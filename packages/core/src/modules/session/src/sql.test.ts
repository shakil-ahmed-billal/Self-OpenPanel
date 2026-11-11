// Shape tests for the session module's fragments: every user value binds as a
// `{pN:Type}` parameter, the optional clauses toggle correctly, and `sql.id` rejects a
// column outside the whitelist. These run offline.

import { describe, expect, test } from 'bun:test';
import { sql } from '@openpanel/db/src/clickhouse/sql';
import {
  hasSessionListLookback,
  querySessionsQuery,
  SESSION_DISTINCT_FIELDS,
  sessionByIdQuery,
  sessionDistinctValuesQuery,
  sessionEventsQuery,
  sessionListQuery,
  sessionsCountQuery,
} from './sql';

const PROJECT_ID = 'proj-1';

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

describe('sessionListQuery', () => {
  test('first page: lookback window anchored at now, no cursor clause', () => {
    const { query, query_params } = sessionListQuery({
      projectId: PROJECT_ID,
      take: 50,
      lookbackDays: 0.5,
    }).toStatement();
    const text = collapse(query);

    expect(text).toContain('SELECT created_at,');
    expect(text).toContain('FROM sessions');
    expect(text).not.toContain('FINAL');
    expect(text).toContain(
      'WHERE project_id = {p1:String} AND created_at >= toDateTime64({p2:String}, 3) - INTERVAL {p3:Float64} DAY AND sign = 1 AND (id, version) GLOBAL NOT IN ( SELECT id, version FROM sessions WHERE project_id = {p4:String} AND created_at >= toDateTime64({p5:String}, 3) - INTERVAL {p6:Float64} DAY AND sign = -1 ) ORDER BY created_at DESC LIMIT {p7:UInt64}'
    );
    expect(text).not.toContain('created_at <');
    expect(text).not.toContain('profile_id =');
    expect(text).not.toContain('ILIKE');
    expect(query_params).toMatchObject({
      p1: PROJECT_ID,
      p3: 0.5,
      p4: PROJECT_ID,
      p6: 0.5,
      p7: 50,
    });
    expect(query_params.p5).toBe(query_params.p2);
    expect(query_params.p2).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  test('cursor page: lookback anchored at the cursor plus the `created_at <` boundary, in both the page and the −1 subquery', () => {
    const cursor = new Date('2026-07-10T12:34:56.789Z');
    const { query, query_params } = sessionListQuery({
      projectId: PROJECT_ID,
      take: 50,
      cursor,
      lookbackDays: 1,
    }).toStatement();
    const text = collapse(query);

    expect(text).toContain(
      'AND created_at >= toDateTime64({p2:String}, 3) - INTERVAL {p3:Float64} DAY AND created_at < {p4:String} AND sign = 1'
    );
    expect(text).toContain(
      'WHERE project_id = {p5:String} AND created_at >= toDateTime64({p6:String}, 3) - INTERVAL {p7:Float64} DAY AND created_at < {p8:String} AND sign = -1 )'
    );
    for (const key of ['p2', 'p4', 'p6', 'p8']) {
      expect(query_params[key]).toBe('2026-07-10 12:34:56');
    }
  });

  test('explicit date range: no lookback window, calendar-day BETWEEN in both, search and filters only on the page', () => {
    const { query, query_params } = sessionListQuery({
      projectId: PROJECT_ID,
      take: 10,
      lookbackDays: 0.5,
      startDate: new Date('2026-07-01T00:00:00Z'),
      endDate: new Date('2026-07-31T23:59:59Z'),
      profileId: 'user-1',
      search: 'checkout',
      filterClauses: {
        f0: sql`country = 'SE'`,
        f1: sql`device = 'mobile'`,
      },
    }).toStatement();
    const text = collapse(query);

    expect(text).not.toContain('toDateTime64');
    expect(text).toContain(
      "AND toDate(created_at) BETWEEN toDate({p2:String}) AND toDate({p3:String}) AND sign = 1 AND (id, version) GLOBAL NOT IN ( SELECT id, version FROM sessions WHERE project_id = {p4:String} AND toDate(created_at) BETWEEN toDate({p5:String}) AND toDate({p6:String}) AND sign = -1 ) AND profile_id = {p7:String} AND (entry_path ILIKE {p8:String} OR exit_path ILIKE {p9:String} OR referrer ILIKE {p10:String} OR referrer_name ILIKE {p11:String}) AND country = 'SE' AND device = 'mobile' ORDER BY"
    );
    expect(query_params).toMatchObject({
      p2: '2026-07-01 00:00:00',
      p3: '2026-07-31 23:59:59',
      p5: '2026-07-01 00:00:00',
      p6: '2026-07-31 23:59:59',
      p7: 'user-1',
      p8: '%checkout%',
      p11: '%checkout%',
      p12: 10,
    });
  });

  test('hasSessionListLookback is off only for a date-bounded first page', () => {
    const range = { startDate: new Date(), endDate: new Date() };
    expect(hasSessionListLookback({})).toBe(true);
    expect(hasSessionListLookback({ cursor: new Date(), ...range })).toBe(true);
    expect(hasSessionListLookback(range)).toBe(false);
  });
});

describe('sessionsCountQuery', () => {
  test('counts sign = 1 rows with the same optional clauses as the list', () => {
    const { query, query_params } = sessionsCountQuery({
      projectId: PROJECT_ID,
      search: 'x',
    }).toStatement();

    expect(collapse(query)).toBe(
      'SELECT count(*) as count FROM sessions WHERE project_id = {p1:String} AND sign = 1 AND (entry_path ILIKE {p2:String} OR exit_path ILIKE {p3:String} OR referrer ILIKE {p4:String} OR referrer_name ILIKE {p5:String})'
    );
    expect(query_params).toEqual({
      p1: PROJECT_ID,
      p2: '%x%',
      p3: '%x%',
      p4: '%x%',
      p5: '%x%',
    });
  });
});

describe('byId', () => {
  test('sessionByIdQuery prewheres the id and keeps sign under FINAL', () => {
    const byId = sessionByIdQuery({
      sessionId: 'sess-1',
      projectId: PROJECT_ID,
    }).toStatement();
    expect(collapse(byId.query)).toBe(
      'SELECT * FROM sessions FINAL PREWHERE id = {p1:String} AND project_id = {p2:String} WHERE sign = 1'
    );
  });
});

describe('sessionDistinctValuesQuery', () => {
  test('whitelisted column is emitted as an identifier, limit bound', () => {
    const { query, query_params } = sessionDistinctValuesQuery({
      projectId: PROJECT_ID,
      field: 'referrer_name',
      limit: 200,
    }).toStatement();

    expect(collapse(query)).toBe(
      "SELECT referrer_name AS value, count() AS cnt FROM sessions WHERE project_id = {p1:String} AND referrer_name != '' AND sign = 1 AND created_at > now() - INTERVAL {p2:UInt64} DAY GROUP BY value ORDER BY cnt DESC LIMIT {p3:UInt64}"
    );
    expect(query_params).toEqual({ p1: PROJECT_ID, p2: 90, p3: 200 });
  });

  test('a column outside SESSION_DISTINCT_FIELDS throws instead of interpolating', () => {
    expect(SESSION_DISTINCT_FIELDS).not.toContain('profile_id');
    expect(() =>
      sessionDistinctValuesQuery({
        projectId: PROJECT_ID,
        field: 'profile_id' as never,
        limit: 200,
      })
    ).toThrow();
  });
});

describe('querySessionsQuery', () => {
  test('equality filters follow a stable clause order, dates bind as Strings', () => {
    const { query, query_params } = querySessionsQuery({
      projectId: PROJECT_ID,
      startDate: '2026-07-01 00:00:00',
      endDate: '2026-07-31 00:00:00',
      limit: 20,
      browser: 'Chrome',
      country: 'SE',
      profileId: 'user-1',
    }).toStatement();

    expect(collapse(query)).toBe(
      'SELECT * FROM sessions WHERE project_id = {p1:String} AND sign = 1 AND profile_id = {p2:String} AND country = {p3:String} AND browser = {p4:String} AND created_at BETWEEN {p5:String} AND {p6:String} ORDER BY created_at DESC LIMIT {p7:UInt64}'
    );
    expect(query_params).toEqual({
      p1: PROJECT_ID,
      p2: 'user-1',
      p3: 'SE',
      p4: 'Chrome',
      p5: '2026-07-01 00:00:00',
      p6: '2026-07-31 00:00:00',
      p7: 20,
    });
  });

  // `query_sessions` labels its rows `created_at desc`, so the cut has to happen after
  // the sort; otherwise a bare LIMIT returns the OLDEST sessions in the window.
  test('takes the newest sessions, not an arbitrary slice', () => {
    const { query } = querySessionsQuery({
      projectId: PROJECT_ID,
      startDate: '2026-07-01 00:00:00',
      endDate: '2026-07-31 00:00:00',
      limit: 20,
    }).toStatement();

    expect(query.indexOf('ORDER BY created_at DESC')).toBeGreaterThan(-1);
    expect(query.indexOf('ORDER BY')).toBeLessThan(query.indexOf('LIMIT'));
  });

  // `query_sessions` is reached from MCP with bare `YYYY-MM-DD`, which bound straight
  // through as midnight and dropped the whole last day.
  test('widens a bare end date to the end of that day', () => {
    const { query_params } = querySessionsQuery({
      projectId: PROJECT_ID,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      limit: 20,
    }).toStatement();

    const bounds = Object.values(query_params).filter(
      (value): value is string =>
        typeof value === 'string' && value.startsWith('2026-08-')
    );
    expect(bounds).toContain('2026-08-01 00:00:00');
    expect(bounds).toContain('2026-08-31 23:59:59');
  });
});

describe('sessionEventsQuery', () => {
  test('binds the padded window as ClickHouse date strings', () => {
    const { query, query_params } = sessionEventsQuery({
      sessionId: 'sess-1',
      projectId: PROJECT_ID,
      startAt: new Date('2026-06-08T10:29:59.000Z'),
      endAt: new Date('2026-06-08T11:00:01.000Z'),
      limit: 500,
    }).toStatement();

    expect(collapse(query)).toBe(
      'SELECT * FROM events WHERE session_id = {p1:String} AND project_id = {p2:String} AND created_at BETWEEN {p3:String} AND {p4:String} ORDER BY created_at DESC LIMIT {p5:UInt64}'
    );
    expect(query_params).toEqual({
      p1: 'sess-1',
      p2: PROJECT_ID,
      p3: '2026-06-08 10:29:59',
      p4: '2026-06-08 11:00:01',
      p5: 500,
    });
  });
});
