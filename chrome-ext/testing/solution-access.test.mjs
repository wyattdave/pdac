import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { DEFAULT_SOLUTION_ACCESS, SolutionAccess } from '../src/solution-access.js';

const org = 'https://test.crm.dynamics.com';
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const input = { solutionId: id(1), action: 'share', recipientKind: 'user', recipient: "maker.o'brien@example.com" };
const metadata = (table, extra = {}) => ({
  LogicalName: table, EntitySetName: `${table}s`, PrimaryIdAttribute: `${table}id`,
  OwnershipType: 'UserOwned', ManyToOneRelationships: [], OneToManyRelationships: [], ManyToManyRelationships: [], ...extra,
});

function fixture({ components = [{ componenttype: 29, objectid: id(2) }], types = [], tables = {}, route = () => undefined } = {}) {
  const calls = [];
  const access = new SolutionAccess(org, async (target, method, body) => {
    const url = new URL(target);
    const path = url.pathname.replace('/api/data/v9.2/', '');
    calls.push({ url, path, method, body });
    const custom = await route({ url, path, method, body, calls });
    if (custom !== undefined) return custom;
    if (method !== 'GET') return {};
    if (path === 'systemusers') return { value: [{ systemuserid: id(9), isdisabled: false }] };
    if (path === 'teams') return { value: [{ teamid: id(8), teamtype: 0 }] };
    if (path === `solutions(${id(1)})`) return { solutionid: id(1) };
    if (path === 'solutioncomponents') return { value: components };
    if (path === 'EntityDefinitions') return { value: types };
    const table = /^EntityDefinitions\(LogicalName='([^']+)'\)$/.exec(path)?.[1];
    if (table) return tables[table] || metadata(table);
    if (path.includes('RetrievePrincipalAccess')) return { AccessRights: DEFAULT_SOLUTION_ACCESS };
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
  return { access, calls, changes: () => calls.filter((call) => call.method !== 'GET') };
}

test('shares a solution workflow once, verifies effective rights, escapes recipient filters', async () => {
  const f = fixture({ components: [{ componenttype: 29, objectid: id(2) }, { componenttype: 29, objectid: id(2) }, { componenttype: 1, objectid: id(3) }] });
  const result = await f.access.run(input);
  assert.equal(result.summary.updated, 1);
  assert.equal(result.summary.unsupported, 1);
  assert.equal(f.changes().length, 1);
  assert.deepEqual(f.changes()[0].body, {
    Target: { '@odata.type': 'Microsoft.Dynamics.CRM.workflow', workflowid: id(2) },
    PrincipalAccess: { Principal: { '@odata.type': 'Microsoft.Dynamics.CRM.systemuser', systemuserid: id(9) }, AccessMask: DEFAULT_SOLUTION_ACCESS },
  });
  assert.match(f.calls[0].url.searchParams.get('$filter'), /maker.o''brien@example.com/);
  assert.ok(f.calls.some((call) => call.path.includes('RetrievePrincipalAccess')));
  assert.ok(result.messages.some((message) => message.includes('Unsupported component type 1')));
});

test('owner changes target the metadata entity set, owner team and custom connector tag', async () => {
  const f = fixture({ components: [{ componenttype: 371, objectid: id(2) }] });
  const result = await f.access.run({ ...input, action: 'owner', recipientKind: 'team', recipient: 'Owner team' });
  assert.equal(result.summary.updated, 1);
  assert.equal(f.changes()[0].method, 'PATCH');
  assert.equal(f.changes()[0].url.searchParams.get('tag'), 'PowerAppsRP');
  assert.deepEqual(f.changes()[0].body, { 'ownerid@odata.bind': `/teams(${id(8)})` });
  assert.ok(!f.calls.some((call) => call.path.includes('RetrievePrincipalAccess')));
});

test('rejects invalid rights, disabled users, ambiguous recipients and access-team owners before changing records', async () => {
  for (const scenario of [
    { data: { permissions: 'FullAccess' }, error: /valid, comma-separated/ },
    { route: ({ path }) => path === 'systemusers' ? { value: [{ systemuserid: id(9), isdisabled: true }] } : undefined, error: /disabled/ },
    { route: ({ path }) => path === 'systemusers' ? { value: [{}, {}] } : undefined, error: /Multiple recipients/ },
    { data: { action: 'owner', recipientKind: 'team' }, route: ({ path }) => path === 'teams' ? { value: [{ teamid: id(8), teamtype: 1 }] } : undefined, error: /Access teams cannot own/ },
  ]) {
    const f = fixture({ route: scenario.route });
    await assert.rejects(f.access.run({ ...input, ...scenario.data }), scenario.error);
    assert.equal(f.changes().length, 0);
  }
});

test('follows solution component pages but refuses cross-origin paging before any mutations', async () => {
  const f = fixture({ route: ({ path }) => path === 'solutioncomponents' ? { value: [], '@odata.nextLink': 'https://attacker.example/api/data/v9.2/solutioncomponents' } : undefined });
  await assert.rejects(f.access.run(input), /Unexpected Dataverse URL/);
  assert.equal(f.changes().length, 0);
  assert.ok(f.calls.every((call) => call.url.origin === org));
  const paged = fixture({ route: ({ path, url }) => {
    if (path !== 'solutioncomponents') return undefined;
    return url.searchParams.has('page') ? { value: [{ componenttype: 29, objectid: id(3) }] }
      : { value: [{ componenttype: 29, objectid: id(2) }], '@odata.nextLink': `${org}/api/data/v9.2/solutioncomponents?page=2` };
  } });
  assert.equal((await paged.access.run(input)).summary.updated, 2);
});

test('metadata discovery failure aborts the whole solution before changing anything', async () => {
  const f = fixture({ components: [{ componenttype: 29, objectid: id(2) }, { componenttype: 380, objectid: id(3) }], route: ({ path }) => {
    if (path === "EntityDefinitions(LogicalName='environmentvariabledefinition')") throw new Error('Metadata unavailable');
  } });
  await assert.rejects(f.access.run(input), /Metadata unavailable/);
  assert.equal(f.changes().length, 0);
});

test('failed effective-access verification is reported without claiming all records were shared', async () => {
  const f = fixture({ route: ({ path }) => path.includes('RetrievePrincipalAccess') ? { AccessRights: 'ReadAccess' } : undefined });
  const result = await f.access.run(input);
  assert.equal(result.summary.updated, 0);
  assert.equal(result.summary.failed, 1);
  assert.match(result.messages.join('\n'), /Share submitted, but effective access is missing WriteAccess/);
});

test('organization-owned records verify role privileges and are not individually mutated', async () => {
  for (const granted of [true, false]) {
    const f = fixture({
      tables: { workflow: metadata('workflow', { OwnershipType: 'OrganizationOwned', Privileges: [{ PrivilegeType: 'Read', PrivilegeId: id(7) }] }) },
      route: ({ path }) => path.includes('RetrieveUserPrivileges') ? { RolePrivileges: granted ? [{ PrivilegeId: id(7) }] : [] } : undefined,
    });
    const result = await f.access.run(input);
    assert.equal(result.summary.roleControlled, granted ? 1 : 0);
    assert.equal(result.summary.failed, granted ? 0 : 1);
    assert.equal(f.changes().length, 0);
  }
});

test('environment-variable values process their definition rather than issuing an inherited share', async () => {
  const f = fixture({
    components: [{ componenttype: 381, objectid: id(2) }],
    tables: { environmentvariablevalue: metadata('environmentvariablevalue', { OwnershipType: 'None' }) },
    route: ({ path }) => path === `environmentvariablevalues(${id(2)})` ? { _environmentvariabledefinitionid_value: id(3) } : undefined,
  });
  const result = await f.access.run(input);
  assert.equal(result.summary.inherited, 1);
  assert.equal(result.summary.updated, 1);
  assert.equal(f.changes()[0].body.Target.environmentvariabledefinitionid, id(3));
});

function agentFixture(failAgent = false, failDiscovery = false) {
  return fixture({
    components: [{ componenttype: 10000, objectid: id(2) }, { componenttype: 10001, objectid: id(3) }, { componenttype: 29, objectid: id(4) }],
    types: [{ LogicalName: 'bot', ObjectTypeCode: 10000 }, { LogicalName: 'botcomponent', ObjectTypeCode: 10001 }],
    tables: {
      bot: metadata('bot', { OneToManyRelationships: [{ ReferencingEntity: 'botcomponent', ReferencingAttribute: 'parentbotid' }, { ReferencingEntity: 'conversationtranscript', ReferencingAttribute: 'botid' }] }),
      botcomponent: metadata('botcomponent', { ManyToOneRelationships: [{ ReferencedEntity: 'workflow', ReferencingAttribute: 'workflowid' }] }),
    },
    route: ({ path, method, body }) => {
      if (path === `bots(${id(2)})`) return { botid: id(2) };
      if (path === 'botcomponents') {
        if (failDiscovery) throw new Error('Topic discovery failed');
        return { value: [{ botcomponentid: id(3) }] };
      }
      if (path === `botcomponents(${id(3)})`) return { botcomponentid: id(3), _workflowid_value: id(4) };
      if (path === `workflows(${id(4)})`) return { workflowid: id(4) };
      if (failAgent && method === 'POST' && body.Target?.botid) throw new Error('Agent permission denied');
    },
  });
}

test('agent bundles include topics and linked dependencies once, never transcripts', async () => {
  const f = agentFixture();
  const result = await f.access.run(input);
  assert.equal(result.summary.updated, 3);
  assert.equal(result.summary.unsupported, 0);
  assert.equal(f.changes().length, 3);
  assert.equal(f.changes().filter((call) => call.body.Target?.workflowid).length, 1);
  assert.ok(!f.calls.some((call) => call.path.includes('conversationtranscript')));
  const lastDiscovery = f.calls.findIndex((call) => call.path === `workflows(${id(4)})`);
  assert.ok(f.calls.findIndex((call) => call.method === 'POST') > lastDiscovery);
});

test('agent discovery errors abort before mutations; agent update failure stops child mutations', async () => {
  const discovery = agentFixture(false, true);
  await assert.rejects(discovery.access.run(input), /Topic discovery failed/);
  assert.equal(discovery.changes().length, 0);
  const update = agentFixture(true);
  const result = await update.access.run(input);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.summary.notProcessed, 2);
  assert.equal(update.changes().length, 1);
});

test('orphan agent children are reported as unsupported', async () => {
  const f = fixture({ components: [{ componenttype: 10001, objectid: id(3) }], types: [{ LogicalName: 'botcomponent', ObjectTypeCode: 10001 }] });
  const result = await f.access.run(input);
  assert.equal(result.summary.unsupported, 1);
  assert.equal(f.changes().length, 0);
  assert.match(result.messages.join('\n'), /containing agent/);
});

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const block = (source, start, end) => {
  assert.ok(source.includes(start) && source.includes(end));
  return source.slice(source.indexOf(start), source.indexOf(end));
};

test('chart tooltips show environment and double-click guidance, never record names', () => {
  const context = {};
  vm.runInNewContext(block(app, 'function reportChartConfig(', 'function number('), context);
  for (const stacked of [true, false]) {
    const chart = {
      type: 'bar', labels: ['Oct 1'], datasets: [{ label: 'Environment A', data: [2] }], stacked, recordKind: 'flows',
      tooltipNames: [['Private record name']], tooltipNamesByDataset: [['Private record name']],
      ...(stacked ? { recordEnvironments: [{ label: 'Environment A' }] } : { recordTargets: [{ environment: { displayName: 'Environment A' } }] }),
    };
    const callbacks = context.reportChartConfig(chart).options.plugins.tooltip.callbacks;
    assert.equal(callbacks.title([{ dataIndex: 0, datasetIndex: 0, label: 'Oct 1', dataset: chart.datasets[0] }]), 'Environment A');
    assert.equal(callbacks.afterBody([]), 'Double-click to see records');
    assert.doesNotMatch(JSON.stringify(Object.values(callbacks).map((fn) => fn([]))), /Private record name/);
  }
  assert.equal(context.reportChartConfig({ type: 'pie', labels: [], datasets: [] }).options.plugins.tooltip.callbacks.afterBody([]), '');
});

function pickerFixture() {
  const attributes = {};
  const search = { value: '', disabled: false, setAttribute: (name, value) => { attributes[name] = value; }, removeAttribute: (name) => { delete attributes[name]; } };
  const environments = [{ name: 'dev', displayName: 'Development' }, { name: 'prod', displayName: 'Production' }];
  const context = {
    el: {
      importEnvironmentSearch: search, importEnvironmentDropdown: { hidden: true },
      importEnvironmentSelect: { value: 'dev', dispatchEvent: () => { context.changed++; } },
      importEnvironmentOptions: { innerHTML: '', querySelectorAll: () => context.options },
    },
    importEnvironmentActiveIndex: -1, options: [], changed: 0, Event: class {},
    getVisibleEnvironments: () => environments,
    filterEnvironments: (items, query) => items.filter((item) => item.displayName.toLowerCase().includes(query.toLowerCase())),
    escapeAttr: (value) => String(value), escapeHtml: (value) => String(value), empty: (value) => value,
  };
  vm.runInNewContext(block(app, 'function openImportEnvironmentPicker(', 'async function prepareImportTarget('), context);
  return { context, attributes };
}

test('import environment search filters visible environments and restores committed selection on dismissal', () => {
  const { context: c, attributes } = pickerFixture();
  c.el.importEnvironmentSearch.value = 'prod';
  c.openImportEnvironmentPicker(false);
  assert.match(c.el.importEnvironmentOptions.innerHTML, /Production/);
  assert.doesNotMatch(c.el.importEnvironmentOptions.innerHTML, /Development/);
  assert.equal(attributes['aria-expanded'], 'true');
  c.closeImportEnvironmentPicker();
  assert.equal(c.el.importEnvironmentSearch.value, 'Development');
  assert.equal(c.el.importEnvironmentSelect.value, 'dev');
  assert.equal(attributes['aria-expanded'], 'false');
  c.selectImportEnvironment('hidden-or-missing');
  assert.equal(c.changed, 0);
  c.selectImportEnvironment('prod');
  assert.equal(c.changed, 1);
  assert.equal(c.el.importEnvironmentSelect.value, 'prod');
  assert.equal(c.el.importEnvironmentSearch.value, 'Production');
  c.selectImportEnvironment('prod');
  assert.equal(c.changed, 1, 'reselecting the same target does not invalidate prepared mappings');
});

test('import combobox supports arrow navigation, Enter and Escape without selecting typed free text', () => {
  const { context: c, attributes } = pickerFixture();
  c.options = ['dev', 'prod'].map((name, index) => ({ id: `option-${index}`, dataset: { importEnvironment: name }, classList: { toggle() {} }, scrollIntoView() {} }));
  const key = (value) => c.handleImportEnvironmentKeydown({ key: value, preventDefault() {}, stopPropagation() {} });
  key('ArrowUp');
  assert.equal(attributes['aria-activedescendant'], 'option-1');
  key('Enter');
  assert.equal(c.el.importEnvironmentSelect.value, 'prod');
  key('Enter');
  assert.equal(c.el.importEnvironmentSelect.value, 'prod', 'Enter on the closed picker must not change the target');
  key('ArrowDown');
  assert.equal(attributes['aria-activedescendant'], 'option-0');
  key('Escape');
  assert.equal(c.el.importEnvironmentDropdown.hidden, true);
  assert.equal(c.el.importEnvironmentSelect.value, 'prod');
});

test('late mapping preparation cannot apply mappings to a different target or package', async () => {
  for (const change of ['target', 'package', 'none']) {
    let finish;
    let target = { environmentName: 'dev', orgUrl: org };
    const context = {
      state: { importPackage: { id: 'package' }, importTargetPrepared: null },
      getImportTargetEnvironment: () => target,
      api: () => new Promise((resolve) => { finish = resolve; }),
      renderImportTarget() {}, toast() {},
    };
    vm.runInNewContext(block(app, 'async function prepareImportTarget(', 'async function maybeAutoPrepareImportTarget('), context);
    const pending = context.prepareImportTarget();
    if (change === 'target') target = { environmentName: 'prod', orgUrl: 'https://prod.crm.dynamics.com' };
    if (change === 'package') context.state.importPackage = { id: 'new-package' };
    finish({ target: { orgUrl: org } });
    await pending;
    assert.equal(Boolean(context.state.importTargetPrepared), change === 'none');
  }
});

test('solution access route rejects stale environments and pins subsequent requests to the original account/environment', async () => {
  const source = readFileSync(new URL('../src/server-core.js', import.meta.url), 'utf8');
  const route = block(source, '  const solutionAccessMatch =', '  const solutionTableDocumentXlsxMatch =');
  for (const stale of [true, false]) {
    const calls = [];
    const context = {
      url: { pathname: `/api/solutions/${id(1)}/access` }, req: { method: 'POST' }, res: {},
      selected: { orgUrl: org, accountHomeId: 'original' },
      requireOrgUrl() {}, normalizeOrgUrl: (value) => value,
      HttpError: class extends Error { constructor(status, message) { super(message); this.status = status; } },
      readJson: async () => ({ orgUrl: stale ? 'https://other.crm.dynamics.com' : org, accountHomeId: 'original' }),
      SolutionAccess: class {
        constructor(target, request) { this.request = request; assert.equal(target, org); }
        async run(body) {
          assert.equal(body.solutionId, id(1));
          await this.request(`${org}/api/data/v9.2/first`, 'GET');
          context.selected.orgUrl = 'https://other.crm.dynamics.com';
          context.selected.accountHomeId = 'other';
          await this.request(`${org}/api/data/v9.2/second`, 'POST', {});
          return { summary: {} };
        }
      },
      dvRequestUrl: async (...args) => { calls.push(args); return { data: {} }; },
      sendJson() {},
    };
    const result = vm.runInNewContext(`(async () => { ${route} })()`, context);
    if (stale) await assert.rejects(result, (error) => error.status === 409);
    else {
      await result;
      assert.equal(calls.length, 2);
      assert.ok(calls.every((call) => call[4] === org && call[5] === 'original'));
    }
  }
});

test('bulk access form blocks duplicate submissions and restores controls after a partial result', async () => {
  const fields = Object.fromEntries(['Kind', 'Recipient', 'Permissions', 'Status', 'Results', 'Close', 'Submit'].map((key) => [`#solutionAccess${key}`, { value: '', disabled: false, focus() {} }]));
  fields['#solutionAccessKind'].value = 'user';
  fields['#solutionAccessRecipient'].value = 'maker@example.com';
  fields['#solutionAccessPermissions'].value = DEFAULT_SOLUTION_ACCESS;
  const controls = [fields['#solutionAccessSubmit'], fields['#solutionAccessPermissions']];
  fields['#solutionAccessForm'] = { querySelectorAll: () => controls };
  let finish;
  let requests = 0;
  const context = {
    solutionAccessView: { solutionId: id(1), orgUrl: org, accountHomeId: 'account', action: 'share', busy: false },
    state: { selectedEnvironment: { orgUrl: org }, selectedSolutionId: id(1) },
    document: { querySelector: (selector) => fields[selector] },
    resolveRequestAccountId: () => 'account',
    api: () => { requests++; return new Promise((resolve) => { finish = resolve; }); },
  };
  vm.runInNewContext(block(app, 'async function submitSolutionAccess(', 'async function exportSolutionZip('), context);
  const request = context.submitSolutionAccess();
  await context.submitSolutionAccess();
  assert.equal(requests, 1);
  assert.equal(fields['#solutionAccessClose'].disabled, true);
  finish({ summary: { updated: 1, failed: 1, unsupported: 2, roleControlled: 0, inherited: 0, notProcessed: 0 }, messages: ['Failure details'] });
  await request;
  assert.match(fields['#solutionAccessStatus'].textContent, /^Incomplete: 1 updated, 1 failed/);
  assert.equal(fields['#solutionAccessResults'].textContent, 'Failure details');
  assert.equal(fields['#solutionAccessClose'].disabled, false);
  context.state.selectedSolutionId = 'another';
  await context.submitSolutionAccess();
  assert.equal(requests, 1);
  assert.match(fields['#solutionAccessStatus'].textContent, /Close and reopen/);
});
