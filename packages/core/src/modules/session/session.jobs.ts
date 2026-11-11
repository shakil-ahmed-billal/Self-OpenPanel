import { z } from 'zod';
import type { Ctx } from '../../context';
import { defineJob } from '../../jobs/define';
import type { Logger } from '../../logger';
import { createEvent } from '../event/event.service';
import { sessionRuntimeFrom } from './src/runtime';
import {
  createSessionEnd,
  type SessionEndDeps,
  type SessionEndJobData,
  type SessionEndJobWire,
} from './src/session-end';
import { reapIdleSessions } from './src/session-reaper';
import { vacuumStaleSessions } from './src/session-vacuum';
import { updateEventsCount } from './src/usage';

const MINUTE_MS = 60 * 1000;
const SESSION_REAPER_INTERVAL_MS = 5 * MINUTE_MS;
/** Daily 04:00 UTC — backstop for cleanup leaks. */
const SESSION_VACUUM_CRON = '0 4 * * *';
const FLUSH_SESSIONS_INTERVAL_MS = 10_000;

// Wire-shape check only: tightening it would reject payloads currently accepted.
//
// The schema's INPUT is what the producer holds (`SessionEndJobData`, a real `Date`);
// its OUTPUT is what a handler gets after BullMQ's JSON round-trip (`SessionEndJobWire`,
// a string). The transform is a type seam only.
const sessionEndWireShape = z.object({
  event: z.object({ projectId: z.string(), deviceId: z.string() }),
  snapshot: z.object({
    id: z.string(),
    project_id: z.string(),
    device_id: z.string(),
    ended_at: z.string(),
  }),
});

const sessionEndPayload = z
  .custom<SessionEndJobData>(
    (value) => sessionEndWireShape.safeParse(value).success
  )
  .transform((value) => value as unknown as SessionEndJobWire);

/** The session-end job's dependencies, bound to the run's own ctx. */
function sessionEndDeps(ctx: Ctx, logger: Logger): SessionEndDeps {
  return {
    ...sessionRuntimeFrom(ctx),
    logger,
    createEvent: (payload) => createEvent(ctx, payload),
    profileBackfill: ctx.buffers.profileBackfill,
  };
}

/** The `sessions` queue's own job. */
export const sessionQueueJobs = {
  session: defineJob({
    payload: sessionEndPayload,
    handler: async ({ payload: data, ctx }) => {
      // Child bindings bypass log redaction, so only ids: the event carries
      // the visitor's IP and properties.
      const logger = ctx.logger.child({
        projectId: data.event.projectId,
        sessionId: data.snapshot.id,
      });

      await createSessionEnd(data, sessionEndDeps(ctx, logger));

      try {
        await updateEventsCount(ctx, data.event.projectId);
      } catch (error) {
        logger.error({ err: error }, 'Failed to update events count');
      }
    },
  }),
};

/** This module's fragment of the `cron` queue's jobs. */
export const sessionCronJobs = {
  flushSessions: defineJob({
    payload: z.null(),
    cron: { every: FLUSH_SESSIONS_INTERVAL_MS },
    handler: async ({ ctx }) => {
      await ctx.buffers.session.tryFlush({ trigger: 'cron' });
    },
  }),
  sessionReaper: defineJob({
    payload: z.null(),
    cron: { every: SESSION_REAPER_INTERVAL_MS },
    handler: async ({ ctx }) => {
      await reapIdleSessions({
        ...sessionRuntimeFrom(ctx),
        logger: ctx.logger.child({ job: 'session-reaper' }),
        enqueueSessionEnd: (input) =>
          ctx.services.session.enqueueSessionEnd(input),
      });
    },
  }),
  sessionVacuum: defineJob({
    payload: z.null(),
    cron: { pattern: SESSION_VACUUM_CRON },
    handler: async ({ ctx }) => {
      await vacuumStaleSessions({
        ...sessionRuntimeFrom(ctx),
        logger: ctx.logger.child({ job: 'session-vacuum' }),
      });
    },
  }),
};
