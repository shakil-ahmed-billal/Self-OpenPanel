import { zReportInput } from '@openpanel/core/modules/report/report.constants';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { ReportsDirectory } from '@/components/report/reports-directory';
import ReportEditor from '@/components/report-chart/report-editor';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/reports'
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.REPORTS),
        },
      ],
    };
  },
  validateSearch: z.object({
    dashboardId: z.string().optional(),
    /** A report to open unsaved, from a widget's "Open as report". */
    draft: zReportInput.extend({ name: z.string() }).optional(),
    /** Opens the blank Report Builder instead of the saved reports list. */
    new: z.boolean().optional(),
  }),
  loaderDeps: ({ search }) => ({
    isEditor: Boolean(search.dashboardId || search.draft || search.new),
  }),
  async loader({ context, params, deps }) {
    if (deps.isEditor) {
      return;
    }
    await context.queryClient.prefetchQuery(
      context.trpc.report.listAll.queryOptions({
        projectId: params.projectId,
      })
    );
  },
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const { dashboardId, draft, new: isNew } = Route.useSearch();
  if (dashboardId || draft || isNew) {
    return <ReportEditor draft={draft} report={null} />;
  }
  return <ReportsDirectory />;
}
