import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { after } from 'node:test';
import vm from 'node:vm';
import ExcelJS from 'exceljs';

const originalTimezone = process.env.TZ;
process.env.TZ = 'UTC';
after(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

const source = readFileSync(new URL('../src/server-core.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const extract = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end));
const RealDate = Date;
class ClockDate extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : ['2026-10-01T07:00:00Z']));
  }
}
class OctoberClock extends RealDate {
  constructor(...args) { super(...(args.length ? args : ['2026-10-07T07:00:00Z'])); }
}

const definition = {
  tableName: 'report_ai_flow_event_totals', reportKey: 'ai-events',
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
    REPORT_TREND_DATE_MODE_STORAGE_KEY: 'mode',
    REPORT_TOTAL_TABLE_DEFINITIONS: { 'ai-events': definition },
    REPORT_TREND_RETENTION_DAYS: 730,
    reportTotalTableDefinition: () => definition,
    reportTotalTableDefinitionByName: () => definition,
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
    getReportTrendDateRange: (filters) => ({ range: 'custom', startDate: filters.start, endDate: filters.end }),
    dateRangeLabel: () => 'test range',
    reportTrendRetentionCutoffDate: () => '2024-10-01',
    sqlReportTotalValue: (value, type) => type === 'REAL' ? Number(value || 0) : String(value || ''),
    buildSolutionTrendBackfillRowsBuilder: () => null,
    buildAutomatedAgentSessionTotalsRows: () => [],
    buildAutomatedFlowRunTotalsRows: () => [],
    readSolutionComponentNames: async () => ({}),
    chrome: { storage: { local: {
      get: async () => storage,
      set: async (values) => Object.assign(storage, values),
    } } },
    trendSelectRows: async (table) => rows.filter((row) => row.table === table),
    trendUpdateRows: async (predicate, update) => {
      let updated = 0;
      rows = rows.map((row) => {
        if (!predicate(row)) return row;
        updated += 1;
        return update(row);
      });
      return updated;
    },
    trendRewriteRows: async (predicate, rewrite) => {
      const rewritten = rewrite(rows.filter(predicate));
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
  const blocks = [
    'let reportTrendWriteQueue = Promise.resolve();',
    extract(source, 'function reportCacheDateKey(', 'async function readDailyReportCache('),
    extract(source, 'async function enqueueReportTrendWrite(', 'const SOLUTION_COMPONENT_NAMES_TABLE'),
    extract(source, 'function buildAutomatedReportTrendBackfillSnapshots(', 'function buildSolutionTrendBackfillRowsBuilder('),
    extract(source, 'function reportSourceRowDate(', 'function sqlReportTotalValue('),
    extract(source, 'async function listReportTrendSnapshots(', 'async function listSqlTables('),
    extract(source, 'function trendDataImportColumns(', 'async function buildTrendDataImportTemplate('),
    extract(source, 'function getSqlTableColumnNames(', 'async function exportSqlTablesWorkbook('),
    extract(source, 'function buildAutomatedAiEventTotalsRows(', 'async function buildAutomatedAiEventTotalsWorkbook('),
  ];
  vm.runInNewContext(blocks.join('\n').replace('export async function initializeReportTrendDateMode', 'async function initializeReportTrendDateMode'), context);
  return { context, storage, rows: () => rows };
}

const environment = { environmentId: 'env', orgUrl: 'https://example.test' };
const original = {
  id: 1, table: definition.tableName, account_home_id: 'account',
  environment_id: 'env', environment_url: 'https://example.test',
  date_ran: '2026-09-21', collected_at: '2026-09-21T07:00:00Z',
  range_key: 'month:2026-09-01:2026-09-30',
  count_of_events: 1, sum_ai_builder_credits_used: 100,
};
const event = (date, credits) => ({ createdOnRaw: `${date}T12:00:00Z`, creditType: 'AI Builder', creditsConsumed: credits });
const events = [event('2026-09-17', 100), event('2026-09-18', 10), event('2026-09-21', 20), event('2026-09-28', 30), event('2026-10-01', 90)];

function chartFixture() {
  const context = {
    Date: ClockDate,
    el: { trendCreditPerDay: { checked: true } },
    number: (value) => Number(value || 0),
    chartEnvironmentOptions: () => [{ id: 'env' }],
    selectedReportChartEnvironmentIds: () => new Set(['env']),
    filterTrendRowsByEnvironment: (rows) => rows,
    reportPalette: () => ['#2563eb'],
    withReportChartSettings: (chart) => chart,
    reportDataset: (label, data, color, options) => ({ label, data, ...options }),
    formatDateLabel: (value) => value,
    formatDateInputValue: (value) => [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-'),
  };
  vm.runInNewContext([
    extract(appSource, 'function buildAiRollingCreditChart(', 'function buildStackedEnvironmentBarChart('),
    extract(appSource, 'function buildStackedEnvironmentBarChart(', 'function buildFlowRunStatusChart('),
    extract(appSource, 'function sumRowsByDate(', 'function formatDateLabel('),
  ].join('\n'), context);
  return context;
}

test('blank data dates become run date minus one day without changing run dates or values', async () => {
  const { context, rows } = fixture(false, [original]);
  await context.setReportTrendDateMode(true);
  assert.equal(rows()[0].data_date, '2026-09-20');
  assert.equal(rows()[0].date_ran, '2026-09-21');
  assert.equal(rows()[0].sum_ai_builder_credits_used, 100);
  await context.setReportTrendDateMode(false);
  await context.setReportTrendDateMode(true);
  assert.equal(rows()[0].data_date, '2026-09-20');
  assert.equal(rows()[0].date_ran, '2026-09-21');
  assert.equal(rows()[0].sum_ai_builder_credits_used, 100);
});

test('explicit source dates survive toggles; no API collection is performed', async () => {
  const { context, rows } = fixture(false, [{ ...original, data_date: '2026-09-18' }]);
  context.collectAutomatedAiEventRows = () => { throw new Error('Toggle must not collect events'); };
  await context.setReportTrendDateMode(true);
  await context.setReportTrendDateMode(false);
  assert.equal(rows()[0].data_date, '2026-09-18');
  assert.equal(rows()[0].date_ran, original.date_ran);
  assert.equal(rows()[0].sum_ai_builder_credits_used, 100);
});

test('previous physically shifted rows normalize to their recorded run date exactly once', async () => {
  const { context, rows } = fixture(true, [{ ...original, date_ran: '2026-09-20', run_date: '2026-09-21', date_basis: 'estimated' }]);
  await context.populateReportTrendDataDates();
  await context.setReportTrendDateMode(false);
  await context.setReportTrendDateMode(true);
  assert.equal(rows()[0].date_ran, '2026-09-21');
  assert.equal(rows()[0].data_date, '2026-09-20');
  assert.equal(rows()[0].sum_ai_builder_credits_used, 100);
});

test('report filtering uses the selected date and returns both original dates', async () => {
  const { context } = fixture(false, [original]);
  const filters = { accountHomeId: 'account', start: '2026-09-20', end: '2026-09-20' };
  assert.equal((await context.listReportTrendSnapshots(filters)).rows.length, 0);
  await context.setReportTrendDateMode(true);
  const report = await context.listReportTrendSnapshots(filters);
  assert.equal(report.rows.length, 1);
  assert.equal(report.tables[0].rows[0].dateRan, '2026-09-21');
  assert.equal(report.tables[0].rows[0].dataDate, '2026-09-20');
  assert.equal(report.tables[0].rows[0].reportDate, '2026-09-20');
});

test('activity collection keeps run/data dates separate regardless of display mode', async () => {
  for (const mode of [false, true]) {
    const { context, rows } = fixture(mode);
    await context.saveAutomatedReportTrendSnapshot({
      accountHomeId: 'account', group: 'ai-events',
      rows: context.buildAutomatedAiEventTotalsRows([{ environment, rows: events }]),
      sourceGroups: [{ environment, rows: events }],
      dateRange: { range: 'month', startDate: '2026-09-17', endDate: '2026-09-30' },
    });
    const last = rows().at(-1);
    assert.equal(last.date_ran, '2026-10-01');
    assert.equal(last.data_date, '2026-09-30');
    assert.equal(last.sum_ai_builder_credits_used, 160);
    assert.equal(rows().some((row) => row.data_date === '2026-10-01'), false);
  }
});

test('daily chart leaves both weekends and today empty, with Monday usage on Monday', async () => {
  const { context } = fixture(true);
  await context.saveAutomatedReportTrendSnapshot({
    accountHomeId: 'account', group: 'ai-events',
    rows: context.buildAutomatedAiEventTotalsRows([{ environment, rows: events }]),
    sourceGroups: [{ environment, rows: events }],
    dateRange: { range: 'month', startDate: '2026-09-17', endDate: '2026-09-30' },
  });
  const report = await context.listReportTrendSnapshots({ accountHomeId: 'account', start: '2026-09-17', end: '2026-10-02' });
  const chartContext = chartFixture();
  const chart = chartContext.buildAiRollingCreditChart(report.tables[0], report.range, { id: 'credits', valueKey: 'sum_ai_builder_credits_used', color: '#9333ea' });
  const value = (date) => chart.datasets[0].data[chart.labels.indexOf(date)];
  assert.equal(value('2026-09-18'), 10);
  assert.equal(value('2026-09-21'), 20);
  assert.equal(value('2026-09-28'), 30);
  for (const date of ['2026-09-19', '2026-09-20', '2026-09-26', '2026-09-27', '2026-10-01']) assert.equal(value(date), null);
  assert.equal(chart.datasets[0].spanGaps, false);
});

test('monthly charts and forecasts follow both date modes without counting the previous month total as usage', async () => {
  const snapshots = [
    ['2026-09-30', '2026-09-29', 1000],
    ['2026-10-01', '2026-09-30', 1010],
    ['2026-10-02', '2026-10-01', 4],
    ['2026-10-03', '2026-10-02', 10],
    ['2026-10-04', '2026-10-03', 10],
    ['2026-10-05', '2026-10-04', 10],
    ['2026-10-06', '2026-10-05', 18],
    ['2026-10-07', '2026-10-06', 20],
  ].map(([runDate, dataDate, total], index) => ({
    ...original, id: index + 1, date_ran: runDate, data_date: dataDate,
    collected_at: `${runDate}T07:00:00Z`,
    range_key: `month:${dataDate.slice(0, 7)}-01:${dataDate}`,
    count_of_events: total,
    sum_ai_builder_credits_used: total,
  }));
  const { context, rows } = fixture(false, snapshots);
  const chartContext = chartFixture();
  context.Date = OctoberClock;
  chartContext.Date = OctoberClock;
  const options = { id: 'credits', valueKey: 'sum_ai_builder_credits_used', color: '#2563eb' };
  const value = (chart, dataset, date) => chart.datasets[dataset].data[chart.labels.indexOf(date)];
  for (const mode of [true, false, true, false]) {
    await context.setReportTrendDateMode(mode);
    const report = await context.listReportTrendSnapshots({ accountHomeId: 'account', start: '2026-10-01', end: '2026-10-07' });
    chartContext.el.trendCreditPerDay.checked = true;
    const dailyChart = chartContext.buildAiRollingCreditChart(report.tables[0], report.range, options);
    assert.equal(value(dailyChart, 0, '2026-10-01'), mode ? 4 : 10);
    assert.equal(value(dailyChart, 0, '2026-10-02'), mode ? 6 : 4);
    assert.equal(value(dailyChart, 1, '2026-10-08'), mode ? 4 : 10);
    const dailyCountsChart = chartContext.buildStackedEnvironmentBarChart(report.tables[0], report.range, {
      ...options, valueKey: 'count_of_events', perDay: true,
    });
    assert.equal(value(dailyCountsChart, 0, '2026-10-01'), mode ? 4 : 10);
    assert.equal(value(dailyCountsChart, 0, '2026-10-02'), mode ? 6 : 4);
    chartContext.el.trendCreditPerDay.checked = false;
    const rollingChart = chartContext.buildAiRollingCreditChart(report.tables[0], report.range, options);
    assert.equal(value(rollingChart, 0, '2026-10-01'), mode ? 4 : 10);
    assert.equal(value(rollingChart, 0, '2026-10-02'), mode ? 10 : 14);
    assert.ok(rollingChart.datasets[1].data.filter((total) => total !== null).every((total) => total < 200));
    const partialReport = await context.listReportTrendSnapshots({ accountHomeId: 'account', start: '2026-10-03', end: '2026-10-07' });
    const partialChart = chartContext.buildAiRollingCreditChart(partialReport.tables[0], partialReport.range, options);
    assert.equal(value(partialChart, 0, '2026-10-03'), value(rollingChart, 0, '2026-10-03'));
    assert.ok(partialReport.tables[0].rows.every((row) => row.reportDate >= '2026-10-03'));
    assert.equal(report.tables[0].rows[0].reportDate, mode ? report.tables[0].rows[0].dataDate : report.tables[0].rows[0].dateRan);
  }
  assert.deepEqual(rows().map((row) => row.sum_ai_builder_credits_used), snapshots.map((row) => row.sum_ai_builder_credits_used));
});

test('missing mid-month history is not treated as one day of usage by the forecast', () => {
  const context = chartFixture();
  context.Date = OctoberClock;
  const table = { rows: [
    { dateRan: '2026-10-06', dataDate: '2026-10-05', reportDate: '2026-10-05', rangeKey: 'month:2026-10-01:2026-10-05', values: { environment_id: 'env', credits: 1000 } },
    { dateRan: '2026-10-07', dataDate: '2026-10-06', reportDate: '2026-10-06', rangeKey: 'month:2026-10-01:2026-10-06', values: { environment_id: 'env', credits: 1010 } },
  ] };
  const chart = context.buildAiRollingCreditChart(table, { startDate: '2026-10-01', endDate: '2026-10-07' }, { id: 'credits', valueKey: 'credits', color: '#2563eb' });
  const value = (dataset, date) => chart.datasets[dataset].data[chart.labels.indexOf(date)];
  assert.equal(value(0, '2026-10-05'), null);
  assert.equal(value(0, '2026-10-06'), 10);
  assert.equal(value(1, '2026-10-08'), 10);
});

test('monthly resets are calculated per environment and an absent baseline leaves usage unknown', () => {
  const context = chartFixture();
  const row = (date, sourceDate, environmentId, credits) => ({
    reportDate: date, dateRan: date, dataDate: sourceDate,
    rangeKey: `month:${sourceDate.slice(0, 7)}-01:${sourceDate}`,
    values: { environment_id: environmentId, credits },
  });
  const baselineRows = [row('2026-09-30', '2026-09-29', 'env', 1000), row('2026-09-30', '2026-09-29', 'env2', 2000)];
  const rows = [
    row('2026-10-01', '2026-09-30', 'env', 1010), row('2026-10-01', '2026-09-30', 'env2', 2020),
    row('2026-10-02', '2026-10-01', 'env', 4), row('2026-10-02', '2026-10-01', 'env2', 7),
  ];
  const usage = context.buildTrendUsage(rows, baselineRows, 'credits');
  assert.equal(usage.daily.get('2026-10-01'), 30);
  assert.equal(usage.daily.get('2026-10-02'), 11);
  assert.equal(usage.rolling.get('2026-10-01'), 30);
  assert.equal(usage.rolling.get('2026-10-02'), 41);
  assert.equal(usage.perEnvironment.get('env:2026-10-01'), 10);
  assert.equal(usage.perEnvironment.get('env2:2026-10-01'), 20);
  const unknown = context.buildTrendUsage(rows, [], 'credits');
  assert.equal(unknown.daily.has('2026-10-01'), false);
  assert.equal(unknown.rolling.get('2026-10-01'), null);
  assert.equal(unknown.rolling.get('2026-10-02'), 11);
});

test('switching back to run dates cannot be overwritten by older trend or chart dashboard responses', async () => {
  const backend = fixture(true, [original]);
  const filters = { accountHomeId: 'account', start: '2026-09-01', end: '2026-09-30' };
  const dataDateReport = await backend.context.listReportTrendSnapshots(filters);
  await backend.context.setReportTrendDateMode(false);
  const runDateReport = await backend.context.listReportTrendSnapshots(filters);
  for (const [loader, property] of [
    ['loadCachedReportsDashboard', 'dashboardData'],
    ['loadCachedChartsDashboard', 'chartDashboardData'],
  ]) {
    const responses = [];
    const rendered = [];
    const context = {
      URLSearchParams, console,
      state: { automatedReports: {} },
      el: { trendRange: { value: 'month' }, reportsStatus: {}, chartsStatus: {} },
      resolveRequestAccountId: () => 'account',
      api: () => new Promise((resolve) => responses.push(resolve)),
      updateReportsTabAvailability: () => {},
      updateChartsTabAvailability: () => {},
      renderReportsPlaceholder: () => {},
      hydrateReportComponentNames: async (report) => report,
      buildLatestSqlChartsDashboard: (report) => report,
      renderReportsDashboard: (report) => rendered.push(report),
      renderChartsDashboard: (report) => rendered.push(report),
    };
    vm.runInNewContext(extract(appSource, 'async function loadCachedReportsDashboard(', 'async function hydrateReportComponentNames('), context);
    const oldRefresh = context[loader]();
    const runDateRefresh = context[loader]();
    responses[1](runDateReport);
    await runDateRefresh;
    responses[0](dataDateReport);
    await oldRefresh;
    assert.equal(context.state.automatedReports[property].useRecordDate, false);
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0].tables[0].rows[0].reportDate, original.date_ran);
  }
});

test('data-date reports reject current-day partial activity points', async () => {
  const { context } = fixture(true, [{ ...original, date_ran: '2026-10-02', data_date: '2026-10-01' }]);
  const report = await context.listReportTrendSnapshots({ accountHomeId: 'account', start: '2026-10-01', end: '2026-10-02' });
  assert.equal(report.rows.length, 0);
});

test('Excel export columns include a populated data_date while retaining date_ran', async () => {
  const { context } = fixture(false, [original]);
  assert.ok(context.trendDataImportColumns(definition).includes('data_date'));
  const [row] = await context.getFlatSqlTableRows(definition.tableName);
  assert.equal(row.date_ran, '2026-09-21');
  assert.equal(row.data_date, '2026-09-20');
  assert.equal(row.sum_ai_builder_credits_used, 100);
});

test('month rollover fills a blank data date using the previous month last day', () => {
  const { context } = fixture();
  assert.equal(context.reportTrendDataDate({ date_ran: '2026-10-01' }), '2026-09-30');
  assert.equal(context.reportTrendDataDate({ date_ran: '2026-03-01' }), '2026-02-28');
});

test('settings persistence failure restores the original rows', async () => {
  const { context, rows, storage } = fixture(false, [original]);
  context.chrome.storage.local.set = async () => { throw new Error('Storage unavailable'); };
  await assert.rejects(context.setReportTrendDateMode(true), /Storage unavailable/);
  assert.equal(storage.mode, false);
  assert.equal(JSON.stringify(rows()[0]), JSON.stringify(original));
});

test('new installs default on without changing existing explicit preferences', async () => {
  const fresh = fixture();
  delete fresh.storage.mode;
  await fresh.context.initializeReportTrendDateMode('install');
  assert.equal(fresh.storage.mode, true);
  const existing = fixture(false);
  await existing.context.initializeReportTrendDateMode('update');
  assert.equal(existing.storage.mode, false);
});

function workbookFixture(initialRows = []) {
  const result = fixture(true, initialRows);
  Object.assign(result.context, {
    ExcelJS, Buffer,
    HttpError: class extends Error {
      constructor(status, message) { super(message); this.status = status; }
    },
    getUserSqlTableNames: () => [definition.tableName],
    uniqueWorksheetName: (name) => name,
    columnWidth: () => 24,
    styleSqlWorksheet: () => {},
    cachedCellValue: (value) => value?.result ?? value ?? '',
  });
  vm.runInNewContext([
    extract(source, 'async function parseTrendDataImportWorkbook(', 'async function importTrendDataWorkbook('),
    extract(source, 'async function exportSingleSqlTableWorkbook(', 'function styleSqlWorksheet('),
  ].join('\n'), result.context);
  return result;
}

test('real XLSX export and reimport preserves run date, explicit data date, and totals', async () => {
  const { context } = workbookFixture([{ ...original, data_date: '2026-09-18' }]);
  const bytes = await context.exportSingleSqlTableWorkbook(definition.tableName);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.getWorksheet(definition.tableName);
  assert.ok(sheet.getRow(1).values.includes('data_date'));
  const imports = await context.parseTrendDataImportWorkbook(Buffer.from(bytes).toString('base64'));
  assert.equal(imports[0].rows[0].date_ran, '2026-09-21');
  assert.equal(imports[0].rows[0].data_date, '2026-09-18');
  assert.equal(imports[0].rows[0].sum_ai_builder_credits_used, 100);
});

test('older XLSX headers and blank data dates both default to the previous run day', async () => {
  for (const legacy of [true, false]) {
    const { context } = workbookFixture();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(definition.tableName);
    const columns = context.trendDataImportColumns(definition).filter((header) => !legacy || header !== 'data_date');
    sheet.columns = columns.map((header) => ({ header, key: header }));
    sheet.addRow(original);
    const bytes = await workbook.xlsx.writeBuffer();
    const imports = await context.parseTrendDataImportWorkbook(Buffer.from(bytes).toString('base64'));
    assert.equal(imports[0].rows[0].date_ran, '2026-09-21');
    assert.equal(imports[0].rows[0].data_date, '2026-09-20');
    assert.equal(imports[0].rows[0].sum_ai_builder_credits_used, 100);
  }
});