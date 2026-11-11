// `enforceAccess` only sees a top-level `projectId` / `organizationId`, so
// anything resolved from another id needs its own explicit check. Access
// assertions live in integration.service.ts.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { zIntegrationConfig } from './integration.constants';
import {
  deleteIntegration,
  getIntegrationById,
  listIntegrationsForProject,
  testIntegrationConnection,
  upsertIntegration,
} from './integration.service';

export const integrationRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input, ctx }) =>
      getIntegrationById(ctx, ctx.session.userId, input.id)
    ),

  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input, ctx }) =>
      listIntegrationsForProject(ctx, ctx.session.userId, input.projectId)
    ),

  createOrUpdate: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        projectId: z.string().min(1),
        config: zIntegrationConfig,
      })
    )
    .mutation(({ input, ctx }) =>
      upsertIntegration(ctx, ctx.session.userId, input)
    ),

  testConnection: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        config: zIntegrationConfig,
      })
    )
    .mutation(({ input, ctx }) =>
      testIntegrationConnection(ctx, ctx.session.userId, input)
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input: { id }, ctx }) =>
      deleteIntegration(ctx, ctx.session.userId, id)
    ),
});
