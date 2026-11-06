import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { historyDateRange } from '../src/weekly-report.js';

const source = readFileSync(new URL('../src/server-core.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const presets = ['previous-month', '2x-previous-month', '3-calendar-months'];

function fixture(year, month, day) {
  const RealDate = Date;
  class ClockDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [year, month - 1, day, 12]));
    }
  }
  const context = { Date: ClockDate };
  const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
  vm.runInNewContext([
    extract('function getAiEventDateRange(', 'function normalizeAiEventSummary('),
    extract('function getAgentSessionDateRange(', 'function buildFlowRunListPath('),
    extract('function getReportTrendDateRange(', 'function reportTrendRetentionCutoffDate('),
    extract('function normalizeAutomatedReportScheduleDateRange(', 'async function writeAutomatedReportSchedule('),
  ].join('\n'), context);
  return context;
}

const cases = [
  { today: [2026, 11, 6], dates: [['2026-10-01', '2026-10-31'], ['2026-09-01', '2026-09-30'], ['2026-09-01', '2026-11-30']] },
  { today: [2026, 1, 31], dates: [['2025-12-01', '2025-12-31'], ['2025-11-01', '2025-11-30'], ['2025-11-01', '2026-01-31']] },
  { today: [2024, 3, 31], dates: [['2024-02-01', '2024-02-29'], ['2024-01-01', '2024-01-31'], ['2024-01-01', '2024-03-31']] },
  { today: [2025, 3, 1], dates: [['2025-02-01', '2025-02-28'], ['2025-01-01', '2025-01-31'], ['2025-01-01', '2025-03-31']] },
];

for (const { today, dates } of cases) {
  test(`calendar presets use full months on ${today.join('-')}`, () => {
    const context = fixture(...today);
    const now = new Date(today[0], today[1] - 1, today[2], 12);
    for (const [index, range] of presets.entries()) {
      const [startDate, endDate] = dates[index];
      for (const name of ['getAiEventDateRange', 'getAgentSessionDateRange', 'getFlowRunDateRange', 'getReportTrendDateRange']) {
        const result = context[name]({ range });
        assert.equal(result.range, range, name);
        assert.equal(result.startDate, startDate, name);
        assert.equal(result.endDate, endDate, name);
        if (result.endExclusive) {
          const nextDay = new Date(`${endDate}T12:00:00`);
          nextDay.setDate(nextDay.getDate() + 1);
          assert.equal(context.toDateOnlyString(result.endExclusive), context.toDateOnlyString(nextDay));
          assert.equal(result.start.getHours(), 0);
          assert.equal(result.endExclusive.getHours(), 0);
        }
      }
      const history = historyDateRange(range, '', '', now);
      assert.equal(history.key, range);
      assert.equal(history.start, startDate);
      assert.equal(history.end, endDate);
      assert.equal(context.normalizeAutomatedReportScheduleDateRange({ range }).range, range);
    }
  });
}

test('every extension date-range selector offers each new preset exactly once', () => {
  const selectors = [...html.matchAll(/<select id="([^"]*Range)">([\s\S]*?)<\/select>/g)];
  assert.equal(selectors.length, 7);
  for (const [, id, options] of selectors) {
    for (const range of presets) {
      assert.equal(options.split(`value="${range}"`).length - 1, 1, `${id}: ${range}`);
    }
  }
});

test('existing current-month, rolling-day and weekly history presets are unchanged', () => {
  const context = fixture(2026, 11, 6);
  const current = context.getAiEventDateRange({ range: 'month' });
  assert.equal(current.startDate, '2026-11-01');
  assert.equal(current.endDate, '2026-11-30');
  const rolling = context.getFlowRunDateRange({ range: '7d' });
  assert.equal(rolling.startDate, '2026-10-31');
  assert.equal(rolling.endDate, '2026-11-06');
  const history = historyDateRange('3m', '', '', new Date(2026, 10, 6));
  assert.equal(history.start, '2026-08-06');
  assert.equal(history.end, '2026-11-06');
});
