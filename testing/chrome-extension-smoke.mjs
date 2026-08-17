// Smoke-test a locally loaded PDAC extension through a Chromium DevTools port.
//
// Start Chrome or Edge with chrome-ext/ loaded and remote debugging enabled,
// then run:
//   node testing/chrome-extension-smoke.mjs 9335

const port = Number(process.argv[2] || 9335);
const debuggerBaseUrl = `http://127.0.0.1:${port}`;

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
    const response = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description
      || result.exceptionDetails.text
      || 'Runtime evaluation failed.');
  }
  return result.result.value;
}

async function findPdacWorker() {
  const targets = await fetch(`${debuggerBaseUrl}/json/list`).then((response) => response.json());
  for (const target of targets.filter((item) => item.type === 'service_worker')) {
    const client = new CdpClient(target.webSocketDebuggerUrl);
    try {
      const name = await evaluate(client, 'chrome.runtime.getManifest().name');
      if (name === 'PDAC - Power DevBox Admin Center') {
        return { target, client };
      }
    } catch {
      // Built-in workers may stop while the target list is being inspected.
    }
    client.close();
  }
  throw new Error('The PDAC extension service worker is not loaded.');
}

const { target: workerTarget, client: worker } = await findPdacWorker();
const extensionId = new URL(workerTarget.url).host;
const workerState = await evaluate(worker, `(async () => ({
  manifestName: chrome.runtime.getManifest().name,
  alarm: await chrome.alarms.get('report-check'),
  excelJsLoaded: typeof globalThis.ExcelJS === 'object',
}))()`);

const appUrl = `chrome-extension://${extensionId}/app.html`;
const pageTarget = await fetch(
  `${debuggerBaseUrl}/json/new?${encodeURIComponent(appUrl)}`,
  { method: 'PUT' },
).then(async (response) => {
  if (!response.ok) throw new Error(`Could not open app page: HTTP ${response.status}`);
  return response.json();
});

const page = new CdpClient(pageTarget.webSocketDebuggerUrl);
const errors = [];
page.onEvent((message) => {
  if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params.exceptionDetails.exception?.description
      || message.params.exceptionDetails.text);
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    errors.push(message.params.args.map((item) => item.value || item.description || '').join(' '));
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    errors.push(message.params.entry.text);
  }
});
await Promise.all([
  page.send('Runtime.enable'),
  page.send('Page.enable'),
  page.send('Log.enable'),
]);

for (let attempt = 0; attempt < 50; attempt += 1) {
  if (await evaluate(page, 'document.readyState') === 'complete') break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
await new Promise((resolve) => setTimeout(resolve, 1500));

const appState = await evaluate(page, `(async () => {
  const request = async (path, init) => {
    const response = await fetch(path, init);
    return { status: response.status, body: await response.json() };
  };
  const binaryRequest = async (path) => {
    const response = await fetch(path);
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      byteLength: (await response.arrayBuffer()).byteLength,
    };
  };
  const status = await request('/api/status');
  const startup = await request('/api/startup');
  const sqlTables = await request('/api/sql-tables');
  const schedule = await request('/api/automated-reports/schedule');
  const savedSchedule = await request('/api/automated-reports/schedule', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: false, saveTrendData: true, accountHomeId: '', groups: {} }),
  });
  const database = await import(chrome.runtime.getURL('src/server-db.js'));
  const cacheEntry = {
    version: 1,
    kind: 'smoke',
    accountHomeId: '',
    createdAt: new Date().toISOString(),
    value: { ok: true },
  };
  await database.reportCachePutEntry('2099-01-01', 'smoke', cacheEntry);
  const readCacheEntry = await database.reportCacheGetEntry('2099-01-01', 'smoke');
  const listedCacheEntries = await database.reportCacheListByDate('2099-01-01');
  await database.trendInsertRows('smoke_table', [{ value: 1 }, { value: 2 }]);
  const insertedTrendRows = await database.trendSelectRows('smoke_table');
  const deletedTrendRows = await database.trendDeleteRows('smoke_table', (row) => row.value === 1);
  const remainingTrendRows = await database.trendSelectRows('smoke_table');
  await database.trendDeleteRows('smoke_table', () => true);
  await request('/api/sql-tables/records', { method: 'DELETE' });
  const templateResponse = await fetch('/api/sql-tables/import-template');
  const templateBytes = await templateResponse.arrayBuffer();
  const templateWorkbook = new ExcelJS.Workbook();
  await templateWorkbook.xlsx.load(templateBytes);
  const aiWorksheet = templateWorkbook.getWorksheet('report_ai_flow_event_totals');
  const aiHeaders = aiWorksheet.getRow(1).values.slice(1);
  const aiValues = {
    account_home_id: 'smoke-account',
    date_ran: '2026-07-24',
    collected_at: '2026-07-24T10:00:00.000Z',
    range_key: 'month:2026-07-01:2026-07-31',
    range_label: '2026-07-01 to 2026-07-31',
    environment_display_name: 'Smoke environment',
    environment_id: 'smoke-environment',
    environment_url: 'https://smoke.crm.dynamics.com',
    count_of_events: 2,
    sum_ai_builder_credits_used: 15,
    sum_copilot_studio_credits_used: 1,
    total_credits_consumed: 16,
  };
  aiWorksheet.addRow(aiHeaders.map((header) => aiValues[header] ?? ''));
  const toBase64 = (bytes) => {
    const view = new Uint8Array(bytes);
    let binary = '';
    for (let offset = 0; offset < view.length; offset += 32768) {
      binary += String.fromCharCode(...view.subarray(offset, offset + 32768));
    }
    return btoa(binary);
  };
  const firstImportBytes = await templateWorkbook.xlsx.writeBuffer();
  const firstImport = await request('/api/sql-tables/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xlsx: toBase64(firstImportBytes) }),
  });
  const countColumn = aiHeaders.indexOf('count_of_events') + 1;
  aiWorksheet.getRow(2).getCell(countColumn).value = 3;
  aiWorksheet.getRow(2).getCell(aiHeaders.indexOf('environment_display_name') + 1).value = 'Replacement smoke environment';
  aiWorksheet.getRow(2).getCell(aiHeaders.indexOf('environment_id') + 1).value = 'replacement-smoke-environment';
  aiWorksheet.getRow(2).getCell(aiHeaders.indexOf('environment_url') + 1).value = 'https://replacement-smoke.crm.dynamics.com';
  const secondImportBytes = await templateWorkbook.xlsx.writeBuffer();
  const secondImport = await request('/api/sql-tables/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xlsx: toBase64(secondImportBytes) }),
  });
  aiWorksheet.getRow(1).getCell(1).value = 'invalid_header';
  const invalidImportBytes = await templateWorkbook.xlsx.writeBuffer();
  const invalidImport = await request('/api/sql-tables/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xlsx: toBase64(invalidImportBytes) }),
  });
  const trends = await request('/api/report-trends?accountHomeId=smoke-account&range=custom&start=2026-07-24&end=2026-07-24');
  const today = new Date();
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  await database.reportCachePutEntry(todayKey, 'smoke-automated-older', {
    version: 1,
    kind: 'automated',
    accountHomeId: '',
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    value: {
      reportGroup: 'ai-events',
      files: [{
        filename: 'ai-flow-events-raw-stacked-older.xlsx',
        base64: btoa('older smoke workbook'),
      }],
    },
  });
  await database.reportCachePutEntry(todayKey, 'smoke-automated', {
    version: 1,
    kind: 'automated',
    accountHomeId: '',
    createdAt: new Date().toISOString(),
    value: {
      reportGroup: 'ai-events',
      files: [{
        filename: 'ai-flow-events-totals-by-environment-smoke.xlsx',
        base64: btoa('smoke workbook'),
      }],
    },
  });
  const cachedReports = await request('/api/report-cache');
  const singleTableExport = await binaryRequest('/api/sql-tables/report_ai_flow_event_totals/export');
  const allTablesExportResponse = await fetch('/api/sql-tables/export');
  const allTablesExportBytes = await allTablesExportResponse.arrayBuffer();
  const allTablesExportWorkbook = new ExcelJS.Workbook();
  await allTablesExportWorkbook.xlsx.load(allTablesExportBytes);
  const exportedAiHeaders = allTablesExportWorkbook
    .getWorksheet('report_ai_flow_event_totals')
    .getRow(1)
    .values
    .slice(1);
  const unchangedExportImport = await request('/api/sql-tables/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xlsx: toBase64(allTablesExportBytes) }),
  });
  const allTablesExport = {
    status: allTablesExportResponse.status,
    contentType: allTablesExportResponse.headers.get('content-type'),
    byteLength: allTablesExportBytes.byteLength,
    headersMatchTemplate: JSON.stringify(exportedAiHeaders) === JSON.stringify(aiHeaders),
  };
  const deleteTables = await request('/api/sql-tables/records', { method: 'DELETE' });
  const sqlTablesAfterDelete = await request('/api/sql-tables');
  return {
    title: document.title,
    tabCount: document.querySelectorAll('.tab').length,
    status,
    startup,
    sqlTables,
    schedule,
    savedSchedule,
    controls: {
      saveTrends: Boolean(document.querySelector('#automatedReportsSaveTrends')),
      importTrendData: Boolean(document.querySelector('#importTrendDataButton')),
      downloadTemplate: Boolean(document.querySelector('#downloadTrendTemplateButton')),
      retiredOptionsAbsent: !document.querySelector('#backgroundServerEnabled')
        && !document.querySelector('#backgroundServerAutoStart'),
    },
    template: {
      status: templateResponse.status,
      contentType: templateResponse.headers.get('content-type'),
      byteLength: templateBytes.byteLength,
      worksheetCount: templateWorkbook.worksheets.length,
    },
    firstImport,
    secondImport,
    invalidImport,
    cachedReports,
    trends,
    singleTableExport,
    allTablesExport,
    unchangedExportImport,
    deleteTables,
    sqlTablesAfterDelete,
    indexedDb: {
      cacheRoundTrip: readCacheEntry?.value?.ok === true,
      cacheListCount: listedCacheEntries.length,
      insertedTrendRows: insertedTrendRows.length,
      deletedTrendRows,
      remainingTrendRows: remainingTrendRows.length,
    },
  };
})()`);

const failures = [];
if (workerState.alarm?.periodInMinutes !== 5) failures.push('The five-minute alarm is missing.');
if (!workerState.excelJsLoaded) failures.push('ExcelJS is not loaded in the service worker.');
if (appState.title !== 'PDAC - Power DevBox Admin Center') failures.push('The app title did not render.');
if (appState.tabCount < 10) failures.push('The original app tabs did not render.');
if (appState.status.status !== 200) failures.push('GET /api/status failed.');
if (appState.startup.status !== 200 || appState.startup.body.supported !== false) {
  failures.push('GET /api/startup did not report browser-extension behavior.');
}
if (appState.sqlTables.status !== 200 || appState.sqlTables.body.tables?.length !== 4) {
  failures.push('GET /api/sql-tables did not return the four report tables.');
}
if (appState.schedule.status !== 200 || appState.savedSchedule.status !== 200) {
  failures.push('Schedule storage routes failed.');
}
if (appState.savedSchedule.body.saveTrendData !== true
  || !Object.values(appState.savedSchedule.body.groups || {}).every((group) => group.saveToDatabase === true)) {
  failures.push('The global trend-data schedule setting was not saved.');
}
if (!appState.controls.saveTrends
  || !appState.controls.importTrendData
  || !appState.controls.downloadTemplate
  || !appState.controls.retiredOptionsAbsent) {
  failures.push('The scheduled-report or trend import controls are incorrect.');
}
if (appState.template.status !== 200
  || !appState.template.contentType?.includes('spreadsheetml')
  || appState.template.byteLength < 5000
  || appState.template.worksheetCount !== 5) {
  failures.push('The trend-data import template is invalid.');
}
if (appState.firstImport.status !== 200
  || appState.firstImport.body.importedRows !== 1
  || appState.secondImport.status !== 200
  || appState.secondImport.body.importedRows !== 1
  || appState.secondImport.body.replacedRows !== 1
  || appState.invalidImport.status !== 400) {
  failures.push('Excel trend-data import or matching-row replacement failed.');
}
if (appState.cachedReports.status !== 200
  || !appState.cachedReports.body.files?.some((file) => file.filename === 'ai-flow-events-totals-by-environment-smoke.xlsx')
  || appState.cachedReports.body.files?.some((file) => file.filename === 'ai-flow-events-raw-stacked-older.xlsx')) {
  failures.push('Completed background report downloads were not returned by the cache API.');
}
const aiTrendTable = appState.trends.body.tables?.find(
  (table) => table.tableName === 'report_ai_flow_event_totals',
);
if (appState.trends.status !== 200
  || aiTrendTable?.rows?.length !== 1
  || aiTrendTable.rows[0].values.count_of_events !== 3) {
  failures.push('Trend API did not return the latest flat IndexedDB row.');
}
for (const exported of [appState.singleTableExport, appState.allTablesExport]) {
  if (exported.status !== 200
    || !exported.contentType?.includes('spreadsheetml')
    || exported.byteLength < 5000) {
    failures.push('An SQL-table Excel export failed.');
  }
}
if (!appState.allTablesExport.headersMatchTemplate
  || appState.unchangedExportImport.status !== 200
  || appState.unchangedExportImport.body.importedRows !== 1
  || appState.unchangedExportImport.body.replacedRows !== 1) {
  failures.push('The trend export schema does not round-trip through import.');
}
if (appState.deleteTables.status !== 200
  || appState.deleteTables.body.deletedRows !== 1
  || appState.sqlTablesAfterDelete.body.totalRows !== 0) {
  failures.push('SQL-table deletion did not clear the IndexedDB trend rows.');
}
if (!appState.indexedDb.cacheRoundTrip
  || appState.indexedDb.cacheListCount !== 1
  || appState.indexedDb.insertedTrendRows !== 2
  || appState.indexedDb.deletedTrendRows !== 1
  || appState.indexedDb.remainingTrendRows !== 1) {
  failures.push('IndexedDB cache/trend operations failed.');
}
if (errors.length) failures.push(`Browser console errors: ${errors.join(' | ')}`);

console.log(JSON.stringify({
  extensionId,
  workerState,
  appState,
  errors,
  failures,
}, null, 2));

page.close();
worker.close();

if (failures.length) {
  process.exitCode = 1;
}
