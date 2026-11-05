import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../src/server-core.js', import.meta.url), 'utf8');
const block = (source, start, end) => {
  assert.ok(source.includes(start) && source.includes(end));
  return source.slice(source.indexOf(start), source.indexOf(end));
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

function roleFixture(currentOnly = false) {
  const context = {
    state: {
      roleAssignmentCurrentOnly: currentOnly,
      roles: [{ roleid: 'a', name: 'Available' }, { roleid: 'r', name: 'Root assigned' }],
      assignedRoles: [
        { roleid: 'child', rootRoleId: 'R', name: 'Assigned <role>', businessUnitName: 'Child BU' },
        { roleid: 'orphan', rootRoleId: 'not-listed', name: 'Hidden root role', businessUnitId: 'bu-id' },
      ],
    },
    el: { roleAssignmentSearch: { value: '' }, roleAssignmentRoles: { innerHTML: '' } },
    escapeHtml: escape, escapeAttr: escape, empty: (value) => `<p>${escape(value)}</p>`,
  };
  vm.runInNewContext(block(app, 'function renderRoleAssignmentList(', 'async function loadAssignedSecurityRoles('), context);
  return context;
}

test('current roles precede available roles, including assignments with unlisted roots', () => {
  const context = roleFixture();
  context.renderRoleAssignmentList();
  const html = context.el.roleAssignmentRoles.innerHTML;
  assert.ok(html.indexOf('Assigned &lt;role>') < html.indexOf('Available roles'));
  assert.match(html, /Hidden root role/);
  assert.match(html, /data-assigned-role-id="child"/);
  assert.doesNotMatch(html, /Root assigned/);
});

test('current role view is read-only and supports business-unit search', () => {
  const context = roleFixture(true);
  context.el.roleAssignmentSearch.value = 'Child BU';
  context.renderRoleAssignmentList();
  assert.match(context.el.roleAssignmentRoles.innerHTML, /Current roles \(1\)/);
  assert.doesNotMatch(context.el.roleAssignmentRoles.innerHTML, /<button|Available roles|Remove role/);
});

test('disabled users and access teams can inspect, but not assign, roles', () => {
  const context = { state: { users: [{ systemuserid: 'user', isdisabled: true }], teams: [{ teamid: 'team', teamtype: 1 }] } };
  vm.runInNewContext(block(app, 'function getAssignmentPrincipal(', 'function renderRoleAssignmentList('), context);
  for (const [type, id] of [['systemuser', 'user'], ['team', 'team']]) {
    assert.equal(context.getAssignmentPrincipal(type, id), null);
    assert.equal(context.getAssignmentPrincipal(type, id, true).id, id);
  }
});

test('assignment loading cannot expose available actions before assigned roles arrive', () => {
  const context = roleFixture();
  context.state.roleAssignmentLoading = true;
  context.renderRoleAssignmentList();
  assert.match(context.el.roleAssignmentRoles.innerHTML, /Loading roles/);
  assert.doesNotMatch(context.el.roleAssignmentRoles.innerHTML, /data-role-assignment-action/);
});

test('a late assigned-role response cannot overwrite another principal or a closed modal', async () => {
  let finish;
  const principal = { type: 'systemuser', id: 'first' };
  const context = {
    state: { roleAssignmentPrincipal: principal, assignedRoles: [] }, URLSearchParams,
    api: () => new Promise((resolve) => { finish = resolve; }),
  };
  vm.runInNewContext(block(app, 'async function loadAssignedSecurityRoles(', 'async function assignSecurityRole('), context);
  const loading = context.loadAssignedSecurityRoles(principal);
  context.state.roleAssignmentPrincipal = { type: 'team', id: 'second' };
  finish([{ roleid: 'wrong' }]);
  await loading;
  assert.deepEqual(context.state.assignedRoles, []);
});

test('role inspection uses all Dataverse pages and returns the assigned business-unit copy', async () => {
  let path;
  const context = {
    normalizePrincipalType: (type) => type, normalizeGuid: (value) => String(value || '').toLowerCase(),
    dvGetAll: async (value) => {
      path = value;
      return [{ roleid: 'CHILD', _parentrootroleid_value: 'ROOT', name: 'Role', _businessunitid_value: 'BU', businessunitid: { name: 'Child BU' } }];
    },
  };
  vm.runInNewContext(block(server, 'async function listAssignedSecurityRoles(', 'async function removeSecurityRole('), context);
  const result = await context.listAssignedSecurityRoles({ principalType: 'team', principalId: 'TEAM' });
  assert.match(path, /teams\(team\)\/teamroles_association/);
  assert.match(path, /\$expand=businessunitid/);
  assert.deepEqual(plain(result[0]), { roleid: 'child', rootRoleId: 'root', name: 'Role', businessUnitId: 'bu', businessUnitName: 'Child BU' });
});

function serverFixture(initial = []) {
  let rows = structuredClone(initial);
  const context = {
    selected: { accountHomeId: 'account' },
    HttpError: class extends Error { constructor(status, message) { super(message); this.status = status; } },
    normalizeGuid: (value) => String(value || '').toLowerCase(),
    normalizeOrgUrl: (value) => String(value || '').replace(/\/$/, ''),
    reportCacheDateKey: (value) => value.toISOString().slice(0, 10),
    reportTrendRetentionCutoffDate: () => '2024-10-01',
    trendSelectRows: async () => rows,
    trendReplaceRows: async (table, predicate, records) => { rows = [...rows.filter((row) => !predicate(row)), ...plain(records)]; },
    trendDeleteRows: async (table, predicate) => { rows = rows.filter((row) => !predicate(row)); },
    getAgentSessionDateRange: (filters) => ({ startDate: filters.start, endDate: filters.end }),
    collectAutomatedAgentSessionRows: async (environments, range, account) => {
      context.sessionRequest = { environments, range, account };
      return [{ rows: [{ agentName: 'Agent', conversationId: 'session', conversationStartTime: `${range.startDate}T10:00:00Z` }] }];
    },
  };
  vm.runInNewContext([
    "const SOLUTION_COMPONENT_NAMES_TABLE = 'report_solution_component_names';",
    block(server, 'async function saveSolutionComponentNameSnapshots(', 'async function readSolutionComponentNames('),
    block(server, 'function buildSolutionComponentRecordLists(', 'async function loadWeeklyComponentNames('),
    block(server, 'function normalizeAutomatedReportEnvironments(', 'function normalizeAutomatedSolutionOptions('),
  ].join('\n'), context);
  return { context, rows: () => rows };
}

const environment = { environmentId: 'env', orgUrl: 'https://env.crm.dynamics.com', displayName: 'Environment' };
const request = { accountHomeId: 'account', kind: 'flows', environment, dateRan: '2026-10-01', collectedAt: '2026-10-01T10:00:00Z' };
const snapshot = (date, account = 'account', env = 'env') => ({
  account_home_id: account, environment_id: env, environment_url: `https://${env}.crm.dynamics.com`,
  date_ran: date, collected_at: `${date}T10:00:00Z`,
  component_names: JSON.stringify({ flows: ['Name only'] }),
  component_records: JSON.stringify({ flows: [{ id: `${env}:${date}`, name: 'Flow' }] }),
});

test('record lists deduplicate by ID across solutions, retain distinct records with the same name', () => {
  const { context } = serverFixture();
  const solutions = [{ solutionid: 's1', friendlyname: 'One', version: '1.0' }, { solutionid: 's2', friendlyname: 'Two', ismanaged: true }];
  const component = { objectId: 'flow1', kind: 'flows', name: 'Shared', typeLabel: 'Cloud flow' };
  const result = context.buildSolutionComponentRecordLists(solutions, [
    { ...component, solutionid: 's1' }, { ...component, solutionid: 's2' },
    { ...component, objectId: 'flow2', solutionid: 's1' },
  ]);
  assert.equal(result.flows.length, 2);
  assert.deepEqual(plain(result.flows[0].solutions), ['One', 'Two']);
  assert.equal(result.solutions[1].managed, 'Managed');
});

test('daily inventory snapshots preserve history, replace same-day data, and prune expired rows', async () => {
  const { context, rows } = serverFixture([snapshot('2024-01-01'), snapshot('2026-10-01')]);
  const group = { environment, componentNames: { flows: ['New'] }, componentRecords: { flows: [{ id: 'new', name: 'New' }] } };
  await context.saveSolutionComponentNameSnapshots('account', [group], '2026-10-02T10:00:00Z');
  await context.saveSolutionComponentNameSnapshots('account', [group], '2026-10-02T11:00:00Z');
  assert.equal(rows().length, 2);
  assert.equal(rows()[1].collected_at, '2026-10-02T11:00:00Z');
  assert.equal(JSON.parse(rows()[1].component_records).flows[0].id, 'new');
});

test('historical drilldowns select the correct date, account and environment', async () => {
  const { context } = serverFixture([snapshot('2026-10-01'), snapshot('2026-10-02'), snapshot('2026-10-01', 'other'), snapshot('2026-10-01', 'account', 'other')]);
  const result = await context.listReportChartRecords(request);
  assert.equal(result.rows[0].id, 'env:2026-10-01');
  assert.match(result.note, /^Saved inventory/);
});

test('older trends explicitly identify a latest-inventory fallback, including name-only data', async () => {
  const row = snapshot('2026-10-02');
  delete row.component_records;
  const { context } = serverFixture([row]);
  const result = await context.listReportChartRecords(request);
  assert.equal(result.rows[0].name, 'Name only');
  assert.match(result.note, /Historical record details are unavailable/);
  assert.match(result.note, /names only/);
});

test('AI events and flow runs cannot use the records endpoint', async () => {
  const { context } = serverFixture();
  for (const kind of ['ai-events', 'flow-runs', 'unknown']) {
    await assert.rejects(context.listReportChartRecords({ ...request, kind }), (error) => error.status === 400);
  }
});

test('session drilldown is scoped to the requested environment, account and dates', async () => {
  const { context } = serverFixture();
  const result = await context.listReportChartRecords({ ...request, kind: 'sessions', start: '2026-10-01', end: '2026-10-01' });
  assert.equal(context.sessionRequest.account, 'account');
  assert.equal(context.sessionRequest.environments[0].orgUrl, environment.orgUrl);
  assert.equal(context.sessionRequest.range.endDate, '2026-10-01');
  assert.equal(result.rows[0].conversationId, 'session');
  assert.match(result.note, /Transcripts are not loaded/);
});

test('stacked chart hit-testing chooses the clicked environment/date and ignores unsupported charts', () => {
  const context = { trendRowDate: (row) => row.reportDate };
  vm.runInNewContext(block(app, 'function chartRecordTarget(', 'async function handleChartRecordsDoubleClick('), context);
  const definition = {
    recordKind: 'sessions', recordDates: ['2026-10-01', '2026-10-02'],
    recordEnvironments: [{ id: 'env', label: 'First' }, { id: 'other', label: 'Second' }],
    recordRows: [{ reportDate: '2026-10-02', values: { environment_id: 'other', environment_url: 'https://other.test' } }],
  };
  const result = context.chartRecordTarget(definition, { index: 1, datasetIndex: 1 });
  assert.equal(result.environment.environmentId, 'other');
  assert.equal(result.snapshot.reportDate, '2026-10-02');
  assert.equal(result.daily, true);
  assert.equal(context.chartRecordTarget(definition, { index: 0, datasetIndex: 1 }), null);
  assert.equal(context.chartRecordTarget({ id: 'flow-runs' }, { index: 0, datasetIndex: 0 }), null);
});

test('record table escapes values, searches every displayed field and paginates', () => {
  const elements = {
    '#chartRecordsSearch': { value: '' }, '#chartRecordsCount': { textContent: '' }, '#chartRecordsBody': { innerHTML: '' },
  };
  const context = {
    chartRecordView: { kind: 'flows', page: 0, rows: Array.from({ length: 105 }, (_, index) => ({ name: `<Flow ${index}>`, solutions: ['Solution'], id: `id-${index}` })) },
    document: { querySelector: (selector) => elements[selector] }, escapeHtml: escape, empty: (value) => escape(value),
  };
  vm.runInNewContext(block(app, 'function chartRecordColumns(', 'function closeChartRecordsModal('), context);
  context.renderChartRecords();
  assert.match(elements['#chartRecordsCount'].textContent, /105 matching records/);
  assert.match(elements['#chartRecordsBody'].innerHTML, /&lt;Flow 0>/);
  assert.doesNotMatch(elements['#chartRecordsBody'].innerHTML, /&lt;Flow 104>/);
  context.chartRecordView.page = 1;
  context.renderChartRecords();
  assert.match(elements['#chartRecordsBody'].innerHTML, /&lt;Flow 104>/);
  elements['#chartRecordsSearch'].value = 'id-104';
  context.chartRecordView.page = 0;
  context.renderChartRecords();
  assert.match(elements['#chartRecordsCount'].textContent, /1 matching records/);
});
