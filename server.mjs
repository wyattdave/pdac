import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
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
const ROLE_SCOPE_VALUES = ['none', 'user', 'business', 'parent', 'org', 'recordfilter', 'N/A'];
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
const accountEnvironmentSelections = new Map();
const importPackages = new Map();
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: 'text',
});

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
      error: errorMessage(error),
    });
  }
});

server.listen(PORT, () => {
  console.log(`Power DevBox Admin Center running at http://localhost:${PORT}`);
});

async function handleApi(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const route = `${req.method || 'GET'} ${url.pathname}`;

  if (route === 'GET /api/status') {
    ensureSelectedAccount(await listAccounts());
    sendJson(res, 200, {
      region: REGION,
      environmentName: selected.environmentName,
      orgUrl: selected.orgUrl,
      selectedEnvironment: selectedEnvironmentPayload(),
      accounts: await listAccounts(),
      selectedAccountHomeId: selected.accountHomeId,
    });
    return;
  }

  if (route === 'POST /api/login') {
    const body = await readJson(req);
    const requestedEnvironment = environmentFromBody(body, selectedEnvironmentPayload());
    if (requestedEnvironment.orgUrl) {
      setSelectedEnvironment(requestedEnvironment);
    }
    const resource = selected.orgUrl || SERVICE_RESOURCE;
    await acquireTokenWithAccountPicker(resource);
    ensureSelectedAccount(await listAccounts());
    if (requestedEnvironment.orgUrl) {
      saveSelectedEnvironmentForAccount();
    }
    sendJson(res, 200, {
      tenantId: authProvider.getUserTenantId(),
      orgUrl: selected.orgUrl,
      environmentName: selected.environmentName,
      selectedEnvironment: selectedEnvironmentPayload(),
      resource,
      accounts: await listAccounts(),
      selectedAccountHomeId: selected.accountHomeId,
    });
    return;
  }

  if (route === 'POST /api/login-different') {
    const body = await readJson(req);
    const requestedEnvironment = environmentFromBody(body, selectedEnvironmentPayload());
    if (requestedEnvironment.orgUrl) {
      setSelectedEnvironment(requestedEnvironment);
    }
    const resource = selected.orgUrl || SERVICE_RESOURCE;
    const tokenResult = await acquireTokenWithAccountPicker(resource);
    if (requestedEnvironment.orgUrl) {
      saveSelectedEnvironmentForAccount();
    } else {
      applySavedEnvironmentForAccount(selected.accountHomeId);
    }
    sendJson(res, 200, {
      tenantId: tokenResult.tenantId,
      orgUrl: selected.orgUrl,
      environmentName: selected.environmentName,
      selectedEnvironment: selectedEnvironmentPayload(),
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
    ensureSelectedAccount(await listAccounts());
    sendJson(res, 200, {
      accounts: await listAccounts(),
      selectedAccountHomeId: selected.accountHomeId,
      selectedEnvironment: selectedEnvironmentPayload(),
    });
    return;
  }

  if (route === 'POST /api/account') {
    const body = await readJson(req);
    selectAccount(requireString(body.homeAccountId, 'homeAccountId'));
    sendJson(res, 200, {
      accounts: await listAccounts(),
      selectedAccountHomeId: selected.accountHomeId,
      environmentName: selected.environmentName,
      orgUrl: selected.orgUrl,
      selectedEnvironment: selectedEnvironmentPayload(),
    });
    return;
  }

  if (route === 'GET /api/environments') {
    const data = await listEnvironments();
    sendJson(res, 200, {
      ...data,
      environmentName: selected.environmentName,
      orgUrl: selected.orgUrl,
      selectedEnvironment: selectedEnvironmentPayload(),
      selectedAccountHomeId: selected.accountHomeId,
    });
    return;
  }

  if (route === 'POST /api/org') {
    const body = await readJson(req);
    if (body.clear) {
      setSelectedEnvironment({ environmentName: '', orgUrl: '' });
      clearSelectedEnvironmentForAccount();
      sendJson(res, 200, {
        environmentName: selected.environmentName,
        orgUrl: selected.orgUrl,
        selectedEnvironment: selectedEnvironmentPayload(),
        accounts: await listAccounts(),
        selectedAccountHomeId: selected.accountHomeId,
      });
      return;
    }

    setSelectedEnvironment({
      environmentName: String(body.environmentName || '').trim(),
      orgUrl: normalizeOrgUrl(requireString(body.orgUrl, 'orgUrl')),
    });
    saveSelectedEnvironmentForAccount();
    sendJson(res, 200, {
      environmentName: selected.environmentName,
      orgUrl: selected.orgUrl,
      selectedEnvironment: selectedEnvironmentPayload(),
      accounts: await listAccounts(),
      selectedAccountHomeId: selected.accountHomeId,
    });
    return;
  }

  if (route === 'GET /api/roles') {
    requireOrgUrl();
    const data = await dvGet('roles?$select=roleid,name,_businessunitid_value,ismanaged,roletemplateid,_parentroleid_value,_parentrootroleid_value&$expand=businessunitid($select=name)&$orderby=name');
    sendJson(res, 200, rootRolesWithInheritedCount(data.value || []));
    return;
  }

  if (route === 'GET /api/business-units') {
    requireOrgUrl();
    sendJson(res, 200, await listBusinessUnits());
    return;
  }

  if (route === 'POST /api/roles') {
    requireOrgUrl();
    const body = await readJson(req);
    const role = await createRoleFromBody(body);
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

  const xlsxExportMatch = url.pathname.match(/^\/api\/roles\/([0-9a-fA-F-]+)\/xlsx$/);
  if (req.method === 'GET' && xlsxExportMatch) {
    requireOrgUrl();
    const roleId = xlsxExportMatch[1];
    const role = await getWritableRole(await getRole(roleId));
    const xlsx = await exportTablePermissionsXlsx(role);
    sendXlsx(res, 200, `${safeFilename(role.name)}-table-permissions.xlsx`, xlsx);
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

  const miscXlsxExportMatch = url.pathname.match(/^\/api\/roles\/([0-9a-fA-F-]+)\/misc-xlsx$/);
  if (req.method === 'GET' && miscXlsxExportMatch) {
    requireOrgUrl();
    const roleId = miscXlsxExportMatch[1];
    const role = await getWritableRole(await getRole(roleId));
    const xlsx = await exportMiscPermissionsXlsx(role);
    sendXlsx(res, 200, `${safeFilename(role.name)}-misc-privileges.xlsx`, xlsx);
    return;
  }

  if (route === 'POST /api/import') {
    requireOrgUrl();
    const body = await readJson(req);
    const result = body.format === 'xlsx'
      ? await importRoleXlsx(requireString(body.xlsx, 'xlsx'), body.fallbackRoleId || '')
      : await importRoleCsv(requireString(body.csv, 'csv'), body.fallbackRoleId || '');
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
    const result = await exportSolution(solutionExportMatch[1], {
      managed: Boolean(body.managed),
      version: body.version,
    });
    sendZip(res, 200, result.filename, result.bytes);
    return;
  }

  const solutionDeployMatch = url.pathname.match(/^\/api\/solutions\/([0-9a-fA-F-]+)\/deploy-cache$/);
  if (req.method === 'POST' && solutionDeployMatch) {
    requireOrgUrl();
    const body = await readJson(req);
    const exported = await exportSolution(solutionDeployMatch[1], {
      managed: Boolean(body.managed),
      version: body.version,
    });
    sendJson(res, 200, await cacheImportPackage(exported.bytes, exported.filename, {
      source: 'deploy',
      sourceEnvironmentName: selected.environmentName,
      sourceOrgUrl: selected.orgUrl,
      sourceSolutionId: solutionDeployMatch[1],
    }));
    return;
  }

  if (route === 'POST /api/import-packages') {
    const body = await readJson(req);
    const bytes = Buffer.from(requireString(body.zipBase64, 'zipBase64'), 'base64');
    sendJson(res, 200, await cacheImportPackage(bytes, body.filename || 'solution.zip', { source: 'upload' }));
    return;
  }

  const packageTargetMatch = url.pathname.match(/^\/api\/import-packages\/([^/]+)\/target$/);
  if (req.method === 'POST' && packageTargetMatch) {
    const body = await readJson(req);
    const target = environmentFromBody(body, {});
    if (!target.environmentName || !target.orgUrl) {
      throw new HttpError(400, 'Choose a target environment.');
    }
    sendJson(res, 200, await prepareImportTarget(requireImportPackage(packageTargetMatch[1]), target));
    return;
  }

  const packageImportMatch = url.pathname.match(/^\/api\/import-packages\/([^/]+)\/import$/);
  if (req.method === 'POST' && packageImportMatch) {
    const body = await readJson(req);
    const target = environmentFromBody(body.target || {}, {});
    if (!target.environmentName || !target.orgUrl) {
      throw new HttpError(400, 'Choose a target environment.');
    }
    const result = await importSolutionPackage(requireImportPackage(packageImportMatch[1]), target, body);
    sendJson(res, 200, result);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function getTablePermissionsExport(role) {
  const [allPrivileges, assigned, tables] = await Promise.all([
    getAllPrivileges(),
    getRolePrivileges(role.roleid),
    getTableMetadata(),
  ]);
  const assignedById = new Map(assigned.map((item) => [normalizeGuid(item.PrivilegeId), normalizeDepth(item.Depth)]));
  const privilegeByName = new Map(allPrivileges.map((privilege) => [String(privilege.name).toLowerCase(), privilege]));

  const rows = tables.filter((table) => table.ownership !== 'None').map((table) => {
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

  return {
    rows,
    columns,
    hiddenColumns: [
      'Role Name',
      'Role Id',
      'Name',
      ...TABLE_PERMISSION_COLUMNS.flatMap(([, label]) => [
        `${label} Privilege Name`,
        `${label} Privilege Id`,
        `${label} Available Scopes`,
      ]),
    ],
    scopeColumns: TABLE_PERMISSION_COLUMNS.map(([, label]) => label),
    title: 'Table Permissions',
  };
}

async function exportTablePermissionsCsv(role) {
  const data = await getTablePermissionsExport(role);
  return toCsv(data.rows, data.columns);
}

async function exportTablePermissionsXlsx(role) {
  const data = await getTablePermissionsExport(role);
  return exportRoleWorkbook(data);
}

async function getMiscPermissionsExport(role) {
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

  return {
    rows,
    columns: ['Role Name', 'Role Id', 'Display Name', 'Privilege Name', 'Privilege Id', 'Available Scopes', 'Depth'],
    hiddenColumns: ['Role Name', 'Role Id', 'Privilege Name', 'Privilege Id', 'Available Scopes'],
    scopeColumns: ['Depth'],
    title: 'Misc Privileges',
  };
}

async function exportMiscPermissionsCsv(role) {
  const data = await getMiscPermissionsExport(role);
  return toCsv(data.rows, data.columns);
}

async function exportMiscPermissionsXlsx(role) {
  const data = await getMiscPermissionsExport(role);
  return exportRoleWorkbook(data);
}

async function exportRoleWorkbook({ rows, columns, hiddenColumns, scopeColumns, title }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PDAC';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(title, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.columns = columns.map((header) => ({
    header,
    key: header,
    hidden: hiddenColumns.includes(header),
    width: columnWidth(header),
  }));
  worksheet.addRows(rows);
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  const headerRow = worksheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell, columnNumber) => {
    const header = columns[columnNumber - 1];
    cell.font = { bold: true, color: { argb: 'FF111827' } };
    cell.alignment = { vertical: 'middle' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: hiddenColumns.includes(header) ? 'FFFFFF00' : 'FFE5E7EB' },
    };
    cell.border = bottomBorder();
  });

  const scopeColumnNumbers = scopeColumns.map((header) => columns.indexOf(header) + 1).filter(Boolean);
  const hiddenColumnNumbers = hiddenColumns.map((header) => columns.indexOf(header) + 1).filter(Boolean);
  for (let rowNumber = 2; rowNumber <= rows.length + 1; rowNumber++) {
    for (const columnNumber of scopeColumnNumbers) {
      const header = columns[columnNumber - 1];
      const cell = worksheet.getCell(rowNumber, columnNumber);
      const allowed = validationValuesFor(rows[rowNumber - 2], header);
      cell.dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`"${allowed.join(',')}"`],
        showErrorMessage: true,
        errorStyle: 'error',
        errorTitle: 'Invalid scope',
        error: `Choose one of: ${allowed.join(', ')}`,
      };
    }

    for (const columnNumber of hiddenColumnNumbers) {
      worksheet.getCell(rowNumber, columnNumber).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' },
      };
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function importRoleCsv(csv, fallbackRoleId) {
  const rows = fromCsv(csv);
  return importRoleRows(rows, fallbackRoleId, 'CSV');
}

async function importRoleXlsx(base64, fallbackRoleId) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(base64, 'base64'));
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new HttpError(400, 'XLSX has no worksheets.');
  }

  return importRoleRows(rowsFromWorksheet(worksheet), fallbackRoleId, 'XLSX');
}

async function importRoleRows(rows, fallbackRoleId, format) {
  if (!rows.length) {
    throw new HttpError(400, `${format} has no rows.`);
  }

  const first = rows[0];
  const roleId = normalizeGuid(getCell(first, 'Role Id', 'role_id') || fallbackRoleId);
  const roleName = String(getCell(first, 'Role Name', 'role_name') || '').trim();
  if (!roleId && !roleName) {
    throw new HttpError(400, `${format} must include role_id or role_name.`);
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

async function createRoleFromBody(body) {
  const name = requireString(body.name, 'name');
  const businessUnitId = normalizeGuid(body.businessUnitId) || await getCurrentBusinessUnitId();
  const role = await createRole(name, {
    businessUnitId,
    description: String(body.description || '').trim(),
    summaryofcoretablepermissions: String(body.summaryOfCoreTablePrivileges || '').trim(),
    isinherited: body.memberPrivilegeInheritance === 'team' ? 0 : 1,
  });

  if (body.includeAppOpeningPrivileges !== false) {
    await applyAppOpenerPrivileges(role, businessUnitId);
  }

  return role;
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
    const accounts = await getMsalAccounts();
    if (accounts.length === 1) {
      selected.accountHomeId = accounts[0].homeAccountId;
    } else if (accounts.length > 1) {
      throw new HttpError(400, 'Multiple accounts found. Select an account in the header first.');
    } else {
      return authProvider.getAccessTokenForResource(resource);
    }
  }

  if (!authProvider._msalClient) {
    throw new Error('Authentication not initialized.');
  }

  const account = (await getMsalAccounts()).find((item) => item.homeAccountId === selected.accountHomeId);
  if (!account) {
    selected.accountHomeId = '';
    throw new HttpError(401, 'Selected account is no longer signed in. Sign in again.');
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
    selectedEnvironment: accountEnvironmentSelections.get(account.homeAccountId) || null,
  }));
}

function ensureSelectedAccount(accounts) {
  if (selected.accountHomeId && accounts.some((account) => account.homeAccountId === selected.accountHomeId)) {
    return;
  }

  selected.accountHomeId = accounts.length === 1 ? accounts[0].homeAccountId : '';
  if (selected.accountHomeId && accountEnvironmentSelections.has(selected.accountHomeId)) {
    applySavedEnvironmentForAccount(selected.accountHomeId);
  } else if (selected.accountHomeId && selected.orgUrl) {
    saveSelectedEnvironmentForAccount();
  } else {
    setSelectedEnvironment({ environmentName: '', orgUrl: '' });
  }
}

function selectAccount(homeAccountId) {
  selected.accountHomeId = homeAccountId;
  applySavedEnvironmentForAccount(homeAccountId);
}

function selectedEnvironmentPayload() {
  return {
    environmentName: selected.environmentName,
    orgUrl: selected.orgUrl,
  };
}

function environmentFromBody(body, fallback = {}) {
  return {
    environmentName: String(body.environmentName || body.name || fallback.environmentName || fallback.name || '').trim(),
    orgUrl: normalizeOrgUrl(body.orgUrl || fallback.orgUrl || ''),
  };
}

function setSelectedEnvironment(environment) {
  selected.environmentName = String(environment.environmentName || '').trim();
  selected.orgUrl = normalizeOrgUrl(environment.orgUrl || '');
}

function saveSelectedEnvironmentForAccount() {
  if (!selected.accountHomeId || !selected.orgUrl) {
    return;
  }

  accountEnvironmentSelections.set(selected.accountHomeId, selectedEnvironmentPayload());
}

function clearSelectedEnvironmentForAccount() {
  if (selected.accountHomeId) {
    accountEnvironmentSelections.delete(selected.accountHomeId);
  }
}

function applySavedEnvironmentForAccount(homeAccountId) {
  const environment = accountEnvironmentSelections.get(homeAccountId);
  if (environment) {
    setSelectedEnvironment(environment);
    return;
  }

  setSelectedEnvironment({ environmentName: '', orgUrl: '' });
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
  setSelectedEnvironment({ environmentName: '', orgUrl: '' });
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

async function exportSolution(solutionId, options = {}) {
  const solution = await getSolution(solutionId);
  const managed = Boolean(options.managed);
  const version = String(options.version || '').trim();
  if (version && version !== solution.version) {
    await updateSolutionVersion(solutionId, version);
    solution.version = version;
  }

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

async function updateSolutionVersion(solutionId, version) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) {
    throw new HttpError(400, 'Solution version must use n.n.n.n format.');
  }
  await dvPatch(`solutions(${solutionId})`, { version });
}

async function cacheImportPackage(bytes, filename, meta = {}) {
  const id = randomUUID();
  const analysis = await analyzeSolutionZip(bytes);
  const item = {
    id,
    filename,
    bytes,
    createdAt: new Date().toISOString(),
    meta,
    analysis,
  };
  importPackages.set(id, item);
  return importPackagePayload(item);
}

function requireImportPackage(id) {
  const item = importPackages.get(id);
  if (!item) {
    throw new HttpError(404, 'Import package not found. Upload or deploy a solution first.');
  }
  return item;
}

function importPackagePayload(item) {
  return {
    id: item.id,
    filename: item.filename,
    createdAt: item.createdAt,
    source: item.meta?.source || '',
    sourceEnvironmentName: item.meta?.sourceEnvironmentName || '',
    sourceOrgUrl: item.meta?.sourceOrgUrl || '',
    sourceSolutionId: item.meta?.sourceSolutionId || '',
    analysis: item.analysis,
  };
}

async function prepareImportTarget(item, target) {
  const connections = await listTargetConnections(target.environmentName);
  const connectionReferences = item.analysis.connectionReferences.map((reference) => {
    const matches = connections.filter((connection) => normalizeConnectorId(connection.connectorId) === normalizeConnectorId(reference.connectorId));
    return {
      ...reference,
      matches,
      selectedConnectionId: matches[0]?.connectionId || '',
      createUrl: `https://make.powerapps.com/environments/${encodeURIComponent(target.environmentName)}/connections/available/${connectorName(reference.connectorId)}`,
    };
  });
  const environmentVariables = await hydrateTargetEnvironmentVariables(item.analysis.environmentVariables, target);
  return {
    package: importPackagePayload(item),
    target,
    connectionReferences,
    environmentVariables,
    connections,
  };
}

async function importSolutionPackage(item, target, body) {
  const importJobId = randomUUID();
  const componentParameters = buildComponentParameters(
    item.analysis,
    body.connectionReferences || [],
    body.environmentVariables || [],
  );
  const requestBody = {
    OverwriteUnmanagedCustomizations: body.overwriteUnmanagedCustomizations !== false,
    PublishWorkflows: body.publishWorkflows !== false,
    CustomizationFile: item.bytes.toString('base64'),
    ImportJobId: importJobId,
  };
  if (componentParameters.length) {
    requestBody.ComponentParameters = componentParameters;
  }
  await targetDvPost(target.orgUrl, 'ImportSolution', requestBody);
  const targetSolutionId = await findTargetSolutionId(target, item.analysis.solution?.uniqueName);
  return {
    importJobId,
    imported: true,
    componentParameterCount: componentParameters.length,
    targetSolutionId,
  };
}

async function findTargetSolutionId(target, uniqueName) {
  if (!uniqueName) {
    return '';
  }

  const data = await targetDvGet(
    target.orgUrl,
    `solutions?$select=solutionid&$filter=uniquename eq '${odataString(uniqueName)}'&$top=1`,
  );
  return data.value?.[0]?.solutionid || '';
}

async function analyzeSolutionZip(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const xmlFiles = Object.values(zip.files).filter((file) => !file.dir && file.name.toLowerCase().endsWith('.xml'));
  const xmlRoots = [];
  for (const file of xmlFiles) {
    try {
      xmlRoots.push(xmlParser.parse(await file.async('text')));
    } catch {
      // Ignore non-standard XML entries in the package.
    }
  }

  return {
    solution: findSolutionMetadata(xmlRoots),
    connectionReferences: extractConnectionReferences(xmlRoots),
    environmentVariables: extractEnvironmentVariables(xmlRoots),
  };
}

function findSolutionMetadata(xmlRoots) {
  for (const root of xmlRoots) {
    const uniqueName = findFirstField(root, ['UniqueName', 'uniquename']);
    if (uniqueName) {
      return {
        uniqueName,
        friendlyName: findFirstField(root, ['FriendlyName', 'LocalizedName', 'friendlyname']),
        version: findFirstField(root, ['Version', 'version']),
      };
    }
  }
  return {};
}

function extractConnectionReferences(xmlRoots) {
  const found = new Map();
  for (const node of walkObjects(xmlRoots)) {
    const logicalName = findFirstField(node, ['connectionreferencelogicalname', 'ConnectionReferenceLogicalName', 'LogicalName']);
    const connectorId = findFirstField(node, ['connectorid', 'ConnectorId']);
    if (!logicalName || !connectorId) {
      continue;
    }

    found.set(logicalName, {
      logicalName,
      displayName: findFirstField(node, ['connectionreferencedisplayname', 'ConnectionReferenceDisplayName', 'DisplayName']) || logicalName,
      connectorId,
    });
  }
  return [...found.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function extractEnvironmentVariables(xmlRoots) {
  const found = new Map();
  for (const node of walkObjects(xmlRoots)) {
    const schemaName = findFirstField(node, ['SchemaName', 'schemaname']);
    if (!isEnvironmentVariableNode(node) || !isValidEnvironmentVariableSchemaName(schemaName)) {
      continue;
    }

    const type = findFirstField(node, ['Type', 'type']);
    const defaultValue = findFirstField(node, ['DefaultValue', 'defaultvalue']);
    const value = findFirstField(node, ['Value', 'value']);
    const displayName = findFirstField(node, ['DisplayName', 'displayname', 'LocalizedName']);
    const current = found.get(schemaName) || { schemaName };
    found.set(schemaName, {
      ...current,
      schemaName,
      displayName: displayName || current.displayName || schemaName,
      type: normalizeEnvironmentVariableType(type || current.type),
      defaultValue: defaultValue || current.defaultValue || '',
      value: value || current.value || defaultValue || '',
    });
  }
  return [...found.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function isEnvironmentVariableNode(node) {
  if (!node || typeof node !== 'object') {
    return false;
  }

  return hasField(node, [
    'EnvironmentVariableDefinitionId',
    'environmentvariabledefinitionid',
    'EnvironmentVariableValueId',
    'environmentvariablevalueid',
    'DefaultValue',
    'defaultvalue',
  ]) || hasEnvironmentVariableName(node);
}

function isValidEnvironmentVariableSchemaName(schemaName) {
  const text = String(schemaName || '').trim();
  if (!text || /^environmentvariable(value|definition)$/i.test(text)) {
    return false;
  }
  return /^[A-Za-z][A-Za-z0-9_.-]*$/.test(text);
}

function hasEnvironmentVariableName(node) {
  const names = new Set();
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') {
      continue;
    }
    for (const [key, value] of Object.entries(current)) {
      if (String(key).toLowerCase().includes('environmentvariable')) {
        return true;
      }
      if (value && typeof value === 'object') {
        stack.push(value);
      } else {
        names.add(String(value || '').toLowerCase());
      }
    }
  }
  return [...names].some((name) => name.includes('environmentvariabledefinition') || name.includes('environmentvariablevalue'));
}

function walkObjects(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkObjects(item, output);
    }
  } else if (value && typeof value === 'object') {
    output.push(value);
    for (const child of Object.values(value)) {
      walkObjects(child, output);
    }
  }
  return output;
}

function findFirstField(node, names) {
  if (!node || typeof node !== 'object') {
    return '';
  }

  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') {
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (wanted.has(key.toLowerCase())) {
        return xmlText(value);
      }
      if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }
  return '';
}

function hasField(node, names) {
  if (!node || typeof node !== 'object') {
    return false;
  }

  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') {
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (wanted.has(key.toLowerCase())) {
        return true;
      }
      if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }
  return false;
}

function xmlText(value) {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value.map(xmlText).find(Boolean) || '';
  }
  if (typeof value === 'object') {
    if (Object.hasOwn(value, 'text')) {
      return String(value.text || '').trim();
    }
    for (const child of Object.values(value)) {
      const text = xmlText(child);
      if (text) {
        return text;
      }
    }
  }
  return '';
}

function normalizeEnvironmentVariableType(type) {
  const text = String(type || '').trim().toLowerCase();
  return {
    '100000000': 'string',
    '100000001': 'number',
    '100000002': 'boolean',
    '100000003': 'json',
    '100000004': 'dataSource',
    '100000005': 'secret',
    string: 'string',
    number: 'number',
    decimal: 'number',
    boolean: 'boolean',
    bool: 'boolean',
    json: 'json',
    datasource: 'dataSource',
    secret: 'secret',
  }[text.replace(/\s+/g, '')] || 'string';
}

async function listTargetConnections(environmentName) {
  const url = `https://api.powerplatform.com/connectivity/environments/${encodeURIComponent(environmentName)}/connections?api-version=2024-10-01`;
  const response = await apiHttpRequest('GET', url, { authResource: POWER_PLATFORM_RESOURCE });
  return (response.data.value || []).map((connection) => {
    const connectorId = connection.properties?.apiId || connection.properties?.apiid || connectorIdFromConnection(connection);
    return {
      id: connection.id || '',
      name: connection.name || '',
      displayName: connection.properties?.displayName || connection.name || '',
      connectorId,
      connectionId: connection.name || lastPathPart(connection.id),
      status: connection.properties?.statuses?.[0]?.status || connection.properties?.connectionRuntimeUrl || '',
    };
  }).filter((connection) => connection.connectionId);
}

async function hydrateTargetEnvironmentVariables(environmentVariables, target) {
  return Promise.all(environmentVariables.map(async (variable) => {
    const schema = odataString(variable.schemaName);
    try {
      const data = await targetDvGet(target.orgUrl, `environmentvariabledefinitions?$select=environmentvariabledefinitionid,schemaname,displayname,type,defaultvalue&$expand=environmentvariabledefinition_environmentvariablevalue($select=environmentvariablevalueid,value)&$filter=schemaname eq '${schema}'&$top=1`);
      const row = data.value?.[0];
      const targetValue = row?.environmentvariabledefinition_environmentvariablevalue?.[0]?.value || '';
      return {
        ...variable,
        targetDisplayName: row?.displayname || '',
        targetDefaultValue: row?.defaultvalue || '',
        targetExists: Boolean(row),
        value: targetValue || variable.value || row?.defaultvalue || variable.defaultValue || '',
      };
    } catch {
      return variable;
    }
  }));
}

function buildComponentParameters(analysis, connectionMappings, environmentVariables) {
  const mappingsByLogicalName = new Map(connectionMappings.map((item) => [item.logicalName, item]));
  const valuesBySchemaName = new Map(environmentVariables.map((item) => [item.schemaName, item]));
  const parameters = [];

  for (const reference of analysis.connectionReferences) {
    const mapping = mappingsByLogicalName.get(reference.logicalName);
    if (!mapping?.connectionId) {
      throw new HttpError(400, `Missing connection for ${reference.displayName || reference.logicalName}.`);
    }
    parameters.push({
      '@odata.type': '#Microsoft.Dynamics.CRM.connectionreference',
      connectionreferencelogicalname: reference.logicalName,
      connectionreferencedisplayname: reference.displayName || reference.logicalName,
      connectorid: reference.connectorId,
      connectionid: mapping.connectionId,
    });
  }

  for (const variable of analysis.environmentVariables) {
    const value = valuesBySchemaName.get(variable.schemaName)?.value ?? variable.value ?? variable.defaultValue ?? '';
    validateEnvironmentVariableValue(variable, value);
    parameters.push({
      '@odata.type': '#Microsoft.Dynamics.CRM.environmentvariablevalue',
      schemaname: variable.schemaName,
      value: String(value),
    });
  }

  return parameters;
}

function validateEnvironmentVariableValue(variable, value) {
  const text = String(value ?? '').trim();
  if (variable.type === 'number' && text && Number.isNaN(Number(text))) {
    throw new HttpError(400, `${variable.displayName || variable.schemaName} must be a number.`);
  }
  if (variable.type === 'boolean' && text && !['true', 'false', '1', '0', 'yes', 'no'].includes(text.toLowerCase())) {
    throw new HttpError(400, `${variable.displayName || variable.schemaName} must be true or false.`);
  }
  if (variable.type === 'json' && text) {
    try {
      JSON.parse(text);
    } catch {
      throw new HttpError(400, `${variable.displayName || variable.schemaName} must be valid JSON.`);
    }
  }
}

function connectorIdFromConnection(connection) {
  const apiName = String(connection.id || '').match(/\/apis\/([^/]+)/)?.[1] || '';
  return apiName ? `/providers/Microsoft.PowerApps/apis/${apiName}` : '';
}

function connectorName(connectorId) {
  return String(connectorId || '').split('/').filter(Boolean).pop() || '';
}

function normalizeConnectorId(connectorId) {
  const name = connectorName(connectorId);
  return name ? `/providers/microsoft.powerapps/apis/${name.toLowerCase()}` : '';
}

function lastPathPart(value) {
  return String(value || '').split('/').filter(Boolean).pop() || '';
}

function odataString(value) {
  return String(value || '').replace(/'/g, "''");
}

async function createRole(name, options = {}) {
  const businessUnitId = normalizeGuid(options.businessUnitId) || await getCurrentBusinessUnitId();
  const body = {
    name,
    'businessunitid@odata.bind': `/businessunits(${businessUnitId})`,
  };
  for (const [key, value] of [
    ['description', options.description],
    ['summaryofcoretablepermissions', options.summaryofcoretablepermissions],
    ['isinherited', options.isinherited],
  ]) {
    if (value !== undefined && value !== '') {
      body[key] = value;
    }
  }
  return dvPost('roles', body, { returnRepresentation: true });
}

async function getCurrentBusinessUnitId() {
  const who = await dvGet('WhoAmI()');
  return normalizeGuid(who.BusinessUnitId);
}

async function listBusinessUnits() {
  return (await dvGetAll('businessunits?$select=businessunitid,name,_parentbusinessunitid_value&$orderby=name'))
    .filter((unit) => unit.businessunitid && unit.name)
    .map((unit) => ({
      businessunitid: unit.businessunitid,
      name: unit.name,
      parentBusinessUnitId: unit._parentbusinessunitid_value || '',
    }));
}

async function applyAppOpenerPrivileges(role, businessUnitId) {
  const appOpener = await findAppOpenerRole(businessUnitId);
  if (!appOpener) {
    return;
  }

  const privileges = await getRolePrivileges(appOpener.roleid);
  if (privileges.length) {
    await replacePrivileges(role, privileges.map((privilege) => ({
      PrivilegeId: normalizeGuid(privilege.PrivilegeId),
      Depth: normalizeDepth(privilege.Depth),
    })));
  }
}

async function findAppOpenerRole(businessUnitId) {
  const escapedName = "App Opener".replace(/'/g, "''");
  const businessUnitFilter = businessUnitId ? ` and _businessunitid_value eq ${businessUnitId}` : '';
  const matching = await dvGet(`roles?$select=roleid,name,_businessunitid_value,_parentrootroleid_value,_parentroleid_value&$filter=name eq '${escapedName}'${businessUnitFilter}&$top=1`);
  if (matching.value?.[0]) {
    return getWritableRole(matching.value[0]);
  }

  const any = await dvGet(`roles?$select=roleid,name,_businessunitid_value,_parentrootroleid_value,_parentroleid_value&$filter=name eq '${escapedName}'&$top=1`);
  return any.value?.[0] ? getWritableRole(any.value[0]) : null;
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
      const response = await apiHttpRequest('GET', attempt.url, { authResource: attempt.authResource });
      return {
        value: normalizeEnvironments(response.data),
        source: attempt.url,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new HttpError(502, `Could not list environments. Try signing in again or switching accounts. ${errors.join(' | ')}`);
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

async function targetDvGet(orgUrl, path) {
  const response = await targetDvRequest('GET', orgUrl, path);
  return response.data;
}

async function targetDvPost(orgUrl, path, body) {
  const response = await targetDvRequest('POST', orgUrl, path, body);
  return response.data;
}

function targetDvRequest(method, orgUrl, path, body) {
  return dvRequestUrl(method, `${normalizeOrgUrl(orgUrl)}/api/data/v9.2/${path}`, body, {}, normalizeOrgUrl(orgUrl));
}

async function dvRequestUrl(method, url, body, extraHeaders = {}, authResource = selected.orgUrl) {
  try {
    return await apiHttpRequest(method, url, {
      authResource,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        ...extraHeaders,
      },
      body,
    });
  } catch (error) {
    throw toHttpError(error);
  }
}

async function apiHttpRequest(method, url, options = {}) {
  const authResource = options.authResource || selected.orgUrl;
  const accessToken = await getAccessTokenForSelectedAccount(authResource);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const data = parseJsonResponse(text);
  if (!response.ok) {
    throw new HttpError(response.status, errorMessageFromResponse(data) || `Request failed: ${response.status}`);
  }
  return { data };
}

function parseJsonResponse(text) {
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function errorMessageFromResponse(data) {
  if (typeof data?.error === 'string') {
    return data.error;
  }
  if (data?.error?.message) {
    return data.error.message;
  }
  if (data?.message) {
    return data.message;
  }
  return '';
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

function rowsFromWorksheet(worksheet) {
  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    headers[columnNumber] = cellText(cell.value).trim();
  });

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const item = {};
    let hasValue = false;
    for (let columnNumber = 1; columnNumber < headers.length; columnNumber++) {
      const header = headers[columnNumber];
      if (!header) {
        continue;
      }

      const value = cellText(row.getCell(columnNumber).value);
      item[header] = value;
      hasValue = hasValue || Boolean(String(value).trim());
    }

    if (hasValue) {
      rows.push(item);
    }
  });
  return rows;
}

function cellText(value) {
  if (value == null) {
    return '';
  }
  if (typeof value === 'object') {
    if (Object.hasOwn(value, 'text')) {
      return String(value.text || '');
    }
    if (Object.hasOwn(value, 'result')) {
      return cellText(value.result);
    }
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || '').join('');
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
  }
  return String(value);
}

function validationValuesFor(row, header) {
  const current = String(row[header] || '').trim();
  if (current.toUpperCase() === 'N/A') {
    return ['N/A'];
  }

  const available = header === 'Depth'
    ? String(row['Available Scopes'] || '')
    : String(row[`${header} Available Scopes`] || '');
  const values = available.split('|').map((value) => value.trim()).filter(Boolean);
  const ordered = ROLE_SCOPE_VALUES.filter((value) => values.includes(value));
  if (current && !ordered.includes(current)) {
    ordered.push(current);
  }
  return ordered.length ? ordered : ROLE_SCOPE_VALUES.filter((value) => value !== 'N/A');
}

function columnWidth(header) {
  if (header.endsWith('Privilege Id') || header.endsWith('Privilege Name') || header.endsWith('Available Scopes')) {
    return 28;
  }
  return {
    'Role Name': 18,
    'Role Id': 38,
    Table: 28,
    Name: 24,
    'Record owner': 16,
    'Permission type': 16,
    'Display Name': 32,
    Depth: 14,
  }[header] || 14;
}

function bottomBorder() {
  return {
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };
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
    throw new HttpError(400, 'Select an environment first.');
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

function sendXlsx(res, status, filename, bytes) {
  res.writeHead(status, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': bytes.length,
  });
  res.end(bytes);
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
  if (error instanceof HttpError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const statusMatch = message.match(/HTTP error status:\s*(\d+)/);
  const status = statusMatch ? Number(statusMatch[1]) : 500;
  return new HttpError(status, message);
}

function errorMessage(error) {
  return cleanErrorMessage(error instanceof Error ? error.message : String(error));
}

function cleanErrorMessage(message) {
  const text = String(message || '').trim();
  const jsonMatch = text.match(/:\s*(\{.*\})\s*$/);
  if (!jsonMatch) {
    return text;
  }

  try {
    return errorMessageFromResponse(JSON.parse(jsonMatch[1])) || text;
  } catch {
    return text;
  }
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
