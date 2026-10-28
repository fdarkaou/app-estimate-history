import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseStoreId, points, summarize, describe, toCsv, toComparison } from '../history.js';

const ex = JSON.parse(readFileSync(new URL('../examples/history.json', import.meta.url), 'utf8'));
const r = (mid) => ({ kind: 'range', scope: 'worldwide', range: { low: mid / 2, mid, high: mid * 2 } });

test('parses ids and App Store links', () => {
  assert.equal(parseStoreId('1234567890'), '1234567890');
  assert.equal(parseStoreId('id1234567890'), '1234567890');
  assert.equal(parseStoreId('https://apps.apple.com/us/app/some-app/id1234567890?l=fr'), '1234567890');
  assert.equal(parseStoreId('some app'), null);
});

test('sorts oldest first and keeps one observation per day', () => {
  const p = points({ data: [
    { observedAt: '2026-10-02T00:00:00.000Z', monthlyInstalls: r(10) },
    { observedAt: '2026-10-01T00:00:00.000Z', monthlyInstalls: r(5) },
    { observedAt: '2026-10-02T06:00:00.000Z', monthlyInstalls: r(12) },
  ] });
  assert.deepEqual(p.map((x) => x.day), ['2026-10-01', '2026-10-02']);
  assert.equal(p[1].monthlyInstalls.range.mid, 12);
});

test('change uses ranged days only; unknown and below floor are counted, not zeroed', () => {
  const s = summarize({ data: [
    { observedAt: '2026-10-01T00:00:00Z', monthlyInstalls: null },
    { observedAt: '2026-10-02T00:00:00Z', monthlyInstalls: { kind: 'below_floor', ceiling: 5000 } },
    { observedAt: '2026-10-03T00:00:00Z', monthlyInstalls: r(100) },
    { observedAt: '2026-10-04T00:00:00Z', monthlyInstalls: r(150), previousMonthlyInstalls: r(120) },
  ] });
  assert.equal(s.days, 4);
  assert.equal(s.unknownDays, 1);
  assert.equal(s.belowFloorDays, 1);
  assert.equal(s.changeFrom, '2026-10-03');
  assert.equal(s.change, 0.5);
  assert.equal(s.mom, 0.25);
  assert.deepEqual(s.peak, { day: '2026-10-04', mid: 150 });
});

test('no month-over-month when the previous month is below the floor or missing', () => {
  const s = summarize({ data: [{ observedAt: '2026-10-04T00:00:00Z', monthlyInstalls: r(150), previousMonthlyInstalls: { kind: 'below_floor', ceiling: 5000 } }] });
  assert.equal(s.mom, null);
  assert.equal(s.change, null);
});

test('describe and csv', () => {
  assert.equal(describe(null), 'unknown');
  assert.equal(describe({ kind: 'below_floor', ceiling: 5000 }, true), 'under $5k');
  const csv = toCsv(ex).split('\n');
  assert.equal(csv.length, ex.data.length + 1);
  assert.match(csv[1], /^0000000000,Example Calorie Tracker,2026-09-28,unknown/);
  assert.match(toComparison([ex, ex]), /Example Calorie Tracker/);
});
