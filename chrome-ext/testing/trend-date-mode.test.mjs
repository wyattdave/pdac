import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { after } from 'node:test';
import vm from 'node:vm';

const originalTimezone = process.env.TZ;
process.env.TZ = 'UTC';
after(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

const source = readFileSync(new URL('../src/server-core.js', import.meta.url), 'utf8');
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const RealDate = Date;
class ClockDate extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : ['2026-09-10T07:00:00Z']));
  }
}

const definition = {
  tableName: 'report_ai_flow_event_totals',
  reportKey: 'ai-events',
  columns: [
    ['Environment id', 'environment_id', 'TEXT'],
    ['Environment url', 'environment_url', 'TEXT'],
    ['Count of Events', 'count_of_events', 'REAL'],
    ['Sum AI Builder Credits used', 'sum_ai_builder_credits_used', 'REAL'],
  ],
};

function fixture(mode = false, initialRows = []) {
  let rows = structuredClone(initialRows);
  const storage = { mode };
  const context = {
    Date: ClockDate,
    console: { warn() {} },
    REPORT_TREND_DATE_MODE_STORAGE_KEY: 'mode',
    REPORT_TREND_DATE_MODE_VERSION_KEY: 'version',
    REPORT_TOTAL_TABLE_DEFINITIONS: { 'ai-events': definition },
    reportTotalTableDefinition: () => definition,
    atStartOfDay: (value) => new RealDate(value.getFullYear(), value.getMonth(), value.getDate()),
    addDays: (value, days) => new RealDate(value.getFullYear(), value.getMonth(), value.getDate() + days),
    toDateOnlyString: (value) => [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-'),
    parseDateOnly: (value) => {
      const [year, month, day] = value.split('-').map(Number);
      return new RealDate(year, month - 1, day);
    },
    makeAiEventRange: (range, start, endExclusive) => ({
      range, start, endExclusive,
      startDate: context.toDateOnlyString(start),
      endDate: context.toDateOnlyString(context.addDays(endExclusive, -1)),
    }),
    dateRangeLabel: () => 'test range',
    reportTrendRetentionCutoffDate: () => '2024-09-10',
    reportEnvironmentFields: (environment) => ({ environmentId: environment.environmentId }),
    sqlReportTotalValue: (value, type) => type === 'REAL' ? Number(value || 0) : String(value || ''),
    buildSolutionTrendBackfillRowsBuilder: () => null,
    buildAutomatedAgentSessionTotalsRows: () => [],
    buildAutomatedFlowRunTotalsRows: () => [],
    collectAutomatedAiEventRows: async () => [],
    collectAutomatedAgentSessionRows: async () => [],
    collectAutomatedFlowRunRows: async () => [],
    errorMessage: (error) => error.message,
    chrome: { storage: { local: {
      get: async () => storage,
      set: async (values) => Object.assign(storage, values),
    } } },
    trendSelectRows: async (table) => rows.filter((row) => row.table === table),
    trendRewriteRows: async (predicate, rewrite) => {
      const matched = rows.filter(predicate);
      const rewritten = rewrite(matched);
      rows = [...rows.filter((row) => !predicate(row)), ...rewritten];
      return rewritten.length;
    },
    trendReplaceRows: async (table, predicate, records) => {
      rows = rows.filter((row) => row.table !== table || !predicate(row));
      rows.push(...records.map((row, index) => ({ ...row, table, id: 100 + index })));
    },
    trendDeleteRows: async (table, predicate) => {
      rows = rows.filter((row) => row.table !== table || !predicate(row));
    },
    trendInsertRows: async (table, records) => rows.push(...records.map((row) => ({ ...row, table }))),
  };
  vm.runInNewContext([
    'let reportTrendWriteQueue = Promise.resolve();',
    extract('function reportCacheDateKey(', 'async function readDailyReportCache('),
    extract('async function enqueueReportTrendWrite(', 'const SOLUTION_COMPONENT_NAMES_TABLE'),
    extract('function buildAutomatedReportTrendBackfillSnapshots(', 'function buildSolutionTrendBackfillRowsBuilder('),
    extract('function reportSourceRowDate(', 'function sqlReportTotalValue('),
    extract('function buildAutomatedAiEventTotalsRows(', 'async function buildAutomatedAiEventTotalsWorkbook('),
  ].join('\n').replace('export async function initializeReportTrendDateMode', 'async function initializeReportTrendDateMode'), context);
  return { context, storage, rows: () => rows };
}

const environment = { environmentId: 'env', orgUrl: 'https://example.test' };
const event = (date, credits) => ({ createdOnRaw: `${date}T12:00:00Z`, creditType: 'AI Builder', creditsConsumed: credits });
const original = {
  id: 1, table: definition.tableName, account_home_id: 'account',
  environment_id: 'env', environment_url: 'https://example.test',
  date_ran: '2026-09-07', collected_at: '2026-09-07T07:00:00Z',
  range_key: 'month:2026-09-01:2026-09-30',
  count_of_events: 1, sum_ai_builder_credits_used: 100,
};
const events = [event('2026-09-06', 100), event('2026-09-07', 20), event('2026-09-08', 30), event('2026-09-09', 40), event('2026-09-10', 90)];

test('completed ranges end yesterday, including month rollover and rolling windows', () => {
  const { context } = fixture();
  const range = context.completedTrendRange({ range: '7d' });
  assert.equal(range.startDate, '2026-09-03');
  assert.equal(range.endDate, '2026-09-09');
  const month = context.completedTrendRange({ range: 'month' }, new RealDate('2026-10-01T07:00:00Z'));
  assert.equal(month.startDate, '2026-09-01');
  assert.equal(month.endDate, '2026-09-30');
});

test('on mode refreshes stale days, fills gaps, and excludes today', async () => {
  const { context, rows } = fixture(true, [original]);
  await context.saveAutomatedReportTrendSnapshot({
    accountHomeId: 'account', group: 'ai-events',
    rows: context.buildAutomatedAiEventTotalsRows([{ environment, rows: events }]),
    sourceGroups: [{ environment, rows: events }],
    dateRange: { range: 'month', startDate: '2026-09-01', endDate: '2026-09-09' },
  });
  const value = (date) => rows().find((row) => row.date_ran === date)?.sum_ai_builder_credits_used;
  assert.equal(value('2026-09-07'), 120);
  assert.equal(value('2026-09-08'), 150);
  assert.equal(value('2026-09-09'), 190);
  assert.equal(value('2026-09-10'), undefined);
  await context.setReportTrendDateMode(false);
  assert.equal(rows().find((row) => row.id === 1).sum_ai_builder_credits_used, 100);
});

test('off mode leaves stored history untouched and writes today partial totals', async () => {
  const { context, rows } = fixture(false, [original]);
  await context.saveAutomatedReportTrendSnapshot({
    accountHomeId: 'account', group: 'ai-events',
    rows: context.buildAutomatedAiEventTotalsRows([{ environment, rows: events }]),
    sourceGroups: [{ environment, rows: events }],
    dateRange: { range: 'month', startDate: '2026-09-01', endDate: '2026-09-30' },
  });
  assert.equal(rows().find((row) => row.date_ran === '2026-09-07').sum_ai_builder_credits_used, 100);
  assert.equal(rows().find((row) => row.date_ran === '2026-09-10').sum_ai_builder_credits_used, 280);
});

test('migration rebuilds available rows and reverses the original snapshot exactly', async () => {
  const snapshot = { ...original, date_ran: '2026-09-08', collected_at: '2026-09-08T07:00:00Z', count_of_events: 2, sum_ai_builder_credits_used: 120 };
  const { context, rows } = fixture(false, [snapshot]);
  context.collectAutomatedAiEventRows = async () => [{ environment, rows: events }];
  const result = await context.setReportTrendDateMode(true);
  assert.equal(result.recoveredRows, 1);
  assert.equal(rows()[0].date_ran, '2026-09-07');
  assert.equal(rows()[0].sum_ai_builder_credits_used, 120);
  await context.setReportTrendDateMode(false);
  assert.equal(JSON.stringify(rows()[0]), JSON.stringify(snapshot));
});

test('unavailable API data uses labeled, idempotent estimates without inventing credits', async () => {
  const { context, rows } = fixture(false, [original]);
  context.collectAutomatedAiEventRows = async () => { throw new Error('API unavailable'); };
  const result = await context.setReportTrendDateMode(true);
  assert.equal(result.estimatedRows, 1);
  assert.equal(rows()[0].date_ran, '2026-09-06');
  assert.equal(rows()[0].sum_ai_builder_credits_used, 100);
  assert.equal(rows()[0].date_basis, 'estimated');
  await context.setReportTrendDateMode(true);
  assert.equal(rows()[0].date_ran, '2026-09-06');
  await context.setReportTrendDateMode(false);
  assert.equal(JSON.stringify(rows()[0]), JSON.stringify(original));
});

test('only fresh installs default on; upgrades and explicit settings are preserved', async () => {
  const fresh = fixture();
  delete fresh.storage.mode;
  await fresh.context.initializeReportTrendDateMode('install');
  assert.equal(fresh.storage.mode, true);
  const upgrade = fixture();
  delete upgrade.storage.mode;
  await upgrade.context.initializeReportTrendDateMode('update');
  assert.equal(upgrade.storage.mode, false);
  const existing = fixture(false);
  await existing.context.initializeReportTrendDateMode('install');
  assert.equal(existing.storage.mode, false);
});

test('generated completed-day rows survive repeated off/on switches without date drift', async () => {
  const { context, rows } = fixture(true);
  await context.saveAutomatedReportTrendSnapshot({
    accountHomeId: 'account', group: 'ai-events',
    rows: context.buildAutomatedAiEventTotalsRows([{ environment, rows: events }]),
    sourceGroups: [{ environment, rows: events }],
    dateRange: { range: 'month', startDate: '2026-09-01', endDate: '2026-09-09' },
  });
  for (let repeat = 0; repeat < 2; repeat += 1) {
    await context.setReportTrendDateMode(false);
    await context.setReportTrendDateMode(true);
    assert.equal(rows().at(-1).date_ran, '2026-09-09');
    assert.equal(rows().at(-1).sum_ai_builder_credits_used, 190);
  }
});

test('completed-day mode uses local midnight without changing legacy UTC grouping', () => {
  process.env.TZ = 'America/Los_Angeles';
  try {
    const { context } = fixture();
    const row = event('2026-09-08', 20);
    row.createdOnRaw = '2026-09-08T00:30:00Z';
    assert.equal(context.reportSourceRowDate('ai-events', row), '2026-09-08');
    assert.equal(context.reportSourceRowDate('ai-events', row, true), '2026-09-07');
  } finally {
    process.env.TZ = 'UTC';
  }
});

test('inventory snapshots stay on their observation date and preserve original data', () => {
  const { context } = fixture();
  const inventory = context.completedTrendRow(original, { reportKey: 'solutions' });
  assert.equal(inventory.date_ran, original.date_ran);
  assert.equal(inventory.date_basis, 'inventory');
  assert.equal(JSON.stringify(context.restoreLegacyTrendRows([inventory])[0]), JSON.stringify(original));
});

test('settings persistence failure restores the database before reporting failure', async () => {
  const { context, rows, storage } = fixture(false, [original]);
  context.chrome.storage.local.set = async () => { throw new Error('Storage unavailable'); };
  await assert.rejects(context.setReportTrendDateMode(true), /Storage unavailable/);
  assert.equal(storage.mode, false);
  assert.equal(JSON.stringify(rows()[0]), JSON.stringify(original));
});

test('later API data loss cannot erase a preserved historical total', async () => {
  const { context, rows } = fixture(true, [original]);
  await context.saveAutomatedReportTrendSnapshot({
    accountHomeId: 'account', group: 'ai-events',
    rows: context.buildAutomatedAiEventTotalsRows([{ environment, rows: [] }]),
    sourceGroups: [{ environment, rows: [] }],
    dateRange: { range: 'month', startDate: '2026-09-01', endDate: '2026-09-09' },
  });
  const preserved = rows().find((row) => row.date_ran === '2026-09-07');
  assert.equal(preserved.sum_ai_builder_credits_used, 100);
  assert.equal(preserved.date_basis, 'estimated');
});

test('generated estimates retain their day and estimate label after toggling off and on', async () => {
  const generated = {
    ...original, date_ran: '2026-09-07', record_date: '2026-09-07', run_date: '2026-09-08',
    collected_at: '2026-09-10T07:00:00Z', date_basis: 'estimated', legacy_rows: [],
  };
  const { context, rows } = fixture(true, [generated]);
  await context.setReportTrendDateMode(false);
  assert.equal(rows()[0].date_ran, '2026-09-08');
  await context.setReportTrendDateMode(true);
  assert.equal(rows()[0].date_ran, '2026-09-07');
  assert.equal(rows()[0].date_basis, 'estimated');
});

test('agent sessions and flow runs backfill using their event dates, excluding today', () => {
  const { context } = fixture();
  context.isSuccessfulFlowRun = (row) => row.status === 'Succeeded';
  context.isFailedFlowRun = (row) => row.status === 'Failed';
  vm.runInNewContext([
    extract('function buildAutomatedAgentSessionTotalsRows(', 'async function buildAutomatedAgentSessionTotalsWorkbook('),
    extract('function buildAutomatedFlowRunTotalsRows(', 'async function buildAutomatedFlowRunTotalsWorkbook('),
  ].join('\n'), context);
  for (const group of ['agent-sessions', 'flow-runs']) {
    const snapshots = context.buildAutomatedReportTrendBackfillSnapshots({
      group, dateRan: '2026-09-10', useLocalDate: true,
      dateRange: { startDate: '2026-09-07', endDate: '2026-09-09' },
      sourceGroups: [{ environment, rows: ['07', '08', '09', '10'].map((day) => ({
        conversationStartTime: `2026-09-${day}T12:00:00Z`,
        startTimeRaw: `2026-09-${day}T12:00:00Z`,
        status: 'Succeeded', agentName: 'Agent',
      })) }],
    });
    const header = group === 'agent-sessions' ? 'Total Sessions' : 'Total flow runs';
    assert.equal(snapshots.at(-1).dateRan, '2026-09-09');
    assert.equal(snapshots.at(-1).rows[0][header], 3);
  }
});

test('completed-day report caches cannot reuse collection-day workbooks', async () => {
  const { context, storage } = fixture(false);
  const keys = [];
  Object.assign(context, {
    reportCacheKey: (kind, value) => { keys.push(value); return JSON.stringify(value); },
    reportCacheAccountId: () => 'account',
    reportCacheEnvironments: () => [],
    readDailyReportCache: async () => null,
    writeDailyReportCache: async () => {},
    serialiseAutomatedReport: (report) => report,
    buildAutomatedReport: async () => ({ filename: 'test.xlsx' }),
  });
  vm.runInNewContext(extract('async function getOrBuildCachedAutomatedReport(', 'async function readAutomatedReportSchedule('), context);
  await context.getOrBuildCachedAutomatedReport('ai-events', 'totals');
  storage.mode = true;
  await context.getOrBuildCachedAutomatedReport('ai-events', 'totals');
  assert.equal(keys[0].dateMode, undefined);
  assert.equal(keys[1].dateMode, 'completed-day-v2');
});

test('recovery excludes early collection-day events instead of treating a valid lower total as missing data', async () => {
  const snapshot = {
    ...original, date_ran: '2026-09-08', collected_at: '2026-09-08T07:00:00Z',
    count_of_events: 3, sum_ai_builder_credits_used: 150,
  };
  const { context, rows } = fixture(false, [snapshot]);
  context.collectAutomatedAiEventRows = async () => [{ environment, rows: events }];
  const result = await context.setReportTrendDateMode(true);
  assert.equal(result.recoveredRows, 1);
  assert.equal(rows()[0].date_ran, '2026-09-07');
  assert.equal(rows()[0].count_of_events, 2);
  assert.equal(rows()[0].sum_ai_builder_credits_used, 120);
});