import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ExcelJS from 'exceljs';
import { serverFunction } from '../scripts/sync-platforms.mjs';

const root = path.resolve(import.meta.dirname, '..');
const source = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

test('Node upgrades legacy SQLite data, persists date mode, and serves historical chart inventories', async () => {
  const temporaryRoot = path.join(tmpdir(), 'opencode');
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(path.join(temporaryRoot, 'pdac-parity-'));
  const database = path.join(directory, 'report-trends.sqlite');
  const seed = new DatabaseSync(database);
  seed.exec(`
    CREATE TABLE report_ai_flow_event_totals (
      id INTEGER PRIMARY KEY AUTOINCREMENT, account_home_id TEXT NOT NULL DEFAULT '',
      date_ran TEXT NOT NULL, collected_at TEXT NOT NULL,
      range_key TEXT NOT NULL DEFAULT '', range_label TEXT NOT NULL DEFAULT '',
      environment_id TEXT NOT NULL DEFAULT '', environment_display_name TEXT NOT NULL DEFAULT '',
      environment_url TEXT NOT NULL DEFAULT '', count_of_events REAL NOT NULL DEFAULT 0,
      sum_ai_builder_credits_used REAL NOT NULL DEFAULT 0,
      sum_copilot_studio_credits_used REAL NOT NULL DEFAULT 0, total_credits_consumed REAL NOT NULL DEFAULT 0
    );
    INSERT INTO report_ai_flow_event_totals (date_ran, collected_at, environment_id, sum_ai_builder_credits_used)
      VALUES ('2026-10-01', '2026-10-01T07:00:00Z', 'env', 100);
    CREATE TABLE report_solution_component_names (
      environment_key TEXT PRIMARY KEY, account_home_id TEXT NOT NULL DEFAULT '',
      environment_id TEXT NOT NULL DEFAULT '', environment_display_name TEXT NOT NULL DEFAULT '',
      environment_url TEXT NOT NULL DEFAULT '', collected_at TEXT NOT NULL DEFAULT '',
      component_names TEXT NOT NULL DEFAULT '{}'
    );
    INSERT INTO report_solution_component_names (environment_key, environment_id, environment_url, collected_at, component_names)
      VALUES ('legacy', 'env', 'https://env.crm.dynamics.com', '2026-09-30T07:00:00Z', '{"flows":["Legacy flow"]}');
  `);
  seed.close();
  await writeFile(path.join(directory, 'automated-report-schedule.json'), '{"enabled":false,"groups":{}}');
  let running;
  try {
    running = await startServer(directory);
    const request = async (route, body, method = 'POST') => {
      const response = await fetch(`${running.url}${route}`, body === undefined ? undefined : {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      return result;
    };
    assert.equal((await request('/api/report-trends/date-mode')).useRecordDate, false, 'existing users retain run-date view');
    const db = new DatabaseSync(database);
    try {
      const columns = db.prepare('PRAGMA table_info(report_solution_component_names)').all().map((row) => row.name);
      assert.ok(columns.includes('date_ran') && columns.includes('component_records'));
      const original = { ...db.prepare('SELECT * FROM report_ai_flow_event_totals').get() };
      assert.equal(original.data_date, '2026-09-30');
      for (const useRecordDate of [true, false, true]) {
        await request('/api/report-trends/date-mode', { useRecordDate }, 'PUT');
        const report = await request('/api/report-trends?range=custom&start=2026-09-30&end=2026-09-30');
        assert.equal(report.rows.length, useRecordDate ? 1 : 0);
        if (useRecordDate) {
          const row = report.tables.find((table) => table.reportKey === 'ai-events').rows[0];
          assert.equal(row.dateRan, '2026-10-01');
          assert.equal(row.dataDate, '2026-09-30');
          assert.equal(row.reportDate, '2026-09-30');
          assert.equal(row.values.sum_ai_builder_credits_used, 100);
        }
        assert.deepEqual({ ...db.prepare('SELECT * FROM report_ai_flow_event_totals').get() }, original, 'toggling must not modify totals or dates');
      }

      const environment = { environmentId: 'env', orgUrl: 'https://env.crm.dynamics.com' };
      const legacy = await request('/api/report-chart-records', { kind: 'flows', environment, dateRan: '2026-09-30' });
      assert.equal(legacy.rows[0].name, 'Legacy flow');
      assert.match(legacy.note, /names only/);
      const insert = db.prepare(`INSERT INTO report_solution_component_names
        (environment_key, environment_id, environment_url, collected_at, date_ran, component_records, account_home_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`);
      for (const [date, account] of [['2026-10-01', ''], ['2026-10-02', ''], ['2026-10-01', 'other']]) {
        insert.run(`${date}:${account}`, 'env', environment.orgUrl, `${date}T07:00:00Z`, date,
          JSON.stringify({ flows: [{ name: `${account || 'Local'} flow ${date}`, id: date }] }), account);
      }
      const historical = await request('/api/report-chart-records', { kind: 'flows', environment, dateRan: '2026-10-01' });
      assert.equal(historical.rows.length, 1);
      assert.equal(historical.rows[0].name, 'Local flow 2026-10-01');
      assert.match(historical.note, /^Saved inventory/);
      const fallback = await request('/api/report-chart-records', { kind: 'flows', environment, dateRan: '2026-09-29' });
      assert.equal(fallback.rows[0].id, '2026-10-02');
      assert.match(fallback.note, /latest saved inventory/);
      const excluded = await fetch(`${running.url}/api/report-chart-records`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'flow-runs', environment }),
      });
      assert.equal(excluded.status, 400);

      db.prepare('UPDATE report_ai_flow_event_totals SET account_home_id = ?').run('portable-account');
      const exportResponse = await fetch(`${running.url}/api/sql-tables/report_ai_flow_event_totals/export`);
      assert.equal(exportResponse.status, 200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(await exportResponse.arrayBuffer()));
      const sheet = workbook.worksheets[0];
      const headers = sheet.getRow(1).values.slice(1);
      assert.equal(sheet.getRow(2).getCell(headers.indexOf('data_date') + 1).text, '2026-09-30');
      // Old exports without data_date remain importable.
      sheet.spliceColumns(headers.indexOf('data_date') + 1, 1);
      const imported = await request('/api/sql-tables/import', { xlsx: Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64') });
      assert.equal(imported.importedRows, 1);
      assert.equal(imported.replacedRows, 1);
      assert.equal(db.prepare('SELECT data_date FROM report_ai_flow_event_totals').get().data_date, '2026-09-30');
    } finally {
      db.close();
    }
    await running.stop();
    running = await startServer(directory);
    assert.equal((await request('/api/report-trends/date-mode')).useRecordDate, true, 'preference survives restart');
    await running.stop();
    const freshDirectory = path.join(directory, 'fresh');
    await mkdir(freshDirectory);
    await writeFile(path.join(freshDirectory, 'report-trends.sqlite'), '');
    await writeFile(path.join(freshDirectory, 'automated-report-schedule.json'), '{"enabled":false,"groups":{}}');
    running = await startServer(freshDirectory);
    assert.equal((await request('/api/report-trends/date-mode')).useRecordDate, true, 'new installations default to data dates');
  } finally {
    await running?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('Node snapshot writes reconstruct completed activity days and retain distinct daily solution records', async () => {
  const db = new DatabaseSync(':memory:');
  const context = {
    DatabaseSync, console,
    getReportTrendDb: async () => db,
    populateReportTrendDataDates: async () => 0,
    dateRangeLabel: () => 'Test range',
    reportTrendRetentionCutoffDate: () => '2024-01-01',
    buildSolutionTrendBackfillRowsBuilder: () => null,
    atStartOfDay: (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()),
    addDays: (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days),
    parseDateOnly: (date) => new Date(`${date}T00:00:00`),
    toDateOnlyString: (date) => context.reportCacheDateKey(date),
    buildAutomatedAgentSessionTotalsRows: () => [],
    buildAutomatedFlowRunTotalsRows: () => [],
  };
  const definitionStart = source.indexOf('const REPORT_TOTAL_TABLE_DEFINITIONS =');
  vm.runInNewContext([
    source.slice(definitionStart, source.indexOf('\n};', definitionStart) + 3),
    'let reportTrendWriteQueue = Promise.resolve();',
    ...[
      'getSqlTableColumns', 'quoteSqlIdentifier', 'quoteSqlLiteral', 'ensureReportTotalTable',
      'ensureSolutionComponentNamesTable', 'enqueueReportTrendWrite', 'reportCacheDateKey',
      'reportTrendRunDate', 'reportTrendDataDate', 'reportTotalTableDefinition', 'sqlReportTotalValue',
      'reportTrendEnvironmentKey', 'isDateOnlyString', 'reportSourceRowDate',
      'buildAutomatedAiEventTotalsRows', 'buildAutomatedReportTrendBackfillSnapshots',
      'saveAutomatedReportTrendSnapshot', 'saveSolutionComponentNameSnapshots',
    ].map((name) => serverFunction(source, name)),
    'for (const definition of Object.values(REPORT_TOTAL_TABLE_DEFINITIONS)) ensureReportTotalTable(db, definition);',
    'ensureSolutionComponentNamesTable(db);',
  ].join('\n'), Object.assign(context, { db }));
  try {
    const environment = { environmentId: 'env', orgUrl: 'https://env.crm.dynamics.com' };
    const now = new Date();
    const dates = [-3, -2, -1].map((offset) => context.reportCacheDateKey(context.addDays(now, offset)));
    const rows = dates.map((date, index) => ({ createdOnRaw: `${date}T12:00:00`, creditType: 'AI Builder', creditsConsumed: index + 1 }));
    const input = {
      accountHomeId: 'account', group: 'ai-events', sourceGroups: [{ environment, rows }],
      rows: [{ 'Environment id': 'env' }], dateRange: { range: 'custom', startDate: dates[0], endDate: dates[2] },
    };
    await context.saveAutomatedReportTrendSnapshot(input);
    await context.saveAutomatedReportTrendSnapshot(input);
    const snapshots = db.prepare('SELECT * FROM report_ai_flow_event_totals ORDER BY data_date').all();
    assert.deepEqual(snapshots.map((row) => row.data_date), dates);
    assert.deepEqual(snapshots.map((row) => row.sum_ai_builder_credits_used), [1, 3, 6]);
    assert.equal(snapshots.at(-1).date_ran, context.reportCacheDateKey(now));
    const group = [{ environment, componentNames: { flows: ['Flow'] }, componentRecords: { flows: [{ id: 'flow', name: 'Flow' }] } }];
    for (const timestamp of ['2026-10-01T10:00:00Z', '2026-10-02T10:00:00Z', '2026-10-02T11:00:00Z']) {
      context.saveSolutionComponentNameSnapshots(db, 'account', group, timestamp);
    }
    const inventories = db.prepare('SELECT * FROM report_solution_component_names ORDER BY collected_at').all();
    assert.equal(inventories.length, 2);
    assert.equal(inventories[1].collected_at, '2026-10-02T11:00:00Z');
    assert.equal(JSON.parse(inventories[1].component_records).flows[0].id, 'flow');
  } finally {
    db.close();
  }
});

async function startServer(directory) {
  const listener = http.createServer();
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: root, windowsHide: true,
    env: { ...process.env, PORT: String(port), SECURITY_ROLES_PORT: String(port), PDAC_DATA_DIR: directory, PDAC_TEST_NO_AUTH: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (chunk) => { output += chunk; });
  server.stderr.on('data', (chunk) => { output += chunk; });
  const stop = async () => {
    if (server.exitCode !== null || server.signalCode !== null) return;
    await new Promise((resolve) => { server.once('exit', resolve); server.kill(); });
  };
  const url = `http://127.0.0.1:${port}`;
  try {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (server.exitCode !== null) throw new Error(output);
      try {
        if ((await fetch(`${url}/weekly-report.js`)).ok) return { url, stop };
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Test server did not start: ${output}`);
  } catch (error) {
    await stop();
    throw error;
  }
}
