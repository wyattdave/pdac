// Transport-independent Dataverse data operations, shared with the local server.
const PAGE_SIZE = 100;
const schemaCache = new Map();
const scalarTypes = new Set(['String', 'Memo', 'EntityName', 'Uniqueidentifier', 'Lookup', 'Owner', 'Customer', 'DateTime', 'Integer', 'BigInt', 'Decimal', 'Double', 'Money', 'Picklist', 'State', 'Status', 'Boolean']);
const textTypes = new Set(['String', 'Memo', 'EntityName']);
const guidTypes = new Set(['Uniqueidentifier', 'Lookup', 'Owner', 'Customer']);
const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TableDataError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function fail(message, status = 400) {
  throw new TableDataError(message, status);
}

function identifier(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]*$/i.test(value)) fail('Invalid table or column name.');
  return value;
}

function label(value, fallback) {
  return value?.UserLocalizedLabel?.Label || value?.LocalizedLabels?.[0]?.Label || fallback;
}

export function tableDataLiteral(column, value) {
  if (textTypes.has(column.type)) return `'${String(value).replaceAll("'", "''")}'`;
  if (guidTypes.has(column.type)) {
    if (!guidPattern.test(String(value))) fail('Enter a GUID for this column.');
    return String(value);
  }
  if (column.type === 'Boolean') {
    if (!['true', 'false', true, false].includes(value)) fail('Boolean filters must be true or false.');
    return String(value);
  }
  if (column.type === 'DateTime') {
    const text = String(value);
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(text) || !Number.isFinite(Date.parse(text))) {
      fail('Use an ISO date or date/time with a timezone for this column.');
    }
    return text.length === 10 ? `${text}T00:00:00Z` : text;
  }
  const text = String(value);
  const integer = ['Integer', 'BigInt', 'Picklist', 'State', 'Status'].includes(column.type);
  if (!(integer ? /^-?\d+$/ : /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i).test(text) || !Number.isFinite(Number(text))) {
    fail('Enter a numeric value for this column.');
  }
  return text;
}

export function buildTableDataQuery(schema, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('Invalid table query.');
  const byName = new Map(schema.columns.map((column) => [column.logicalName, column]));
  const find = (name) => {
    const column = byName.get(name);
    if (!column) fail(`Column is not readable: ${String(name)}`);
    return column;
  };
  const names = options.columns ?? schema.defaultColumns;
  if (!Array.isArray(names) || !names.length || names.length > schema.columns.length) fail('Select at least one column.');
  const visible = [...new Set(names)].map(find);
  const required = [schema.primaryId];
  if (schema.logicalName === 'workflow') required.push('category', 'type', 'statecode');
  const select = [...new Set([...visible.map((column) => column.apiName), ...required.map((name) => find(name).apiName)])];
  const filters = options.filters ?? [];
  if (!Array.isArray(filters) || filters.length > 20) fail('Use no more than 20 filters.');
  const expressions = filters.map((filter) => {
    if (!filter || typeof filter !== 'object') fail('Invalid column filter.');
    const column = find(filter.column);
    const op = filter.operator;
    if (op === 'null' || op === 'notnull') return `${column.apiName} ${op === 'null' ? 'eq' : 'ne'} null`;
    if (['contains', 'startswith', 'endswith'].includes(op)) {
      if (!textTypes.has(column.type)) fail('Text matching requires a text column.');
      return `${op}(${column.apiName},${tableDataLiteral(column, filter.value ?? '')})`;
    }
    if (!['eq', 'ne', 'gt', 'ge', 'lt', 'le'].includes(op)) fail('Unsupported filter operator.');
    if (filter.value === undefined || filter.value === null || (!textTypes.has(column.type) && filter.value === '')) fail('Enter a filter value.');
    return `${column.apiName} ${op} ${tableDataLiteral(column, filter.value)}`;
  });
  const order = [];
  if (options.sort?.column) {
    const column = find(options.sort.column);
    if (!column.sortable) fail('This column cannot be sorted.');
    if (!['asc', 'desc'].includes(options.sort.direction)) fail('Invalid sort direction.');
    order.push(`${column.apiName} ${options.sort.direction}`);
  }
  // A unique tie-breaker keeps continuation pages deterministic.
  if (options.sort?.column !== schema.primaryId) order.push(`${find(schema.primaryId).apiName} asc`);
  const params = new URLSearchParams({ '$select': select.join(','), '$orderby': order.join(',') });
  if (expressions.length) params.set('$filter', expressions.map((expression) => `(${expression})`).join(' and '));
  return { path: `${schema.entitySetName}?${params}`, columns: visible };
}

export function validateTableDataContinuation(token, path, orgUrl) {
  const base = `${orgUrl.replace(/\/$/, '')}/api/data/v9.2/`;
  let next;
  try { next = new URL(token); } catch { fail('Invalid continuation link. Apply the query again.'); }
  const expected = new URL(path, base);
  if (next.origin !== expected.origin || next.pathname !== expected.pathname || next.username || next.password || next.hash) fail('Invalid continuation link target.');
  const allowed = new Set([...expected.searchParams.keys(), '$skiptoken']);
  for (const [key] of next.searchParams) {
    if (!allowed.has(key) || next.searchParams.getAll(key).length !== 1) fail('Invalid continuation query.');
  }
  for (const [key, value] of expected.searchParams) {
    if (next.searchParams.get(key) !== value) fail('The query changed. Apply it again before paging.');
  }
  if (!next.searchParams.get('$skiptoken')) fail('Missing continuation token.');
  return next.href.slice(base.length);
}

export function createTableDataService({ request, orgUrl, accountHomeId = '' }) {
  async function schema(logicalName) {
    const name = identifier(logicalName);
    const cacheKey = `${orgUrl}:${accountHomeId}:${name}`;
    const cached = schemaCache.get(cacheKey);
    if (cached?.expires > Date.now()) return cached.value;
    const entity = await request('GET', `EntityDefinitions(LogicalName='${name}')?$select=LogicalName,DisplayName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,IsOptimisticConcurrencyEnabled`);
    const attributes = [];
    let path = `EntityDefinitions(LogicalName='${name}')/Attributes?$select=LogicalName,DisplayName,AttributeType,IsValidForRead,AttributeOf`;
    while (path) {
      const data = await request('GET', path);
      attributes.push(...(data.value || []));
      const next = data['@odata.nextLink'];
      if (next && !next.startsWith(`${orgUrl}/api/data/v9.2/`)) fail('Unexpected metadata continuation target.');
      path = next ? next.slice(`${orgUrl}/api/data/v9.2/`.length) : '';
    }
    const columns = attributes.filter((attribute) => attribute.IsValidForRead === true && !attribute.AttributeOf && scalarTypes.has(attribute.AttributeType)).map((attribute) => ({
      logicalName: identifier(attribute.LogicalName),
      apiName: ['Lookup', 'Owner', 'Customer'].includes(attribute.AttributeType) ? `_${attribute.LogicalName}_value` : attribute.LogicalName,
      displayName: label(attribute.DisplayName, attribute.LogicalName),
      type: attribute.AttributeType,
      sortable: attribute.AttributeType !== 'Memo',
    })).sort((a, b) => a.displayName.localeCompare(b.displayName));
    const preferred = [entity.PrimaryNameAttribute, entity.PrimaryIdAttribute,
      ...(name === 'environmentvariablevalue' ? ['value', 'schemaname', 'environmentvariabledefinitionid'] : []),
      ...(name === 'workflow' ? ['name', 'category', 'type', 'statecode', 'statuscode'] : []),
      'modifiedon', 'createdon', 'statecode'];
    const value = {
      logicalName: name,
      displayName: label(entity.DisplayName, name),
      entitySetName: identifier(entity.EntitySetName),
      primaryId: identifier(entity.PrimaryIdAttribute),
      primaryName: entity.PrimaryNameAttribute || '',
      optimisticConcurrency: entity.IsOptimisticConcurrencyEnabled === true,
      columns,
      defaultColumns: [...new Set(preferred.filter((column) => columns.some((item) => item.logicalName === column)))],
    };
    if (schemaCache.size >= 100) schemaCache.delete(schemaCache.keys().next().value);
    schemaCache.set(cacheKey, { value, expires: Date.now() + 5 * 60 * 1000 });
    return value;
  }

  async function query(name, options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) fail('Invalid table query.');
    const metadata = await schema(name);
    const built = buildTableDataQuery(metadata, options);
    const path = options.pageToken ? validateTableDataContinuation(options.pageToken, built.path, orgUrl) : built.path;
    const data = await request('GET', path, undefined, { Prefer: `odata.maxpagesize=${PAGE_SIZE},odata.include-annotations="OData.Community.Display.V1.FormattedValue"` });
    return { rows: data.value || [], columns: built.columns, pageSize: PAGE_SIZE, nextPageToken: data['@odata.nextLink'] || '' };
  }

  function recordId(id) {
    if (!guidPattern.test(String(id))) fail('Invalid record ID.');
    return id;
  }

  async function record(name, id) {
    recordId(id);
    if (name === 'environmentvariablevalue') {
      return request('GET', `environmentvariablevalues(${id})?$select=environmentvariablevalueid,value`);
    }
    fail('Record editing is only available for environment variable values.');
  }

  async function update(name, id, body) {
    recordId(id);
    if (!body || typeof body !== 'object') fail('Invalid record update.');
    if (typeof body.etag !== 'string' || body.etag.length > 200 || !/^W\/"[^"\r\n]+"$/.test(body.etag)) fail('A record version is required. Refresh the record and try again.');
    if (name === 'environmentvariablevalue' && body.action === 'value') {
      if (typeof body.value !== 'string' && body.value !== null) fail('The value must be text or null.');
      const metadata = await schema(name);
      if (!metadata.optimisticConcurrency) {
        const current = await record(name, id);
        if (current['@odata.etag'] !== body.etag) fail('This value changed. Reopen the editor before saving.', 412);
      }
      const headers = { 'If-Match': metadata.optimisticConcurrency ? body.etag : '*' };
      await request('PATCH', `environmentvariablevalues(${id})`, { value: body.value }, headers);
    } else if (name === 'workflow' && body.action === 'state') {
      if (!['on', 'off'].includes(body.state)) fail('Flow state must be on or off.');
      const workflow = await request('GET', `workflows(${id})?$select=category,type,statecode`);
      if (Number(workflow.category) !== 5 || Number(workflow.type) !== 1) fail('Only solution-aware cloud flow definitions can be turned on or off here.');
      if (workflow['@odata.etag'] !== body.etag) fail('This flow changed. Refresh the page before trying again.', 412);
      const metadata = await schema(name);
      const headers = { 'If-Match': metadata.optimisticConcurrency ? body.etag : '*' };
      await request('PATCH', `workflows(${id})`, body.state === 'on' ? { statecode: 1, statuscode: 2 } : { statecode: 0, statuscode: 1 }, headers);
    } else {
      fail('This table or action is read-only.');
    }
    return { saved: true };
  }

  return { schema, query, record, update };
}
