import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeMsalAuthenticationProvider } from '@microsoft/power-apps-cli/dist/Authentication/NodeMsalAuthenticationProvider.js';
import { CliHttpClient } from '@microsoft/power-apps-cli/dist/HttpClient/CliHttpClient.js';

const PORT = Number(process.env.SECURITY_ROLES_PORT || process.env.PORT || 4280);
const REGION = process.env.PP_REGION || 'prod';
const SERVICE_RESOURCE = process.env.PP_SERVICE_RESOURCE || 'https://service.powerapps.com/';
const POWER_PLATFORM_RESOURCE = process.env.PP_API_RESOURCE || 'https://api.powerplatform.com';
const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'public');

const DEPTHS = new Set(['None', 'Basic', 'Local', 'Deep', 'Global', 'RecordFilter']);
const CSV_SCOPE_TO_DEPTH = {
  none: 'None',
  user: 'Basic',
  basic: 'Basic',
  business: 'Local',
  local: 'Local',
  parent: 'Deep',
  deep: 'Deep',
  org: 'Global',
  organization: 'Global',
  global: 'Global',
  recordfilter: 'RecordFilter',
};
const DEPTH_TO_CSV_SCOPE = {
  None: 'none',
  Basic: 'user',
  Local: 'business',
  Deep: 'parent',
  Global: 'org',
  RecordFilter: 'recordfilter',
};
const TABLE_PERMISSION_COLUMNS = [
  ['create', 'Create'],
  ['read', 'Read'],
  ['write', 'Write'],
  ['delete', 'Delete'],
  ['append', 'Append'],
  ['append_to', 'Append To'],
  ['assign', 'Assign'],
  ['share', 'Share'],
];
const PRIVILEGE_PREFIXES = {
  create: 'prvCreate',
  read: 'prvRead',
  write: 'prvWrite',
  delete: 'prvDelete',
  append: 'prvAppend',
  append_to: 'prvAppendTo',
  assign: 'prvAssign',
  share: 'prvShare',
};
const SOLUTION_COMPONENT_TYPES = {
  1: 'Table',
  2: 'Column',
  10: 'View',
  20: 'Role',
  29: 'Flow',
  31: 'Report',
  44: 'Duplicate Rule',
  60: 'Form',
  61: 'Web Resource',
  62: 'Site Map',
  66: 'Ribbon Customization',
  70: 'Field Security Profile',
  90: 'Plugin Type',
  91: 'Plugin Assembly',
  92: 'SDK Message Processing Step',
  93: 'SDK Message Processing Step Image',
  95: 'Service Endpoint',
  150: 'Routing Rule',
  152: 'SLA',
  300: 'Canvas App',
  371: 'Connector',
  380: 'Environment Variable Definition',
  381: 'Environment Variable Value',
};
const selected = {
  environmentName: process.env.PP_ENVIRONMENT_ID || '',
  orgUrl: normalizeOrgUrl(process.env.PP_ORG_URL || ''),
  accountHomeId: '',
};

const authProvider = new NodeMsalAuthenticationProvider();
await authProvider.initAsync(REGION);
const httpClient = new CliHttpClient({
  getAccessTokenForResource: getAccessTokenForSelectedAccount,
  getUserTenantId: () => authProvider.getUserTenantId(),
});

const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.startsWith('/api/')) {
      await handleApi(req, res);
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, getStatus(error), {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, () => {
  console.log(`Security Role CSV Editor running at http://localhost:${PORT}`);
});

async function handleApi(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const route = `${req.method || 'GET'} ${url.pathname}`;

  if (route === 'GET /api/status') {
    sendJson(res, 200, {
      region: REGION,
      environmentName: selected.environmentName,
      orgUrl: selected.orgUrl,
      accounts: await listAccounts(),
      selectedAccountHomeId: selected.accountHomeId,
    });
    return;
  }

  if (route === 'POST /api/login') {
    const body = await readJson(req);
    const orgUrl = normalizeOrgUrl(body.orgUrl || selected.orgUrl);
    if (orgUrl) {
      selected.orgUrl = orgUrl;
    }
    const resource = selected.orgUrl || SERVICE_RESOURCE;
    await authProvider.getAccessTokenForResource(resource);
    sendJson(res, 200, {
      tenantId: authProvider.getUserTenantId(),
      orgUrl: selected.orgUrl,
      resource,
      accounts: await listAccounts(),
      selectedAccountHomeId: selected.accountHomeId,
    });
    return;
  }

  if (route === 'POST /api/login-different') {
    const body = await readJson(req);
    const orgUrl = normalizeOrgUrl(body.orgUrl || selected.orgUrl);
    if (orgUrl) {
      selected.orgUrl = orgUrl;
    }
    const resource = selected.orgUrl || SERVICE_RESOURCE;
    const tokenResult = await acquireTokenWithAccountPicker(resource);
    sendJson(res, 200, {
      tenantId: tokenResult.tenantId,
      orgUrl: selected.orgUrl,
      resource,
      account: tokenResult.account?.username || '',
      accounts: await listAccounts(),
      selectedAccountHomeId: selected.accountHomeId,
    });
    return;
  }

  if (route === 'POST /api/logout') {
    sendJson(res, 200, await logoutAccounts());
    return;
  }

  if (route === 'GET /api/accounts') {
    sendJson(res, 200, {
      accounts: await listAccounts(),
      selectedAccountHomeId: selected.accountHomeId,
    });
    return;
  }

  if (route === 'POST /api/account') {
    const body = await readJson(req);
    selected.accountHomeId = requireString(body.homeAccountId, 'homeAccountId');
    sendJson(res, 200, {
      accounts: await listAccounts(),
      selectedAccountHomeId: selected.accountHomeId,
    });
    return;
  }

  if (route === 'GET /api/environments') {
    sendJson(res, 200, await listEnvironments());
    return;
  }

  if (route === 'POST /api/org') {
    const body = await readJson(req);
    selected.environmentName = String(body.environmentName || '').trim();
    selected.orgUrl = normalizeOrgUrl(requireString(body.orgUrl, 'orgUrl'));
    sendJson(res, 200, {
      environmentName: selected.environmentName,
      orgUrl: selected.orgUrl,
    });
    return;
  }

  if (route === 'GET /api/roles') {
    requireOrgUrl();
    const data = await dvGet('roles?$select=roleid,name,_businessunitid_value,ismanaged,roletemplateid,_parentroleid_value,_parentrootroleid_value&$expand=businessunitid($select=name)&$orderby=name');
    sendJson(res, 200, rootRolesWithInheritedCount(data.value || []));
    return;
  }

  if (route === 'POST /api/roles') {
    requireOrgUrl();
    const body = await readJson(req);
    const name = requireString(body.name, 'name');
    const who = await dvGet('WhoAmI()');
    const role = await dvPost('roles', {
      name,
      'businessunitid@odata.bind': `/businessunits(${who.BusinessUnitId})`,
    }, { returnRepresentation: true });
    sendJson(res, 201, role);
    return;
  }

  const roleMatch = url.pathname.match(/^\/api\/roles\/([0-9a-fA-F-]+)$/);
  if (req.method === 'PATCH' && roleMatch) {
    requireOrgUrl();
    const body = await readJson(req);
    const name = requireString(body.name, 'name');
    const role = await getWritableRole(await getRole(roleMatch[1]));
    await dvPatch(`roles(${role.roleid})`, { name });
    sendJson(res, 200, { roleid: role.roleid, name });
    return;
  }

  const exportMatch = url.pathname.match(/^\/api\/roles\/([0-9a-fA-F-]+)\/csv$/);
  if (req.method === 'GET' && exportMatch) {
    requireOrgUrl();
    const roleId = exportMatch[1];
    const role = await getWritableRole(await getRole(roleId));
    const csv = await exportTablePermissionsCsv(role);
    sendCsv(res, 200, `${safeFilename(role.name)}-table-permissions.csv`, csv);
    return;
  }

  const miscExportMatch = url.pathname.match(/^\/api\/roles\/([0-9a-fA-F-]+)\/misc-csv$/);
  if (req.method === 'GET' && miscExportMatch) {
    requireOrgUrl();
    const roleId = miscExportMatch[1];
    const role = await getWritableRole(await getRole(roleId));
    const csv = await exportMiscPermissionsCsv(role);
    sendCsv(res, 200, `${safeFilename(role.name)}-misc-privileges.csv`, csv);
    return;
  }

  if (route === 'POST /api/import') {
    requireOrgUrl();
    const body = await readJson(req);
    const result = await importRoleCsv(requireString(body.csv, 'csv'), body.fallbackRoleId || '');
    sendJson(res, 200, result);
    return;
  }

  if (route === 'GET /api/solutions') {
    requireOrgUrl();
    sendJson(res, 200, await listSolutions());
    return;
  }

  const componentsMatch = url.pathname.match(/^\/api\/solutions\/([0-9a-fA-F-]+)\/components$/);
  if (req.method === 'GET' && componentsMatch) {
    requireOrgUrl();
    sendJson(res, 200, await listSolutionComponents(componentsMatch[1]));
    return;
  }

  const solutionExportMatch = url.pathname.match(/^\/api\/solutions\/([0-9a-fA-F-]+)\/export$/);
  if (req.method === 'POST' && solutionExportMatch) {
    requireOrgUrl();
    const body = await readJson(req);
    const result = await exportSolution(solutionExportMatch[1], Boolean(body.managed));
    sendZip(res, 200, result.filename, result.bytes);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function exportTablePermissionsCsv(role) {
  const [allPrivileges, assigned, tables] = await Promise.all([
    getAllPrivileges(),
    getRolePrivileges(role.roleid),
    getTableMetadata(),
  ]);
  const assignedById = new Map(assigned.map((item) => [normalizeGuid(item.PrivilegeId), normalizeDepth(item.Depth)]));
  const privilegeByName = new Map(allPrivileges.map((privilege) => [String(privilege.name).toLowerCase(), privilege]));

  const rows = tables.map((table) => {
    const row = {
      'Role Name': role.name,
      'Role Id': role.roleid,
      Table: table.displayName,
      Name: table.logicalName,
      'Record owner': table.ownership,
      'Permission type': 'Table',
    };

    for (const [column, label] of TABLE_PERMISSION_COLUMNS) {
      const privilege = findTablePrivilege(privilegeByName, column, table);
      row[label] = privilege ? depthToCsvScope(assignedById.get(normalizeGuid(privilege.privilegeid)) || 'None') : 'N/A';
      row[`${label} Privilege Name`] = privilege?.name || '';
      row[`${label} Privilege Id`] = privilege?.privilegeid || '';
      row[`${label} Available Scopes`] = privilege ? availableScopes(privilege) : '';
    }

    return row;
  });

  const columns = [
    'Role Name',
    'Role Id',
    'Table',
    'Name',
    'Record owner',
    'Permission type',
    ...TABLE_PERMISSION_COLUMNS.map(([, label]) => label),
    ...TABLE_PERMISSION_COLUMNS.flatMap(([, label]) => [
      `${label} Privilege Name`,
      `${label} Privilege Id`,
      `${label} Available Scopes`,
    ]),
  ];

  return toCsv(rows, columns);
}

async function exportMiscPermissionsCsv(role) {
  const [allPrivileges, assigned, tables] = await Promise.all([
    getAllPrivileges(),
    getRolePrivileges(role.roleid),
    getTableMetadata(),
  ]);
  const tableNames = new Set(tables.flatMap((table) => entityNameCandidates(table)));
  const assignedById = new Map(assigned.map((item) => [normalizeGuid(item.PrivilegeId), normalizeDepth(item.Depth)]));

  const rows = allPrivileges.map((privilege) => ({
    'Role Name': role.name,
    'Role Id': role.roleid,
    'Display Name': privilegeDisplayName(privilege.name),
    'Privilege Name': privilege.name,
    'Privilege Id': privilege.privilegeid,
    'Available Scopes': availableScopes(privilege),
    Depth: depthToCsvScope(assignedById.get(normalizeGuid(privilege.privilegeid)) || 'None'),
  })).filter((row) => !isTablePrivilege(row['Privilege Name'], tableNames));

  return toCsv(rows, ['Role Name', 'Role Id', 'Display Name', 'Privilege Name', 'Privilege Id', 'Available Scopes', 'Depth']);
}

async function importRoleCsv(csv, fallbackRoleId) {
  const rows = fromCsv(csv);
  if (!rows.length) {
    throw new HttpError(400, 'CSV has no rows.');
  }

  const first = rows[0];
  const roleId = normalizeGuid(getCell(first, 'Role Id', 'role_id') || fallbackRoleId);
  const roleName = String(getCell(first, 'Role Name', 'role_name') || '').trim();
  if (!roleId && !roleName) {
    throw new HttpError(400, 'CSV must include role_id or role_name.');
  }

  let role = roleId ? await getRole(roleId) : null;
  if (!role) {
    role = await createRole(roleName);
  } else if (roleName && roleName !== role.name) {
    role = await getWritableRole(role);
    await dvPatch(`roles(${role.roleid})`, { name: roleName });
    role.name = roleName;
  } else {
    role = await getWritableRole(role);
  }

  if (Object.hasOwn(first, 'Name') || Object.hasOwn(first, 'table_logical_name')) {
    return importTablePermissionRows(rows, role);
  }

  const privilegeLookup = await getPrivilegeLookup();
  return importPrivilegeRows(rows, role, privilegeLookup);
}

async function importTablePermissionRows(rows, role) {
  const [currentPrivileges, tablePrivilegeIds] = await Promise.all([
    getRolePrivileges(role.roleid),
    getTablePrivilegeIds(),
  ]);
  const privileges = currentPrivileges
    .filter((item) => !tablePrivilegeIds.has(normalizeGuid(item.PrivilegeId)))
    .map((item) => ({
      PrivilegeId: normalizeGuid(item.PrivilegeId),
      Depth: normalizeDepth(item.Depth),
    }));
  const unknown = [];

  for (const row of rows) {
    for (const [column, label] of TABLE_PERMISSION_COLUMNS) {
      const rawDepth = getCell(row, label, column) || 'None';
      if (String(rawDepth).trim().toUpperCase() === 'N/A') {
        continue;
      }

      const depth = normalizeDepth(rawDepth);
      if (depth === 'None') {
        continue;
      }

      const id = normalizeGuid(getCell(row, `${label} Privilege Id`, `${column}_privilege_id`));
      const name = getCell(row, `${label} Privilege Name`, `${column}_privilege_name`) || `${label} ${getCell(row, 'Name', 'table_logical_name') || ''}`;
      if (!id) {
        unknown.push(name);
        continue;
      }

      privileges.push({
        PrivilegeId: id,
        Depth: depth,
      });
    }
  }

  if (unknown.length) {
    throw new HttpError(400, `Missing privilege IDs for: ${unknown.join(', ')}`);
  }

  await replacePrivileges(role, privileges);
  return {
    roleid: role.roleid,
    name: role.name,
    appliedPrivileges: privileges.length,
  };
}

async function importPrivilegeRows(rows, role, privilegeLookup) {
  const isMiscCsv = Object.hasOwn(rows[0] || {}, 'Display Name') ||
    Object.hasOwn(rows[0] || {}, 'privilege_display_name') ||
    Object.hasOwn(rows[0] || {}, 'available_scopes');
  const currentPrivileges = isMiscCsv ? await getRolePrivileges(role.roleid) : [];
  const tablePrivilegeIds = isMiscCsv ? await getTablePrivilegeIds() : new Set();
  const privileges = currentPrivileges
    .filter((item) => tablePrivilegeIds.has(normalizeGuid(item.PrivilegeId)))
    .map((item) => ({
      PrivilegeId: normalizeGuid(item.PrivilegeId),
      Depth: normalizeDepth(item.Depth),
    }));
  const unknown = [];

  for (const row of rows) {
    const depth = normalizeDepth(getCell(row, 'Depth', 'depth') || 'None');
    if (depth === 'None') {
      continue;
    }

    const privilegeName = getCell(row, 'Privilege Name', 'privilege_name');
    const id = normalizeGuid(getCell(row, 'Privilege Id', 'privilege_id')) || privilegeLookup.get(String(privilegeName || '').toLowerCase());
    if (!id) {
      unknown.push(privilegeName || getCell(row, 'Privilege Id', 'privilege_id') || '(blank)');
      continue;
    }

    privileges.push({
      PrivilegeId: id,
      Depth: depth,
    });
  }

  if (unknown.length) {
    throw new HttpError(400, `Unknown privilege(s): ${unknown.join(', ')}`);
  }

  await replacePrivileges(role, privileges);

  return {
    roleid: role.roleid,
    name: role.name,
    appliedPrivileges: privileges.length,
  };
}

async function replacePrivileges(role, privileges) {
  await dvPost(`roles(${role.roleid})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole`, {
    Privileges: privileges,
  });
}

async function acquireTokenWithAccountPicker(resource) {
  if (!authProvider._msalClient) {
    throw new Error('Authentication not initialized.');
  }

  const request = authProvider._getInteractiveLoginRequest(`${resource}/.default`);
  const result = await authProvider._msalClient.acquireTokenInteractive({
    ...request,
    prompt: 'select_account',
  });
  authProvider._tenantId = result.tenantId;
  selected.accountHomeId = result.account?.homeAccountId || '';
  return result;
}

async function getAccessTokenForSelectedAccount(resource) {
  if (!selected.accountHomeId) {
    const token = await authProvider.getAccessTokenForResource(resource);
    const accounts = await getMsalAccounts();
    if (accounts.length === 1) {
      selected.accountHomeId = accounts[0].homeAccountId;
    }
    return token;
  }

  if (!authProvider._msalClient) {
    throw new Error('Authentication not initialized.');
  }

  const account = (await getMsalAccounts()).find((item) => item.homeAccountId === selected.accountHomeId);
  if (!account) {
    selected.accountHomeId = '';
    return authProvider.getAccessTokenForResource(resource);
  }

  const result = await authProvider._msalClient.acquireTokenSilent({
    account,
    scopes: [`${resource}/.default`],
  });
  authProvider._tenantId = result.tenantId;
  return result.accessToken;
}

async function getMsalAccounts() {
  if (!authProvider._msalClient) {
    return [];
  }
  return authProvider._msalClient.getTokenCache().getAllAccounts();
}

async function listAccounts() {
  return (await getMsalAccounts()).map((account) => ({
    homeAccountId: account.homeAccountId,
    username: account.username,
    name: account.name || account.username,
    tenantId: account.tenantId,
  }));
}

async function logoutAccounts() {
  if (!authProvider._msalClient) {
    return { removed: 0 };
  }

  const cache = authProvider._msalClient.getTokenCache();
  const accounts = await cache.getAllAccounts();
  for (const account of accounts) {
    await cache.removeAccount(account);
  }
  authProvider._tenantId = undefined;
  selected.accountHomeId = '';
  return { removed: accounts.length };
}

async function listSolutions() {
  const data = await dvGetAll(
    'solutions?$select=solutionid,friendlyname,uniquename,version,ismanaged,isvisible,createdon,modifiedon,_publisherid_value&$expand=publisherid($select=publisherid,friendlyname,uniquename)&$orderby=friendlyname',
  );
  return data.map((solution) => ({
    solutionid: solution.solutionid,
    friendlyname: solution.friendlyname,
    uniquename: solution.uniquename,
    version: solution.version,
    ismanaged: Boolean(solution.ismanaged),
    isvisible: solution.isvisible,
    createdon: solution.createdon,
    modifiedon: solution.modifiedon,
    publisher: {
      publisherid: solution.publisherid?.publisherid || solution._publisherid_value || '',
      friendlyname: solution.publisherid?.friendlyname || solution['_publisherid_value@OData.Community.Display.V1.FormattedValue'] || '',
      uniquename: solution.publisherid?.uniquename || '',
    },
  }));
}

async function getSolution(solutionId) {
  return dvGet(`solutions(${solutionId})?$select=solutionid,friendlyname,uniquename,version,ismanaged`);
}

async function listSolutionComponents(solutionId) {
  const data = await dvGetAll(
    `solutioncomponents?$select=solutioncomponentid,componenttype,objectid,rootsolutioncomponentid&$filter=_solutionid_value eq ${solutionId}`,
  );
  const enriched = await Promise.all(data.map((component) => enrichSolutionComponent(component)));
  return enriched.sort((left, right) => `${left.typeLabel} ${left.displayName}`.localeCompare(`${right.typeLabel} ${right.displayName}`));
}

async function enrichSolutionComponent(component) {
  const componentType = Number(component.componenttype);
  const typeLabel = SOLUTION_COMPONENT_TYPES[componentType] || component[`componenttype@OData.Community.Display.V1.FormattedValue`] || `Type ${componentType}`;
  const display = await lookupComponentDisplayName(componentType, component.objectid);
  return {
    solutioncomponentid: component.solutioncomponentid,
    componenttype: componentType,
    typeLabel: display.typeLabel || typeLabel,
    objectid: component.objectid,
    displayName: display.displayName || component.objectid,
    logicalName: display.logicalName || '',
  };
}

async function lookupComponentDisplayName(componentType, objectId) {
  if (!objectId) {
    return {};
  }

  const attempts = componentDisplayAttempts(componentType, objectId);
  for (const attempt of attempts) {
    try {
      const data = await dvGet(attempt.path);
      return await attempt.map(data);
    } catch {
      // Best effort only. Some component types do not map cleanly to a readable row.
    }
  }
  return {};
}

function componentDisplayAttempts(componentType, objectId) {
  const id = normalizeGuid(objectId);
  const entityMetadataMap = (data) => ({
    displayName: getLabel(data.DisplayName) || data.SchemaName || data.LogicalName,
    logicalName: data.LogicalName || data.SchemaName || '',
  });
  const namedRowMap = (...names) => (data) => {
    for (const name of names) {
      if (data[name]) {
        return { displayName: data[name], logicalName: data.name || data.uniquename || '' };
      }
    }
    return {};
  };

  return {
    1: [{ path: `EntityDefinitions(${id})?$select=LogicalName,SchemaName,DisplayName`, map: entityMetadataMap }],
    2: [{ path: `entities?$filter=objecttypecode eq ${componentType}`, map: (data) => entityBackedComponentMap(data, id) }],
    10: [{ path: `savedqueries(${id})?$select=name,returnedtypecode`, map: namedRowMap('name') }],
    29: [{ path: `workflows(${id})?$select=name,uniquename`, map: namedRowMap('name', 'uniquename') }],
    60: [{ path: `systemforms(${id})?$select=name,objecttypecode,type`, map: namedRowMap('name') }],
    61: [{ path: `webresourceset(${id})?$select=name,displayname`, map: namedRowMap('displayname', 'name') }],
    62: [{ path: `sitemaps(${id})?$select=sitemapname`, map: namedRowMap('sitemapname') }],
    91: [{ path: `pluginassemblies(${id})?$select=name`, map: namedRowMap('name') }],
    92: [{ path: `sdkmessageprocessingsteps(${id})?$select=name`, map: namedRowMap('name') }],
  }[componentType] || [
    { path: `entities?$filter=objecttypecode eq ${componentType}`, map: (data) => entityBackedComponentMap(data, id) },
  ];
}

async function entityBackedComponentMap(data, id) {
  const row = Array.isArray(data?.value) ? data.value[0] : data;
  if (!row) {
    return {};
  }

  const typeLabel = row.originallocalizedname ||
    row.localizedname ||
    row.displayname ||
    row.name ||
    row.logicalname ||
    row.entitysetname ||
    '';
  const collection = row.collectionname || row.entitysetname || row.entitysetnameplural || '';
  if (!collection) {
    return {
      typeLabel,
      displayName: typeLabel,
      logicalName: row.logicalname || row.name || row.entitysetname || '',
    };
  }

  try {
    const component = await dvGet(`${collection}(${id})`);
    return {
      typeLabel,
      displayName: pickDisplayName(component) || typeLabel,
      logicalName: pickLogicalName(component) || row.logicalname || row.name || row.entitysetname || '',
    };
  } catch {
    return {
      typeLabel,
      displayName: typeLabel,
      logicalName: row.logicalname || row.name || row.entitysetname || '',
    };
  }
}

function pickDisplayName(row) {
  const keys = [
    'connectionreferencedisplayname',
    'displayname',
    'name',
    'friendlyname',
    'localizedname',
    'title',
    'subject',
  ];
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return '';
}

function pickLogicalName(row) {
  const keys = [
    'connectionreferencelogicalname',
    'logicalname',
    'uniquename',
    'name',
  ];
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return '';
}

async function exportSolution(solutionId, managed) {
  const solution = await getSolution(solutionId);
  const data = await dvPost('ExportSolution', {
    SolutionName: solution.uniquename,
    Managed: managed,
  });
  if (!data.ExportSolutionFile) {
    throw new HttpError(502, 'ExportSolution did not return a solution file.');
  }
  const suffix = managed ? 'managed' : 'unmanaged';
  return {
    filename: `${safeFilename(solution.uniquename || solution.friendlyname)}_${suffix}.zip`,
    bytes: Buffer.from(data.ExportSolutionFile, 'base64'),
  };
}

async function createRole(name) {
  const who = await dvGet('WhoAmI()');
  return dvPost('roles', {
    name,
    'businessunitid@odata.bind': `/businessunits(${who.BusinessUnitId})`,
  }, { returnRepresentation: true });
}

async function getRole(roleId) {
  try {
    return await dvGet(`roles(${roleId})?$select=roleid,name,_businessunitid_value,ismanaged,roletemplateid,_parentroleid_value,_parentrootroleid_value&$expand=businessunitid($select=name)`);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

async function getWritableRole(role) {
  if (!role) {
    throw new HttpError(404, 'Role not found.');
  }

  const rootId = normalizeGuid(role._parentrootroleid_value);
  const parentId = normalizeGuid(role._parentroleid_value);
  const roleId = normalizeGuid(role.roleid);
  if (parentId && rootId && rootId !== roleId) {
    return getRole(rootId);
  }
  return role;
}

async function getRolePrivileges(roleId) {
  const data = await dvGet(`RetrieveRolePrivilegesRole(RoleId=${roleId})`);
  return data.RolePrivileges || [];
}

async function listEnvironments() {
  const attempts = [
    {
      url: 'https://api.powerplatform.com/powerplatform/environments?api-version=2022-03-01-preview',
      authResource: POWER_PLATFORM_RESOURCE,
    },
    {
      url: 'https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments?api-version=2020-10-01',
      authResource: SERVICE_RESOURCE,
    },
  ];

  const errors = [];
  for (const attempt of attempts) {
    try {
      const response = await httpClient.get(attempt.url, { authResource: attempt.authResource });
      return {
        value: normalizeEnvironments(response.data),
        source: attempt.url,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new HttpError(502, `Could not list environments. You can still enter the org URL manually. ${errors.join(' | ')}`);
}

function normalizeEnvironments(data) {
  const values = Array.isArray(data?.value) ? data.value : Array.isArray(data) ? data : [];
  return values.map((item) => {
    const properties = item.properties || {};
    const linked = properties.linkedEnvironmentMetadata || properties.linkedEnvironment || {};
    return {
      name: item.name || properties.name || properties.environmentName || '',
      displayName: properties.displayName || properties.friendlyName || item.displayName || item.name || '',
      orgUrl: normalizeOrgUrl(linked.instanceUrl || properties.instanceUrl || ''),
      region: properties.azureRegion || properties.location || item.location || '',
      type: properties.environmentType || properties.environmentSku || '',
    };
  }).filter((env) => env.name);
}

function rootRolesWithInheritedCount(roles) {
  const groups = new Map();
  for (const role of roles) {
    const roleId = normalizeGuid(role.roleid);
    const rootId = normalizeGuid(role._parentrootroleid_value) || roleId;
    const parentId = normalizeGuid(role._parentroleid_value);
    const key = rootId || roleId;
    const current = groups.get(key) || {
      root: null,
      inheritedCount: 0,
      businessUnits: new Set(),
    };

    if (parentId) {
      current.inheritedCount++;
    } else {
      current.root = role;
    }

    const businessUnitName = role.businessunitid?.name ||
      role['_businessunitid_value@OData.Community.Display.V1.FormattedValue'] ||
      role._businessunitid_value ||
      '';
    if (businessUnitName) {
      current.businessUnits.add(businessUnitName);
    }

    groups.set(key, current);
  }

  return [...groups.values()]
    .map((group) => {
      const role = group.root;
      if (!role) {
        return null;
      }
      return {
        ...role,
        inheritedCount: group.inheritedCount,
        businessUnitNames: [...group.businessUnits].sort(),
      };
    })
    .filter(Boolean)
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
}

async function getAllPrivileges() {
  const data = await dvGetAll('privileges?$select=privilegeid,name,canbebasic,canbelocal,canbedeep,canbeglobal&$orderby=name');
  return data.filter((item) => item.privilegeid && item.name);
}

async function getTableMetadata() {
  const data = await dvGetAll('EntityDefinitions?$select=LogicalName,SchemaName,DisplayName,DisplayCollectionName,OwnershipType,IsPrivate,IsIntersect,IsCustomEntity');
  return data
    .filter((item) => item.LogicalName && item.SchemaName && !item.IsIntersect)
    .map((item) => ({
      logicalName: item.LogicalName,
      schemaName: item.SchemaName,
      displayName: getLabel(item.DisplayName) || item.SchemaName || item.LogicalName,
      ownership: item.OwnershipType || '',
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

async function getPrivilegeLookup() {
  const privileges = await getAllPrivileges();
  return new Map(privileges.map((privilege) => [String(privilege.name).toLowerCase(), normalizeGuid(privilege.privilegeid)]));
}

async function getTablePrivilegeIds() {
  const [allPrivileges, tables] = await Promise.all([
    getAllPrivileges(),
    getTableMetadata(),
  ]);
  const tableNames = new Set(tables.flatMap((table) => entityNameCandidates(table)));
  return new Set(
    allPrivileges
      .filter((privilege) => isTablePrivilege(privilege.name, tableNames))
      .map((privilege) => normalizeGuid(privilege.privilegeid)),
  );
}

async function dvGetAll(path) {
  const rows = [];
  let next = `${selected.orgUrl}/api/data/v9.2/${path}`;
  while (next) {
    const response = await dvRequestUrl('GET', next);
    rows.push(...(response.data.value || []));
    next = response.data['@odata.nextLink'] || '';
  }
  return rows;
}

async function dvGet(path) {
  const response = await dvRequest('GET', path);
  return response.data;
}

async function dvPost(path, body, options = {}) {
  const headers = options.returnRepresentation ? { Prefer: 'return=representation' } : {};
  const response = await dvRequest('POST', path, body, headers);
  return response.data;
}

async function dvPatch(path, body) {
  await dvRequest('PATCH', path, body);
}

function dvRequest(method, path, body, extraHeaders = {}) {
  return dvRequestUrl(method, `${selected.orgUrl}/api/data/v9.2/${path}`, body, extraHeaders);
}

async function dvRequestUrl(method, url, body, extraHeaders = {}) {
  try {
    const config = {
      authResource: selected.orgUrl,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        ...extraHeaders,
      },
    };
    if (body !== undefined) {
      config.body = body;
    }
    return await httpClient[method.toLowerCase()](url, config);
  } catch (error) {
    throw toHttpError(error);
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const fullPath = normalize(join(PUBLIC_DIR, requested));

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  try {
    const content = await readFile(fullPath);
    res.writeHead(200, { 'Content-Type': contentType(fullPath) });
    res.end(content);
  } catch {
    sendText(res, 404, 'Not found');
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function toCsv(rows, columns) {
  const output = [columns.join(',')];
  for (const row of rows) {
    output.push(columns.map((column) => csvEscape(row[column] ?? '')).join(','));
  }
  return `${output.join('\r\n')}\r\n`;
}

function fromCsv(csv) {
  const rows = parseCsv(csv.trim());
  if (!rows.length) {
    return [];
  }
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1)
    .filter((row) => row.some((cell) => String(cell).trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.replace(/\r$/, ''));
  rows.push(row);
  return rows;
}

function csvEscape(value) {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function getCell(row, ...names) {
  for (const name of names) {
    if (Object.hasOwn(row, name)) {
      return row[name];
    }
  }
  return '';
}

function normalizeDepth(value) {
  const text = String(value ?? '').trim();
  const friendly = CSV_SCOPE_TO_DEPTH[text.toLowerCase().replace(/[\s_-]+/g, '')];
  if (friendly) {
    return friendly;
  }
  const byNumber = {
    0: 'Basic',
    1: 'Local',
    2: 'Deep',
    3: 'Global',
    4: 'RecordFilter',
  };
  if (Object.hasOwn(byNumber, text)) {
    return byNumber[text];
  }
  const match = [...DEPTHS].find((depth) => depth.toLowerCase() === text.toLowerCase());
  if (!match) {
    throw new HttpError(400, `Invalid depth '${value}'. Use none, user, business, parent, org, or recordfilter.`);
  }
  return match;
}

function depthToCsvScope(depth) {
  return DEPTH_TO_CSV_SCOPE[normalizeDepth(depth)] || 'none';
}

function findTablePrivilege(privilegeByName, column, table) {
  const prefix = PRIVILEGE_PREFIXES[column];
  for (const name of entityNameCandidates(table)) {
    const found = privilegeByName.get(`${prefix}${name}`.toLowerCase());
    if (found) {
      return found;
    }
  }
  return null;
}

function isTablePrivilege(privilegeName, tableNames) {
  for (const prefix of Object.values(PRIVILEGE_PREFIXES)) {
    if (!privilegeName.startsWith(prefix)) {
      continue;
    }
    const suffix = privilegeName.slice(prefix.length).toLowerCase();
    if (tableNames.has(suffix)) {
      return true;
    }
  }
  return false;
}

function entityNameCandidates(table) {
  return [
    table.logicalName,
    table.schemaName,
    pascalize(table.logicalName),
    pascalize(table.schemaName),
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
}

function availableScopes(privilege) {
  const scopes = ['none'];
  if (privilege.canbebasic) {
    scopes.push('user');
  }
  if (privilege.canbelocal) {
    scopes.push('business');
  }
  if (privilege.canbedeep) {
    scopes.push('parent');
  }
  if (privilege.canbeglobal) {
    scopes.push('org');
  }
  return scopes.join('|');
}

function privilegeDisplayName(name) {
  return String(name || '')
    .replace(/^prv/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

function getLabel(label) {
  return label?.UserLocalizedLabel?.Label || label?.LocalizedLabels?.[0]?.Label || '';
}

function pascalize(value) {
  return String(value || '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('');
}

function requireOrgUrl() {
  if (!selected.orgUrl) {
    throw new HttpError(400, 'Enter a Dataverse org URL first.');
  }
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `Missing required field: ${name}`);
  }
  return value.trim();
}

function normalizeOrgUrl(value) {
  return value ? String(value).trim().replace(/\/$/, '') : '';
}

function normalizeGuid(value) {
  return String(value || '').trim().replace(/[{}]/g, '').toLowerCase();
}

function safeFilename(value) {
  return String(value || 'security-role').replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'security-role';
}

function contentType(path) {
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
  }[extname(path)] || 'application/octet-stream';
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 2));
}

function sendCsv(res, status, filename, csv) {
  res.writeHead(status, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  res.end(csv);
}

function sendZip(res, status, filename, bytes) {
  res.writeHead(status, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': bytes.length,
  });
  res.end(bytes);
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function toHttpError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const statusMatch = message.match(/HTTP error status:\s*(\d+)/);
  const status = statusMatch ? Number(statusMatch[1]) : 500;
  return new HttpError(status, message);
}

function getStatus(error) {
  return error instanceof HttpError ? error.status : 500;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
