import { z } from 'zod';
import { defineJob } from '../../jobs/define';

/** This module's fragment of the `cron` queue's jobs. */
export const organizationCronJobs = {
  delete: defineJob({
    payload: z.null(),
    cron: { pattern: '0 * * * *' },
    handler: async ({ ctx }) => {
      const result = await ctx.services.organization.runDeleteCron();
      ctx.logger.info({ ...result }, 'Delete cron complete');
    },
  }),
};
