import {
  chartTypes,
  type IChartEventItem,
  type IChartType,
  timeWindows,
} from '@openpanel/core/modules/report/report.constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { format } from 'date-fns';
import {
  ArrowUpRightIcon,
  ChartLineIcon,
  CopyIcon,
  LayoutPanelTopIcon,
  MoreHorizontal,
  PencilIcon,
  PlusIcon,
  ShareIcon,
  TrashIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/card';
import { CHART_TYPE_ICONS } from '@/components/dashboard-preview';
import { EmptyState } from '@/components/empty-state';
import { ProjectLink } from '@/components/links';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { ReportChart } from '@/components/report-chart';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { AnimatedSearchInput } from '@/components/ui/data-table/data-table-toolbar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TableButtons } from '@/components/ui/table';
import {
  ToolbarSelect,
  type ToolbarSelectOption,
} from '@/components/ui/toolbar-select';
import { useAppParams } from '@/hooks/use-app-params';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { objectToZodEnums } from '@/utils/object-to-zod-enums';

export type ProjectReportListItem = RouterOutputs['report']['listAll'][number];

const ALL_FILTER = 'all';

function seriesSummaryLabel(item: IChartEventItem): string {
  if (item.type === 'formula') {
    return item.displayName || `Formula (${item.formula})`;
  }
  return item.displayName || item.name;
}

/** Summarizes a report's event/formula series for card search and footer text. */
export function formatReportSeriesSummary(series: IChartEventItem[]): string {
  return series.map(seriesSummaryLabel).filter(Boolean).join(', ');
}

function formatReportRangeLabel(report: ProjectReportListItem): string {
  if (report.startDate && report.endDate) {
    return 'Custom dates';
  }
  const key = report.range as keyof typeof timeWindows;
  return timeWindows[key]?.label ?? report.range;
}

/** Filters project reports by search text, chart type, and owning dashboard. */
export function filterProjectReports(
  reports: ProjectReportListItem[],
  {
    search,
    chartType,
    dashboardId,
  }: {
    search: string;
    chartType: string;
    dashboardId: string;
  }
): ProjectReportListItem[] {
  const query = search.trim().toLowerCase();
  return reports.filter((report) => {
    if (chartType !== ALL_FILTER && report.chartType !== chartType) {
      return false;
    }
    if (dashboardId !== ALL_FILTER && report.dashboardId !== dashboardId) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [
      report.name,
      report.dashboardName,
      chartTypes[report.chartType],
      formatReportSeriesSummary(report.series),
      ...report.breakdowns.map((b) => b.name),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

function ReportDirectoryCard({
  report,
  onDuplicate,
  onDelete,
  isDuplicating,
}: {
  report: ProjectReportListItem;
  onDuplicate: (reportId: string) => void;
  onDelete: (reportId: string, name: string) => void;
  isDuplicating: boolean;
}) {
  const navigate = useNavigate();
  const { organizationId, projectId } = useAppParams();
  const Icon = CHART_TYPE_ICONS[report.chartType];
  const seriesSummary = formatReportSeriesSummary(report.series);
  const rangeLabel = formatReportRangeLabel(report);

  return (
    <Card className="group flex flex-col overflow-hidden" hover>
      <div className="flex items-start justify-between gap-3 border-border border-b p-4">
        <div className="min-w-0 flex-1">
          <ProjectLink
            className="flex items-center gap-2 font-medium text-foreground transition-colors hover:text-primary"
            params={{ reportId: report.id }}
            to="/reports/$reportId"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            <span className="truncate">{report.name}</span>
          </ProjectLink>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
            <Badge variant="secondary">{chartTypes[report.chartType]}</Badge>
            <Badge variant="outline">{rangeLabel}</Badge>
            {report.breakdowns.length > 0 && (
              <Badge variant="outline">
                by {report.breakdowns.map((b) => b.name).join(', ')}
              </Badge>
            )}
            <ProjectLink
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
              params={{ dashboardId: report.dashboardId }}
              to="/dashboards/$dashboardId"
            >
              <LayoutPanelTopIcon className="size-3 shrink-0" />
              <span className="max-w-[160px] truncate">
                {report.dashboardName}
              </span>
            </ProjectLink>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <LinkButton
            aria-label={`Open ${report.name} in report editor`}
            params={{
              organizationId,
              projectId,
              reportId: report.id,
            }}
            size="sm"
            to="/$organizationId/$projectId/reports/$reportId"
            variant="ghost"
          >
            <span className="max-sm:hidden">Open</span>
            <ArrowUpRightIcon className="size-3.5 sm:ml-1" />
          </LinkButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`Actions for ${report.name}`}
                size="icon"
                variant="ghost"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() =>
                    navigate({
                      to: '/$organizationId/$projectId/reports/$reportId',
                      params: {
                        organizationId,
                        projectId,
                        reportId: report.id,
                      },
                    })
                  }
                >
                  <PencilIcon className="mr-2 size-4" />
                  Edit report
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    pushModal('ShareReportModal', { reportId: report.id })
                  }
                >
                  <ShareIcon className="mr-2 size-4" />
                  Share report
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isDuplicating}
                  onClick={() => onDuplicate(report.id)}
                >
                  <CopyIcon className="mr-2 size-4" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    pushModal('MoveReport', {
                      reportId: report.id,
                      dashboardId: report.dashboardId,
                    })
                  }
                >
                  <LayoutPanelTopIcon className="mr-2 size-4" />
                  Move to dashboard
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDelete(report.id, report.name)}
                >
                  <TrashIcon className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex h-64 flex-col">
        <div
          className={cn(
            'min-h-0 flex-1 overflow-hidden p-4',
            report.chartType === 'metric' && 'flex items-center p-0'
          )}
        >
          <ReportChart
            layout="fill"
            options={{ hideLegend: true, hideTable: true }}
            report={report}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-border border-t px-4 py-2.5 text-muted-foreground text-xs">
        <span className="truncate">
          {seriesSummary || 'No events configured'}
        </span>
        <span className="shrink-0">
          Updated {format(report.updatedAt, 'MMM d, HH:mm')}
        </span>
      </div>
    </Card>
  );
}

/**
 * Lists every saved report in the project with live chart previews, filters,
 * and a button to launch the blank Report Builder (`?new=true`).
 */
export function ReportsDirectory() {
  const { organizationId, projectId } = useAppParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [chartTypeFilter, setChartTypeFilter] = useState<string>(ALL_FILTER);
  const [dashboardFilter, setDashboardFilter] = useState<string>(ALL_FILTER);

  const query = useQuery(trpc.report.listAll.queryOptions({ projectId }));
  const reports = query.data ?? [];

  const duplication = useMutation(
    trpc.report.duplicate.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess(report) {
        queryClient.invalidateQueries(trpc.report.listAll.pathFilter());
        queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
        toast('Report duplicated', { description: report.name });
      },
    })
  );

  const deletion = useMutation(
    trpc.report.delete.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess() {
        queryClient.invalidateQueries(trpc.report.listAll.pathFilter());
        queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
        toast('Report deleted');
      },
    })
  );

  const chartTypeOptions = useMemo<ToolbarSelectOption<string>[]>(() => {
    const counts = new Map<IChartType, number>();
    for (const report of reports) {
      counts.set(report.chartType, (counts.get(report.chartType) ?? 0) + 1);
    }
    const present = objectToZodEnums(chartTypes)
      .filter((type) => (counts.get(type) ?? 0) > 0)
      .map((type) => ({
        value: type,
        label: `${chartTypes[type]} (${counts.get(type)})`,
      }));
    return [{ value: ALL_FILTER, label: 'All chart types' }, ...present];
  }, [reports]);

  const dashboardOptions = useMemo<ToolbarSelectOption<string>[]>(() => {
    const unique = new Map<string, string>();
    for (const report of reports) {
      unique.set(report.dashboardId, report.dashboardName);
    }
    return [
      { value: ALL_FILTER, label: 'All dashboards' },
      ...Array.from(unique.entries()).map(([id, name]) => ({
        value: id,
        label: name,
      })),
    ];
  }, [reports]);

  const filteredReports = useMemo(
    () =>
      filterProjectReports(reports, {
        search,
        chartType: chartTypeFilter,
        dashboardId: dashboardFilter,
      }),
    [reports, search, chartTypeFilter, dashboardFilter]
  );

  const isFiltered =
    search.trim() !== '' ||
    chartTypeFilter !== ALL_FILTER ||
    dashboardFilter !== ALL_FILTER;

  const clearFilters = () => {
    setSearch('');
    setChartTypeFilter(ALL_FILTER);
    setDashboardFilter(ALL_FILTER);
  };

  return (
    <PageContainer>
      <PageHeader
        actions={
          <LinkButton
            icon={PlusIcon}
            params={{ organizationId, projectId }}
            search={{ new: true }}
            to="/$organizationId/$projectId/reports"
          >
            <span className="max-sm:hidden">Create report</span>
            <span className="sm:hidden">Report</span>
          </LinkButton>
        }
        className="mb-8"
        description="Explore all saved reports across your dashboards or build a new custom report"
        title="Reports"
      />

      {reports.length > 0 && (
        <TableButtons className="mb-6">
          <AnimatedSearchInput
            onChange={setSearch}
            placeholder="Search reports..."
            value={search}
          />
          <ToolbarSelect
            icon={ChartLineIcon}
            label="Chart type"
            onChange={setChartTypeFilter}
            options={chartTypeOptions}
            value={chartTypeFilter}
          />
          <ToolbarSelect
            icon={LayoutPanelTopIcon}
            label="Dashboard"
            onChange={setDashboardFilter}
            options={dashboardOptions}
            value={dashboardFilter}
          />
        </TableButtons>
      )}

      {reports.length === 0 ? (
        <EmptyState
          description="Build custom charts, funnels, retention cohorts, formulas, and user flows from your tracked events."
          icon={ChartLineIcon}
          title="No reports yet"
        >
          <LinkButton
            icon={PlusIcon}
            params={{ organizationId, projectId }}
            search={{ new: true }}
            to="/$organizationId/$projectId/reports"
          >
            Create report
          </LinkButton>
        </EmptyState>
      ) : filteredReports.length === 0 ? (
        <EmptyState
          description="No reports match your current search or filters."
          icon={ChartLineIcon}
          title="No matching reports"
        >
          {isFiltered && (
            <Button onClick={clearFilters} variant="outline">
              Clear filters
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredReports.map((report) => (
            <ReportDirectoryCard
              isDuplicating={duplication.isPending}
              key={report.id}
              onDelete={(reportId, name) =>
                showConfirm({
                  title: 'Delete report',
                  text: `Are you sure you want to delete "${name}"?`,
                  onConfirm: () => deletion.mutate({ reportId }),
                })
              }
              onDuplicate={(reportId) => duplication.mutate({ reportId })}
              report={report}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
