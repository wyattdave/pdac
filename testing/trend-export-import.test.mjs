import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import ExcelJS from 'exceljs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

test('server keeps latest report downloads and round-trips trend exports', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'pdac-trend-export-import-'));
  await Promise.all([
    mkdir(path.join(dataDirectory, 'report-cache')),
    writeFile(path.join(dataDirectory, 'report-trends.sqlite'), ''),
    writeFile(path.join(dataDirectory, 'automated-report-schedule.json'), '{"enabled":false,"groups":{}}\n'),
  ]);
  const cacheDateDirectory = path.join(dataDirectory, 'report-cache', localDateKey(new Date()));
  await mkdir(cacheDateDirectory);
  await Promise.all([
    writeFile(path.join(cacheDateDirectory, 'older-agent-sessions.json'), JSON.stringify({
      version: 1,
      kind: 'automated',
      accountHomeId: '',
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      value: {
        reportGroup: 'agent-sessions',
        multiple: false,
        files: [{
          filename: 'agent-sessions-raw-stacked-older.xlsx',
          base64: Buffer.from('older').toString('base64'),
        }],
      },
    })),
    writeFile(path.join(cacheDateDirectory, 'newer-agent-sessions.json'), JSON.stringify({
      version: 1,
      kind: 'automated',
      accountHomeId: '',
      createdAt: new Date().toISOString(),
      value: {
        reportGroup: 'agent-sessions',
        multiple: false,
        files: [{
          filename: 'agent-sessions-totals-by-environment-newest.xlsx',
          base64: Buffer.from('newest').toString('base64'),
        }],
      },
    })),
  ]);
  const port = await availablePort();
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PORT: String(port),
      PDAC_DATA_DIR: dataDirectory,
      PDAC_TEST_NO_AUTH: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let serverOutput = '';
  server.stdout.on('data', (chunk) => { serverOutput += chunk; });
  server.stderr.on('data', (chunk) => { serverOutput += chunk; });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl, server, () => serverOutput);

    const cachedReportsResponse = await fetch(`${baseUrl}/api/report-cache`);
    assert.equal(cachedReportsResponse.status, 200);
    const cachedReports = await cachedReportsResponse.json();
    assert.deepEqual(cachedReports.files.map((file) => file.filename), [
      'agent-sessions-totals-by-environment-newest.xlsx',
    ]);
    assert.equal(cachedReports.files[0].base64, Buffer.from('newest').toString('base64'));

    const templateResponse = await fetch(`${baseUrl}/api/sql-tables/import-template`);
    assert.equal(templateResponse.status, 200);
    const templateWorkbook = await loadWorkbook(await templateResponse.arrayBuffer());
    const tableName = 'report_ai_flow_event_totals';
    const templateWorksheet = templateWorkbook.getWorksheet(tableName);
    const templateHeaders = worksheetHeaders(templateWorksheet);
    assert.equal(templateHeaders.includes('id'), false);
    const dateRan = new Date().toISOString().slice(0, 10);

    const row = {
      account_home_id: 'portable-account',
      date_ran: dateRan,
      collected_at: `${dateRan}T10:00:00.000Z`,
      range_key: 'portable-export',
      range_label: 'Portable export',
      environment_display_name: 'Portable environment',
      environment_id: 'portable-environment',
      environment_url: 'https://portable.crm.dynamics.com',
      count_of_events: 2,
      sum_ai_builder_credits_used: 12,
      sum_copilot_studio_credits_used: 3,
      total_credits_consumed: 15,
    };
    templateWorksheet.addRow(templateHeaders.map((header) => row[header] ?? ''));
    const seededTemplate = await templateWorkbook.xlsx.writeBuffer();
    const firstImport = await postWorkbook(baseUrl, seededTemplate);
    assert.equal(firstImport.status, 200);
    assert.equal(firstImport.body.importedRows, 1);

    const replacementRow = {
      ...row,
      collected_at: `${dateRan}T11:00:00.000Z`,
      environment_display_name: 'Replacement environment',
      environment_id: 'replacement-environment',
      environment_url: 'https://replacement.crm.dynamics.com',
      count_of_events: 3,
      total_credits_consumed: 16,
    };
    templateWorksheet.spliceRows(2, 1, templateHeaders.map((header) => replacementRow[header] ?? ''));
    const replacementImport = await postWorkbook(baseUrl, await templateWorkbook.xlsx.writeBuffer());
    assert.equal(replacementImport.status, 200);
    assert.equal(replacementImport.body.importedRows, 1);
    assert.equal(replacementImport.body.replacedRows, 1);

    const exportResponse = await fetch(`${baseUrl}/api/sql-tables/export`);
    assert.equal(exportResponse.status, 200);
    const exportBytes = await exportResponse.arrayBuffer();
    const exportWorkbook = await loadWorkbook(exportBytes);
    const exportedDataWorksheet = exportWorkbook.getWorksheet(tableName);
    assert.equal(exportedDataWorksheet.rowCount, 2);
    assert.equal(
      exportedDataWorksheet.getRow(2).getCell(templateHeaders.indexOf('environment_id') + 1).text,
      'replacement-environment',
    );
    for (const templateDataWorksheet of templateWorkbook.worksheets.slice(1)) {
      const exportedWorksheet = exportWorkbook.getWorksheet(templateDataWorksheet.name);
      assert.ok(exportedWorksheet, `Missing exported worksheet ${templateDataWorksheet.name}`);
      assert.deepEqual(worksheetHeaders(exportedWorksheet), worksheetHeaders(templateDataWorksheet));
    }

    const unchangedExportImport = await postWorkbook(baseUrl, exportBytes);
    assert.equal(unchangedExportImport.status, 200);
    assert.equal(unchangedExportImport.body.importedRows, 1);
    assert.equal(unchangedExportImport.body.replacedRows, 1);

    exportWorkbook.getWorksheet(tableName).spliceColumns(1, 0, ['id', 999]);
    const legacyExportImport = await postWorkbook(baseUrl, await exportWorkbook.xlsx.writeBuffer());
    assert.equal(legacyExportImport.status, 200);
    assert.equal(legacyExportImport.body.importedRows, 1);
    assert.equal(legacyExportImport.body.replacedRows, 1);

    const singleExportResponse = await fetch(`${baseUrl}/api/sql-tables/${tableName}/export`);
    assert.equal(singleExportResponse.status, 200);
    const singleExportWorkbook = await loadWorkbook(await singleExportResponse.arrayBuffer());
    assert.deepEqual(worksheetHeaders(singleExportWorkbook.getWorksheet(tableName)), templateHeaders);
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 2_000);
        timeout.unref();
        server.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
        server.kill();
      });
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

async function availablePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function localDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

async function waitForServer(baseUrl, server, output) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`PDAC test server exited early (${server.exitCode}).\n${output()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/status`);
      if (response.ok) {
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`PDAC test server did not become ready.\n${output()}`);
}

async function loadWorkbook(bytes) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes));
  return workbook;
}

function worksheetHeaders(worksheet) {
  assert.ok(worksheet);
  return worksheet.getRow(1).values.slice(1).map((value) => String(value || '').trim());
}

async function postWorkbook(baseUrl, bytes) {
  const response = await fetch(`${baseUrl}/api/sql-tables/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xlsx: Buffer.from(bytes).toString('base64') }),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}
