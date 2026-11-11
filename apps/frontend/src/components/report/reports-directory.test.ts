import { describe, expect, test } from 'vitest';
import {
  filterProjectReports,
  formatReportSeriesSummary,
  type ProjectReportListItem,
} from './reports-directory';

function makeReport(
  overrides: Partial<ProjectReportListItem> = {}
): ProjectReportListItem {
  return {
    id: 'rep_1',
    projectId: 'proj_1',
    name: 'Daily Traffic',
    chartType: 'linear',
    lineType: 'monotone',
    interval: 'day',
    range: '7d',
    previous: false,
    metric: 'sum',
    breakdowns: [],
    globalFilters: [],
    display: { view: 'chart' },
    series: [
      {
        id: 'A',
        type: 'event',
        name: 'screen_view',
        segment: 'event',
        filters: [],
        displayName: 'Pageviews',
      },
    ],
    dashboardId: 'dash_1',
    dashboardName: 'Executive Overview',
    createdAt: new Date('2026-11-10T00:00:00Z'),
    updatedAt: new Date('2026-11-11T00:00:00Z'),
    ...overrides,
  };
}

describe('formatReportSeriesSummary', () => {
  test('formats event display names and formulas cleanly', () => {
    const summary = formatReportSeriesSummary([
      {
        id: 'A',
        type: 'event',
        name: 'signup_completed',
        segment: 'event',
        filters: [],
        displayName: 'Signups',
      },
      {
        id: 'B',
        type: 'formula',
        formula: '(A / B) * 100',
      },
    ]);

    expect(summary).toBe('Signups, Formula ((A / B) * 100)');
  });
});

describe('filterProjectReports', () => {
  const reports: ProjectReportListItem[] = [
    makeReport({
      id: 'r1',
      name: 'Traffic by Country',
      chartType: 'bar',
      breakdowns: [{ name: 'country' }],
      dashboardId: 'd1',
      dashboardName: 'Executive Overview',
    }),
    makeReport({
      id: 'r2',
      name: 'Signup Funnel',
      chartType: 'funnel',
      dashboardId: 'd2',
      dashboardName: 'Funnel & Flow',
      series: [
        {
          id: 'A',
          type: 'event',
          name: 'cta_clicked',
          segment: 'event',
          filters: [],
        },
      ],
    }),
  ];

  test('filters by chartType and dashboardId', () => {
    expect(
      filterProjectReports(reports, {
        search: '',
        chartType: 'funnel',
        dashboardId: 'all',
      }).map((r) => r.id)
    ).toEqual(['r2']);

    expect(
      filterProjectReports(reports, {
        search: '',
        chartType: 'all',
        dashboardId: 'd1',
      }).map((r) => r.id)
    ).toEqual(['r1']);
  });

  test('matches search query against report name, dashboard, breakdown, and series', () => {
    expect(
      filterProjectReports(reports, {
        search: 'country',
        chartType: 'all',
        dashboardId: 'all',
      }).map((r) => r.id)
    ).toEqual(['r1']);

    expect(
      filterProjectReports(reports, {
        search: 'cta_clicked',
        chartType: 'all',
        dashboardId: 'all',
      }).map((r) => r.id)
    ).toEqual(['r2']);

    expect(
      filterProjectReports(reports, {
        search: 'funnel & flow',
        chartType: 'all',
        dashboardId: 'all',
      }).map((r) => r.id)
    ).toEqual(['r2']);
  });
});
