import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  buildTableDataQuery,
  createTableDataService,
  tableDataLiteral,
  TableDataError,
  validateTableDataContinuation,
} from '../chrome-ext/src/table-data-api.js';
import { columnPreferenceKey, restoreTableColumns } from '../chrome-ext/table-data.js';

const orgUrl = 'https://table-data-test.crm.dynamics.com';
const id = '11111111-2222-3333-4444-555555555555';
const column = (logicalName, type = 'String', extra = {}) => ({ logicalName, apiName: logicalName, displayName: logicalName, type, sortable: type !== 'Memo', ...extra });
const columns = [column('accountid', 'Uniqueidentifier'), column('name'), column('description', 'Memo'), column('revenue', 'Money'), column('numberofemployees', 'Integer'), column('createdon', 'DateTime'), column('donotemail', 'Boolean'), column('ownerid', 'Lookup', { apiName: '_ownerid_value' })];
const schema = { logicalName: 'account', entitySetName: 'accounts', primaryId: 'accountid', primaryName: 'name', columns, defaultColumns: ['name', 'accountid'] };
const params = (query) => new URL(query.path, `${orgUrl}/api/data/v9.2/`).searchParams;
const rejects400 = (operation) => assert.throws(operation, (error) => error instanceof TableDataError && error.status === 400);

test('data queries select only requested columns plus record ID and use stable server ordering', () => {
  const query = buildTableDataQuery(schema, { columns: ['name'] });
  assert.equal(params(query).get('$select'), 'name,accountid');
  assert.equal(params(query).get('$orderby'), 'accountid asc');
  assert.equal(params(query).has('$top'), false);
  assert.equal(params(query).has('$skip'), false);
  assert.deepEqual(query.columns.map((item) => item.logicalName), ['name']);
});

test('sorts and all filters are represented in the Dataverse query, including hidden columns', () => {
  const query = buildTableDataQuery(schema, {
    columns: ['name'],
    sort: { column: 'revenue', direction: 'desc' },
    filters: [
      { column: 'name', operator: 'contains', value: "O'Brien & Sons" },
      { column: 'ownerid', operator: 'eq', value: id },
      { column: 'revenue', operator: 'ge', value: '1000.25' },
      { column: 'donotemail', operator: 'eq', value: 'false' },
      { column: 'createdon', operator: 'gt', value: '2026-10-01' },
      { column: 'description', operator: 'null' },
    ],
  });
  assert.equal(params(query).get('$orderby'), 'revenue desc,accountid asc');
  assert.equal(params(query).get('$filter'), `(contains(name,'O''Brien & Sons')) and (_ownerid_value eq ${id}) and (revenue ge 1000.25) and (donotemail eq false) and (createdon gt 2026-10-01T00:00:00Z) and (description eq null)`);
  assert.equal(params(query).get('$select'), 'name,accountid');
});

test('primary-ID ordering is not duplicated and lookup selection uses the Web API property', () => {
  const query = buildTableDataQuery(schema, { columns: ['ownerid'], sort: { column: 'accountid', direction: 'desc' } });
  assert.equal(params(query).get('$select'), '_ownerid_value,accountid');
  assert.equal(params(query).get('$orderby'), 'accountid desc');
});

test('query validation rejects unknown columns, invalid operators, injected numeric values and unsupported sorts', () => {
  for (const options of [
    null, [], { filters: [null] },
    { columns: [] }, { columns: ['unknown'] }, { columns: 'name' },
    { sort: { column: 'name', direction: 'desc,$expand=contacts' } },
    { sort: { column: 'description', direction: 'asc' } },
    { filters: [{ column: 'name', operator: 'raw', value: 'x' }] },
    { filters: [{ column: 'revenue', operator: 'eq', value: '0 or revenue gt 0' }] },
    { filters: [{ column: 'revenue', operator: 'contains', value: '1' }] },
    { filters: [{ column: 'revenue', operator: 'eq', value: '' }] },
    { filters: Array.from({ length: 21 }, () => ({ column: 'name', operator: 'null' })) },
  ]) rejects400(() => buildTableDataQuery(schema, options));
});

test('typed literals validate raw values without rounding large integer filters', () => {
  assert.equal(tableDataLiteral(column('test', 'BigInt'), '9223372036854775807'), '9223372036854775807');
  assert.equal(tableDataLiteral(column('test', 'String'), ''), "''");
  assert.equal(tableDataLiteral(column('test', 'DateTime'), '2026-11-12T10:30:00+01:00'), '2026-11-12T10:30:00+01:00');
  for (const [type, value] of [['Integer', '1.2'], ['Boolean', '1'], ['Lookup', 'not-a-guid'], ['DateTime', 'yesterday'], ['DateTime', '2026-11-12T10:30'], ['Money', 'Infinity']]) {
    rejects400(() => tableDataLiteral(column('test', type), value));
  }
});

test('continuation links are restricted to the same org, table and applied query', () => {
  const query = buildTableDataQuery(schema, { columns: ['name'] });
  const next = new URL(query.path, `${orgUrl}/api/data/v9.2/`);
  next.searchParams.set('$skiptoken', '<cookie page="2">x</cookie>');
  assert.equal(validateTableDataContinuation(next.href, query.path, orgUrl), `${next.pathname.split('/').at(-1)}${next.search}`);
  for (const mutate of [
    (url) => { url.hostname = 'evil.example'; },
    (url) => { url.pathname = '/api/data/v9.2/contacts'; },
    (url) => { url.searchParams.set('$select', 'description'); },
    (url) => { url.searchParams.set('$expand', 'contacts'); },
    (url) => { url.searchParams.set('$top', '10000'); },
    (url) => { url.searchParams.append('$skiptoken', 'duplicate'); },
    (url) => { url.username = 'user'; },
    (url) => { url.hash = 'fragment'; },
    (url) => { url.searchParams.delete('$skiptoken'); },
  ]) {
    const invalid = new URL(next);
    mutate(invalid);
    rejects400(() => validateTableDataContinuation(invalid.href, query.path, orgUrl));
  }
});

function fixture(name = 'account', overrides = {}) {
  const calls = [];
  const entities = {
    account: { LogicalName: 'account', EntitySetName: 'accounts', PrimaryIdAttribute: 'accountid', PrimaryNameAttribute: 'name' },
    workflow: { LogicalName: 'workflow', EntitySetName: 'workflows', PrimaryIdAttribute: 'workflowid', PrimaryNameAttribute: 'name' },
    environmentvariablevalue: { LogicalName: 'environmentvariablevalue', EntitySetName: 'environmentvariablevalues', PrimaryIdAttribute: 'environmentvariablevalueid', PrimaryNameAttribute: 'schemaname' },
  };
  const fields = name === 'workflow'
    ? [column('workflowid', 'Uniqueidentifier'), column('name'), column('statecode', 'State'), column('category', 'Picklist'), column('type', 'Picklist')]
    : name === 'environmentvariablevalue'
      ? [column('environmentvariablevalueid', 'Uniqueidentifier'), column('schemaname'), column('value', 'Memo')]
      : columns;
  const service = createTableDataService({
    orgUrl, accountHomeId: crypto.randomUUID(),
    request: async (method, path, body, headers) => {
      calls.push({ method, path, body, headers });
      if (overrides.request) {
        const result = await overrides.request(method, path, body, headers);
        if (result !== undefined) return result;
      }
      if (path.includes('/Attributes?')) return { value: fields.map((item) => ({ LogicalName: item.logicalName, DisplayName: { UserLocalizedLabel: { Label: item.displayName } }, AttributeType: item.type, IsValidForRead: true })) };
      if (path.startsWith('EntityDefinitions(')) return { ...entities[name], IsOptimisticConcurrencyEnabled: overrides.optimisticConcurrency !== false };
      if (method === 'GET') return { value: [{ accountid: id, name: 'Test' }] };
      return {};
    },
  });
  return { service, calls };
}

test('service queries one page with maxpagesize=100 and formatted values; schema is cached', async () => {
  const { service, calls } = fixture();
  const result = await service.query('account', { columns: ['name'] });
  assert.equal(result.pageSize, 100);
  assert.equal(result.rows.length, 1);
  assert.equal(calls.length, 3);
  assert.match(calls[2].headers.Prefer, /odata.maxpagesize=100/);
  assert.match(calls[2].headers.Prefer, /FormattedValue/);
  await service.query('account', { columns: ['name'] });
  assert.equal(calls.length, 4, 'later pages/queries do not reload metadata');
});

test('schema omits unreadable, derived and nonscalar attributes', async () => {
  const { service } = fixture('account', {
    request: (method, path) => path.includes('/Attributes?') ? { value: [
      { LogicalName: 'accountid', AttributeType: 'Uniqueidentifier', IsValidForRead: true },
      { LogicalName: 'name', AttributeType: 'String', IsValidForRead: true },
      { LogicalName: 'privatevalue', AttributeType: 'String', IsValidForRead: false },
      { LogicalName: 'derivedvalue', AttributeType: 'String', IsValidForRead: true, AttributeOf: 'name' },
      { LogicalName: 'image', AttributeType: 'Virtual', IsValidForRead: true },
    ] } : undefined,
  });
  const result = await service.schema('account');
  assert.deepEqual(result.columns.map((item) => item.logicalName), ['accountid', 'name']);
});

test('workflow queries retain internal action fields when hidden', () => {
  const workflow = { ...schema, logicalName: 'workflow', entitySetName: 'workflows', primaryId: 'workflowid', columns: [column('workflowid', 'Uniqueidentifier'), column('name'), column('category', 'Picklist'), column('type', 'Picklist'), column('statecode', 'State')] };
  assert.equal(params(buildTableDataQuery(workflow, { columns: ['name'] })).get('$select'), 'name,workflowid,category,type,statecode');
});

test('environment variable edits PATCH only the value with optimistic concurrency', async () => {
  const { service, calls } = fixture('environmentvariablevalue');
  await service.update('environmentvariablevalue', id, { action: 'value', value: 'new value', etag: 'W/"123"', extra: 'ignored' });
  assert.deepEqual(calls.find((call) => call.method === 'PATCH'), { method: 'PATCH', path: `environmentvariablevalues(${id})`, body: { value: 'new value' }, headers: { 'If-Match': 'W/"123"' } });
  await service.update('environmentvariablevalue', id, { action: 'value', value: '', etag: 'W/"123"' });
  await service.update('environmentvariablevalue', id, { action: 'value', value: null, etag: 'W/"123"' });
  assert.equal(calls.filter((call) => call.method === 'PATCH')[1].body.value, '');
  assert.equal(calls.filter((call) => call.method === 'PATCH')[2].body.value, null);
});

test('environment variable editor reads the current value and record version separately', async () => {
  const { service, calls } = fixture('account', { request: () => ({ value: 'current', '@odata.etag': 'W/"123"' }) });
  assert.equal((await service.record('environmentvariablevalue', id)).value, 'current');
  assert.equal(calls[0].path, `environmentvariablevalues(${id})?$select=environmentvariablevalueid,value`);
});

test('cloud flow controls validate the definition and send paired state/status values', async () => {
  const { service, calls } = fixture('workflow', { request: (method, path) => path.startsWith('workflows(') && method === 'GET' ? { category: 5, type: 1, '@odata.etag': 'W/"123"' } : undefined });
  await service.update('workflow', id, { action: 'state', state: 'on', etag: 'W/"123"' });
  assert.deepEqual(calls.find((call) => call.method === 'PATCH').body, { statecode: 1, statuscode: 2 });
  assert.deepEqual(calls.find((call) => call.method === 'PATCH').headers, { 'If-Match': 'W/"123"' });
  await service.update('workflow', id, { action: 'state', state: 'off', etag: 'W/"123"' });
  assert.deepEqual(calls.filter((call) => call.method === 'PATCH')[1].body, { statecode: 0, statuscode: 1 });
});

test('non-cloud processes, runtime copies and changed flow records cannot be toggled', async () => {
  for (const snapshot of [
    { category: 0, type: 1, '@odata.etag': 'W/"123"' },
    { category: 5, type: 2, '@odata.etag': 'W/"123"' },
    { category: 5, type: 1, '@odata.etag': 'W/"124"' },
  ]) {
    const { service, calls } = fixture('workflow', { request: () => snapshot });
    await assert.rejects(service.update('workflow', id, { action: 'state', state: 'on', etag: 'W/"123"' }), TableDataError);
    assert.equal(calls.filter((call) => call.method === 'PATCH').length, 0);
  }
});

test('arbitrary table edits, invalid record IDs and unversioned writes are rejected', async () => {
  const { service, calls } = fixture();
  for (const [name, recordId, body] of [
    ['account', id, { action: 'value', value: 'test', etag: 'W/"123"' }],
    ['environmentvariablevalue', 'bad-id', { action: 'value', value: 'test', etag: 'W/"123"' }],
    ['environmentvariablevalue', id, { action: 'value', value: 'test' }],
    ['environmentvariablevalue', id, { action: 'value', value: 5, etag: 'W/"123"' }],
    ['workflow', id, { action: 'state', state: 'delete', etag: 'W/"123"' }],
  ]) await assert.rejects(service.update(name, recordId, body), TableDataError);
  assert.equal(calls.length, 0);
});

test('Dataverse permission/conflict failures propagate without retrying writes', async () => {
  const denied = Object.assign(new Error('Forbidden'), { status: 403 });
  const { service, calls } = fixture('environmentvariablevalue', { request: (method) => { if (method === 'PATCH') throw denied; } });
  await assert.rejects(service.update('environmentvariablevalue', id, { action: 'value', value: 'new', etag: 'W/"123"' }), (error) => error === denied);
  assert.equal(calls.filter((call) => call.method === 'PATCH').length, 1);
});

test('tables without optimistic concurrency use a preflight version check and prevent record recreation', async () => {
  const { service, calls } = fixture('environmentvariablevalue', {
    optimisticConcurrency: false,
    request: (method, path) => path.startsWith('environmentvariablevalues(') && method === 'GET' ? { value: 'previous', '@odata.etag': 'W/"opaque-tag"' } : undefined,
  });
  assert.equal((await service.schema('environmentvariablevalue')).optimisticConcurrency, false);
  await service.update('environmentvariablevalue', id, { action: 'value', value: 'new', etag: 'W/"opaque-tag"' });
  assert.deepEqual(calls.find((call) => call.method === 'PATCH').headers, { 'If-Match': '*' });
  await assert.rejects(service.update('environmentvariablevalue', id, { action: 'value', value: 'new', etag: 'W/"different-tag"' }), (error) => error.status === 412);
  assert.equal(calls.filter((call) => call.method === 'PATCH').length, 1);
});

test('local column preferences are scoped by environment/table and tolerate stale or invalid storage', () => {
  assert.equal(columnPreferenceKey({ orgUrl: `${orgUrl.toUpperCase()}/` }, 'account'), columnPreferenceKey({ orgUrl }, 'account'));
  assert.notEqual(columnPreferenceKey({ orgUrl }, 'account'), columnPreferenceKey({ orgUrl }, 'contact'));
  assert.notEqual(columnPreferenceKey({ orgUrl }, 'account'), columnPreferenceKey({ orgUrl: 'https://other.crm.dynamics.com' }, 'account'));
  assert.deepEqual(restoreTableColumns(schema, ['name', 'removedcolumn', 'name', 'revenue']), ['name', 'revenue']);
  for (const stored of [null, [], ['removedcolumn'], 'invalid']) assert.deepEqual(restoreTableColumns(schema, stored), schema.defaultColumns);
});

test('npm runtime package includes the shared browser and API modules used by both hosts', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const path of ['chrome-ext/table-data.js', 'chrome-ext/table-data.css', 'chrome-ext/src/table-data-api.js']) assert.ok(pkg.files.includes(path));
});
