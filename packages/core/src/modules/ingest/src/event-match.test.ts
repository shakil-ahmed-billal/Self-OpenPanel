import { expect, mock, test } from 'bun:test';
import { matchEvent, matchEventFilters } from './event-match';

const CLICK_EVENT = { name: 'click', filters: [] } as never;

test('matchEvent matches by exact name', () => {
  const payload = { name: 'click' } as never;
  expect(matchEvent(payload, CLICK_EVENT)).toBe(true);
  expect(matchEvent({ name: 'purchase' } as never, CLICK_EVENT)).toBe(false);
});

test('matchEvent matches any event name on a wildcard', () => {
  const wildcard = { name: '*', filters: [] } as never;
  expect(matchEvent({ name: 'anything' } as never, wildcard)).toBe(true);
});

test('matchEventFilters: an empty value list always matches', () => {
  expect(
    matchEventFilters({} as never, [
      { name: 'country', operator: 'is', value: [] } as never,
    ])
  ).toBe(true);
});

test('matchEventFilters: "is" matches the exact property value', () => {
  const payload = { country: 'SE' } as never;
  expect(
    matchEventFilters(payload, [
      { name: 'country', operator: 'is', value: ['SE'] } as never,
    ])
  ).toBe(true);
  expect(
    matchEventFilters(payload, [
      { name: 'country', operator: 'is', value: ['US'] } as never,
    ])
  ).toBe(false);
});

test('matchEventFilters: regex matches through RE2, slashes stripped', () => {
  const payload = { path: '/product/42' } as never;
  const regex = (value: string) =>
    [{ name: 'path', operator: 'regex', value: [value] }] as never;

  expect(matchEventFilters(payload, regex('/^\\/product\\/\\d+$/'))).toBe(
    true
  );
  expect(matchEventFilters(payload, regex('^/cart'))).toBe(false);
});

test('matchEventFilters: a stored regex RE2 cannot compile never matches and is logged once', () => {
  const payload = { path: '/product/42' } as never;
  const lookahead = [
    { name: 'path', operator: 'regex', value: ['(?=/product)/p'] },
  ] as never;
  const warn = mock(() => undefined);
  const logger = { warn } as never;

  expect(matchEventFilters(payload, lookahead, logger)).toBe(false);
  expect(matchEventFilters(payload, lookahead, logger)).toBe(false);
  expect(warn).toHaveBeenCalledTimes(1);
});

test('matchEventFilters: a backtracking-prone regex stays fast', () => {
  const payload = { name: `${'a'.repeat(50_000)}!` } as never;
  const startedAt = performance.now();
  expect(
    matchEventFilters(payload, [
      { name: 'name', operator: 'regex', value: ['(a+)+$'] },
    ] as never)
  ).toBe(false);
  expect(performance.now() - startedAt).toBeLessThan(250);
});

test('matchEventFilters: has_profile compares profileId against deviceId', () => {
  const identified = { profileId: 'p1', deviceId: 'd1' } as never;
  const anonymous = { profileId: 'd1', deviceId: 'd1' } as never;
  const filter = {
    name: 'has_profile',
    operator: 'is',
    value: ['true'],
  } as never;
  expect(matchEventFilters(identified, [filter])).toBe(true);
  expect(matchEventFilters(anonymous, [filter])).toBe(false);
});
