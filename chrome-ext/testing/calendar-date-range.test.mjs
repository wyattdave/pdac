import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { historyDateRange } from '../src/weekly-report.js';

const source = readFileSync(new URL('../src/server-core.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const presets = ['previous-month', '2x-previous-month', '3-calendar-months'];

function fixture(year, month, day) {
  const RealDate = Date;
  class ClockDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [year, month - 1, day, 12]));
    }
  }
  const context = { Date: ClockDate, requireString: (value) => String(value), HttpError: Error, AI_EVENT_ENTITY_SET_NAME: 'msdyn_aievents' };
  const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
  vm.runInNewContext([
    extract('function getAiEventDateRange(', 'function normalizeAiEventSummary('),
    extract('function getAgentSessionDateRange(', 'function buildFlowRunListPath('),
    extract('function getReportTrendDateRange(', 'function reportTrendRetentionCutoffDate('),
    extract('function normalizeAutomatedReportScheduleDateRange(', 'async function writeAutomatedReportSchedule('),
    extract('function completedTrendRange(', 'async function setReportTrendDateMode('),
    extract('function getAutomatedReportDateRange(', 'function normalizeAutomatedReportEnvironments('),
    extract('function buildAiEventListPath(', 'function getAiEventDateRange('),
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

for (const today of [[2026, 11, 10], [2026, 1, 1], [2024, 3, 1], [2025, 3, 31]]) {
  test(`all seven selectors show dates matching their report ranges on ${today.join('-')}`, () => {
    const context = fixture(...today);
    const now = new Date(today[0], today[1] - 1, today[2], 12);
    context.el = {};
    context.historyDateRange = (range) => historyDateRange(range, '', '', now);
    context.formatDateInputValue = context.toDateOnlyString;
    const extract = (start, end) => appSource.slice(appSource.indexOf(start), appSource.indexOf(end));
    vm.runInNewContext([
      extract('function syncReportDateRangeInputs(', 'function handleAiEventRangeChange('),
      extract('function syncFlowRunCustomRangeVisibility(', 'function handleFlowRunRangeChange('),
      extract('function syncWeeklyHistoryRangeVisibility(', 'function renderWeeklyReport('),
      extract('function syncAutomatedReportDateRanges(', 'function renderAutomatedReportControls('),
      extract('function scheduledReportDateRange(', 'function automatedReportOptionInput('),
      extract('function buildAutomatedReportBody(', 'function renderAutomatedReportStatus('),
    ].join('\n'), context);
    context.resolveRequestAccountId = () => 'test-account';
    for (const [, id] of html.matchAll(/<select id="([^"]*Range)">/g)) {
      const prefix = id.slice(0, -5);
      context.el[id] = { value: '' };
      context.el[`${prefix}Start`] = { value: '2026-08-01' };
      context.el[`${prefix}End`] = { value: '2026-08-31' };
    }
    const sync = {
      automatedAiEvents: 'syncAutomatedReportDateRanges',
      automatedAgentSessions: 'syncAutomatedReportDateRanges',
      weeklyReportHistory: 'syncWeeklyHistoryRangeVisibility',
      trend: 'syncTrendRangeVisibility',
      aiEvents: 'syncAiEventCustomRangeVisibility',
      flowRuns: 'syncFlowRunCustomRangeVisibility',
      agentSessions: 'syncAgentSessionCustomRangeVisibility',
    };
    for (const [, id, options] of html.matchAll(/<select id="([^"]*Range)">([\s\S]*?)<\/select>/g)) {
      const prefix = id.slice(0, -5);
      for (const [, range] of options.matchAll(/value="([^"]+)"/g)) {
        context.el[id].value = range;
        const startInput = context.el[`${prefix}Start`];
        const endInput = context.el[`${prefix}End`];
        startInput.value = '2026-08-01';
        endInput.value = '2026-08-31';
        context[sync[prefix]]();
        const label = `${id}: ${range}`;
        assert.equal(startInput.disabled, range !== 'custom', label);
        assert.equal(endInput.disabled, range !== 'custom', label);
        if (range === 'custom') {
          assert.equal(startInput.value, '2026-08-01', label);
          assert.equal(endInput.value, '2026-08-31', label);
          continue;
        }
        let expected;
        if (prefix === 'weeklyReportHistory') {
          const dates = historyDateRange(range, '', '', now);
          expected = { startDate: dates.start, endDate: dates.end };
        } else if (prefix === 'trend') {
          expected = context.getReportTrendDateRange({ range });
        } else {
          expected = context.getAiEventDateRange({ range });
          if (prefix.startsWith('automated')) {
            const groupKey = prefix === 'automatedAiEvents' ? 'aiEvents' : 'agentSessions';
            const body = context.buildAutomatedReportBody(groupKey, []);
            const group = groupKey === 'aiEvents' ? 'ai-events' : 'agent-sessions';
            expected = context.completedTrendRange(context.getAutomatedReportDateRange(group, body.dateRange));
          }
        }
        assert.equal(startInput.value, expected.startDate, label);
        assert.equal(endInput.value, expected.endDate, label);
      }
    }
  });
}

test('completed calendar presets preserve their requested bounds in report queries', () => {
  const context = fixture(2026, 11, 10);
  for (const [range, start, end] of [
    ['previous-month', '2026-10-01', '2026-10-31'],
    ['2x-previous-month', '2026-09-01', '2026-09-30'],
    ['3-calendar-months', '2026-09-01', '2026-11-09'],
    ['28d', '2026-10-13', '2026-11-09'],
    ['custom', '2026-08-01', '2026-08-31'],
  ]) {
    for (const group of ['ai-events', 'agent-sessions']) {
      const requested = context.getAutomatedReportDateRange(group, { range, start: '2026-08-01', end: '2026-08-31' });
      const completed = context.completedTrendRange(requested);
      assert.equal(completed.startDate, start, `${group}: ${range}`);
      assert.equal(completed.endDate, end, `${group}: ${range}`);
      const query = decodeURIComponent(context.buildAiEventListPath(['createdon'], completed));
      assert.ok(query.includes(`createdon ge ${start}T00:00:00Z`));
      assert.ok(query.includes(`createdon lt ${context.toDateOnlyString(completed.endExclusive)}T00:00:00Z`));
    }
  }
});

test('totals, raw and combined reports pass calendar bounds to collection and each workbook', async () => {
  const context = fixture(2026, 11, 10);
  context.normalizeAutomatedReportEnvironments = (environments) => environments;
  context.createAutomatedReportProgressReporter = () => null;
  vm.runInNewContext(source.slice(source.indexOf('async function buildAutomatedReport('),
    source.indexOf('function createAutomatedReportProgressReporter(')), context);
  for (const family of ['AiEvent', 'AgentSession']) {
    const group = family === 'AiEvent' ? 'ai-events' : 'agent-sessions';
    for (const range of presets) {
      for (const reportType of ['totals', 'raw', 'both']) {
        const expected = context.completedTrendRange(context.getAiEventDateRange({ range }));
        const verify = (dates) => {
          assert.equal(dates.startDate, expected.startDate);
          assert.equal(dates.endDate, expected.endDate);
        };
        let collected = 0;
        let workbooks = 0;
        context[`collectAutomated${family}Rows`] = async (environments, dates) => {
          verify(dates);
          collected += 1;
          return [];
        };
        for (const type of ['Totals', 'Raw']) {
          context[`buildAutomated${family}${type}Workbook`] = async (rows, dates) => {
            verify(dates);
            workbooks += 1;
            return { filename: `${type}-${dates.startDate}-to-${dates.endDate}.xlsx` };
          };
        }
        await context.buildAutomatedReport(group, reportType, {
          environments: [{}], accountHomeId: 'test-account', dateRange: { range },
        });
        assert.equal(collected, 1);
        assert.equal(workbooks, reportType === 'both' ? 2 : 1);
      }
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
