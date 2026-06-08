import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import {
  createConnectionAsync,
  getConnectorAsync,
  initializePlayerServices,
  isSsoOnlyConnector,
  listConnectionsAsync,
  updateEnvironmentName,
} from '@microsoft/power-apps-actions';
import { createMaafConnectionUrl } from '@microsoft/power-apps-common/services';
import { NodeMsalAuthenticationProvider } from '@microsoft/power-apps-cli/dist/Authentication/NodeMsalAuthenticationProvider.js';
import { initializeCliSettings, setCliLogger } from '@microsoft/power-apps-cli/dist/CliSettings.js';
import { CliHttpClient } from '@microsoft/power-apps-cli/dist/HttpClient/CliHttpClient.js';
import open from 'open';
import { deleteConnectionAsync } from './node_modules/@microsoft/power-apps-actions/dist/services/connectivity/ConnectivityService.js';

const PORT = Number(process.env.SECURITY_ROLES_PORT || process.env.PORT || 4280);
const REGION = process.env.PP_REGION || 'prod';
const SERVICE_RESOURCE = process.env.PP_SERVICE_RESOURCE || 'https://service.powerapps.com/';
const POWER_PLATFORM_RESOURCE = process.env.PP_API_RESOURCE || 'https://api.powerplatform.com';
const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const CONNECTION_CREATION_TIMEOUT_MS = 10 * 60 * 1000;
const CONNECTION_CALLBACK_PROTOCOL_VERSION = '1';

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
const MANAGEABLE_LOGICAL_NAMES = new Set([
  'environmentvariabledefinition',
  'environmentvariablevalue',
  'connectionreference',
  'workflow',
  'canvasapp',
  'bot',
]);
const MANAGEABLE_COMPONENT_TYPES = new Set([29, 300, 380, 381]);
const SHAREABLE_COMPONENTS = {
  workflow: { collection: 'workflows', idName: 'workflowid', odataType: 'Microsoft.Dynamics.CRM.workflow' },
  canvasapp: { collection: 'canvasapps', idName: 'canvasappid', odataType: 'Microsoft.Dynamics.CRM.canvasapp' },
  bot: { collection: 'bots', idName: 'botid', odataType: 'Microsoft.Dynamics.CRM.bot' },
  botcomponent: { collection: 'botcomponents', idName: 'botcomponentid', odataType: 'Microsoft.Dynamics.CRM.botcomponent' },
};
const SHARE_ROLE_ACCESS = {
  user: 'ReadAccess',
  analyticsviewer: 'ReadAccess',
  coowner: 'ReadAccess, WriteAccess, ShareAccess',
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
const logger = {
  trackActivityEvent() {},
  trackErrorEvent(eventName, eventData) {
    console.error(eventName, eventData || '');
  },
  trackScenario() {
    return {
      scenarioId: randomUUID(),
      complete() {},
      failure() {},
      completeWithError() {},
    };
  },
  stringifyError(error) {
    return error instanceof Error ? error.message : String(error);
  },
};

const authProvider = new NodeMsalAuthenticationProvider();
await authProvider.initAsync(REGION);
await initializeCliSettings({
  source: 'standalone',
  interactive: isBrowserConnectionEnabled(),
});
setCliLogger(logger);
const httpClient = new CliHttpClient({
  getAccessTokenForResource: getAccessTokenForSelectedAccount,
  getUserTenantId: () => authProvider.getUserTenantId(),
});
const actionAuthProvider = {
  getAccessTokenForResource: getAccessTokenForSelectedAccount,
};
initializePlayerServices({
  logger,
  authProvider: actionAuthProvider,
  httpClient,
  region: REGION,
  environmentName: selected.environmentName,
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
  await applyRequestAccount(req);

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
    await selectAccount(requireString(body.homeAccountId, 'homeAccountId'));
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

  if (route === 'GET /api/users') {
    requireOrgUrl();
    sendJson(res, 200, await listEnvironmentUsers(url.searchParams.get('q') || ''));
    return;
  }

  if (route === 'POST /api/users/sync') {
    requireOrgUrl();
    const body = await readJson(req);
    sendJson(res, 200, await syncEnvironmentUser(requireString(body.principalObjectId, 'principalObjectId')));
    return;
  }

  if (route === 'GET /api/teams') {
    requireOrgUrl();
    sendJson(res, 200, await listEnvironmentTeams(url.searchParams.get('q') || ''));
    return;
  }

  if (route === 'POST /api/teams') {
    requireOrgUrl();
    const body = await readJson(req);
    sendJson(res, 201, await createEnvironmentTeam(body));
    return;
  }

  const teamMembersMatch = url.pathname.match(/^\/api\/teams\/([0-9a-fA-F-]+)\/members$/);
  if (req.method === 'POST' && teamMembersMatch) {
    requireOrgUrl();
    const body = await readJson(req);
    sendJson(res, 200, await addTeamMembers(teamMembersMatch[1], body.userIds || body.members || []));
    return;
  }

  if (route === 'POST /api/role-assignments') {
    requireOrgUrl();
    const body = await readJson(req);
    sendJson(res, 200, await assignSecurityRole(body));
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

  if (route === 'GET /api/tables') {
    requireOrgUrl();
    sendJson(res, 200, await listDataverseTables({
      scope: url.searchParams.get('scope') || 'custom',
      includeCounts: url.searchParams.get('includeCounts') !== 'false',
    }));
    return;
  }

  const tableDocumentXlsxMatch = url.pathname.match(/^\/api\/tables\/([^/]+)\/document\/xlsx$/);
  if (req.method === 'GET' && tableDocumentXlsxMatch) {
    requireOrgUrl();
    const document = await getTableDesignDocument(decodeURIComponent(tableDocumentXlsxMatch[1]), {
      columnScope: url.searchParams.get('columns') || 'custom',
    });
    sendXlsx(res, 200, `${safeFilename(document.table.displayName || document.table.logicalName)}-table-design.xlsx`, await exportDesignDocumentWorkbook(document));
    return;
  }

  const tableDocumentMatch = url.pathname.match(/^\/api\/tables\/([^/]+)\/document$/);
  if (req.method === 'GET' && tableDocumentMatch) {
    requireOrgUrl();
    sendJson(res, 200, await getTableDesignDocument(decodeURIComponent(tableDocumentMatch[1]), {
      columnScope: url.searchParams.get('columns') || 'custom',
    }));
    return;
  }

  const tableDetailMatch = url.pathname.match(/^\/api\/tables\/([^/]+)$/);
  if (req.method === 'GET' && tableDetailMatch) {
    requireOrgUrl();
    sendJson(res, 200, await getDataverseTableDetails(decodeURIComponent(tableDetailMatch[1]), {
      columnScope: url.searchParams.get('columns') || 'custom',
    }));
    return;
  }

  const tableDiagramMatch = url.pathname.match(/^\/api\/tables\/([^/]+)\/diagram$/);
  if (req.method === 'GET' && tableDiagramMatch) {
    requireOrgUrl();
    sendJson(res, 200, await buildDataverseTableDiagram(decodeURIComponent(tableDiagramMatch[1]), {
      columnScope: url.searchParams.get('columns') || 'custom',
    }));
    return;
  }

  const componentsMatch = url.pathname.match(/^\/api\/solutions\/([0-9a-fA-F-]+)\/components$/);
  if (req.method === 'GET' && componentsMatch) {
    requireOrgUrl();
    sendJson(res, 200, await listSolutionComponents(componentsMatch[1]));
    return;
  }

  const solutionTableDocumentXlsxMatch = url.pathname.match(/^\/api\/solutions\/([0-9a-fA-F-]+)\/tables\/document\/xlsx$/);
  if (req.method === 'GET' && solutionTableDocumentXlsxMatch) {
    requireOrgUrl();
    const document = await getSolutionTableDesignDocument(solutionTableDocumentXlsxMatch[1]);
    sendXlsx(res, 200, `${safeFilename(document.solution.uniquename || document.solution.friendlyname)}-table-design.xlsx`, await exportDesignDocumentWorkbook(document));
    return;
  }

  const solutionTableDocumentMatch = url.pathname.match(/^\/api\/solutions\/([0-9a-fA-F-]+)\/tables\/document$/);
  if (req.method === 'GET' && solutionTableDocumentMatch) {
    requireOrgUrl();
    sendJson(res, 200, await getSolutionTableDesignDocument(solutionTableDocumentMatch[1]));
    return;
  }

  const solutionTableDiagramMatch = url.pathname.match(/^\/api\/solutions\/([0-9a-fA-F-]+)\/tables\/diagram$/);
  if (req.method === 'GET' && solutionTableDiagramMatch) {
    requireOrgUrl();
    sendJson(res, 200, await buildSolutionTableDiagram(solutionTableDiagramMatch[1]));
    return;
  }

  if (route === 'GET /api/principals') {
    requireOrgUrl();
    sendJson(res, 200, await listEnvironmentPrincipals(url.searchParams.get('q') || ''));
    return;
  }

  if (route === 'GET /api/connections') {
    requireOrgUrl();
    sendJson(res, 200, await listEnvironmentConnections());
    return;
  }

  const connectionDeleteMatch = url.pathname.match(/^\/api\/connections\/([^/]+)$/);
  if (req.method === 'DELETE' && connectionDeleteMatch) {
    requireOrgUrl();
    sendJson(res, 200, await deleteEnvironmentConnection(decodeURIComponent(connectionDeleteMatch[1])));
    return;
  }

  const componentManageMatch = url.pathname.match(/^\/api\/components\/(\d+)\/([0-9a-fA-F-]+)\/manage$/);
  if (req.method === 'GET' && componentManageMatch) {
    requireOrgUrl();
    sendJson(res, 200, await getComponentManagementDetails(Number(componentManageMatch[1]), componentManageMatch[2]));
    return;
  }

  const envVarSaveMatch = url.pathname.match(/^\/api\/environment-variables\/([0-9a-fA-F-]+)\/value$/);
  if (req.method === 'POST' && envVarSaveMatch) {
    requireOrgUrl();
    const body = await readJson(req);
    sendJson(res, 200, await saveEnvironmentVariableValue(envVarSaveMatch[1], String(body.value ?? '')));
    return;
  }

  const connectionReferenceSaveMatch = url.pathname.match(/^\/api\/connection-references\/([0-9a-fA-F-]+)\/connection$/);
  if (req.method === 'POST' && connectionReferenceSaveMatch) {
    requireOrgUrl();
    const body = await readJson(req);
    sendJson(res, 200, await saveConnectionReferenceConnection(connectionReferenceSaveMatch[1], requireString(body.connectionId, 'connectionId')));
    return;
  }

  const connectionReferenceCreateMatch = url.pathname.match(/^\/api\/connection-references\/([0-9a-fA-F-]+)\/connections$/);
  if (req.method === 'POST' && connectionReferenceCreateMatch) {
    requireOrgUrl();
    const body = await readJson(req);
    sendJson(res, 201, await createConnectionForReference(connectionReferenceCreateMatch[1], body.displayName));
    return;
  }

  const workflowStateMatch = url.pathname.match(/^\/api\/workflows\/([0-9a-fA-F-]+)\/state$/);
  if (req.method === 'POST' && workflowStateMatch) {
    requireOrgUrl();
    const body = await readJson(req);
    sendJson(res, 200, await saveWorkflowState(workflowStateMatch[1], body.state));
    return;
  }

  const shareComponentMatch = url.pathname.match(/^\/api\/components\/(\d+)\/([0-9a-fA-F-]+)\/share$/);
  if (req.method === 'POST' && shareComponentMatch) {
    requireOrgUrl();
    const body = await readJson(req);
    sendJson(res, 200, await shareComponent(Number(shareComponentMatch[1]), shareComponentMatch[2], body));
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

async function selectAccount(homeAccountId) {
  const accounts = await listAccounts();
  if (!accounts.some((account) => account.homeAccountId === homeAccountId)) {
    ensureSelectedAccount(accounts);
    if (!selected.accountHomeId) {
      throw new HttpError(401, 'Selected account is no longer signed in. Sign in again.');
    }
    return;
  }

  selected.accountHomeId = homeAccountId;
  applySavedEnvironmentForAccount(homeAccountId);
}

async function applyRequestAccount(req) {
  const homeAccountId = String(req.headers['x-pdac-account-home-id'] || '').trim();
  if (!homeAccountId || selected.accountHomeId === homeAccountId) {
    return;
  }

  const accounts = await getMsalAccounts();
  if (!accounts.some((account) => account.homeAccountId === homeAccountId)) {
    throw new HttpError(401, 'Selected account is no longer signed in. Sign in again.');
  }

  selected.accountHomeId = homeAccountId;
  const savedEnvironment = accountEnvironmentSelections.get(homeAccountId);
  if (savedEnvironment) {
    setSelectedEnvironment(savedEnvironment);
  }
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
  updateEnvironmentName(selected.environmentName);
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

async function listDataverseTables(options = {}) {
  const scope = options.scope === 'all' ? 'all' : 'custom';
  const data = await dvGetAll('EntityDefinitions?$select=LogicalName,SchemaName,DisplayName,DisplayCollectionName,Description,OwnershipType,IsPrivate,IsIntersect,IsCustomEntity,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute&LabelLanguages=1033');
  const tables = data
    .filter((item) => item.LogicalName && item.SchemaName && !item.IsIntersect)
    .filter((item) => scope === 'all' || item.IsCustomEntity)
    .map(mapEntityDefinition)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  return {
    scope,
    tables,
  };
}

async function getDataverseTableDetails(logicalName, options = {}) {
  const entity = await getEntityDefinition(logicalName);
  const [attributes, lookupTargets] = await Promise.all([
    listEntityAttributes(logicalName),
    listLookupAttributeTargets(logicalName).catch(() => new Map()),
  ]);
  const columnScope = options.columnScope === 'all' ? 'all' : 'custom';
  const columns = attributes
    .map((attribute) => mapAttributeDefinition(attribute, lookupTargets.get(attribute.LogicalName) || []))
    .filter((column) => columnScope === 'all' || column.isCustom)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  return {
    table: mapEntityDefinition(entity),
    columnScope,
    columns,
  };
}

async function buildDataverseTableDiagram(logicalName, options = {}) {
  const name = requireLogicalName(logicalName, 'table');
  const diagram = await buildDataverseTablesDiagram([name], {
    columnScope: options.columnScope === 'all' ? 'all' : 'custom',
  });
  return {
    ...diagram,
    table: diagram.tables.find((table) => table.logicalName === name) || mapEntityDefinition(await getEntityDefinition(name)),
  };
}

async function buildSolutionTableDiagram(solutionId) {
  const solution = await getSolution(solutionId);
  const solutionTables = await listSolutionTables(solutionId);
  if (!solutionTables.length) {
    return {
      solution,
      tableCount: 0,
      relatedTableCount: 0,
      relationshipCount: 0,
      externalDependencyCount: 0,
      tables: [],
      externalDependencies: [],
      relationships: [],
      mermaid: 'erDiagram\n',
    };
  }

  return {
    solution,
    tableCount: solutionTables.length,
    ...await buildDataverseTablesDiagram(solutionTables.map((table) => table.logicalName), {
      solutionTableNames: new Set(solutionTables.map((table) => table.logicalName)),
    }),
  };
}

async function buildDataverseTablesDiagram(logicalNames, options = {}) {
  const rootNames = [...new Set(logicalNames.map((name) => requireLogicalName(name, 'table')))];
  const solutionTableNames = options.solutionTableNames || null;
  const columnScope = options.columnScope === 'all' ? 'all' : 'custom';
  let relationships = [];
  for (const name of rootNames) {
    relationships.push(...await listDirectLookupRelationships(name));
  }

  const relationshipByKey = new Map();
  for (const relationship of relationships) {
    relationshipByKey.set(`${relationship.referencingEntity}:${relationship.referencingAttribute}:${relationship.referencedEntity}`, relationship);
  }
  relationships = [...relationshipByKey.values()];

  const tableNames = new Set(rootNames);
  for (const relationship of relationships) {
    tableNames.add(relationship.referencedEntity);
    tableNames.add(relationship.referencingEntity);
  }

  const tableEntries = await mapWithConcurrency([...tableNames], 4, async (name) => {
    const [entity, attributes, lookupTargets] = await Promise.all([
      getEntityDefinition(name),
      listEntityAttributes(name),
      listLookupAttributeTargets(name).catch(() => new Map()),
    ]);
    const table = mapEntityDefinition(entity);
    return [
      name,
      {
        table: {
          ...table,
          isExternalDependency: Boolean(solutionTableNames && !solutionTableNames.has(name)),
        },
        columns: diagramColumns(table, attributes, lookupTargets, { columnScope }),
      },
    ];
  });
  const tables = new Map(tableEntries);
  relationships = relationships.filter((relationship) => isCustomLookupRelationshipForDiagram(relationship, tables));

  const visibleTables = new Set(rootNames);
  for (const relationship of relationships) {
    visibleTables.add(relationship.referencedEntity);
    visibleTables.add(relationship.referencingEntity);
  }
  for (const name of [...tables.keys()]) {
    if (!visibleTables.has(name)) {
      tables.delete(name);
    }
  }

  const mermaid = buildMermaidErDiagram(rootNames[0], tables, relationships, {
    externalTableNames: solutionTableNames
      ? [...tables.keys()].filter((name) => !solutionTableNames.has(name))
      : [],
  });
  const externalDependencies = [...tables.values()]
    .map((entry) => entry.table)
    .filter((table) => table.isExternalDependency)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  return {
    relatedTableCount: Math.max(0, tables.size - rootNames.length),
    relationshipCount: relationships.length,
    externalDependencyCount: externalDependencies.length,
    tables: [...tables.values()].map((entry) => entry.table).sort((left, right) => left.displayName.localeCompare(right.displayName)),
    externalDependencies,
    relationships,
    mermaid,
  };
}

async function getTableDesignDocument(logicalName, options = {}) {
  const name = requireLogicalName(logicalName, 'table');
  const table = mapEntityDefinition(await getEntityDefinition(name));
  const columnScope = options.columnScope === 'all' ? 'all' : 'custom';
  const columns = await getDesignDocumentRowsForTable(table, { columnScope });
  return {
    kind: 'table',
    table,
    columns,
    xlsxUrl: `/api/tables/${encodeURIComponent(name)}/document/xlsx?columns=${encodeURIComponent(columnScope)}`,
  };
}

async function getSolutionTableDesignDocument(solutionId) {
  const solution = await getSolution(solutionId);
  const tables = await listSolutionTables(solutionId);
  const groups = await mapWithConcurrency(tables, 3, async (table) => ({
    table,
    columns: await getDesignDocumentRowsForTable(table, { includeTableDisplayName: true }),
  }));
  const columns = groups.flatMap((group) => group.columns);
  return {
    kind: 'solution',
    solution,
    tables,
    tableCount: tables.length,
    columns,
    xlsxUrl: `/api/solutions/${encodeURIComponent(solutionId)}/tables/document/xlsx`,
  };
}

async function getDesignDocumentRowsForTable(table, options = {}) {
  const [attributes, lookupTargets, choiceDetails] = await Promise.all([
    listEntityAttributes(table.logicalName),
    listLookupAttributeTargets(table.logicalName).catch(() => new Map()),
    listChoiceAttributeDetails(table.logicalName).catch(() => new Map()),
  ]);
  return attributes
    .map((attribute) => mapAttributeDefinition(attribute, lookupTargets.get(attribute.LogicalName) || []))
    .filter((column) => options.columnScope === 'all' || isDesignDocumentColumn(table, column))
    .sort((left, right) => designColumnSort(table, left, right))
    .map((column) => designDocumentRow(table, column, choiceDetails.get(column.logicalName), options));
}

async function listSolutionTables(solutionId) {
  const data = await dvGetAll(
    `solutioncomponents?$select=objectid&$filter=_solutionid_value eq ${normalizeGuid(solutionId)} and componenttype eq 1`,
  );
  const tables = [];
  const seen = new Set();
  for (const component of data) {
    try {
      const table = mapEntityDefinition(await getEntityDefinitionByMetadataId(component.objectid));
      if (table.logicalName && !seen.has(table.logicalName)) {
        seen.add(table.logicalName);
        tables.push(table);
      }
    } catch (error) {
      console.error('Could not resolve solution table component:', component.objectid, error);
    }
  }
  return tables.sort((left, right) => left.displayName.localeCompare(right.displayName));
}

async function getEntityDefinition(logicalName) {
  const name = requireLogicalName(logicalName, 'table');
  return dvGet(`EntityDefinitions(LogicalName='${odataString(name)}')?$select=LogicalName,SchemaName,DisplayName,DisplayCollectionName,Description,OwnershipType,IsPrivate,IsIntersect,IsCustomEntity,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute&LabelLanguages=1033`);
}

async function getEntityDefinitionByMetadataId(metadataId) {
  const id = normalizeGuid(metadataId);
  if (!id) {
    throw new HttpError(400, 'Table metadata id is required.');
  }
  return dvGet(`EntityDefinitions(${id})?$select=LogicalName,SchemaName,DisplayName,DisplayCollectionName,Description,OwnershipType,IsPrivate,IsIntersect,IsCustomEntity,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute&LabelLanguages=1033`);
}

async function listEntityAttributes(logicalName) {
  const name = requireLogicalName(logicalName, 'table');
  const path = `EntityDefinitions(LogicalName='${odataString(name)}')/Attributes?$select=LogicalName,SchemaName,DisplayName,Description,AttributeType,IsCustomAttribute,IsPrimaryId,IsPrimaryName,IsValidForCreate,IsValidForRead,IsValidForUpdate,RequiredLevel,AttributeOf&LabelLanguages=1033`;
  const data = await dvGetAll(path);
  return data.filter((attribute) => attribute.LogicalName && !attribute.AttributeOf);
}

async function listLookupAttributeTargets(logicalName) {
  const name = requireLogicalName(logicalName, 'table');
  const data = await dvGetAll(`EntityDefinitions(LogicalName='${odataString(name)}')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets&LabelLanguages=1033`);
  return new Map(data.filter((item) => item.LogicalName).map((item) => [item.LogicalName, item.Targets || []]));
}

async function listChoiceAttributeDetails(logicalName) {
  const name = requireLogicalName(logicalName, 'table');
  const paths = [
    `EntityDefinitions(LogicalName='${odataString(name)}')/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet,GlobalOptionSet&LabelLanguages=1033`,
    `EntityDefinitions(LogicalName='${odataString(name)}')/Attributes/Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata?$expand=OptionSet,GlobalOptionSet&LabelLanguages=1033`,
  ];
  const rows = (await Promise.all(paths.map((path) => dvGetAll(path).catch(() => [])))).flat();
  return new Map(rows.filter((row) => row.LogicalName).map((row) => [row.LogicalName, mapChoiceAttributeDetail(row)]));
}

async function listDirectLookupRelationships(logicalName) {
  const name = requireLogicalName(logicalName, 'table');
  const select = '$select=SchemaName,ReferencedEntity,ReferencedAttribute,ReferencingEntity,ReferencingAttribute,ReferencedEntityNavigationPropertyName,ReferencingEntityNavigationPropertyName,IsCustomRelationship';
  const [manyToOne, oneToMany] = await Promise.all([
    dvGetAll(`EntityDefinitions(LogicalName='${odataString(name)}')/ManyToOneRelationships?${select}`),
    dvGetAll(`EntityDefinitions(LogicalName='${odataString(name)}')/OneToManyRelationships?${select}`),
  ]);
  const byKey = new Map();
  for (const relationship of [...manyToOne, ...oneToMany]) {
    if (!relationship.ReferencedEntity || !relationship.ReferencingEntity || !relationship.ReferencingAttribute) {
      continue;
    }
    if (isAuditRelationship(relationship)) {
      continue;
    }
    const mapped = mapLookupRelationship(relationship, name);
    byKey.set(`${mapped.referencingEntity}:${mapped.referencingAttribute}:${mapped.referencedEntity}`, mapped);
  }
  return [...byKey.values()].sort((left, right) => `${left.referencingEntity}.${left.referencingAttribute}`.localeCompare(`${right.referencingEntity}.${right.referencingAttribute}`));
}

function mapEntityDefinition(item) {
  return {
    logicalName: item.LogicalName || '',
    schemaName: item.SchemaName || '',
    displayName: getLabel(item.DisplayName) || item.SchemaName || item.LogicalName || '',
    displayCollectionName: getLabel(item.DisplayCollectionName) || '',
    description: getLabel(item.Description) || '',
    entitySetName: item.EntitySetName || '',
    ownership: item.OwnershipType || '',
    isCustom: Boolean(item.IsCustomEntity),
    isPrivate: Boolean(item.IsPrivate),
    primaryIdAttribute: item.PrimaryIdAttribute || '',
    primaryNameAttribute: item.PrimaryNameAttribute || '',
  };
}

function mapAttributeDefinition(attribute, targets = []) {
  const requiredLevel = attribute.RequiredLevel?.Value || '';
  return {
    logicalName: attribute.LogicalName || '',
    schemaName: attribute.SchemaName || '',
    displayName: getLabel(attribute.DisplayName) || attribute.SchemaName || attribute.LogicalName || '',
    description: getLabel(attribute.Description) || '',
    type: attribute.AttributeType || '',
    requiredLevel,
    targets,
    isCustom: Boolean(attribute.IsCustomAttribute),
    isPrimaryId: Boolean(attribute.IsPrimaryId),
    isPrimaryName: Boolean(attribute.IsPrimaryName),
    isValidForCreate: attribute.IsValidForCreate !== false,
    isValidForRead: attribute.IsValidForRead !== false,
    isValidForUpdate: attribute.IsValidForUpdate !== false,
  };
}

function mapChoiceAttributeDetail(attribute) {
  const global = attribute.GlobalOptionSet || null;
  const local = attribute.OptionSet || null;
  const optionSet = global || local || {};
  return {
    isGlobal: Boolean(global),
    optionSetName: global?.Name || local?.Name || '',
    choices: (optionSet.Options || [])
      .map((option) => ({
        value: option.Value,
        label: getLabel(option.Label) || String(option.Value ?? ''),
      }))
      .filter((option) => option.label)
      .sort((left, right) => String(left.label).localeCompare(String(right.label))),
  };
}

function mapLookupRelationship(relationship, selectedLogicalName) {
  return {
    schemaName: relationship.SchemaName || '',
    referencedEntity: relationship.ReferencedEntity || '',
    referencedAttribute: relationship.ReferencedAttribute || '',
    referencingEntity: relationship.ReferencingEntity || '',
    referencingAttribute: relationship.ReferencingAttribute || '',
    referencedNavigation: relationship.ReferencedEntityNavigationPropertyName || '',
    referencingNavigation: relationship.ReferencingEntityNavigationPropertyName || '',
    isCustom: Boolean(relationship.IsCustomRelationship),
    direction: relationship.ReferencingEntity === selectedLogicalName ? 'outgoing' : 'incoming',
  };
}

function diagramColumns(table, attributes, lookupTargets, options = {}) {
  const primaryName = table.primaryNameAttribute || 'name';
  const include = new Set([primaryName, 'name', 'createdby', 'createdon']);
  return attributes
    .map((attribute) => mapAttributeDefinition(attribute, lookupTargets.get(attribute.LogicalName) || []))
    .filter((column) => options.columnScope === 'all' || column.isCustom || include.has(column.logicalName))
    .sort((left, right) => {
      const leftPinned = include.has(left.logicalName) ? 0 : 1;
      const rightPinned = include.has(right.logicalName) ? 0 : 1;
      return leftPinned - rightPinned || left.displayName.localeCompare(right.displayName);
    });
}

function buildMermaidErDiagram(rootLogicalName, tables, relationships, options = {}) {
  const lines = ['erDiagram'];
  for (const relationship of relationships) {
    const parent = mermaidIdentifier(relationship.referencedEntity);
    const child = mermaidIdentifier(relationship.referencingEntity);
    const label = mermaidLabel(relationship.referencingAttribute || relationship.schemaName || 'lookup');
    lines.push(`  ${parent} ||--o{ ${child} : "${label}"`);
  }
  for (const [logicalName, entry] of [...tables.entries()].sort((left, right) => {
    if (left[0] === rootLogicalName) {
      return -1;
    }
    if (right[0] === rootLogicalName) {
      return 1;
    }
    return left[1].table.displayName.localeCompare(right[1].table.displayName);
  })) {
    lines.push(`  ${mermaidIdentifier(logicalName)} {`);
    for (const column of entry.columns) {
      lines.push(`    ${mermaidType(column.type)} ${mermaidIdentifier(column.logicalName)} "${mermaidLabel(column.displayName)}"`);
    }
    if (!entry.columns.length) {
      lines.push('    string no_custom_columns "No custom columns"');
    }
    lines.push('  }');
  }
  return `${lines.join('\n')}\n`;
}

function isDesignDocumentColumn(table, column) {
  return column.isCustom ||
    column.logicalName === table.primaryNameAttribute ||
    column.logicalName === 'name' ||
    column.logicalName === 'createdby' ||
    column.logicalName === 'createdon';
}

function designColumnSort(table, left, right) {
  const order = new Map([
    [table.primaryNameAttribute || 'name', 0],
    ['name', 1],
    ['createdby', 2],
    ['createdon', 3],
  ]);
  const leftOrder = order.has(left.logicalName) ? order.get(left.logicalName) : 10;
  const rightOrder = order.has(right.logicalName) ? order.get(right.logicalName) : 10;
  return leftOrder - rightOrder || left.displayName.localeCompare(right.displayName);
}

function designDocumentRow(table, column, choiceDetails, options = {}) {
  const row = {
    'Display Name': column.displayName || column.schemaName || column.logicalName,
    'Unique Name': column.schemaName || column.logicalName,
    'Data Type': designDataType(column),
    Description: column.description || '',
    Type: designColumnType(column, choiceDetails),
  };
  if (options.includeTableDisplayName) {
    return {
      'Table Display Name': table.displayName || table.schemaName || table.logicalName,
      ...row,
    };
  }
  return row;
}

function designDataType(column) {
  const type = String(column.type || 'String');
  if (type === 'Picklist') {
    return 'Choice';
  }
  if (type === 'MultiSelectPicklist') {
    return 'Choices';
  }
  if (['Integer', 'BigInt'].includes(type)) {
    return 'Integer';
  }
  return type;
}

function designColumnType(column, choiceDetails) {
  if (['Lookup', 'Customer', 'Owner'].includes(column.type)) {
    return column.targets?.length ? `Lookup table: ${column.targets.join(', ')}` : 'Lookup table: unavailable';
  }
  if (['Picklist', 'MultiSelectPicklist'].includes(column.type)) {
    if (choiceDetails?.isGlobal) {
      return `Global choice: ${choiceDetails.optionSetName || 'unnamed'}`;
    }
    const choices = choiceDetails?.choices?.length
      ? choiceDetails.choices.map((choice) => `${choice.label} (${choice.value})`).join('; ')
      : 'choices unavailable';
    return `Local choices: ${choices}`;
  }
  return column.isCustom ? 'Custom column' : 'Standard column';
}

async function exportDesignDocumentWorkbook(document) {
  const rows = document.columns || [];
  const columns = document.kind === 'solution'
    ? ['Table Display Name', 'Display Name', 'Unique Name', 'Data Type', 'Description', 'Type']
    : ['Display Name', 'Unique Name', 'Data Type', 'Description', 'Type'];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PDAC';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('Table Design', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  worksheet.columns = columns.map((header) => ({
    header,
    key: header,
    width: designDocumentColumnWidth(header),
  }));
  worksheet.addRows(rows);
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
  const headerRow = worksheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF111827' } };
    cell.alignment = { vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    cell.border = bottomBorder();
  });
  for (let rowNumber = 2; rowNumber <= rows.length + 1; rowNumber++) {
    worksheet.getRow(rowNumber).alignment = { vertical: 'top', wrapText: true };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function designDocumentColumnWidth(header) {
  return {
    'Table Display Name': 28,
    'Display Name': 28,
    'Unique Name': 30,
    'Data Type': 18,
    Description: 48,
    Type: 56,
  }[header] || 20;
}

function isAuditRelationship(relationship) {
  const attribute = String(relationship.ReferencingAttribute || '').toLowerCase();
  const referenced = String(relationship.ReferencedEntity || '').toLowerCase();
  return attribute === 'createdby' && ['systemuser', 'team'].includes(referenced);
}

function isCustomLookupRelationshipForDiagram(relationship, tables) {
  const referencing = tables.get(relationship.referencingEntity);
  return Boolean(referencing?.columns?.some((column) =>
    column.logicalName === relationship.referencingAttribute &&
    column.isCustom &&
    ['Lookup', 'Customer', 'Owner'].includes(column.type)
  ));
}

function mermaidIdentifier(value) {
  const text = String(value || 'unknown').replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(text) ? text : `_${text}`;
}

function mermaidType(value) {
  const type = String(value || 'string').toLowerCase();
  if (type.includes('lookup') || type.includes('owner') || type.includes('customer')) {
    return 'lookup';
  }
  if (type.includes('int') || type.includes('decimal') || type.includes('double') || type.includes('money') || type.includes('bigint')) {
    return 'number';
  }
  if (type.includes('date')) {
    return 'datetime';
  }
  if (type.includes('boolean')) {
    return 'boolean';
  }
  return 'string';
}

function mermaidLabel(value) {
  return String(value || '').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
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
  const logicalName = display.logicalName || '';
  const effectiveTypeLabel = display.typeLabel || typeLabel;
  return {
    solutioncomponentid: component.solutioncomponentid,
    componenttype: componentType,
    typeLabel: display.canvasAppTypeLabel || effectiveTypeLabel,
    objectid: component.objectid,
    displayName: display.displayName || component.objectid,
    logicalName,
    recordLogicalName: display.recordLogicalName || '',
    manageable: isManageableComponent(componentType, logicalName),
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
    20: [{ path: `roles(${id})?$select=roleid,name,_businessunitid_value,ismanaged,roletemplateid,_parentroleid_value,_parentrootroleid_value&$expand=businessunitid($select=name)`, map: mapRoleComponent }],
    29: [{ path: `workflows(${id})?$select=name,uniquename`, map: (data) => ({ ...namedRowMap('name', 'uniquename')(data), logicalName: 'workflow' }) }],
    300: [{ path: `canvasapps(${id})?$select=name,displayname,canvasapptype`, map: (data) => ({ displayName: pickDisplayName(data), logicalName: 'canvasapp', canvasAppTypeLabel: Number(data.canvasapptype) === 4 ? 'Code App' : 'Canvas App' }) }],
    60: [{ path: `systemforms(${id})?$select=name,objecttypecode,type`, map: namedRowMap('name') }],
    61: [{ path: `webresourceset(${id})?$select=name,displayname`, map: namedRowMap('displayname', 'name') }],
    62: [{ path: `sitemaps(${id})?$select=sitemapname`, map: namedRowMap('sitemapname') }],
    91: [{ path: `pluginassemblies(${id})?$select=name`, map: namedRowMap('name') }],
    92: [{ path: `sdkmessageprocessingsteps(${id})?$select=name`, map: namedRowMap('name') }],
    380: [{ path: `environmentvariabledefinitions(${id})?$select=schemaname,displayname`, map: namedRowMap('displayname', 'schemaname') }],
    381: [{ path: `environmentvariablevalues(${id})?$select=schemaname,value,_environmentvariabledefinitionid_value`, map: namedRowMap('schemaname', 'value') }],
  }[componentType] || [
    { path: `entities?$filter=objecttypecode eq ${componentType}`, map: (data) => entityBackedComponentMap(data, id, componentType) },
  ];
}

async function entityBackedComponentMap(data, id, componentType = 0) {
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
  const entityLogicalName = row.logicalname || row.name || row.entitysetname || '';
  const collection = row.collectionname || row.entitysetname || row.entitysetnameplural || '';
  if (!collection) {
    return {
      typeLabel,
      displayName: typeLabel,
      logicalName: entityLogicalName,
    };
  }

  try {
    const component = await getEntityBackedComponentRow(collection, id, entityLogicalName);
    return {
      typeLabel,
      displayName: pickEntityBackedDisplayName(component, entityLogicalName, typeLabel) || typeLabel,
      logicalName: entityLogicalName,
      recordLogicalName: pickLogicalName(component),
    };
  } catch {
    return {
      typeLabel,
      displayName: typeLabel,
      logicalName: entityLogicalName,
    };
  }
}

async function getEntityBackedComponentRow(collection, id, logicalName) {
  if (logicalName === 'bot') {
    return dvGet(`${collection}(${id})?$select=botid,name,schemaname`);
  }
  if (logicalName === 'botcomponent') {
    return dvGet(`${collection}(${id})?$select=botcomponentid,name,schemaname,componenttype,category`);
  }
  return dvGet(`${collection}(${id})`);
}

function pickEntityBackedDisplayName(row, logicalName, typeLabel) {
  if (logicalName === 'bot' || logicalName === 'botcomponent') {
    return pickBotDisplayName(row, typeLabel);
  }
  return pickDisplayName(row);
}

function pickBotDisplayName(row, typeLabel = '') {
  const primaryName = String(row?.name || '').trim();
  if (primaryName && !isGenericBotDisplayName(primaryName, typeLabel)) {
    return primaryName;
  }

  const schemaName = String(row?.schemaname || '').trim();
  if (schemaName && !isGenericBotDisplayName(schemaName, typeLabel)) {
    return schemaName;
  }

  return primaryName || schemaName || '';
}

function isGenericBotDisplayName(value, typeLabel = '') {
  const text = String(value || '').trim().toLowerCase();
  const label = String(typeLabel || '').trim().toLowerCase();
  return !text ||
    text === label ||
    text === 'chatbot' ||
    text === 'copilot' ||
    text === 'bot' ||
    text === 'chatbot subcomponent' ||
    text === 'copilot component' ||
    text === 'botcomponent';
}

function pickDisplayName(row) {
  const keys = [
    'connectionreferencedisplayname',
    'displayname',
    'name',
    'schemaname',
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

function mapRoleComponent(role) {
  return {
    displayName: role?.name || role?.roleid || '',
    logicalName: 'role',
    recordLogicalName: role?.roleid || '',
  };
}

function pickLogicalName(row) {
  const keys = [
    'connectionreferencelogicalname',
    'logicalname',
    'uniquename',
    'schemaname',
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

function isManageableComponent(componentType, logicalName) {
  if (MANAGEABLE_COMPONENT_TYPES.has(Number(componentType))) {
    return true;
  }
  return MANAGEABLE_LOGICAL_NAMES.has(String(logicalName || '').toLowerCase());
}

async function getComponentManagementDetails(componentType, objectId) {
  const resolved = await resolveComponentRecord(componentType, objectId);
  const logicalName = resolved.logicalName;
  if (!isManageableComponent(componentType, logicalName)) {
    return {
      kind: 'unsupported',
      objectId,
      componentType,
      displayName: resolved.displayName || objectId,
      typeLabel: resolved.typeLabel || SOLUTION_COMPONENT_TYPES[componentType] || `Type ${componentType}`,
      message: 'This component type does not expose a supported management action in PDAC yet.',
    };
  }

  if (logicalName === 'environmentvariabledefinition' || componentType === 380) {
    return getEnvironmentVariableDetails(objectId);
  }

  if (logicalName === 'environmentvariablevalue' || componentType === 381) {
    const value = await dvGet(`environmentvariablevalues(${objectId})?$select=environmentvariablevalueid,value,_environmentvariabledefinitionid_value`);
    const definitionId = normalizeGuid(value._environmentvariabledefinitionid_value);
    return getEnvironmentVariableDetails(definitionId || objectId);
  }

  if (logicalName === 'connectionreference') {
    return getConnectionReferenceDetails(objectId);
  }

  if (logicalName === 'workflow' || componentType === 29) {
    return getWorkflowDetails(objectId);
  }

  if (logicalName === 'canvasapp' || componentType === 300) {
    return getCanvasAppDetails(objectId);
  }

  if (logicalName === 'bot' || logicalName === 'botcomponent') {
    return getBotDetails(objectId, logicalName, resolved);
  }

  return {
    kind: 'unsupported',
    objectId,
    componentType,
    displayName: resolved.displayName || objectId,
    typeLabel: resolved.typeLabel || `Type ${componentType}`,
    message: 'This component was recognized, but PDAC does not have a supported action for it yet.',
  };
}

async function resolveComponentRecord(componentType, objectId) {
  const known = {
    29: { collection: 'workflows', logicalName: 'workflow', select: 'name,uniquename' },
    300: { collection: 'canvasapps', logicalName: 'canvasapp', select: 'name,displayname,canvasapptype' },
    380: { collection: 'environmentvariabledefinitions', logicalName: 'environmentvariabledefinition', select: 'schemaname,displayname' },
    381: { collection: 'environmentvariablevalues', logicalName: 'environmentvariablevalue', select: 'schemaname,value' },
  }[Number(componentType)];
  if (known) {
    const row = await dvGet(`${known.collection}(${objectId})?$select=${known.select}`);
    return {
      collection: known.collection,
      logicalName: known.logicalName,
      displayName: pickDisplayName(row) || pickLogicalName(row),
      typeLabel: Number(componentType) === 300 && Number(row.canvasapptype) === 4 ? 'Code App' : SOLUTION_COMPONENT_TYPES[componentType],
      row,
    };
  }

  const entity = await resolveEntityForComponentType(componentType);
  if (!entity.collection || !entity.logicalName) {
    return { logicalName: '', displayName: '', typeLabel: SOLUTION_COMPONENT_TYPES[componentType] || `Type ${componentType}` };
  }

  const row = await dvGet(`${entity.collection}(${objectId})`);
  return {
    ...entity,
    displayName: pickDisplayName(row) || entity.typeLabel,
    row,
  };
}

async function resolveEntityForComponentType(componentType) {
  const data = await dvGet(`entities?$filter=objecttypecode eq ${Number(componentType)}`);
  const row = Array.isArray(data?.value) ? data.value[0] : data;
  if (!row) {
    return {};
  }
  return {
    logicalName: row.logicalname || row.name || row.entitysetname || '',
    collection: row.collectionname || row.entitysetname || row.entitysetnameplural || '',
    typeLabel: row.originallocalizedname || row.localizedname || row.displayname || row.name || row.logicalname || '',
  };
}

async function getEnvironmentVariableDetails(definitionId) {
  const data = await dvGet(`environmentvariabledefinitions(${definitionId})?$select=environmentvariabledefinitionid,schemaname,displayname,type,defaultvalue&$expand=environmentvariabledefinition_environmentvariablevalue($select=environmentvariablevalueid,value,schemaname,modifiedon)`);
  const values = data.environmentvariabledefinition_environmentvariablevalue || [];
  const current = values[0] || null;
  return {
    kind: 'environmentVariable',
    objectId: data.environmentvariabledefinitionid,
    displayName: data.displayname || data.schemaname,
    schemaName: data.schemaname || '',
    type: normalizeEnvironmentVariableType(data.type),
    defaultValue: data.defaultvalue || '',
    valueId: current?.environmentvariablevalueid || '',
    value: current?.value || '',
    source: current ? 'Current environment value' : 'Default value',
    effectiveValue: current?.value || data.defaultvalue || '',
    notes: ['Environment variable values are stored in Dataverse and can be read and updated with the Environment Variable Value table.'],
  };
}

async function saveEnvironmentVariableValue(definitionId, value) {
  const details = await getEnvironmentVariableDetails(definitionId);
  if (details.valueId) {
    await dvPatch(`environmentvariablevalues(${details.valueId})`, { value });
  } else {
    await dvPost('environmentvariablevalues', {
      value,
      schemaname: details.schemaName,
      'EnvironmentVariableDefinitionId@odata.bind': `/environmentvariabledefinitions(${definitionId})`,
    });
  }
  return getEnvironmentVariableDetails(definitionId);
}

async function getConnectionReferenceDetails(connectionReferenceId) {
  const reference = await dvGet(`connectionreferences(${connectionReferenceId})?$select=connectionreferenceid,connectionreferencedisplayname,connectionreferencelogicalname,connectorid,connectionid`);
  const allConnections = await listTargetConnections(selected.environmentName);
  const connectorKeys = connectorMatchKeys(reference.connectorid);
  const currentConnection = findConnectionById(allConnections, reference.connectionid);
  const effectiveConnectorKeys = currentConnection
    ? new Set([...connectorKeys, ...(currentConnection.connectorKeys || [])])
    : connectorKeys;
  const connections = allConnections.filter((connection) =>
    hasConnectorMatch(effectiveConnectorKeys, connection.connectorKeys) ||
    connectionLooksLikeConnector(connection, effectiveConnectorKeys) ||
    connectionMatchesId(connection, reference.connectionid)
  );
  return {
    kind: 'connectionReference',
    objectId: reference.connectionreferenceid,
    displayName: reference.connectionreferencedisplayname || reference.connectionreferencelogicalname || connectionReferenceId,
    logicalName: reference.connectionreferencelogicalname || '',
    connectorId: reference.connectorid || '',
    connectorKeys: [...effectiveConnectorKeys],
    connectionId: reference.connectionid || '',
    connections,
    totalConnectionCount: allConnections.length,
    matchingConnectionCount: connections.length,
    currentConnectionFound: Boolean(currentConnection),
    createUrl: makeConnectionCreateUrl(selected.environmentName, reference.connectorid),
    notes: ['PDAC only lists existing connections whose connector matches this connection reference. Create connection starts the Microsoft Power Apps connection flow, then refreshes this panel.'],
  };
}

async function saveConnectionReferenceConnection(connectionReferenceId, connectionId) {
  await dvPatch(`connectionreferences(${connectionReferenceId})`, { connectionid: connectionId });
  return getConnectionReferenceDetails(connectionReferenceId);
}

async function createConnectionForReference(connectionReferenceId, displayName) {
  const reference = await dvGet(`connectionreferences(${connectionReferenceId})?$select=connectionreferenceid,connectionreferencedisplayname,connectorid`);
  const requestedDisplayName = String(displayName || reference.connectionreferencedisplayname || '').trim();
  const connection = await createPowerPlatformConnection(
    reference.connectorid,
    requestedDisplayName,
  );
  return {
    connection,
    requestedDisplayName,
    details: await getConnectionReferenceDetails(connectionReferenceId),
  };
}

async function createPowerPlatformConnection(connectorIdRaw, displayName) {
  const connectorId = normalizeActionConnectorId(requireString(connectorIdRaw, 'connectorId'));
  const connector = await getConnectorAsync(connectorId, logger);
  if (!connector) {
    throw new HttpError(404, `Connector '${connectorId}' was not found.`);
  }

  if (isSsoOnlyConnector(connector)) {
    try {
      return await createConnectionAsync(actionContext({ connectorId, displayName }));
    } catch (error) {
      if (!isBrowserConnectionEnabled()) {
        throw error;
      }
      console.warn(`Silent connection creation failed; falling back to browser flow: ${String(error)}`);
    }
  } else if (!isBrowserConnectionEnabled()) {
    throw new HttpError(
      400,
      `Connector '${connectorId}' needs an interactive browser flow. Restart with POWERAPPS_CLI_ENABLE_BROWSER_CONNECTION=true or create it in make.powerapps.com.`,
    );
  }

  return startConnectionServer({
    connectorName: connectorId,
    environmentId: environmentUrlName(selected.environmentName),
    region: REGION,
  });
}

function startConnectionServer(config) {
  const nonce = randomUUID();
  return new Promise((resolve, reject) => {
    const callbackServer = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      if (url.searchParams.get('nonce') !== nonce) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h2>Connection request verification failed. Please try again.</h2>');
        cleanup();
        resolve({ status: 'cancelled' });
        return;
      }

      const status = url.searchParams.get('status');
      const message = url.searchParams.get('message') || undefined;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(status === 'created'
        ? '<h2>Connection created. You can close this tab.</h2>'
        : `<h2>Connection creation ${escapeHtml(status || 'cancelled')}.</h2><p>${escapeHtml(message || '')}</p>`);
      cleanup();

      if (status === 'created') {
        resolve({
          status: 'created',
          name: url.searchParams.get('connectionName') || url.searchParams.get('connectionId'),
          id: url.searchParams.get('connectionId'),
          displayName: url.searchParams.get('displayName'),
        });
      } else if (status === 'error') {
        reject(new HttpError(400, message || 'Connection creation failed in the browser.'));
      } else {
        reject(new HttpError(400, 'Connection creation was cancelled.'));
      }
    });

    callbackServer.listen(0, 'localhost', async () => {
      const address = callbackServer.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const callbackUrl = `http://localhost:${port}/callback`;
      const playerUrl = createMaafConnectionUrl(config.region, config.environmentId, {
        connector: config.connectorName,
        callbackUrl,
        nonce,
        protocolVersion: CONNECTION_CALLBACK_PROTOCOL_VERSION,
      });

      try {
        await open(playerUrl, { wait: false });
      } catch {
        console.log(`Open this URL to create the connection:\n${playerUrl}`);
      }
    });

    callbackServer.on('error', (error) => {
      cleanup();
      reject(error);
    });

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new HttpError(408, 'Connection creation timed out after 10 minutes.'));
    }, CONNECTION_CREATION_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeoutId);
      callbackServer.close();
    }
  });
}

async function getWorkflowDetails(workflowId) {
  const workflow = await dvGet(`workflows(${workflowId})?$select=workflowid,name,uniquename,category,type,statecode,statuscode,clientdata`);
  const clientData = parsePossiblyJson(workflow.clientdata);
  const triggerEntries = Object.entries(clientData?.definition?.triggers || {});
  const connectionReferences = Object.entries(clientData?.connectionReferences || {}).map(([key, value]) => ({
    key,
    logicalName: value?.connectionReferenceLogicalName || value?.connectionName || key,
    displayName: value?.displayName || value?.api?.name || key,
    connectorId: value?.api?.id || value?.apiId || '',
    source: value?.source || value?.connectionSource || '',
  }));
  const isManual = triggerEntries.some(([, trigger]) => isManualFlowTrigger(trigger));
  return {
    kind: 'workflow',
    objectId: workflow.workflowid,
    displayName: workflow.name || workflow.uniquename || workflowId,
    uniqueName: workflow.uniquename || '',
    stateCode: Number(workflow.statecode),
    stateLabel: Number(workflow.statecode) === 1 ? 'On' : Number(workflow.statecode) === 0 ? 'Off' : 'Suspended',
    isCloudFlow: Number(workflow.category) === 5,
    isManual,
    triggers: triggerEntries.map(([name, trigger]) => ({
      name,
      type: trigger?.type || '',
      kind: trigger?.kind || '',
    })),
    connectionReferences,
    share: shareCapability('workflow'),
    unsupported: [
      'Run-only users and the manual-trigger connection mode are supported by the Power Automate Management connector. PDAC does not call the unsupported api.flow.microsoft.com endpoints, so those settings are shown here as read-only.',
    ],
    notes: ['Solution-aware cloud flows are stored as Dataverse workflow rows. Turning a flow on or off is done by updating workflow.statecode.'],
  };
}

async function saveWorkflowState(workflowId, state) {
  const workflowState = normalizeWorkflowState(state);
  await dvPatch(`workflows(${workflowId})`, workflowState);
  return getWorkflowDetails(workflowId);
}

function normalizeWorkflowState(state) {
  const text = String(state ?? '').toLowerCase();
  if (text === 'on' || text === '1' || text === 'true') {
    return {
      statecode: 1,
      statuscode: 2,
    };
  }
  if (text === 'off' || text === '0' || text === 'false') {
    return {
      statecode: 0,
      statuscode: 1,
    };
  }
  throw new HttpError(400, 'Flow state must be "on" or "off".');
}

function isManualFlowTrigger(trigger) {
  const text = JSON.stringify(trigger || {}).toLowerCase();
  return text.includes('"kind":"button"') ||
    text.includes('"type":"request"') ||
    text.includes('manual') ||
    text.includes('powerapp');
}

async function getCanvasAppDetails(canvasAppId) {
  const app = await dvGet(`canvasapps(${canvasAppId})?$select=canvasappid,name,displayname,canvasapptype,status`);
  const isCodeApp = Number(app.canvasapptype) === 4;
  return {
    kind: isCodeApp ? 'codeApp' : 'canvasApp',
    objectId: app.canvasappid,
    displayName: app.displayname || app.name || canvasAppId,
    name: app.name || '',
    canvasAppType: Number(app.canvasapptype),
    share: shareCapability('canvasapp'),
    notes: [`${isCodeApp ? 'Code apps' : 'Canvas apps'} are stored in the Dataverse Canvas App table. PDAC uses supported Dataverse sharing actions for users and teams.`],
  };
}

async function getBotDetails(objectId, logicalName, resolved) {
  const config = SHAREABLE_COMPONENTS[logicalName];
  const row = resolved.row || await dvGet(`${config.collection}(${objectId})`);
  const isBot = logicalName === 'bot';
  return {
    kind: isBot ? 'bot' : 'botComponent',
    objectId,
    displayName: pickDisplayName(row) || resolved.displayName || objectId,
    logicalName,
    share: shareCapability(logicalName),
    notes: [
      isBot
        ? 'Copilot Studio agents are Dataverse user-owned records that support GrantAccess for users and teams.'
        : 'Copilot components are Dataverse user-owned records that support GrantAccess for users and teams.',
      ...(isBot ? ['Analytics viewer grants Dataverse read access to the bot row. Copilot Studio analytics may still require additional product permissions outside Dataverse record sharing.'] : []),
      'Channel-specific publishing and authentication settings may still be required in Copilot Studio.',
    ],
  };
}

function shareCapability(logicalName) {
  const normalized = String(logicalName || '').toLowerCase();
  const roles = [
    { value: 'user', label: 'User' },
    { value: 'coowner', label: 'Co-owner' },
  ];
  if (normalized === 'bot') {
    roles.push({ value: 'analyticsviewer', label: 'Analytics viewer' });
  }
  return {
    supported: Boolean(SHAREABLE_COMPONENTS[normalized]),
    roles,
  };
}

async function shareComponent(componentType, objectId, body) {
  const resolved = await resolveComponentRecord(componentType, objectId);
  const logicalName = String(resolved.logicalName || '').toLowerCase();
  const config = SHAREABLE_COMPONENTS[logicalName];
  if (!config) {
    throw new HttpError(400, 'This component does not support Dataverse record sharing from PDAC.');
  }

  const role = String(body.role || 'user').toLowerCase();
  const roleAllowed = shareCapability(logicalName).roles.some((item) => item.value === role);
  if (!roleAllowed) {
    throw new HttpError(400, `Share role '${role}' is not available for this component.`);
  }
  const accessMask = SHARE_ROLE_ACCESS[role];
  if (!accessMask) {
    throw new HttpError(400, 'Share role must be user, coowner, or analyticsviewer.');
  }

  const principals = Array.isArray(body.principals) ? body.principals : [];
  if (!principals.length) {
    throw new HttpError(400, 'Choose at least one user or team.');
  }

  let shared = 0;
  for (const principal of principals) {
    const principalType = String(principal.type || '').toLowerCase();
    const principalId = normalizeGuid(principal.id);
    if (!principalId || !['systemuser', 'team'].includes(principalType)) {
      continue;
    }
    await dvPost('GrantAccess', {
      Target: {
        [config.idName]: objectId,
        '@odata.type': config.odataType,
      },
      PrincipalAccess: {
        Principal: {
          [principalType === 'systemuser' ? 'systemuserid' : 'teamid']: principalId,
          '@odata.type': `Microsoft.Dynamics.CRM.${principalType}`,
        },
        AccessMask: accessMask,
      },
    });
    shared++;
  }

  return {
    shared,
    role,
    accessMask,
    displayName: resolved.displayName || objectId,
  };
}

async function listEnvironmentPrincipals(query) {
  const normalized = String(query || '').trim();
  const top = 25;
  const userFilter = normalized
    ? ` and (${principalContainsFilter(['fullname', 'internalemailaddress', 'domainname'], normalized)})`
    : '';
  const teamFilter = normalized ? `&$filter=${principalContainsFilter(['name'], normalized)}` : '';
  const [users, teams] = await Promise.all([
    dvGetAll(`systemusers?$select=systemuserid,fullname,internalemailaddress,domainname,azureactivedirectoryobjectid&$filter=isdisabled eq false${userFilter}&$orderby=fullname&$top=${top}`),
    dvGetAll(`teams?$select=teamid,name,teamtype,azureactivedirectoryobjectid${teamFilter}&$orderby=name&$top=${top}`),
  ]);

  return [
    ...users.slice(0, top).map((user) => ({
      id: user.systemuserid,
      type: 'systemuser',
      label: user.fullname || user.internalemailaddress || user.domainname || user.systemuserid,
      detail: user.internalemailaddress || user.domainname || '',
    })),
    ...teams.slice(0, top).map((team) => ({
      id: team.teamid,
      type: 'team',
      label: userSafeTeamName(team),
      detail: `Team${team.azureactivedirectoryobjectid ? ' | Entra group backed' : ''}`,
    })),
  ].sort((left, right) => left.label.localeCompare(right.label)).slice(0, 40);
}

async function listEnvironmentUsers(query = '') {
  const filter = userSearchFilter(query);
  const rows = await dvGetAll(`systemusers?$select=systemuserid,fullname,internalemailaddress,domainname,isdisabled,accessmode,azureactivedirectoryobjectid,_businessunitid_value&$expand=businessunitid($select=name)&$filter=${filter}&$orderby=fullname&$top=250`);
  return rows.map((user) => ({
    systemuserid: user.systemuserid,
    fullname: user.fullname || '',
    internalemailaddress: user.internalemailaddress || '',
    domainname: user.domainname || '',
    isdisabled: Boolean(user.isdisabled),
    accessmode: user.accessmode,
    azureactivedirectoryobjectid: user.azureactivedirectoryobjectid || '',
    businessUnitId: user._businessunitid_value || '',
    businessUnitName: user.businessunitid?.name || user['_businessunitid_value@OData.Community.Display.V1.FormattedValue'] || '',
  }));
}

async function listEnvironmentTeams(query = '') {
  const normalized = String(query || '').trim();
  const filter = normalized ? `&$filter=${principalContainsFilter(['name', 'emailaddress'], normalized)}` : '';
  const rows = await dvGetAll(`teams?$select=teamid,name,teamtype,emailaddress,description,azureactivedirectoryobjectid,_businessunitid_value&$expand=businessunitid($select=name)${filter}&$orderby=name&$top=250`);
  return rows.map((team) => ({
    teamid: team.teamid,
    name: team.name || '',
    teamtype: team.teamtype,
    teamTypeLabel: team['teamtype@OData.Community.Display.V1.FormattedValue'] || teamTypeLabel(team.teamtype),
    emailaddress: team.emailaddress || '',
    description: team.description || '',
    azureactivedirectoryobjectid: team.azureactivedirectoryobjectid || '',
    businessUnitId: team._businessunitid_value || '',
    businessUnitName: team.businessunitid?.name || team['_businessunitid_value@OData.Community.Display.V1.FormattedValue'] || '',
  }));
}

async function syncEnvironmentUser(principalObjectId) {
  const principalId = normalizeGuid(principalObjectId);
  if (!principalId) {
    throw new HttpError(400, 'Enter a valid Entra user object ID.');
  }

  const environmentName = environmentUrlName(selected.environmentName);
  const url = `https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments/${encodeURIComponent(environmentName)}/syncUser?api-version=2019-05-01`;
  const response = await apiHttpRequest('POST', url, {
    authResource: SERVICE_RESOURCE,
    body: { id: principalId },
  });
  return {
    principalObjectId: principalId,
    result: response.data,
    message: 'User sync requested. Refresh users after the Power Platform service finishes provisioning the SystemUser row.',
  };
}

async function createEnvironmentTeam(body) {
  const name = requireString(body.name, 'name');
  const teamType = normalizeTeamType(body.teamType);
  const businessUnitId = normalizeGuid(body.businessUnitId) || await getCurrentBusinessUnitId();
  const teamBody = {
    name,
    teamtype: teamType,
    'businessunitid@odata.bind': `/businessunits(${businessUnitId})`,
  };

  const aadObjectId = normalizeGuid(body.azureActiveDirectoryObjectId || body.azureactivedirectoryobjectid);
  if (aadObjectId) {
    teamBody.azureactivedirectoryobjectid = aadObjectId;
  }
  for (const [key, value] of [
    ['description', body.description],
    ['emailaddress', body.emailaddress],
  ]) {
    if (value !== undefined && String(value).trim()) {
      teamBody[key] = String(value).trim();
    }
  }

  return dvPost('teams', teamBody, { returnRepresentation: true });
}

async function addTeamMembers(teamId, userIds) {
  const ids = Array.isArray(userIds) ? userIds.map(normalizeGuid).filter(Boolean) : [];
  if (!ids.length) {
    throw new HttpError(400, 'Choose at least one user to add.');
  }
  await dvPost(`teams(${teamId})/Microsoft.Dynamics.CRM.AddMembersTeam`, {
    Members: ids,
  });
  return { added: ids.length };
}

async function assignSecurityRole(body) {
  const principalType = normalizePrincipalType(body.principalType || body.type);
  const principalId = normalizeGuid(body.principalId || body.id);
  const selectedRoleId = normalizeGuid(body.roleId);
  if (!principalId) {
    throw new HttpError(400, 'Choose a user or team.');
  }
  if (!selectedRoleId) {
    throw new HttpError(400, 'Choose a security role.');
  }

  const principal = await getRoleAssignmentPrincipal(principalType, principalId);
  const role = await resolveRoleForBusinessUnit(selectedRoleId, principal.businessUnitId);
  const association = principalType === 'systemuser' ? 'systemuserroles_association' : 'teamroles_association';
  try {
    await dvPost(`${principal.collection}(${principalId})/${association}/$ref`, {
      '@odata.id': `${selected.orgUrl}/api/data/v9.2/roles(${role.roleid})`,
    });
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      throw new HttpError(404, `Could not assign '${role.name || 'role'}' to ${principal.name}. Dataverse could not find the resolved role or principal association. Refresh users, teams, and roles, then try again.`);
    }
    throw error;
  }

  return {
    principalId,
    principalType,
    principalName: principal.name,
    roleid: role.roleid,
    roleName: role.name || '',
    assignedRoleBusinessUnitId: normalizeGuid(role._businessunitid_value),
  };
}

function normalizePrincipalType(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['user', 'systemuser', 'systemusers'].includes(text)) {
    return 'systemuser';
  }
  if (['team', 'teams'].includes(text)) {
    return 'team';
  }
  throw new HttpError(400, 'Principal type must be user or team.');
}

async function getRoleAssignmentPrincipal(type, id) {
  if (type === 'systemuser') {
    const user = await dvGet(`systemusers(${id})?$select=systemuserid,fullname,internalemailaddress,domainname,isdisabled,_businessunitid_value&$expand=businessunitid($select=name)`);
    if (user.isdisabled) {
      throw new HttpError(400, 'Disabled users cannot receive security roles.');
    }
    const businessUnitId = normalizeGuid(user._businessunitid_value);
    if (!businessUnitId) {
      throw new HttpError(400, `User '${user.fullname || user.internalemailaddress || id}' does not have a business unit in Dataverse.`);
    }
    return {
      collection: 'systemusers',
      businessUnitId,
      name: user.fullname || user.internalemailaddress || user.domainname || user.systemuserid || id,
    };
  }

  const team = await dvGet(`teams(${id})?$select=teamid,name,teamtype,_businessunitid_value&$expand=businessunitid($select=name)`);
  if (Number(team.teamtype) === 1) {
    throw new HttpError(400, 'Access teams cannot receive security roles. Choose an owner team or group-backed team.');
  }
  const businessUnitId = normalizeGuid(team._businessunitid_value);
  if (!businessUnitId) {
    throw new HttpError(400, `Team '${team.name || id}' does not have a business unit in Dataverse.`);
  }
  return {
    collection: 'teams',
    businessUnitId,
    name: team.name || team.teamid || id,
  };
}

function userSearchFilter(query) {
  const base = 'systemuserid ne null';
  const normalized = String(query || '').trim();
  if (!normalized) {
    return base;
  }
  return `${base} and (${principalContainsFilter(['fullname', 'internalemailaddress', 'domainname'], normalized)})`;
}

function normalizeTeamType(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'access' || text === '1') {
    return 1;
  }
  if (text === 'security' || text === 'securitygroup' || text === 'security group' || text === '2') {
    return 2;
  }
  if (text === 'office' || text === 'officegroup' || text === 'office group' || text === '3') {
    return 3;
  }
  return 0;
}

function teamTypeLabel(value) {
  return {
    0: 'Owner',
    1: 'Access',
    2: 'Security Group',
    3: 'Office Group',
  }[Number(value)] || `Type ${value}`;
}

function principalContainsFilter(columns, query) {
  const value = odataString(query);
  return columns.map((column) => `contains(${column},'${value}')`).join(' or ');
}

function userSafeTeamName(team) {
  return team.name || team.teamid;
}

function parsePossiblyJson(value) {
  if (!value || typeof value !== 'string') {
    return {};
  }
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
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
  const connectionReferences = await Promise.all(item.analysis.connectionReferences.map(async (reference) => {
    const connectorKeys = connectorMatchKeys(reference.connectorId);
    const matches = connections.filter((connection) => hasConnectorMatch(connectorKeys, connection.connectorKeys));
    return {
      ...reference,
      matches,
      selectedConnectionId: matches[0]?.connectionId || '',
      createUrl: makeConnectionCreateUrl(target.environmentName, reference.connectorId),
    };
  }));
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
  const sources = [];

  try {
    sources.push(...await listAdminConnections(environmentName));
  } catch (error) {
    console.warn(`Power Apps admin connection list failed: ${errorMessage(error)}`);
  }

  const url = `https://api.powerplatform.com/connectivity/environments/${encodeURIComponent(environmentName)}/connections?api-version=2024-10-01`;
  try {
    const rows = await powerPlatformGetAll(url);
    sources.push(...rows.map(normalizeConnectivityConnection));
  } catch (error) {
    console.warn(`Connectivity connection list failed: ${errorMessage(error)}`);
  }

  try {
    sources.push(...await listUserConnections());
  } catch (error) {
    console.warn(`Power Apps action connection list failed: ${errorMessage(error)}`);
  }

  return uniqueConnections(sources).filter((connection) => connection.connectionId);
}

async function listAdminConnections(environmentName) {
  const url = `https://api.powerapps.com/providers/Microsoft.PowerApps/scopes/admin/environments/${encodeURIComponent(environmentName)}/connections?api-version=2016-11-01&$top=250`;
  const rows = await powerAppsGetAll(url);
  return rows.map(normalizeAdminConnection);
}

async function listUserConnections() {
  const actionConnections = await listConnectionsAsync(actionContext({}));
  const values = Array.isArray(actionConnections) ? actionConnections : actionConnections?.value || [];
  return values.map(normalizeActionConnection);
}

async function listEnvironmentConnections() {
  if (!selected.environmentName) {
    throw new HttpError(400, 'Selected environment has no environment ID. Choose it from the loaded environment list, then try again.');
  }
  const currentUser = await getCurrentConnectionUser();
  const sources = [];
  const warnings = [];

  try {
    sources.push(...await listAdminConnections(selected.environmentName));
  } catch (error) {
    const message = `Power Apps admin connection list failed: ${errorMessage(error)}`;
    console.warn(message);
    warnings.push(message);
  }

  try {
    const url = `https://api.powerplatform.com/connectivity/environments/${encodeURIComponent(selected.environmentName)}/connections?api-version=2024-10-01`;
    const rows = await powerPlatformGetAll(url);
    sources.push(...rows.map(normalizeConnectivityConnection));
  } catch (error) {
    const message = `Connectivity connection list failed: ${errorMessage(error)}`;
    console.warn(message);
    warnings.push(message);
  }

  try {
    const actionConnections = await listUserConnections();
    sources.push(...actionConnections);
  } catch (error) {
    const message = `Power Apps action connection list failed: ${errorMessage(error)}`;
    console.warn(message);
    warnings.push(message);
  }

  if (!sources.length && warnings.length) {
    throw new HttpError(502, `Could not list connections. ${warnings.join(' | ')}`);
  }

  const connections = uniqueConnections(sources)
    .map((connection) => enrichConnectionForAdmin(connection, currentUser))
    .sort((a, b) =>
      String(a.displayName || a.connectionId).localeCompare(String(b.displayName || b.connectionId), undefined, { sensitivity: 'base' })
    );

  return {
    environmentName: selected.environmentName,
    orgUrl: selected.orgUrl,
    currentUser,
    source: warnings.length ? 'partial' : 'all',
    warnings,
    connections,
  };
}

async function deleteEnvironmentConnection(connectionId) {
  if (!selected.environmentName) {
    throw new HttpError(400, 'Selected environment has no environment ID. Choose it from the loaded environment list, then try again.');
  }
  const id = requireString(connectionId, 'connectionId');
  const connection = findConnectionById(await listTargetConnections(selected.environmentName), id);
  if (!connection) {
    throw new HttpError(404, 'Connection was not found in the selected environment. Refresh connections and try again.');
  }

  const connectorId = normalizeActionConnectorId(connection.connectorId || connectorIdFromConnection(connection));
  if (!connectorName(connectorId)) {
    throw new HttpError(400, 'Connection connector could not be determined. Refresh connections and try again.');
  }
  try {
    await deleteAdminConnection(selected.environmentName, connectorId, connection.connectionId);
  } catch (error) {
    console.warn(`Power Apps admin connection delete failed: ${errorMessage(error)}`);
    await deleteConnectionAsync(connectorId, connection.connectionId, logger);
  }
  return {
    deleted: true,
    connectionId: connection.connectionId,
    connectorId,
  };
}

async function deleteAdminConnection(environmentName, connectorId, connectionId) {
  const url = `https://api.powerapps.com/providers/Microsoft.PowerApps/scopes/admin/environments/${encodeURIComponent(environmentName)}/apis/${encodeURIComponent(connectorName(connectorId))}/connections/${encodeURIComponent(connectionId)}?api-version=2016-11-01`;
  await apiHttpRequest('DELETE', url, { authResource: SERVICE_RESOURCE });
}

async function getCurrentConnectionUser() {
  const account = (await listAccounts()).find((item) => item.homeAccountId === selected.accountHomeId) || {};
  const current = {
    accountHomeId: selected.accountHomeId || '',
    displayName: account.name || account.username || '',
    email: account.username || '',
    systemUserId: '',
    azureActiveDirectoryObjectId: '',
    domainName: '',
  };

  try {
    const who = await dvGet('WhoAmI()');
    const systemUserId = normalizeGuid(who.UserId);
    if (systemUserId) {
      const user = await dvGet(`systemusers(${systemUserId})?$select=systemuserid,fullname,internalemailaddress,domainname,azureactivedirectoryobjectid`);
      current.systemUserId = user.systemuserid || systemUserId;
      current.azureActiveDirectoryObjectId = user.azureactivedirectoryobjectid || '';
      current.displayName = current.displayName || user.fullname || '';
      current.email = current.email || user.internalemailaddress || user.domainname || '';
      current.domainName = user.domainname || '';
    }
  } catch (error) {
    console.warn(`Current Dataverse user lookup failed: ${errorMessage(error)}`);
  }

  return current;
}

function enrichConnectionForAdmin(connection, currentUser) {
  const isActionOwned = String(connection.source || '').split(',').map((item) => item.trim()).includes('actions');
  const inferredOwner = hasOwnerDetails(connection.owner)
    ? connection.owner
    : isActionOwned
      ? {
          id: currentUser.systemUserId || currentUser.azureActiveDirectoryObjectId || '',
          displayName: currentUser.displayName || currentUser.email || '',
          email: currentUser.email || currentUser.domainName || '',
        }
      : connection.owner;
  const isCurrentUserConnection = ownerMatchesCurrentUser(inferredOwner, currentUser) || isActionOwned;
  const health = connection.health || 'unknown';

  return {
    ...connection,
    owner: inferredOwner,
    connectorName: connectorName(connection.connectorId),
    health,
    healthLabel: {
      valid: 'Valid',
      broken: 'Broken',
      unknown: 'Unknown',
    }[health] || 'Unknown',
    isCurrentUserConnection,
    fixUrl: health === 'broken' && isCurrentUserConnection
      ? makeConnectionManageUrl(selected.environmentName, connection.connectionId)
      : '',
  };
}

async function powerPlatformGetAll(initialUrl) {
  const rows = [];
  let next = initialUrl;
  while (next) {
    const response = await apiHttpRequest('GET', next, { authResource: POWER_PLATFORM_RESOURCE });
    rows.push(...(response.data.value || []));
    next = response.data['@odata.nextLink'] || response.data.nextLink || '';
  }
  return rows;
}

async function powerAppsGetAll(initialUrl) {
  const rows = [];
  let next = initialUrl;
  while (next) {
    const response = await apiHttpRequest('GET', next, { authResource: SERVICE_RESOURCE });
    rows.push(...(response.data.value || []));
    next = response.data.nextLink || response.data['@odata.nextLink'] || '';
  }
  return rows;
}

function normalizeAdminConnection(connection) {
  const connectorId = connection.properties?.apiId ||
    connection.properties?.apiid ||
    connection.properties?.api?.id ||
    connection.properties?.api?.name ||
    connection.api?.id ||
    connection.api?.name ||
    connectorIdFromConnection(connection);
  return normalizeConnectionPayload(connection, connectorId, 'admin');
}

function normalizeConnectivityConnection(connection) {
  const connectorId = connection.properties?.apiId ||
    connection.properties?.apiid ||
    connection.properties?.api?.id ||
    connection.properties?.api?.name ||
    connection.api?.id ||
    connection.api?.name ||
    connection.properties?.connectorId ||
    connectorIdFromConnection(connection);
  return normalizeConnectionPayload(connection, connectorId, 'connectivity');
}

function normalizeActionConnection(connection) {
  const connectorId = connection.properties?.apiId ||
    connection.properties?.apiid ||
    connection.properties?.api?.id ||
    connection.properties?.api?.name ||
    connection.api?.id ||
    connection.api?.name ||
    connection.properties?.connectorId ||
    connection.apiId ||
    connection.apiName ||
    connection.connectorId ||
    connection.connectorName ||
    connectorIdFromConnection(connection);
  return normalizeConnectionPayload(connection, connectorId, 'actions');
}

function normalizeConnectionPayload(connection, connectorId, source) {
  const pathConnectionId = String(connection.id || '').match(/\/connections\/([^/?#]+)/i)?.[1] || '';
  const connectionId = connection.connectionId || pathConnectionId || connection.name || connection.connectionName || lastPathPart(connection.id);
  const statusDetail = connectionStatusDetail(connection);
  const health = connectionHealth(connection, statusDetail);
  return {
    id: connection.id || '',
    name: connection.name || connection.connectionName || '',
    displayName: connection.properties?.displayName || connection.displayName || connection.name || connectionId || '',
    connectorDisplayName: connection.properties?.api?.displayName || connection.properties?.apiDisplayName || connection.api?.displayName || connection.connectorDisplayName || '',
    connectorId,
    connectorKeys: [...connectorMatchKeys([
      connectorId,
      connection.properties?.apiId,
      connection.properties?.apiid,
      connection.properties?.api?.id,
      connection.properties?.api?.name,
      connection.api?.id,
      connection.api?.name,
      connection.properties?.connectorId,
      connection.apiId,
      connection.apiName,
      connection.connectorId,
      connection.connectorName,
      connection.id,
      connection.name,
      connection.connectionName,
      connection.connectionId,
      connectorIdFromConnection(connection),
    ])],
    connectionId,
    owner: normalizeConnectionOwner(connection),
    isAuthenticated: typeof connection.isAuthenticated === 'boolean'
      ? connection.isAuthenticated
      : typeof connection.properties?.isAuthenticated === 'boolean'
        ? connection.properties.isAuthenticated
        : undefined,
    status: connection.properties?.statuses?.[0]?.status || connection.properties?.connectionRuntimeUrl || connection.status || '',
    statusDetail,
    health,
    source,
  };
}

function uniqueConnections(connections) {
  const byId = new Map();
  for (const connection of connections) {
    const key = connection.connectionId || connection.id || connection.name;
    if (!key) {
      continue;
    }
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, connection);
      continue;
    }
    const source = [...new Set(String(`${existing.source || ''},${connection.source || ''}`).split(',').map((item) => item.trim()).filter(Boolean))].join(',');
    const health = mergeConnectionHealth(existing.health, connection.health);
    byId.set(key, {
      ...existing,
      ...connection,
      owner: hasOwnerDetails(connection.owner) ? connection.owner : existing.owner,
      connectorDisplayName: connection.connectorDisplayName || existing.connectorDisplayName || '',
      statusDetail: connection.statusDetail || existing.statusDetail || '',
      isAuthenticated: connection.isAuthenticated ?? existing.isAuthenticated,
      health,
      connectorKeys: [...new Set([...(existing.connectorKeys || []), ...(connection.connectorKeys || [])])],
      source,
    });
  }
  return [...byId.values()];
}

function mergeConnectionHealth(left, right) {
  if (left === 'broken' || right === 'broken') {
    return 'broken';
  }
  if (left === 'valid' || right === 'valid') {
    return 'valid';
  }
  return 'unknown';
}

function normalizeConnectionOwner(connection) {
  const properties = connection.properties || {};
  const candidates = [
    properties.owner,
    properties.createdBy,
    properties.createdby,
    properties.createdByUser,
    properties.createdByUserDetails,
    properties.creator,
    properties.user,
    connection.owner,
    connection.createdBy,
    connection.createdby,
    connection.user,
  ];

  for (const candidate of candidates) {
    const owner = ownerFromValue(candidate);
    if (hasOwnerDetails(owner)) {
      return owner;
    }
  }

  const owner = {
    id: properties.ownerId || properties.createdById || properties.createdByObjectId || connection.ownerId || '',
    displayName: properties.ownerDisplayName || properties.createdByDisplayName || connection.ownerDisplayName || '',
    email: properties.ownerEmail || properties.createdByEmail || properties.createdByUserPrincipalName || connection.ownerEmail || '',
  };
  return hasOwnerDetails(owner) ? owner : {};
}

function ownerFromValue(value) {
  if (!value) {
    return {};
  }
  if (typeof value === 'string') {
    return value.includes('@')
      ? { email: value, displayName: value }
      : { id: value, displayName: value };
  }
  if (typeof value !== 'object') {
    return {};
  }

  return {
    id: value.id || value.objectId || value.userId || value.principalId || value.aadObjectId || value.azureActiveDirectoryObjectId || '',
    displayName: value.displayName || value.name || value.fullName || value.fullname || value.userName || value.username || '',
    email: value.email || value.mail || value.userPrincipalName || value.upn || value.internalemailaddress || value.domainname || '',
  };
}

function hasOwnerDetails(owner) {
  return Boolean(owner && (owner.id || owner.displayName || owner.email));
}

function ownerMatchesCurrentUser(owner, currentUser) {
  if (!hasOwnerDetails(owner) || !currentUser) {
    return false;
  }

  const ownerIds = [
    owner.id,
    owner.azureActiveDirectoryObjectId,
  ].map(normalizeGuid).filter(Boolean);
  const currentIds = [
    currentUser.systemUserId,
    currentUser.azureActiveDirectoryObjectId,
  ].map(normalizeGuid).filter(Boolean);
  if (ownerIds.some((id) => currentIds.includes(id))) {
    return true;
  }

  const ownerEmails = [owner.email, owner.displayName].map(normalizeEmailLike).filter(Boolean);
  const currentEmails = [currentUser.email, currentUser.domainName, currentUser.displayName].map(normalizeEmailLike).filter(Boolean);
  return ownerEmails.some((email) => currentEmails.includes(email));
}

function normalizeEmailLike(value) {
  const text = String(value || '').trim().toLowerCase();
  return text.includes('@') ? text : '';
}

function connectionStatusDetail(connection) {
  const statuses = [
    ...toArray(connection.properties?.statuses),
    ...toArray(connection.statuses),
  ];
  const statusTexts = statuses
    .map((status) => [
      status.status,
      status.state,
      status.code,
      status.error?.message,
      status.error?.code,
      status.message,
      status.target,
    ].filter(Boolean).join(' '))
    .filter(Boolean);

  return [
    ...statusTexts,
    connection.properties?.status,
    connection.properties?.connectionState,
    connection.properties?.overallStatus,
    connection.status,
    connection.connectionStatus,
  ].filter(Boolean).join(' | ');
}

function connectionHealth(connection, statusDetail) {
  const isAuthenticated = typeof connection.isAuthenticated === 'boolean'
    ? connection.isAuthenticated
    : typeof connection.properties?.isAuthenticated === 'boolean'
      ? connection.properties.isAuthenticated
      : undefined;
  const text = String(statusDetail || '').toLowerCase();
  if (isAuthenticated === false || /\b(error|failed|failure|invalid|broken|unauthorized|forbidden|expired|disabled|disconnected|notauthenticated|not authenticated|needsattention|needs attention)\b/.test(text)) {
    return 'broken';
  }
  if (isAuthenticated === true || /\b(connected|ready|enabled|succeeded|success|valid|authenticated)\b/.test(text)) {
    return 'valid';
  }
  return 'unknown';
}

function toArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function findConnectionById(connections, connectionId) {
  return connections.find((connection) => connectionMatchesId(connection, connectionId)) || null;
}

function connectionMatchesId(connection, connectionId) {
  const needle = normalizeConnectionIdentifier(connectionId);
  if (!needle) {
    return false;
  }
  return [
    connection.connectionId,
    connection.id,
    connection.name,
  ].some((value) => normalizeConnectionIdentifier(value).includes(needle));
}

function normalizeConnectionIdentifier(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
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
  const source = [
    connection.id,
    connection.name,
    connection.connectionName,
    connection.connectionId,
    connection.properties?.connectionRuntimeUrl,
    connection.properties?.testLinks?.requestUri,
  ].filter(Boolean).join('/');
  const apiName = String(source || '').match(/\/(?:apis|connectors)\/([^/?#]+)/)?.[1] || '';
  return apiName ? `/providers/Microsoft.PowerApps/apis/${apiName}` : '';
}

function connectorName(connectorId) {
  return String(connectorId || '').split('/').filter(Boolean).pop() || '';
}

function normalizeActionConnectorId(connectorId) {
  const name = connectorName(connectorId);
  return name.startsWith('shared_') ? name : `shared_${name}`;
}

function normalizeConnectorId(connectorId) {
  const name = connectorName(connectorId);
  return name ? `/providers/microsoft.powerapps/apis/${name.toLowerCase()}` : '';
}

function connectorMatchKeys(values) {
  const inputs = Array.isArray(values) ? values : [values];
  const keys = new Set();
  for (const value of inputs) {
    const text = String(value || '').trim();
    if (!text) {
      continue;
    }
    const lower = text.toLowerCase();
    keys.add(lower);

    const apiMatch = lower.match(/\/apis\/([^/?#]+)/);
    const providerMatch = lower.match(/\/providers\/microsoft\.powerapps\/apis\/([^/?#]+)/);
    const rawName = decodeURIComponent((providerMatch?.[1] || apiMatch?.[1] || connectorName(lower) || '').trim());
    if (rawName) {
      keys.add(rawName);
      keys.add(rawName.replace(/^shared_/, ''));
      keys.add(rawName.startsWith('shared_') ? rawName : `shared_${rawName}`);
      keys.add(`/providers/microsoft.powerapps/apis/${rawName}`);
      keys.add(`/providers/microsoft.powerapps/apis/${rawName.startsWith('shared_') ? rawName : `shared_${rawName}`}`);
    }
  }
  return keys;
}

function hasConnectorMatch(referenceKeys, connectionKeys = []) {
  const keys = connectionKeys instanceof Set ? connectionKeys : new Set(connectionKeys);
  for (const key of referenceKeys) {
    if (keys.has(key)) {
      return true;
    }
  }
  return false;
}

function connectionLooksLikeConnector(connection, connectorKeys) {
  const haystack = [
    connection.connectionId,
    connection.id,
    connection.name,
    connection.displayName,
  ].map(normalizeConnectionIdentifier).join('|');
  if (!haystack) {
    return false;
  }
  for (const key of connectorKeys) {
    const normalized = normalizeConnectionIdentifier(key);
    if (normalized && normalized.length > 5 && haystack.includes(normalized)) {
      return true;
    }
  }
  return false;
}

function makeConnectionCreateUrl(environmentName, connectorId) {
  const environmentId = environmentUrlName(environmentName);
  const connector = connectorName(connectorId);
  if (!environmentId || !connector) {
    return '';
  }
  return `https://make.powerapps.com/environments/${encodeURIComponent(environmentId)}/connections/available/${encodeURIComponent(connector)}`;
}

function makeConnectionManageUrl(environmentName, connectionId) {
  const environmentId = environmentUrlName(environmentName);
  if (!environmentId) {
    return 'https://make.powerapps.com/connections';
  }
  if (!connectionId) {
    return `https://make.powerapps.com/environments/${encodeURIComponent(environmentId)}/connections`;
  }
  return `https://make.powerapps.com/environments/${encodeURIComponent(environmentId)}/connections/${encodeURIComponent(connectionId)}`;
}

function environmentUrlName(environmentName) {
  const value = String(environmentName || '').trim();
  if (!value) {
    return '';
  }
  return lastPathPart(value);
}

function isBrowserConnectionEnabled() {
  return String(process.env.POWERAPPS_CLI_ENABLE_BROWSER_CONNECTION || '').toLowerCase() === 'true';
}

function actionContext(actionsParams) {
  return {
    vfs: {},
    authProvider: actionAuthProvider,
    region: REGION,
    environmentName: environmentUrlName(selected.environmentName),
    actionsParams,
    localFilePaths: {
      powerConfigPath: 'power.config.json',
      schemaPath: '.power/schemas',
      codeGenPath: 'src/generated',
    },
    logger,
    httpClient,
  };
}

function lastPathPart(value) {
  return String(value || '').split('/').filter(Boolean).pop() || '';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
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

async function resolveRoleForBusinessUnit(roleId, businessUnitId) {
  const role = await getRole(roleId);
  if (!role) {
    throw new HttpError(404, 'Role not found.');
  }

  const normalizedBusinessUnitId = normalizeGuid(businessUnitId);
  if (!normalizedBusinessUnitId || normalizeGuid(role._businessunitid_value) === normalizedBusinessUnitId) {
    return role;
  }

  const rootRoleId = normalizeGuid(role._parentrootroleid_value) || roleId;
  const escapedName = odataString(role.name || '');
  const inherited = await dvGet(`roles?$select=roleid,name,_businessunitid_value,_parentrootroleid_value,_parentroleid_value&$filter=_businessunitid_value eq ${normalizedBusinessUnitId} and (_parentrootroleid_value eq ${rootRoleId} or roleid eq ${rootRoleId} or name eq '${escapedName}')&$top=1`);
  const match = inherited.value?.[0];
  if (!match) {
    throw new HttpError(404, `No copy of role '${role.name || roleId}' was found in the selected principal's business unit.`);
  }
  return match;
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
    const environmentName = pickEnvironmentName(item, properties);
    return {
      name: environmentName,
      displayName: properties.displayName || properties.friendlyName || item.displayName || item.name || '',
      orgUrl: normalizeOrgUrl(linked.instanceUrl || properties.instanceUrl || ''),
      region: properties.azureRegion || properties.location || item.location || '',
      type: properties.environmentType || properties.environmentSku || '',
      resourceId: item.id || '',
    };
  }).filter((env) => env.name);
}

function pickEnvironmentName(item, properties = {}) {
  const namedValue = environmentUrlName(item.name || properties.name || properties.environmentName || '');
  const resourceValue = environmentUrlName(item.id || '');
  if (namedValue && namedValue.toLowerCase() !== 'default') {
    return namedValue;
  }
  return resourceValue || namedValue;
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

function requireLogicalName(value, name) {
  const text = requireString(value, name).toLowerCase();
  if (!/^[a-z][a-z0-9_]*$/.test(text)) {
    throw new HttpError(400, `${name} must be a Dataverse logical name.`);
  }
  return text;
}

function chunkArray(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
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
