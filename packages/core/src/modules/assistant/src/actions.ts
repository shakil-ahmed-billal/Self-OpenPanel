// The assistant's write path is the same tRPC procedures the dashboard calls,
// so access rules and side effects live in one place.
import type { HttpCtx } from '../../../context';
import { createTRPCRouter, makeTrpcContext } from '../../../rpc/base';
import { dashboardRouter } from '../../dashboard/dashboard.rpc';
import { organizationRouter } from '../../organization/organization.rpc';
import { projectRouter } from '../../project/project.rpc';
import { reportRouter } from '../../report/report.rpc';

const chatActionsRouter = createTRPCRouter({
  dashboard: dashboardRouter,
  organization: organizationRouter,
  project: projectRouter,
  report: reportRouter,
});

export type ChatActions = ReturnType<typeof chatActionsRouter.createCaller>;

export async function createChatActions(
  httpCtx: HttpCtx
): Promise<ChatActions> {
  const trpcCtx = await makeTrpcContext(httpCtx, new Headers(), {
    cookieOptions: {},
    demoMode: Boolean(httpCtx.config.demoUserId),
  });
  return chatActionsRouter.createCaller(trpcCtx);
}
