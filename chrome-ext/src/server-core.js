// PDAC server core — browser port of the original server.mjs for the Chrome
// extension. Route dispatch and business logic are kept verbatim from the
// Node server; only the Node-specific edges are replaced:
//   - MSAL / pac CLI auth      -> src/auth.js + src/tokens.js (PKCE + refresh)
//   - http server / static     -> bootstrap.js fetch() interceptor (fake req/res)
//   - fs report cache          -> IndexedDB (src/server-db.js)
//   - schedule JSON file       -> chrome.storage.local
//   - node:sqlite trend db     -> IndexedDB (same output shapes)
//   - player services          -> Power Apps REST + make.powerapps.com tabs
// ExcelJS / JSZip / XMLParser load as classic scripts on the app page (and as
// side-effect imports in the service worker) and are read from globalThis.

import { Buffer, createHash, randomUUID } from './node-shims.js';
import { AuthRequiredError, signInInteractive } from './auth.js';
import { clearTokenCache, getAccessTokenForAccountId } from './tokens.js';
import {
  getAccounts as storeGetAccounts,
  removeAccount as storeRemoveAccount,
} from './storage.js';
import {
  reportCacheGetEntry,
  reportCachePutEntry,
  reportCacheListByDate,
  trendSelectRows,
  trendInsertRows,
  trendDeleteRows,
  trendReplaceRows,
  weeklyReplaceEvents,
  weeklyListEvents,
  weeklyDeleteEventsBefore,
} from './server-db.js';
import {
  WEEKLY_COMPONENT_TYPES,
  emptyWeeklyComponentCounts,
  formatLocalDateKey,
  primaryWeeklyComponent,
  startOfCalendarWeek,
  weeklyRetentionCutoff,
} from './weekly-report.js';

const ExcelJS = globalThis.ExcelJS;
const JSZip = globalThis.JSZip;

const REGION = 'prod';
const SERVICE_RESOURCE = 'https://service.powerapps.com/';
const POWER_PLATFORM_RESOURCE = 'https://api.powerplatform.com';
const AUTOMATED_REPORT_SCHEDULE_STORAGE_KEY = 'pdac.automatedReportSchedule';
const WEEKLY_REPORT_SETTINGS_STORAGE_KEY = 'pdac.weeklyReportSettings';
const STARTUP_TASK_NAME = 'PDAC Background Server';
export const REPORT_TREND_RETENTION_DAYS = 730;
export const AUTOMATED_REPORT_CHECK_INTERVAL_MS = 5 * 60 * 1000;
export const WEEKLY_REPORT_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const WEEKLY_REPORT_FULL_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const WEEKLY_REPORT_QUERY_OVERLAP_MS = 10 * 60 * 1000;
const USERS_TEAMS_PAGE_SIZE = 50;
const DATAVERSE_THROTTLE_MAX_RETRIES = 4;


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
  80: 'Model-Driven App',
  90: 'Plugin Type',
  91: 'Plugin Assembly',
  92: 'SDK Message Processing Step',
  93: 'SDK Message Processing Step Image',
  95: 'Service Endpoint',
  150: 'Routing Rule',
  152: 'SLA',
  300: 'Canvas App',
  371: 'Connector',
  372: 'Connection Reference',
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
  environmentName: '',
  orgUrl: '',
  accountHomeId: '',
};
const accountEnvironmentSelections = new Map();
const importPackages = new Map();
const componentTypeEntityCache = new Map();
const aiEventMetadataCache = new Map();
const automatedReportProgress = new Map();
let reportTrendWriteQueue = Promise.resolve();
let automatedReportScheduleWriteQueue = Promise.resolve();
let automatedReportScheduleRunning = false;
let weeklyReportTrackingRunning = false;
let lastDataverseAccountHomeId = '';
const xmlParser = typeof globalThis.XMLParser === 'function'
  ? new globalThis.XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      textNodeName: 'text',
    })
  : null;
const AI_EVENT_ENTITY_LOGICAL_NAME = 'msdyn_aievent';
const AI_EVENT_ENTITY_SET_NAME = 'msdyn_aievents';
const AGENT_SESSION_ENTITY_SET_NAME = 'conversationtranscripts';
const AGENT_SESSION_PAGE_SIZE = 50;
const AUTOMATED_SOLUTION_ENVIRONMENT_CONCURRENCY = 2;
const AGENT_SESSION_BOT_NAME_CACHE = new Map();
const ODATA_FORMATTED_VALUE_ANNOTATION = 'OData.Community.Display.V1.FormattedValue';
const AI_EVENT_BATCH_PREFER = `odata.include-annotations="${ODATA_FORMATTED_VALUE_ANNOTATION}",odata.maxpagesize=5000`;
const FLOW_RUN_PREFER = `odata.include-annotations="${ODATA_FORMATTED_VALUE_ANNOTATION}",odata.maxpagesize=5000`;
const DATAVERSE_TABLE_EXCLUDED_OBJECT_TYPE_CODES = [
  4712, 4724, 9933, 9934, 9935, 9947, 9945, 9944, 9942, 9951, 2016, 9949, 9866, 9867, 9868,
];
const DATAVERSE_TABLE_SELECT = [
  'MetadataId',
  'LogicalName',
  'SchemaName',
  'DisplayName',
  'DisplayCollectionName',
  'Description',
  'OwnershipType',
  'IsPrivate',
  'IsIntersect',
  'IsLogicalEntity',
  'IsCustomEntity',
  'IsManaged',
  'IsCustomizable',
  'IsMappable',
  'IsRenameable',
  'EntitySetName',
  'PrimaryIdAttribute',
  'PrimaryNameAttribute',
  'ObjectTypeCode',
  'TableType',
].join(',');
const REPORT_TOTAL_TABLE_DEFINITIONS = {
  'ai-events': {
    tableName: 'report_ai_flow_event_totals',
    reportKey: 'ai-events',
    reportLabel: 'AI Flow events',
    columns: [
      ['Environment display name', 'environment_display_name', 'TEXT'],
      ['Environment id', 'environment_id', 'TEXT'],
      ['Environment url', 'environment_url', 'TEXT'],
      ['Count of Events', 'count_of_events', 'REAL'],
      ['Sum AI Builder Credits used', 'sum_ai_builder_credits_used', 'REAL'],
      ['Sum Copilot Studio credits used', 'sum_copilot_studio_credits_used', 'REAL'],
      ['Total credits consumed', 'total_credits_consumed', 'REAL'],
    ],
  },
  'agent-sessions': {
    tableName: 'report_agent_session_totals',
    reportKey: 'agent-sessions',
    reportLabel: 'Agent Sessions',
    columns: [
      ['Environment display name', 'environment_display_name', 'TEXT'],
      ['Environment id', 'environment_id', 'TEXT'],
      ['Environment url', 'environment_url', 'TEXT'],
      ['Total Sessions', 'total_sessions', 'REAL'],
      ['Distinct Agents', 'distinct_agents', 'REAL'],
    ],
  },
  'flow-runs': {
    tableName: 'report_flow_run_totals',
    reportKey: 'flow-runs',
    reportLabel: 'Flow Runs',
    columns: [
      ['Environment display name', 'environment_display_name', 'TEXT'],
      ['Environment id', 'environment_id', 'TEXT'],
      ['Environment url', 'environment_url', 'TEXT'],
      ['Total flow runs', 'total_flow_runs', 'REAL'],
      ['Successful flow runs', 'successful_flow_runs', 'REAL'],
      ['Failed flow runs', 'failed_flow_runs', 'REAL'],
      ['Success rate', 'success_rate', 'REAL'],
      ['Failure rate', 'failure_rate', 'REAL'],
    ],
  },
  solutions: {
    tableName: 'report_solution_totals',
    reportKey: 'solutions',
    reportLabel: 'Solutions',
    columns: [
      ['Environment display name', 'environment_display_name', 'TEXT'],
      ['Environment id', 'environment_id', 'TEXT'],
      ['Environment url', 'environment_url', 'TEXT'],
      ['Included solutions', 'included_solutions', 'REAL'],
      ['Managed solutions', 'managed_solutions', 'REAL'],
      ['Unmanaged solutions', 'unmanaged_solutions', 'REAL'],
      ['Visible solutions', 'visible_solutions', 'REAL'],
      ['Hidden solutions', 'hidden_solutions', 'REAL'],
      ['Distinct publishers', 'distinct_publishers', 'REAL'],
      ['# of flows', 'number_of_flows', 'REAL'],
      ['# of Code Apps', 'number_of_code_apps', 'REAL'],
      ['# of Canvas Apps', 'number_of_canvas_apps', 'REAL'],
      ['# of Model Driven Apps', 'number_of_model_driven_apps', 'REAL'],
      ['# of Copilot Studio Agents', 'number_of_copilot_studio_agents', 'REAL'],
      ['Custom Dataverse tables', 'number_of_dataverse_tables', 'REAL'],
      ['# of AI models', 'number_of_ai_models', 'REAL'],
      ['# of connection references', 'number_of_connection_references', 'REAL'],
      ['# of environment variables', 'number_of_environment_variables', 'REAL'],
      ['# of dataflows', 'number_of_dataflows', 'REAL'],
      ['Before filters', 'before_filters', 'REAL'],
      ['Publisher exclusions', 'publisher_exclusions', 'TEXT'],
      ['Managed included', 'managed_included', 'TEXT'],
      ['Microsoft owned included', 'microsoft_owned_included', 'TEXT'],
    ],
  },
};
const AI_EVENT_FIELD_RULES = {
  creditType: {
    logicalNames: ['msdyn_consumptionsource'],
    exactLabels: ['consumption source'],
    tokenGroups: [],
    preferredTypes: ['Picklist'],
  },
  dataType: {
    logicalNames: [],
    exactLabels: [],
    tokenGroups: [],
    preferredTypes: [],
  },
  source: {
    logicalNames: ['msdyn_partnersource'],
    exactLabels: ['partner source'],
    tokenGroups: [],
    preferredTypes: ['String', 'Memo'],
  },
  toolName: {
    logicalNames: [],
    exactLabels: [],
    tokenGroups: [],
    preferredTypes: [],
  },
  model: {
    logicalNames: ['msdyn_aimodelid'],
    exactLabels: ['ai model'],
    tokenGroups: [],
    preferredTypes: ['Lookup'],
  },
  input: {
    logicalNames: ['msdyn_eventdata', 'msdyn_datainfo'],
    exactLabels: ['event data', 'data info'],
    tokenGroups: [],
    preferredTypes: ['Memo', 'String'],
  },
  output: {
    logicalNames: ['msdyn_output'],
    exactLabels: ['output'],
    tokenGroups: [],
    preferredTypes: ['String', 'Memo'],
  },
  eventName: {
    logicalNames: [],
    exactLabels: [],
    tokenGroups: [],
    preferredTypes: [],
  },
};
// The http server from the Node build is replaced by bootstrap.js, which
// intercepts window.fetch('/api/...') calls and forwards them to handleApi
// with fake req/res objects. handleApiRequest is that entry point.
export async function handleApiRequest(req, res) {
  try {
    await handleApi(req, res);
  } catch (error) {
    sendJson(res, getStatus(error), {
      error: errorMessage(error),
    });
  }
}

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
      tenantId: await getSelectedAccountTenantId(),
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
    sendJson(res, 200, await listEnvironmentUsers({
      query: url.searchParams.get('q') || '',
      pageToken: url.searchParams.get('pageToken') || '',
    }));
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
    sendJson(res, 200, await listEnvironmentTeams({
      query: url.searchParams.get('q') || '',
      pageToken: url.searchParams.get('pageToken') || '',
    }));
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

  if (route === 'GET /api/ai-events') {
    requireOrgUrl();
    const payload = await listAiEvents({
      range: url.searchParams.get('range') || 'month',
      start: url.searchParams.get('start') || '',
      end: url.searchParams.get('end') || '',
    });
    console.log('[AI events] sending list payload:\n' + JSON.stringify(payload, null, 2));
    sendJson(res, 200, payload);
    return;
  }

  if (route === 'GET /api/startup') {
    sendJson(res, 200, await getStartupTaskStatus());
    return;
  }

  if (route === 'PUT /api/startup') {
    const body = await readJson(req);
    const result = await setStartupTaskSettings(body);
    const { stopCurrentProcess, ...payload } = result;
    sendJson(res, 200, payload);
    if (stopCurrentProcess) {
      scheduleBackgroundServerStop();
    }
    return;
  }

  if (route === 'GET /api/agent-sessions') {
    requireOrgUrl();
    sendJson(res, 200, await listAgentSessions({
      pageToken: url.searchParams.get('pageToken') || '',
      pageSize: url.searchParams.get('pageSize') || '',
      range: url.searchParams.get('range') || '7d',
      start: url.searchParams.get('start') || '',
      end: url.searchParams.get('end') || '',
    }));
    return;
  }

  if (route === 'POST /api/ai-events/export') {
    const body = await readJson(req);
    const workbook = await exportAiEventsWorkbook(body.rows || []);
    const range = body.dateRange || {};
    const rangeName = range.startDate && range.endDate ? `${range.startDate}-to-${range.endDate}` : 'export';
    sendXlsx(res, 200, `ai-flow-${safeFilename(rangeName)}.xlsx`, workbook);
    return;
  }

  if (route === 'GET /api/flow-runs') {
    requireOrgUrl();
    sendJson(res, 200, await listFlowRuns({
      range: url.searchParams.get('range') || '7d',
      start: url.searchParams.get('start') || '',
      end: url.searchParams.get('end') || '',
    }));
    return;
  }

  if (route === 'POST /api/flow-runs/export') {
    const body = await readJson(req);
    const workbook = await exportFlowRunsWorkbook(body.rows || []);
    const range = body.dateRange || {};
    const rangeName = range.startDate && range.endDate ? `${range.startDate}-to-${range.endDate}` : 'export';
    sendXlsx(res, 200, `flow-runs-${safeFilename(rangeName)}.xlsx`, workbook);
    return;
  }

  const aiEventDetailMatch = url.pathname.match(/^\/api\/ai-events\/([0-9a-fA-F-]+)$/);
  if (req.method === 'GET' && aiEventDetailMatch) {
    requireOrgUrl();
    const payload = await getAiEventDetail(aiEventDetailMatch[1]);
    console.log('[AI events] sending detail payload:\n' + JSON.stringify(payload, null, 2));
    sendJson(res, 200, payload);
    return;
  }

  const agentSessionDetailMatch = url.pathname.match(/^\/api\/agent-sessions\/([0-9a-fA-F-]+)$/);
  if (req.method === 'GET' && agentSessionDetailMatch) {
    requireOrgUrl();
    sendJson(res, 200, await getAgentSessionDetail(agentSessionDetailMatch[1]));
    return;
  }

  if (route === 'POST /api/agent-sessions/export') {
    const body = await readJson(req);
    const workbook = await exportAgentSessionTotalsWorkbook(body.rows || []);
    const range = body.dateRange || {};
    const rangeName = range.startDate && range.endDate ? `${range.startDate}-to-${range.endDate}` : 'export';
    sendXlsx(res, 200, `agent-sessions-${safeFilename(rangeName)}.xlsx`, workbook);
    return;
  }

  const automatedReportProgressMatch = url.pathname.match(/^\/api\/automated-reports\/progress\/([A-Za-z0-9-]+)$/);
  if (req.method === 'GET' && automatedReportProgressMatch) {
    const progress = automatedReportProgress.get(automatedReportProgressMatch[1]);
    if (!progress) {
      throw new HttpError(404, 'Background report progress is not available.');
    }
    sendJson(res, 200, progress);
    return;
  }

  if (route === 'GET /api/automated-reports/schedule') {
    sendJson(res, 200, await readAutomatedReportSchedule());
    return;
  }

  if (route === 'PUT /api/automated-reports/schedule') {
    const body = await readJson(req);
    const schedule = normalizeAutomatedReportSchedule(body);
    const savedSchedule = await writeAutomatedReportSchedule(schedule);
    sendJson(res, 200, savedSchedule);
    queueMicrotask(() => checkAutomatedReportSchedule().catch(logAutomatedReportScheduleError));
    return;
  }

  if (route === 'GET /api/weekly-report/settings') {
    sendJson(res, 200, await readWeeklyReportSettings());
    return;
  }

  if (route === 'PUT /api/weekly-report/settings') {
    const body = await readJson(req);
    const current = await readWeeklyReportSettings();
    const settings = normalizeWeeklyReportSettings(body, current);
    if (settings.enabled && !settings.accountHomeId) {
      throw new HttpError(400, 'Select an account before enabling the weekly report.');
    }
    if (settings.enabled && !settings.environments.length) {
      throw new HttpError(400, 'Select at least one environment in the Solutions report before enabling weekly tracking.');
    }
    await writeWeeklyReportSettings(settings);
    sendJson(res, 200, settings);
    return;
  }

  if (route === 'POST /api/weekly-report/sync') {
    const body = await readJson(req);
    sendJson(res, 200, await checkWeeklyReportTracking({
      force: true,
      full: Boolean(body.full),
      accountHomeId: body.accountHomeId || body.selectedAccountHomeId || '',
      environments: body.environments,
    }));
    return;
  }

  if (route === 'GET /api/weekly-report') {
    const accountHomeId = String(url.searchParams.get('accountHomeId') || selected.accountHomeId || '').trim();
    sendJson(res, 200, {
      settings: await readWeeklyReportSettings(),
      events: await weeklyListEvents(accountHomeId),
    });
    return;
  }

  const automatedReportMatch = url.pathname.match(/^\/api\/automated-reports\/(ai-events|agent-sessions|solutions|flow-runs)\/(totals|raw|both)$/);
  if (req.method === 'POST' && automatedReportMatch) {
    const body = await readJson(req);
    await applyAccountHomeId(body.accountHomeId || body.selectedAccountHomeId || '');
    const progressId = String(body.reportRunId || '').trim();
    setAutomatedReportProgress(progressId, { status: 'starting' });
    try {
      const report = await getOrBuildCachedAutomatedReport(automatedReportMatch[1], automatedReportMatch[2], body);
      setAutomatedReportProgress(progressId, { status: 'complete' });
      sendAutomatedReportResponse(res, report);
    } catch (error) {
      setAutomatedReportProgress(progressId, { status: 'error' });
      throw error;
    }
    return;
  }

  if (route === 'GET /api/report-cache') {
    sendJson(res, 200, { files: await listCachedAutomatedReportFiles(selected.accountHomeId) });
    return;
  }

  if (route === 'GET /api/reports/summary-cache') {
    const summary = await buildReportsSummaryFromCachedReports(selected.accountHomeId);
    if (!summary) {
      throw new HttpError(404, 'No cached background report data is available for today.');
    }
    sendJson(res, 200, summary);
    return;
  }

  if (route === 'POST /api/reports/summary') {
    const body = await readJson(req);
    await applyAccountHomeId(body.accountHomeId || body.selectedAccountHomeId || '');
    sendJson(res, 200, await getOrBuildCachedReportsSummary(body));
    return;
  }

  if (route === 'GET /api/report-trends') {
    const accountHomeId = url.searchParams.get('accountHomeId') || selected.accountHomeId || '';
    sendJson(res, 200, await listReportTrendSnapshots({
      accountHomeId,
      range: url.searchParams.get('range') || '28d',
      start: url.searchParams.get('start') || '',
      end: url.searchParams.get('end') || '',
      latestOnly: url.searchParams.get('latestOnly') === 'true',
    }));
    return;
  }

  if (route === 'GET /api/sql-tables') {
    sendJson(res, 200, await listSqlTables());
    return;
  }

  if (route === 'GET /api/sql-tables/export') {
    sendXlsx(res, 200, 'pdac-sql-tables.xlsx', await exportSqlTablesWorkbook());
    return;
  }

  if (route === 'GET /api/sql-tables/import-template') {
    sendXlsx(
      res,
      200,
      'pdac-trend-data-import-template.xlsx',
      await buildTrendDataImportTemplate(selected.accountHomeId),
    );
    return;
  }

  if (route === 'POST /api/sql-tables/import') {
    const body = await readJson(req);
    sendJson(res, 200, await importTrendDataWorkbook(
      body.xlsx,
      body.accountHomeId || body.selectedAccountHomeId || selected.accountHomeId,
    ));
    return;
  }

  const sqlTableExportMatch = url.pathname.match(/^\/api\/sql-tables\/([^/]+)\/export$/);
  if (req.method === 'GET' && sqlTableExportMatch) {
    const tableName = decodeURIComponent(sqlTableExportMatch[1] || '');
    sendXlsx(res, 200, `${safeFilename(tableName || 'sql-table')}.xlsx`, await exportSingleSqlTableWorkbook(tableName));
    return;
  }

  if (route === 'DELETE /api/sql-tables/records') {
    sendJson(res, 200, await deleteSqlTableRecords());
    return;
  }

  if (route === 'POST /api/solutions/report') {
    const body = await readJson(req);
    await applyAccountHomeId(body.accountHomeId || body.selectedAccountHomeId || '');
    requireOrgUrl();
    const report = await buildSolutionsReportWorkbook(
      body.solutionIds || [],
      body.solutions || body.solutionSnapshots || [],
      normalizeReportEnvironment(body.environment || body.selectedEnvironment || {}),
    );
    sendXlsx(res, 200, report.filename, report.bytes);
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
      environmentDisplayName: body.environmentDisplayName,
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

  const packageConnectionCreateMatch = url.pathname.match(/^\/api\/import-packages\/([^/]+)\/connections$/);
  if (req.method === 'POST' && packageConnectionCreateMatch) {
    const body = await readJson(req);
    const target = environmentFromBody(body.target || {}, {});
    if (!target.environmentName || !target.orgUrl) {
      throw new HttpError(400, 'Choose a target environment.');
    }
    sendJson(res, 201, await createConnectionForImportReference(
      requireImportPackage(packageConnectionCreateMatch[1]),
      target,
      body,
    ));
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
  const result = await signInInteractive({
    resource: String(resource).replace(/\/+$/, ''),
    selectAccount: true,
  });
  const { saveAccount } = await import('./storage.js');
  await saveAccount(result.account);
  selected.accountHomeId = result.account.homeAccountId;
  rememberDataverseAccount(selected.accountHomeId);
  return {
    accessToken: result.accessToken,
    tenantId: result.account.tenantId,
    account: result.account,
  };
}

async function getAccessTokenForSelectedAccount(resource) {
  if (!selected.accountHomeId) {
    const accounts = await getMsalAccounts();
    const rememberedAccount = accounts.find((account) => account.homeAccountId === lastDataverseAccountHomeId);
    if (rememberedAccount) {
      selected.accountHomeId = rememberedAccount.homeAccountId;
    } else if (accounts.length === 1) {
      selected.accountHomeId = accounts[0].homeAccountId;
    } else if (accounts.length > 1) {
      throw new HttpError(400, 'Multiple accounts found. Select an account in the header first.');
    } else {
      throw new HttpError(401, 'No account is signed in. Sign in first.');
    }
  }

  return getAccessTokenForAccount(resource, selected.accountHomeId);
}

async function getAccessTokenForAccount(resource, homeAccountId) {
  const normalizedHomeAccountId = String(homeAccountId || '').trim();
  if (!normalizedHomeAccountId) {
    return getAccessTokenForSelectedAccount(resource);
  }
  const account = (await getMsalAccounts()).find((item) => item.homeAccountId === normalizedHomeAccountId);
  if (!account) {
    throw new HttpError(401, 'Selected account is no longer signed in. Sign in again.');
  }
  try {
    const accessToken = await getAccessTokenForAccountId(String(resource).replace(/\/+$/, ''), normalizedHomeAccountId);
    rememberDataverseAccount(account.homeAccountId);
    return accessToken;
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      throw new HttpError(401, `Sign-in required for ${account.username || 'the selected account'}. Sign in again.`);
    }
    throw error;
  }
}

async function getMsalAccounts() {
  return Object.values(await storeGetAccounts());
}

async function getSelectedAccountTenantId() {
  const accounts = await getMsalAccounts();
  const account = selected.accountHomeId
    ? accounts.find((item) => item.homeAccountId === selected.accountHomeId)
    : null;
  return String(account?.tenantId || accounts[0]?.tenantId || '').trim();
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
    rememberDataverseAccount(selected.accountHomeId);
    return;
  }

  selected.accountHomeId = accounts.length === 1 ? accounts[0].homeAccountId : '';
  rememberDataverseAccount(selected.accountHomeId);
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
  rememberDataverseAccount(homeAccountId);
  applySavedEnvironmentForAccount(homeAccountId);
}

async function applyRequestAccount(req) {
  const homeAccountId = String(req.headers['x-pdac-account-home-id'] || '').trim();
  await applyAccountHomeId(homeAccountId);
}

async function applyAccountHomeId(homeAccountId) {
  const normalizedHomeAccountId = String(homeAccountId || '').trim();
  if (!normalizedHomeAccountId || selected.accountHomeId === normalizedHomeAccountId) {
    return;
  }

  const accounts = await getMsalAccounts();
  if (!accounts.some((account) => account.homeAccountId === normalizedHomeAccountId)) {
    throw new HttpError(401, 'Selected account is no longer signed in. Sign in again.');
  }

  selected.accountHomeId = normalizedHomeAccountId;
  rememberDataverseAccount(normalizedHomeAccountId);
  const savedEnvironment = accountEnvironmentSelections.get(normalizedHomeAccountId);
  if (savedEnvironment) {
    setSelectedEnvironment(savedEnvironment);
  }
}

function rememberDataverseAccount(homeAccountId) {
  const normalizedHomeAccountId = String(homeAccountId || '').trim();
  if (normalizedHomeAccountId) {
    lastDataverseAccountHomeId = normalizedHomeAccountId;
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
  const accounts = await getMsalAccounts();
  for (const account of accounts) {
    await storeRemoveAccount(account.homeAccountId);
  }
  await clearTokenCache();
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

async function buildSolutionsReportWorkbook(solutionIds, solutionSnapshots = [], environment = {}) {
  const normalizedIds = [...new Set((Array.isArray(solutionIds) ? solutionIds : [])
    .map((value) => normalizeGuid(value))
    .filter(Boolean))];
  if (!normalizedIds.length) {
    throw new HttpError(400, 'Select at least one solution to export a report.');
  }

  const snapshotSolutions = normalizeSolutionReportSnapshots(solutionSnapshots);
  const allSolutions = snapshotSolutions.length ? snapshotSolutions : await listSolutions();
  const selectedSolutions = allSolutions.filter((solution) => normalizedIds.includes(normalizeGuid(solution.solutionid)));
  if (!selectedSolutions.length) {
    throw new HttpError(404, 'No matching solutions were found for the requested report.');
  }

  const reportEnvironment = normalizeReportEnvironment(environment);

  const components = await listSolutionComponentsForSolutions(selectedSolutions.map((solution) => solution.solutionid));
  const rows = await buildSolutionReportRows(selectedSolutions, components, reportEnvironment);
  const componentRows = buildSolutionComponentReportRows(selectedSolutions, components, reportEnvironment);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PDAC';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('Solutions', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const columns = [
    ['Environment display name', 30, true],
    ['Environment id', 28, true],
    ['Environment url', 42, true],
    ['Solution name', 32],
    ['Solution unique name', 36],
    ['Publisher display name', 28],
    ['# of flows', 14],
    ['# of Code Apps', 16],
    ['# of Canvas Apps', 18],
    ['# of Model Driven Apps', 22],
    ['# of Copilot Studio Agents', 24],
    ['# of Dataverse tables', 20],
    ['# of AI models', 16],
    ['# of connection references', 23],
    ['# of environment variables', 23],
    ['# of dataflows', 16],
  ];
  worksheet.columns = columns.map(([header, width, hidden]) => ({ header, key: header, width, hidden: Boolean(hidden) }));
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
    worksheet.getRow(rowNumber).alignment = { vertical: 'top' };
  }

  const componentWorksheet = workbook.addWorksheet('Components', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const componentColumns = [
    ['Environment display name', 30, true],
    ['Environment id', 28, true],
    ['Environment url', 42, true],
    ['Solution', 32],
    ['Type', 26],
    ['name', 42],
    ['Id', 38],
  ];
  componentWorksheet.columns = componentColumns.map(([header, width, hidden]) => ({ header, key: header, width, hidden: Boolean(hidden) }));
  componentWorksheet.addRows(componentRows);
  componentWorksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: componentColumns.length },
  };
  const componentHeaderRow = componentWorksheet.getRow(1);
  componentHeaderRow.height = 22;
  componentHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF111827' } };
    cell.alignment = { vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    cell.border = bottomBorder();
  });
  for (let rowNumber = 2; rowNumber <= componentRows.length + 1; rowNumber++) {
    componentWorksheet.getRow(rowNumber).alignment = { vertical: 'top' };
  }

  return {
    filename: `solutions-report-${safeFilename(reportEnvironment.displayName || 'environment')}.xlsx`,
    bytes: Buffer.from(await workbook.xlsx.writeBuffer()),
  };
}

function normalizeSolutionReportSnapshots(solutions) {
  if (!Array.isArray(solutions)) {
    return [];
  }

  return solutions
    .filter((solution) => normalizeGuid(solution?.solutionid))
    .map((solution) => ({
      solutionid: solution.solutionid,
      friendlyname: solution.friendlyname || '',
      uniquename: solution.uniquename || '',
      publisher: {
        friendlyname: solution.publisher?.friendlyname || '',
        uniquename: solution.publisher?.uniquename || '',
      },
    }));
}

async function buildSolutionReportRows(solutions, components, environment = {}) {
  const componentsBySolution = new Map();
  for (const component of components) {
    const solutionId = normalizeGuid(component.solutionid);
    if (!solutionId) {
      continue;
    }
    if (!componentsBySolution.has(solutionId)) {
      componentsBySolution.set(solutionId, []);
    }
    componentsBySolution.get(solutionId).push(component);
  }

  return solutions.map((solution) => {
    const solutionComponents = componentsBySolution.get(normalizeGuid(solution.solutionid)) || [];
    const countFields = solutionReportCountFields(solutionComponents);
    return {
      'Environment display name': environment.displayName || '',
      'Environment id': environment.environmentId || '',
      'Environment url': environment.orgUrl || '',
      'Solution name': solution.friendlyname || solution.uniquename || '',
      'Solution unique name': solution.uniquename || '',
      'Publisher display name': solution.publisher?.friendlyname || solution.publisher?.uniquename || '',
      ...countFields,
    };
  });
}

function solutionReportCountFields(components) {
  const counts = countSolutionReportComponents(components);
  return {
    '# of flows': counts.flows.size,
    '# of Code Apps': counts.codeApps.size,
    '# of Canvas Apps': counts.canvasApps.size,
    '# of Model Driven Apps': counts.modelDrivenApps.size,
    '# of Copilot Studio Agents': counts.copilotStudioAgents.size,
    '# of Dataverse tables': counts.tables.size,
    '# of AI models': counts.aiModels.size,
    '# of connection references': counts.connectionReferences.size,
    '# of environment variables': counts.environmentVariables.size,
    '# of dataflows': counts.dataflows.size,
  };
}

function countSolutionReportComponents(components) {
  const counts = createSolutionReportCounts();
  for (const component of components) {
    const componentType = Number(component.componenttype);
    const objectId = normalizeGuid(component.objectid) || `${componentType}:${counts.flows.size + counts.tables.size}`;
    const logicalName = String(component.logicalName || component.recordLogicalName || '').toLowerCase();
    const typeLabel = String(component.typeLabel || SOLUTION_COMPONENT_TYPES[componentType] || '').toLowerCase();

    if (componentType === 29) {
      counts.flows.add(objectId);
      continue;
    }

    if (componentType === 1) {
      counts.tables.add(objectId);
      continue;
    }

    if (componentType === 380 || typeLabel.includes('environment variable definition')) {
      counts.environmentVariables.add(objectId);
      continue;
    }

    if (logicalName === 'connectionreference') {
      counts.connectionReferences.add(objectId);
      continue;
    }

    if (componentType === 80 || logicalName === 'appmodule') {
      counts.modelDrivenApps.add(objectId);
      continue;
    }

    if (logicalName === 'bot') {
      counts.copilotStudioAgents.add(objectId);
      continue;
    }

    if (componentType === 300 && typeLabel.includes('code app')) {
      counts.codeApps.add(objectId);
      continue;
    }

    if (componentType === 300) {
      counts.canvasApps.add(objectId);
      continue;
    }

    if (isAiModelComponent(logicalName, '')) {
      counts.aiModels.add(objectId);
      continue;
    }

    if (isDataflowComponent(logicalName, '')) {
      counts.dataflows.add(objectId);
    }
  }
  return counts;
}

function createSolutionReportCounts() {
  return {
    flows: new Set(),
    codeApps: new Set(),
    canvasApps: new Set(),
    modelDrivenApps: new Set(),
    copilotStudioAgents: new Set(),
    tables: new Set(),
    aiModels: new Set(),
    connectionReferences: new Set(),
    environmentVariables: new Set(),
    dataflows: new Set(),
  };
}

function buildSolutionComponentReportRows(solutions, components, environment = {}) {
  const solutionNameById = new Map(solutions.map((solution) => [
    normalizeGuid(solution.solutionid),
    solution.friendlyname || solution.uniquename || solution.solutionid || '',
  ]));

  const rows = components.map((component) => ({
    'Environment display name': environment.displayName || '',
    'Environment id': environment.environmentId || '',
    'Environment url': environment.orgUrl || '',
    Solution: solutionNameById.get(normalizeGuid(component.solutionid)) || '',
    Type: component.typeLabel || SOLUTION_COMPONENT_TYPES[Number(component.componenttype)] || `Type ${Number(component.componenttype)}`,
    name: component.displayName || component.objectid || '',
    Id: component.objectid || '',
  }));

  return rows.sort((left, right) =>
    `${left.Solution} ${left.Type} ${left.name}`.localeCompare(`${right.Solution} ${right.Type} ${right.name}`),
  );
}

async function listSolutionComponentsForSolutions(solutionIds) {
  const normalizedIds = [...new Set(solutionIds.map((value) => normalizeGuid(value)).filter(Boolean))];
  if (!normalizedIds.length) {
    return [];
  }

  const chunks = chunkArray(normalizedIds, 20);
  const pages = await mapWithConcurrency(chunks, 3, async (chunk) => {
    const filter = chunk.map((solutionId) => `_solutionid_value eq ${solutionId}`).join(' or ');
    return dvGetAll(`solutioncomponents?$select=_solutionid_value,solutioncomponentid,componenttype,objectid&$filter=${filter}`, {
      Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
    });
  });
  const rawComponents = pages.flat();
  return mapWithConcurrency(rawComponents, 8, async (component) => ({
    solutionid: component._solutionid_value,
    ...(await enrichSolutionComponent(component)),
  }));
}

async function getSolutionReportTypeDetails(componentType) {
  const known = {
    1: { logicalName: 'entity', typeLabel: 'Table' },
    29: { logicalName: 'workflow', typeLabel: 'Flow' },
    300: { logicalName: 'canvasapp', typeLabel: 'Canvas App' },
    380: { logicalName: 'environmentvariabledefinition', typeLabel: 'Environment Variable Definition' },
    381: { logicalName: 'environmentvariablevalue', typeLabel: 'Environment Variable Value' },
  }[Number(componentType)];
  if (known) {
    return known;
  }

  try {
    return await resolveEntityForComponentType(componentType);
  } catch {
    return {};
  }
}

async function listCanvasAppsForReport(canvasAppIds) {
  const ids = [...new Set(canvasAppIds.map((value) => normalizeGuid(value)).filter(Boolean))];
  if (!ids.length) {
    return new Map();
  }

  const chunks = chunkArray(ids, 20);
  const pages = await mapWithConcurrency(chunks, 3, async (chunk) => {
    const filter = chunk.map((canvasAppId) => `canvasappid eq ${canvasAppId}`).join(' or ');
    return dvGetAll(`canvasapps?$select=canvasappid,canvasapptype&$filter=${filter}`);
  });
  return new Map(pages.flat().map((app) => [normalizeGuid(app.canvasappid), app]));
}

function isAiModelComponent(logicalName, typeLabel) {
  return [logicalName, typeLabel].some((value) => {
    const text = String(value || '').toLowerCase();
    const normalized = text.replace(/[^a-z0-9]/g, '');
    return normalized === 'aimodel' ||
      normalized.endsWith('aimodel') ||
      normalized === 'predictionmodel' ||
      normalized.endsWith('predictionmodel') ||
      normalized === 'aibmodel' ||
      normalized.endsWith('aibmodel') ||
      text === 'ai model' ||
      text === 'prediction model' ||
      text.includes('ai model');
  });
}

function isDataflowComponent(logicalName, typeLabel) {
  return [logicalName, typeLabel].some((value) => String(value || '').toLowerCase().includes('dataflow'));
}

async function getSolution(solutionId) {
  return dvGet(`solutions(${solutionId})?$select=solutionid,friendlyname,uniquename,version,ismanaged`);
}

async function listDataverseTables(options = {}) {
  const scope = options.scope === 'all' ? 'all' : 'custom';
  const data = await dvGetAll(dataverseTableMetadataPath(scope));
  const tables = data
    .filter((item) => item.LogicalName && item.SchemaName && !item.IsIntersect && !item.IsLogicalEntity)
    .filter((item) => scope === 'all' || isCustomizableDataverseTable(item))
    .map(mapEntityDefinition)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  return {
    scope,
    tables,
  };
}

function dataverseTableMetadataPath(scope = 'custom') {
  const filters = [
    'IsIntersect eq false',
    'IsLogicalEntity eq false',
    'PrimaryNameAttribute ne null',
    "PrimaryNameAttribute ne ''",
    'ObjectTypeCode gt 0',
    ...DATAVERSE_TABLE_EXCLUDED_OBJECT_TYPE_CODES.map((code) => `ObjectTypeCode ne ${code}`),
  ];
  if (scope === 'custom') {
    filters.push('(IsCustomizable/Value eq true or IsCustomEntity eq true or IsManaged eq false or IsMappable/Value eq true or IsRenameable/Value eq true)');
  }
  return `EntityDefinitions?$select=${DATAVERSE_TABLE_SELECT}&RetrieveAllSettings=true&$filter=${filters.join(' and ')}&LabelLanguages=1033`;
}

function isCustomizableDataverseTable(item) {
  return Boolean(
    item.IsCustomEntity ||
    item.IsManaged === false ||
    item.IsCustomizable?.Value ||
    item.IsMappable?.Value ||
    item.IsRenameable?.Value,
  );
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
  return dvGet(`EntityDefinitions(LogicalName='${odataString(name)}')?$select=MetadataId,LogicalName,SchemaName,DisplayName,DisplayCollectionName,Description,OwnershipType,IsPrivate,IsIntersect,IsCustomEntity,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute&LabelLanguages=1033`);
}

async function getEntityDefinitionByMetadataId(metadataId) {
  const id = normalizeGuid(metadataId);
  if (!id) {
    throw new HttpError(400, 'Table metadata id is required.');
  }
  return dvGet(`EntityDefinitions(${id})?$select=MetadataId,LogicalName,SchemaName,DisplayName,DisplayCollectionName,Description,OwnershipType,IsPrivate,IsIntersect,IsCustomEntity,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute&LabelLanguages=1033`);
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
    metadataId: normalizeGuid(item.MetadataId),
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
  const normalizedComponentType = Number(componentType);
  if (!normalizedComponentType) {
    return {};
  }

  const environmentKey = normalizeOrgUrl(selected.orgUrl || '') || 'default';
  let environmentCache = componentTypeEntityCache.get(environmentKey);
  if (!environmentCache) {
    environmentCache = new Map();
    componentTypeEntityCache.set(environmentKey, environmentCache);
  }
  if (environmentCache.has(normalizedComponentType)) {
    return environmentCache.get(normalizedComponentType);
  }

  let row;
  try {
    const metadata = await dvGet(`EntityDefinitions?$select=LogicalName,EntitySetName,DisplayName&$filter=ObjectTypeCode eq ${normalizedComponentType}`);
    row = Array.isArray(metadata?.value) ? metadata.value[0] : metadata;
  } catch {
    // Some solution component types are not exposed through EntityDefinitions.
  }
  if (!row) {
    const data = await dvGet(`entities?$filter=objecttypecode eq ${normalizedComponentType}`);
    row = Array.isArray(data?.value) ? data.value[0] : data;
  }
  if (!row) {
    environmentCache.set(normalizedComponentType, {});
    return {};
  }
  const entity = {
    logicalName: row.logicalname || row.name || row.entitysetname || '',
    collection: row.collectionname || row.entitysetname || row.entitysetnameplural || '',
    typeLabel: row.originallocalizedname || row.localizedname || row.displayname || row.name || row.logicalname || '',
  };
  environmentCache.set(normalizedComponentType, entity);
  return entity;
}

async function resolveEntityForComponentTypeForEnvironment(orgUrl, componentType, accountHomeId = '') {
  const normalizedComponentType = Number(componentType);
  const environmentKey = normalizeOrgUrl(orgUrl || '') || 'default';
  if (!normalizedComponentType) {
    return {};
  }
  let environmentCache = componentTypeEntityCache.get(environmentKey);
  if (!environmentCache) {
    environmentCache = new Map();
    componentTypeEntityCache.set(environmentKey, environmentCache);
  }
  if (environmentCache.has(normalizedComponentType)) {
    return environmentCache.get(normalizedComponentType);
  }

  let row;
  try {
    const metadata = await targetDvGet(
      environmentKey,
      `EntityDefinitions?$select=LogicalName,EntitySetName,DisplayName&$filter=ObjectTypeCode eq ${normalizedComponentType}`,
      accountHomeId,
    );
    row = Array.isArray(metadata?.value) ? metadata.value[0] : metadata;
  } catch {
    // Some solution component types are not exposed through EntityDefinitions.
  }
  if (!row) {
    const data = await targetDvGet(
      environmentKey,
      `entities?$select=logicalname,collectionname,entitysetname,originallocalizedname,name&$filter=objecttypecode eq ${normalizedComponentType}`,
      accountHomeId,
    );
    row = Array.isArray(data?.value) ? data.value[0] : data;
  }
  const entity = row ? {
    logicalName: row.LogicalName || row.logicalname || row.name || row.EntitySetName || row.entitysetname || '',
    collection: row.EntitySetName || row.collectionname || row.entitysetname || row.entitysetnameplural || '',
    typeLabel: getLabel(row.DisplayName) || row.originallocalizedname || row.localizedname || row.displayname || row.name || row.LogicalName || row.logicalname || '',
  } : {};
  environmentCache.set(normalizedComponentType, entity);
  return entity;
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
    createUrl: await makeConnectionCreateUrl(selected.environmentName, reference.connectorid),
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
    { environmentName: selected.environmentName },
  );
  return {
    connection,
    requestedDisplayName,
    details: await getConnectionReferenceDetails(connectionReferenceId),
  };
}

async function createConnectionForImportReference(item, target, body) {
  const connectorId = requireString(body.connectorId, 'connectorId');
  const reference = findImportConnectionReference(item, connectorId, body.logicalName);
  const requestedDisplayName = String(
    body.displayName ||
    reference.displayName ||
    reference.logicalName ||
    connectorName(connectorId) ||
    'Connection',
  ).trim();
  const connection = await createPowerPlatformConnection(connectorId, requestedDisplayName, {
    environmentName: target.environmentName,
  });
  return {
    connection,
    requestedDisplayName,
  };
}

function findImportConnectionReference(item, connectorId, logicalName) {
  const wantedLogicalName = String(logicalName || '').trim().toLowerCase();
  const wantedKeys = connectorMatchKeys(connectorId);
  const references = item.analysis.connectionReferences || [];
  const reference = wantedLogicalName
    ? references.find((candidate) => String(candidate.logicalName || '').toLowerCase() === wantedLogicalName)
    : references.find((candidate) => hasConnectorMatch(wantedKeys, connectorMatchKeys(candidate.connectorId)));
  if (!reference) {
    throw new HttpError(400, 'Connector is not used by this import package.');
  }
  if (!hasConnectorMatch(wantedKeys, connectorMatchKeys(reference.connectorId))) {
    throw new HttpError(400, 'Connector does not match the selected import connection reference.');
  }
  return reference;
}

async function createPowerPlatformConnection(connectorIdRaw, displayName, options = {}) {
  const connectorId = normalizeActionConnectorId(requireString(connectorIdRaw, 'connectorId'));
  const environmentName = options.environmentName || selected.environmentName;
  // The Node server drove the pac CLI player services (silent SSO creation or
  // a localhost callback browser flow). Neither is possible inside a browser
  // extension, so open the Power Apps connection-creation page in a new tab
  // and let the user finish there.
  const createUrl = await makeConnectionCreateUrl(environmentName, connectorId);
  if (!createUrl) {
    throw new HttpError(400, 'Could not build the connection creation URL for this environment.');
  }
  await openInBrowser(createUrl);
  return {
    status: 'browser',
    id: '',
    name: '',
    displayName: String(displayName || '').trim(),
    message: 'The connection creation page was opened in a new tab. Create the connection there, then refresh this panel.',
  };
}

async function openInBrowser(url) {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    await chrome.tabs.create({ url, active: true });
    return;
  }
  window.open(url, '_blank');
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

async function listEnvironmentUsers(options = {}) {
  const query = typeof options === 'string' ? options : options.query || '';
  const pageToken = typeof options === 'string' ? '' : options.pageToken || '';
  const filter = userSearchFilter(query);
  const { rows, nextPageToken } = await dvGetPage(
    `systemusers?$select=systemuserid,fullname,internalemailaddress,domainname,isdisabled,accessmode,azureactivedirectoryobjectid,_businessunitid_value&$expand=businessunitid($select=name)&$filter=${filter}&$orderby=fullname`,
    pageToken,
    { Prefer: `odata.maxpagesize=${USERS_TEAMS_PAGE_SIZE}` },
  );
  return {
    items: rows.map((user) => ({
    systemuserid: user.systemuserid,
    fullname: user.fullname || '',
    internalemailaddress: user.internalemailaddress || '',
    domainname: user.domainname || '',
    isdisabled: Boolean(user.isdisabled),
    accessmode: user.accessmode,
    azureactivedirectoryobjectid: user.azureactivedirectoryobjectid || '',
    businessUnitId: user._businessunitid_value || '',
    businessUnitName: user.businessunitid?.name || user['_businessunitid_value@OData.Community.Display.V1.FormattedValue'] || '',
    })),
    nextPageToken,
  };
}

async function listEnvironmentTeams(options = {}) {
  const query = typeof options === 'string' ? options : options.query || '';
  const pageToken = typeof options === 'string' ? '' : options.pageToken || '';
  const normalized = String(query || '').trim();
  const filter = normalized ? `&$filter=${principalContainsFilter(['name', 'emailaddress'], normalized)}` : '';
  const { rows, nextPageToken } = await dvGetPage(
    `teams?$select=teamid,name,teamtype,emailaddress,description,azureactivedirectoryobjectid,_businessunitid_value&$expand=businessunitid($select=name)${filter}&$orderby=name`,
    pageToken,
    { Prefer: `odata.maxpagesize=${USERS_TEAMS_PAGE_SIZE}` },
  );
  return {
    items: rows.map((team) => ({
    teamid: team.teamid,
    name: team.name || '',
    teamtype: team.teamtype,
    teamTypeLabel: team['teamtype@OData.Community.Display.V1.FormattedValue'] || teamTypeLabel(team.teamtype),
    emailaddress: team.emailaddress || '',
    description: team.description || '',
    azureactivedirectoryobjectid: team.azureactivedirectoryobjectid || '',
    businessUnitId: team._businessunitid_value || '',
    businessUnitName: team.businessunitid?.name || team['_businessunitid_value@OData.Community.Display.V1.FormattedValue'] || '',
    })),
    nextPageToken,
  };
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
  const environmentDisplayName = String(options.environmentDisplayName || '').trim();
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
  const environmentSegment = safeFilename(environmentDisplayName || 'environment');
  return {
    filename: `${safeFilename(solution.uniquename || solution.friendlyname)}_${environmentSegment}_${suffix}.zip`,
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
  let analysis = await analyzeSolutionZip(bytes);
  if (meta.sourceSolutionId) {
    try {
      analysis = mergeImportAnalysis(analysis, await analyzeSourceSolution(meta.sourceSolutionId));
    } catch (error) {
      console.warn(`Source solution analysis failed: ${errorMessage(error)}`);
    }
  }
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

function mergeImportAnalysis(zipAnalysis, sourceAnalysis) {
  return {
    ...zipAnalysis,
    solution: Object.values(zipAnalysis.solution || {}).some(Boolean) ? zipAnalysis.solution : sourceAnalysis.solution,
    components: sourceAnalysis.components?.length ? sourceAnalysis.components : zipAnalysis.components,
    connectionReferences: sourceAnalysis.connectionReferences?.length ? sourceAnalysis.connectionReferences : zipAnalysis.connectionReferences,
    environmentVariables: sourceAnalysis.environmentVariables?.length ? sourceAnalysis.environmentVariables : zipAnalysis.environmentVariables,
  };
}

async function analyzeSourceSolution(solutionId) {
  const [solution, sourceComponents] = await Promise.all([
    getSolution(solutionId),
    listSolutionComponents(solutionId),
  ]);
  const connectionComponents = sourceComponents.filter((component) => Number(component.componenttype) === 372);
  const variableComponents = sourceComponents.filter((component) => Number(component.componenttype) === 380);
  const [connectionReferences, environmentVariables] = await Promise.all([
    mapWithConcurrency(connectionComponents, 6, async (component) => {
      try {
        const row = await dvGet(`connectionreferences(${normalizeGuid(component.objectid)})?$select=connectionreferencelogicalname,connectionreferencedisplayname,connectorid`);
        return {
          logicalName: row.connectionreferencelogicalname || component.logicalName || '',
          displayName: row.connectionreferencedisplayname || component.displayName || row.connectionreferencelogicalname || '',
          connectorId: row.connectorid || '',
        };
      } catch {
        return null;
      }
    }),
    mapWithConcurrency(variableComponents, 6, async (component) => {
      try {
        const row = await dvGet(`environmentvariabledefinitions(${normalizeGuid(component.objectid)})?$select=schemaname,displayname,type,defaultvalue&$expand=environmentvariabledefinition_environmentvariablevalue($select=value)`);
        const currentValue = row.environmentvariabledefinition_environmentvariablevalue?.[0]?.value || '';
        return {
          schemaName: row.schemaname || component.logicalName || '',
          displayName: row.displayname || component.displayName || row.schemaname || '',
          type: normalizeEnvironmentVariableType(row.type),
          defaultValue: row.defaultvalue || '',
          value: currentValue || row.defaultvalue || '',
        };
      } catch {
        return null;
      }
    }),
  ]);
  return {
    solution: {
      uniqueName: solution.uniquename || '',
      friendlyName: solution.friendlyname || '',
      version: solution.version || '',
    },
    components: sourceComponents.map((component) => ({
      type: String(component.componenttype || ''),
      typeName: component.typeLabel || SOLUTION_COMPONENT_TYPES[Number(component.componenttype)] || `Component type ${component.componenttype}`,
      schemaName: component.displayName || component.logicalName || component.objectid || '',
    })),
    connectionReferences: connectionReferences.filter((reference) => reference?.logicalName && reference.connectorId),
    environmentVariables: environmentVariables.filter((variable) => variable?.schemaName),
  };
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
      createUrl: await makeConnectionCreateUrl(target.environmentName, reference.connectorId),
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
  const xmlTexts = [];
  for (const file of xmlFiles) {
    try {
      const text = await file.async('text');
      xmlTexts.push(text);
      if (xmlParser) {
        xmlRoots.push(xmlParser.parse(text));
      }
    } catch {
      // Ignore non-standard XML entries in the package.
    }
  }

  return {
    solution: findSolutionMetadata(xmlRoots, xmlTexts),
    components: extractSolutionComponents(xmlTexts),
    connectionReferences: extractConnectionReferences(xmlRoots, xmlTexts),
    environmentVariables: extractEnvironmentVariables(xmlRoots, xmlTexts),
  };
}

function findSolutionMetadata(xmlRoots, xmlTexts = []) {
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
  return {
    uniqueName: findXmlTagText(xmlTexts, 'UniqueName'),
    friendlyName: findXmlTagText(xmlTexts, 'FriendlyName') || findXmlTagText(xmlTexts, 'LocalizedName'),
    version: findXmlTagText(xmlTexts, 'Version'),
  };
}

function extractSolutionComponents(xmlTexts) {
  const found = new Map();
  for (const text of xmlTexts) {
    for (const attributes of findXmlTagAttributes(text, 'RootComponent')) {
      const type = xmlAttribute(attributes, 'type');
      const schemaName = xmlAttribute(attributes, 'schemaName') || xmlAttribute(attributes, 'id');
      if (!type && !schemaName) {
        continue;
      }
      const key = `${type}:${schemaName}`;
      found.set(key, {
        type: String(type || ''),
        typeName: SOLUTION_COMPONENT_TYPES[Number(type)] || `Component type ${type || 'unknown'}`,
        schemaName: String(schemaName || ''),
      });
    }
  }
  return [...found.values()].sort((left, right) => `${left.typeName}:${left.schemaName}`.localeCompare(`${right.typeName}:${right.schemaName}`));
}

function extractConnectionReferences(xmlRoots, xmlTexts = []) {
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
  for (const text of xmlTexts) {
    for (const element of findXmlElements(text, 'connectionreference')) {
      const logicalName = xmlElementField(element, 'connectionreferencelogicalname') || xmlElementField(element, 'logicalname');
      const connectorId = xmlElementField(element, 'connectorid');
      if (logicalName && connectorId) {
        found.set(logicalName, {
          logicalName,
          displayName: xmlElementField(element, 'connectionreferencedisplayname') || xmlElementField(element, 'displayname') || logicalName,
          connectorId,
        });
      }
    }
  }
  return [...found.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function extractEnvironmentVariables(xmlRoots, xmlTexts = []) {
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
  for (const text of xmlTexts) {
    for (const tagName of ['environmentvariabledefinition', 'environmentvariable']) {
      for (const element of findXmlElements(text, tagName)) {
        const schemaName = xmlElementField(element, 'schemaname');
        if (!isValidEnvironmentVariableSchemaName(schemaName)) continue;
        const current = found.get(schemaName) || { schemaName };
        const defaultValue = xmlElementField(element, 'defaultvalue');
        const value = xmlElementField(element, 'value');
        found.set(schemaName, {
          ...current,
          schemaName,
          displayName: xmlElementField(element, 'displayname') || current.displayName || schemaName,
          type: normalizeEnvironmentVariableType(xmlElementField(element, 'type') || current.type),
          defaultValue: defaultValue || current.defaultValue || '',
          value: value || current.value || defaultValue || '',
        });
      }
    }
  }
  return [...found.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function findXmlTagText(xmlTexts, tagName) {
  const escapedName = String(tagName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<${escapedName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedName}\\s*>`, 'i');
  for (const text of xmlTexts) {
    const match = pattern.exec(text);
    if (match) {
      return String(match[1]).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
    }
  }
  return '';
}

function findXmlTagAttributes(text, tagName) {
  const escapedName = String(tagName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<${escapedName}\\b([^>]*)>`, 'gi');
  return [...String(text).matchAll(pattern)].map((match) => match[1]);
}

function findXmlElements(text, tagName) {
  const escapedName = String(tagName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<${escapedName}\\b([^>]*?)(?:\\/\\s*>|>([\\s\\S]*?)<\\/${escapedName}\\s*>)`, 'gi');
  return [...String(text).matchAll(pattern)].map((match) => ({ attributes: match[1] || '', body: match[2] || '' }));
}

function xmlElementField(element, name) {
  const attribute = xmlAttribute(element.attributes, name);
  return decodeXmlText(attribute || findXmlTagText([element.body], name));
}

function decodeXmlText(value) {
  return String(value || '').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&');
}

function xmlAttribute(attributes, name) {
  const escapedName = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\b${escapedName}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i').exec(String(attributes));
  return match ? match[2].trim() : '';
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
    sources.push(...await listUserConnections(environmentName));
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

async function listUserConnections(environmentName = selected.environmentName) {
  const actionEnvironmentName = environmentUrlName(environmentName);
  const url = `https://api.powerapps.com/providers/Microsoft.PowerApps/connections?api-version=2016-11-01&$filter=environment eq '${actionEnvironmentName}'`;
  const rows = await powerAppsGetAll(url);
  return rows.map(normalizeActionConnection);
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
    await deleteUserConnection(selected.environmentName, connectorId, connection.connectionId);
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

async function deleteUserConnection(environmentName, connectorId, connectionId) {
  const url = `https://api.powerapps.com/providers/Microsoft.PowerApps/apis/${encodeURIComponent(connectorName(connectorId))}/connections/${encodeURIComponent(connectionId)}?api-version=2016-11-01&$filter=environment eq '${environmentUrlName(environmentName)}'`;
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

async function makeConnectionCreateUrl(environmentName, connectorId) {
  const environmentId = environmentUrlName(environmentName);
  const connector = connectorName(connectorId);
  if (!environmentId || !connector) {
    return '';
  }
  return addTenantIdToUrl(
    `https://make.powerapps.com/environments/${encodeURIComponent(environmentId)}/connections/available/${encodeURIComponent(connector)}`,
    await getSelectedAccountTenantId(),
  );
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

function addTenantIdToUrl(rawUrl, tenantId) {
  const normalizedTenantId = String(tenantId || '').trim();
  if (!normalizedTenantId) {
    return rawUrl;
  }

  const url = new URL(rawUrl);
  url.searchParams.set('tenantId', normalizedTenantId);
  return url.toString();
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
  const url = 'https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments?api-version=2020-10-01';
  try {
    const response = await apiHttpRequest('GET', url, { authResource: SERVICE_RESOURCE });
    return {
      value: normalizeEnvironments(response.data),
      source: url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new HttpError(502, `Could not list environments. Try signing in again or switching accounts. ${message}`);
  }
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

async function listAiEvents(filters = {}) {
  const config = await getAiEventFieldConfig();
  const dateRange = getAiEventDateRange(filters);
  const selectFields = getAiEventSelectFields(config, { includePayload: false });
  const data = await fetchAiEventData(
    buildAiEventListPath(selectFields, dateRange),
    AI_EVENT_BATCH_PREFER,
  );
  const rows = data
    .map((row) => normalizeAiEventSummary(row, config))
    .filter((row) => Number(row.creditsConsumed || 0) > 0);
  return {
    dateRange,
    fieldMappings: config.labels,
    fieldCandidates: config.resolved,
    unresolvedFields: config.unresolved,
    rows,
  };
}

async function listFlowRuns(filters = {}) {
  const dateRange = getFlowRunDateRange(filters);
  const rows = await dvGetAll(buildFlowRunListPath(dateRange), { Prefer: FLOW_RUN_PREFER });
  return {
    dateRange,
    rows: rows.map(normalizeFlowRunSummary),
  };
}

async function listAgentSessions(filters = {}) {
  const requestedPageSize = Number(filters.pageSize || AGENT_SESSION_PAGE_SIZE);
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(100, Math.max(1, Math.trunc(requestedPageSize)))
    : AGENT_SESSION_PAGE_SIZE;
  const dateRange = getAgentSessionDateRange(filters);
  const path = `${AGENT_SESSION_ENTITY_SET_NAME}?${buildAiEventQueryString({
    '$select': 'conversationtranscriptid,conversationstarttime,name,metadata,_bot_conversationtranscriptid_value',
    '$expand': 'bot_conversationtranscriptId($select=name)',
    '$filter': `conversationstarttime ge ${toODataDateTime(dateRange.start)} and conversationstarttime lt ${toODataDateTime(dateRange.endExclusive)}`,
    '$orderby': 'conversationstarttime desc,createdon desc',
  })}`;
  const page = await dvGetPage(path, filters.pageToken || '', {
    Prefer: `odata.include-annotations="${ODATA_FORMATTED_VALUE_ANNOTATION}",odata.maxpagesize=${pageSize}`,
  });
  const rows = await mapWithConcurrency(page.rows || [], 4, async (row) => normalizeAgentSessionSummary(row));
  return {
    dateRange,
    rows,
    nextPageToken: page.nextPageToken,
  };
}

async function getOrBuildCachedAutomatedReport(group, reportType, body = {}) {
  const reportSchemaVersion = group === 'solutions' ? 4 : 1;
  const cacheKey = reportCacheKey('automated', {
    version: reportSchemaVersion,
    accountHomeId: reportCacheAccountId(body),
    group,
    reportType,
    environments: reportCacheEnvironments(body),
    dateRange: body.dateRange || body.filters || {},
    solutionOptions: body.solutionOptions || body.filters || {},
  });
  const cached = await readDailyReportCache(cacheKey);
  if (!body.forceRefresh && !body.saveToDatabase && cached?.kind === 'automated') {
    return cachedAutomatedReport(cached.value);
  }

  const report = await buildAutomatedReport(group, reportType, body);
  await writeDailyReportCache(cacheKey, 'automated', reportCacheAccountId(body), serialiseAutomatedReport(report, {
    reportGroup: group,
    reportSchemaVersion,
  }));
  return report;
}

async function readAutomatedReportSchedule() {
  try {
    const stored = await chrome.storage.local.get(AUTOMATED_REPORT_SCHEDULE_STORAGE_KEY);
    return normalizeAutomatedReportSchedule(
      stored[AUTOMATED_REPORT_SCHEDULE_STORAGE_KEY],
      { preserveState: true },
    );
  } catch {
    return normalizeAutomatedReportSchedule({});
  }
}

function normalizeAutomatedReportSchedule(value = {}, options = {}) {
  const groups = {};
  for (const group of ['ai-events', 'agent-sessions', 'solutions', 'flow-runs']) {
    const source = value.groups?.[group] || {};
    groups[group] = {
      environments: normalizeAutomatedReportEnvironments(source.environments || []),
      dateRange: normalizeAutomatedReportScheduleDateRange(source.dateRange),
      solutionOptions: source.solutionOptions && typeof source.solutionOptions === 'object' ? source.solutionOptions : {},
      saveToDatabase: Boolean(source.saveToDatabase),
      lastRunDate: options.preserveState ? String(source.lastRunDate || '') : '',
      lastStartedAt: options.preserveState ? String(source.lastStartedAt || '') : '',
      lastCompletedAt: options.preserveState ? String(source.lastCompletedAt || '') : '',
      lastDatabaseUpdatedAt: options.preserveState ? String(source.lastDatabaseUpdatedAt || '') : '',
      lastError: options.preserveState ? String(source.lastError || '') : '',
    };
  }
  const saveTrendData = value.saveTrendData === undefined
    ? Object.values(groups).some((group) => group.saveToDatabase)
    : Boolean(value.saveTrendData);
  for (const group of Object.values(groups)) {
    group.saveToDatabase = saveTrendData;
  }
  return {
    enabled: Boolean(value.enabled),
    saveTrendData,
    accountHomeId: String(value.accountHomeId || '').trim(),
    groups,
    lastRunDate: options.preserveState ? String(value.lastRunDate || '') : '',
    lastStartedAt: options.preserveState ? String(value.lastStartedAt || '') : '',
    lastCompletedAt: options.preserveState ? String(value.lastCompletedAt || '') : '',
    lastError: options.preserveState ? String(value.lastError || '') : '',
  };
}

function normalizeAutomatedReportScheduleDateRange(value = {}) {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const range = String(value.range || '').trim().toLowerCase();
  if (!range) {
    return {};
  }
  if (range !== 'custom') {
    return { range };
  }
  return {
    range,
    start: String(value.start || '').trim(),
    end: String(value.end || '').trim(),
  };
}

async function writeAutomatedReportSchedule(schedule) {
  return enqueueAutomatedReportScheduleWrite(async () => {
    const existing = await readAutomatedReportSchedule();
    const next = {
      ...schedule,
      groups: Object.fromEntries(Object.entries(schedule.groups).map(([group, settings]) => [group, {
        ...settings,
        ...automatedReportGroupRunState(existing.groups[group]),
      }])),
      lastRunDate: existing.lastRunDate,
      lastStartedAt: existing.lastStartedAt,
      lastCompletedAt: existing.lastCompletedAt,
      lastError: existing.lastError,
    };
    await persistAutomatedReportScheduleFile(next);
    return next;
  });
}

async function persistAutomatedReportScheduleState(schedule) {
  return enqueueAutomatedReportScheduleWrite(async () => {
    const current = await readAutomatedReportSchedule();
    const next = {
      ...current,
      groups: Object.fromEntries(Object.entries(current.groups).map(([group, settings]) => [group, {
        ...settings,
        ...automatedReportGroupRunState(schedule.groups[group]),
      }])),
      lastRunDate: schedule.lastRunDate,
      lastStartedAt: schedule.lastStartedAt,
      lastCompletedAt: schedule.lastCompletedAt,
      lastError: schedule.lastError,
    };
    await persistAutomatedReportScheduleFile(next);
    return next;
  });
}

function automatedReportGroupRunState(group = {}) {
  return {
    lastRunDate: String(group.lastRunDate || ''),
    lastStartedAt: String(group.lastStartedAt || ''),
    lastCompletedAt: String(group.lastCompletedAt || ''),
    lastDatabaseUpdatedAt: String(group.lastDatabaseUpdatedAt || ''),
    lastError: String(group.lastError || ''),
  };
}

async function enqueueAutomatedReportScheduleWrite(action) {
  const run = automatedReportScheduleWriteQueue.then(action, action);
  automatedReportScheduleWriteQueue = run.catch(() => {});
  return run;
}

async function persistAutomatedReportScheduleFile(schedule) {
  await chrome.storage.local.set({
    [AUTOMATED_REPORT_SCHEDULE_STORAGE_KEY]: schedule,
  });
}

async function readWeeklyReportSettings() {
  try {
    const stored = await chrome.storage.local.get(WEEKLY_REPORT_SETTINGS_STORAGE_KEY);
    return normalizeWeeklyReportSettings(stored[WEEKLY_REPORT_SETTINGS_STORAGE_KEY]);
  } catch {
    return normalizeWeeklyReportSettings({});
  }
}

function normalizeWeeklyReportSettings(value = {}, existing = {}) {
  const sourceEnvironments = value.environments === undefined ? existing.environments : value.environments;
  const accountHomeId = String(value.accountHomeId || existing.accountHomeId || '').trim();
  const previousAccountHomeId = String(existing.accountHomeId || '').trim();
  const accountChanged = Boolean(previousAccountHomeId && accountHomeId !== previousAccountHomeId);
  const sourceEnvironmentSync = accountChanged
    ? {}
    : value.environmentSync === undefined ? existing.environmentSync : value.environmentSync;
  return {
    enabled: Boolean(value.enabled),
    accountHomeId,
    environments: normalizeAutomatedReportEnvironments(sourceEnvironments || []),
    lastCheckedAt: String(value.lastCheckedAt ?? existing.lastCheckedAt ?? ''),
    lastCompletedAt: String(value.lastCompletedAt ?? existing.lastCompletedAt ?? ''),
    lastError: String(value.lastError ?? existing.lastError ?? ''),
    lastCapturedEvents: Number(value.lastCapturedEvents ?? existing.lastCapturedEvents ?? 0),
    environmentSync: normalizeWeeklyEnvironmentSync(sourceEnvironmentSync),
  };
}

function normalizeWeeklyEnvironmentSync(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([environmentId, state]) => {
    const key = String(environmentId || '').trim();
    if (!key || !state || typeof state !== 'object') return [];
    return [[key, {
      lastSuccessfulSyncAt: String(state.lastSuccessfulSyncAt || ''),
      lastFullReconcileAt: String(state.lastFullReconcileAt || ''),
      lastError: String(state.lastError || ''),
    }]];
  }));
}

async function writeWeeklyReportSettings(settings) {
  await chrome.storage.local.set({
    [WEEKLY_REPORT_SETTINGS_STORAGE_KEY]: settings,
  });
  return settings;
}

async function updateWeeklyReportRunState(patch) {
  const current = await readWeeklyReportSettings();
  return writeWeeklyReportSettings(normalizeWeeklyReportSettings({
    ...current,
    ...patch,
  }));
}

function weeklyEnvironmentId(environment = {}) {
  return String(environment.environmentId || environment.environmentName || environment.name || environment.orgUrl || '').trim();
}

function groupWeeklyEventsByEnvironment(events = []) {
  const grouped = new Map();
  for (const event of events) {
    const environmentId = String(event.environmentId || event.environmentUrl || '').trim();
    if (!grouped.has(environmentId)) grouped.set(environmentId, []);
    grouped.get(environmentId).push(event);
  }
  return grouped;
}

export async function checkWeeklyReportTracking(options = {}) {
  if (weeklyReportTrackingRunning) {
    return { status: 'running', ...(await readWeeklyReportSettings()) };
  }
  const stored = await readWeeklyReportSettings();
  const accountHomeId = String(options.accountHomeId || stored.accountHomeId || '').trim();
  const environments = options.environments === undefined
    ? stored.environments
    : normalizeAutomatedReportEnvironments(options.environments);
  const force = Boolean(options.force);
  if (!stored.enabled && !force) {
    return { status: 'disabled', ...stored };
  }
  if (!accountHomeId || !environments.length) {
    return { status: 'not-configured', ...stored };
  }
  const lastChecked = Date.parse(stored.lastCheckedAt || '');
  const requiresInitialSync = environments.some((environment) => {
    const syncState = stored.environmentSync?.[weeklyEnvironmentId(environment)];
    return !Number.isFinite(Date.parse(syncState?.lastSuccessfulSyncAt || ''));
  });
  if (!force && !requiresInitialSync && Number.isFinite(lastChecked) && Date.now() - lastChecked < WEEKLY_REPORT_CHECK_INTERVAL_MS) {
    return { status: 'not-due', ...stored };
  }

  weeklyReportTrackingRunning = true;
  const startedAt = new Date().toISOString();
  await updateWeeklyReportRunState({ lastCheckedAt: startedAt, lastError: '' });
  try {
    await applyAccountHomeId(accountHomeId);
    const cutoff = weeklyRetentionCutoff();
    const existingEvents = await weeklyListEvents(accountHomeId);
    const eventsByEnvironment = groupWeeklyEventsByEnvironment(existingEvents);
    const environmentSync = { ...(stored.environmentSync || {}) };
    const startedAtMs = Date.parse(startedAt);
    const outcomes = await mapWithConcurrency(environments, AUTOMATED_SOLUTION_ENVIRONMENT_CONCURRENCY, async (environment) => {
      const environmentId = weeklyEnvironmentId(environment);
      const syncState = environmentSync[environmentId] || {};
      const lastSuccessfulSync = Date.parse(syncState.lastSuccessfulSyncAt || '');
      const lastFullReconcile = Date.parse(syncState.lastFullReconcileAt || '');
      const fullReconcile = Boolean(
        options.full ||
        !Number.isFinite(lastSuccessfulSync) ||
        !Number.isFinite(lastFullReconcile) ||
        startedAtMs - lastFullReconcile >= WEEKLY_REPORT_FULL_RECONCILE_INTERVAL_MS
      );
      const sinceInstant = fullReconcile
        ? new Date(`${cutoff}T00:00:00`).toISOString()
        : new Date(Math.max(0, lastSuccessfulSync - WEEKLY_REPORT_QUERY_OVERLAP_MS)).toISOString();
      try {
        return {
          environment,
          environmentId,
          fullReconcile,
          events: await collectWeeklySolutionEvents(environment, accountHomeId, {
            cutoffDate: cutoff,
            sinceInstant,
            existingEvents: eventsByEnvironment.get(environmentId) || [],
          }),
          error: '',
        };
      } catch (error) {
        return { environment, environmentId, fullReconcile, events: [], error: errorMessage(error) };
      }
    });
    const events = outcomes.flatMap((outcome) => outcome.events);
    if (events.length) {
      await weeklyReplaceEvents(events);
    }
    await weeklyDeleteEventsBefore(cutoff);
    const errors = outcomes.filter((outcome) => outcome.error);
    const completedAt = new Date().toISOString();
    for (const outcome of outcomes) {
      const previous = environmentSync[outcome.environmentId] || {};
      environmentSync[outcome.environmentId] = outcome.error
        ? { ...previous, lastError: outcome.error }
        : {
            ...previous,
            lastSuccessfulSyncAt: startedAt,
            lastFullReconcileAt: outcome.fullReconcile ? startedAt : previous.lastFullReconcileAt || '',
            lastError: '',
          };
    }
    const runState = await updateWeeklyReportRunState({
      lastCheckedAt: startedAt,
      lastCompletedAt: completedAt,
      lastCapturedEvents: events.length,
      lastError: errors.map((outcome) => `${outcome.environment.displayName}: ${outcome.error}`).join(' | '),
      environmentSync,
    });
    return {
      status: errors.length === outcomes.length ? 'error' : errors.length ? 'partial' : 'complete',
      capturedEvents: events.length,
      environmentsChecked: outcomes.length,
      errors: errors.map((outcome) => ({
        environment: outcome.environment.displayName,
        error: outcome.error,
      })),
      ...runState,
    };
  } catch (error) {
    await updateWeeklyReportRunState({ lastError: errorMessage(error) });
    throw error;
  } finally {
    weeklyReportTrackingRunning = false;
  }
}

export async function checkAutomatedReportSchedule() {
  if (automatedReportScheduleRunning) return;
  const schedule = await readAutomatedReportSchedule();
  const today = reportCacheDateKey();
  if (!schedule.enabled) return;
  const runnable = Object.entries(schedule.groups)
    .filter(([, group]) => group.environments.length);
  const due = runnable.filter(([, group]) => group.lastRunDate !== today);
  if (!due.length) return;

  automatedReportScheduleRunning = true;
  schedule.lastStartedAt = new Date().toISOString();
  schedule.lastError = '';
  await persistAutomatedReportScheduleState(schedule);
  try {
    await applyAccountHomeId(schedule.accountHomeId);
    for (const [group, settings] of due) {
      settings.lastStartedAt = new Date().toISOString();
      settings.lastError = '';
      await persistAutomatedReportScheduleState(schedule);
      try {
        await getOrBuildCachedAutomatedReport(group, 'both', {
          accountHomeId: schedule.accountHomeId,
          environments: settings.environments,
          dateRange: settings.dateRange,
          solutionOptions: settings.solutionOptions,
          saveToDatabase: settings.saveToDatabase,
          forceRefresh: true,
        });
        settings.lastRunDate = today;
        settings.lastCompletedAt = new Date().toISOString();
        settings.lastDatabaseUpdatedAt = settings.saveToDatabase ? settings.lastCompletedAt : '';
        console.log(`Scheduled ${group} report completed for ${today}${settings.saveToDatabase ? ' and trend data was updated' : ''}.`);
      } catch (error) {
        settings.lastError = errorMessage(error);
        schedule.lastError = `${group}: ${settings.lastError}`;
        console.error(`Scheduled ${group} report failed for ${today}: ${settings.lastError}`);
      }
      await persistAutomatedReportScheduleState(schedule);
    }
    if (runnable.every(([, settings]) => settings.lastRunDate === today)) {
      schedule.lastRunDate = today;
      schedule.lastCompletedAt = new Date().toISOString();
      schedule.lastError = '';
      console.log(`All scheduled reports completed for ${today}.`);
    }
  } catch (error) {
    schedule.lastError = errorMessage(error);
    for (const [, settings] of due) {
      if (settings.lastRunDate !== today) {
        settings.lastError = schedule.lastError;
      }
    }
    console.error(`Scheduled report account setup failed for ${today}: ${schedule.lastError}`);
  } finally {
    await persistAutomatedReportScheduleState(schedule);
    automatedReportScheduleRunning = false;
  }
}

function logAutomatedReportScheduleError(error) {
  console.error(`Scheduled report check failed: ${errorMessage(error)}`);
}

async function getStartupTaskStatus() {
  return {
    supported: false,
    installed: false,
    backgroundEnabled: false,
    autoStartEnabled: false,
    definitionHealthy: true,
    taskName: STARTUP_TASK_NAME,
    taskState: 'Unsupported',
    processMode: 'foreground',
    health: 'unsupported',
  };
}

async function setStartupTaskSettings(body = {}) {
  throw new HttpError(400, 'Background server management is not available in the browser extension.');
}

function scheduleBackgroundServerStop() {
  return {};
}

async function getOrBuildCachedReportsSummary(body = {}) {
  const cacheKey = reportCacheKey('summary', {
    version: 3,
    accountHomeId: reportCacheAccountId(body),
    environments: reportCacheEnvironments(body),
  });
  const cached = await readDailyReportCache(cacheKey);
  if (cached?.kind === 'summary') {
    return { ...cached.value, cached: true };
  }

  const summary = await buildReportsSummary(body);
  await writeDailyReportCache(cacheKey, 'summary', reportCacheAccountId(body), summary);
  return { ...summary, cached: false };
}

function reportCacheAccountId(body = {}) {
  return String(body.accountHomeId || body.selectedAccountHomeId || selected.accountHomeId || '').trim();
}

function reportCacheEnvironments(body = {}) {
  return normalizeAutomatedReportEnvironments(body.environments || body.environmentSelections || [])
    .map((environment) => ({
      environmentId: environment.environmentId,
      orgUrl: environment.orgUrl,
    }))
    .sort((left, right) => `${left.environmentId}|${left.orgUrl}`.localeCompare(`${right.environmentId}|${right.orgUrl}`));
}

function reportCacheKey(kind, value) {
  return createHash('sha256')
    .update(JSON.stringify({ date: reportCacheDateKey(), kind, value }))
    .digest('hex');
}

function reportCacheDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function readDailyReportCache(cacheKey) {
  try {
    return await reportCacheGetEntry(reportCacheDateKey(), cacheKey);
  } catch {
    return null;
  }
}

async function writeDailyReportCache(cacheKey, kind, accountHomeId, value) {
  const dateKey = reportCacheDateKey();
  try {
    await reportCachePutEntry(dateKey, cacheKey, {
      version: 1,
      kind,
      accountHomeId,
      createdAt: new Date().toISOString(),
      value,
    });
  } catch (error) {
    console.warn(`Unable to persist ${kind} report cache: ${errorMessage(error)}`);
  }
}

function serialiseAutomatedReport(report, metadata = {}) {
  const files = Array.isArray(report?.files) ? report.files : [report];
  return {
    reportGroup: metadata.reportGroup || '',
    reportSchemaVersion: Number(metadata.reportSchemaVersion || 1),
    multiple: Array.isArray(report?.files),
    files: files.map((file) => ({
      filename: file.filename,
      base64: Buffer.from(file.bytes).toString('base64'),
    })),
  };
}

function cachedAutomatedReport(value = {}) {
  const files = (Array.isArray(value.files) ? value.files : []).map((file) => ({
    filename: file.filename,
    bytes: Buffer.from(file.base64 || '', 'base64'),
  }));
  return value.multiple ? { files } : files[0];
}

async function listCachedAutomatedReportFiles(accountHomeId = '') {
  const entries = await listDailyAutomatedReportCacheEntries(accountHomeId);
  const seenGroups = new Set();
  return entries.flatMap((entry) => {
    const reportGroup = cachedAutomatedReportGroup(entry);
    if (!reportGroup || seenGroups.has(reportGroup)) {
      return [];
    }
    seenGroups.add(reportGroup);
    return (entry.value?.files || []).map((file) => ({
      filename: file.filename,
      reportGroup,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: file.base64,
      completedAt: entry.createdAt,
    }));
  });
}

function cachedAutomatedReportGroup(entry = {}) {
  const reportGroup = String(entry.value?.reportGroup || '').trim();
  if (reportGroup) {
    return reportGroup;
  }
  const filename = String(entry.value?.files?.[0]?.filename || '').toLowerCase();
  if (filename.startsWith('ai-flow-events-')) return 'ai-events';
  if (filename.startsWith('agent-sessions-')) return 'agent-sessions';
  if (filename.startsWith('solutions-')) return 'solutions';
  if (filename.startsWith('flow-runs-')) return 'flow-runs';
  return '';
}

async function listDailyAutomatedReportCacheEntries(accountHomeId = '') {
  try {
    return (await reportCacheListByDate(reportCacheDateKey()))
      .filter((entry) => entry?.kind === 'automated' && entry.accountHomeId === accountHomeId)
      .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
  } catch {
    return [];
  }
}

async function buildReportsSummaryFromCachedReports(accountHomeId = '') {
  const entries = await listDailyAutomatedReportCacheEntries(accountHomeId);
  if (!entries.length) {
    return null;
  }
  const files = entries.flatMap((entry) => (entry.value?.files || []).map((file) => ({
    ...file,
    createdAt: entry.createdAt,
    reportGroup: entry.value?.reportGroup || '',
    reportSchemaVersion: Number(entry.value?.reportSchemaVersion || 0),
  })));
  const latestFile = (pattern, predicate = () => true) => files.find((file) =>
    pattern.test(String(file.filename || '')) && predicate(file)
  );
  const [aiTotals, aiRaw, agentTotals, solutionTotals, flowTotals] = await Promise.all([
    readCachedWorkbookRows(latestFile(/^ai-flow-events-totals-by-environment-/i)),
    readCachedWorkbookRows(latestFile(/^ai-flow-events-raw-stacked-/i)),
    readCachedWorkbookRows(latestFile(/^agent-sessions-totals-by-environment-/i)),
    readCachedWorkbookRows(latestFile(
      /^solutions-totals-by-environment-/i,
      (file) => file.reportGroup === 'solutions' && file.reportSchemaVersion >= 4,
    )),
    readCachedWorkbookRows(latestFile(/^flow-runs-totals-by-environment-/i)),
  ]);
  const environments = new Map();
  const getEnvironment = (row) => {
    const environmentId = String(row['Environment id'] || '').trim();
    if (!environmentId) {
      return null;
    }
    if (!environments.has(environmentId)) {
      environments.set(environmentId, {
        environmentDisplayName: String(row['Environment display name'] || environmentId).trim() || environmentId,
        environmentId,
        environmentUrl: String(row['Environment url'] || '').trim(),
        flowRuns: { total: 0, successful: 0, failed: 0, successRate: 0, failureRate: 0 },
        aiFlow: { aiBuilderCredits: 0, copilotStudioCredits: 0 },
        copilotSessions: 0,
        solutionCount: 0,
        flowCount: 0,
        codeAppCount: 0,
        canvasAppCount: 0,
        modelDrivenAppCount: 0,
        aiModelCount: 0,
        dataverseTableCount: null,
        copilotStudioAgentCount: 0,
      });
    }
    return environments.get(environmentId);
  };

  for (const row of aiTotals) {
    const target = getEnvironment(row);
    if (!target) continue;
    target.aiFlow.aiBuilderCredits = cachedNumber(row['Sum AI Builder Credits used']);
    target.aiFlow.copilotStudioCredits = cachedNumber(row['Sum Copilot Studio credits used']);
  }
  for (const row of agentTotals) {
    const target = getEnvironment(row);
    if (target) target.copilotSessions = cachedNumber(row['Total Sessions']);
  }
  for (const row of flowTotals) {
    const target = getEnvironment(row);
    if (!target) continue;
    target.flowRuns.total = cachedNumber(row['Total flow runs']);
    target.flowRuns.successful = cachedNumber(row['Successful flow runs']);
    target.flowRuns.failed = cachedNumber(row['Failed flow runs']);
    target.flowRuns.successRate = target.flowRuns.total ? target.flowRuns.successful / target.flowRuns.total : 0;
    target.flowRuns.failureRate = target.flowRuns.total ? target.flowRuns.failed / target.flowRuns.total : 0;
  }
  for (const row of solutionTotals) {
    const target = getEnvironment(row);
    if (!target) continue;
    target.solutionCount = cachedNumber(row['Included solutions']);
    target.flowCount = cachedNumber(row['# of flows']);
    target.codeAppCount = cachedNumber(row['# of Code Apps']);
    target.canvasAppCount = cachedNumber(row['# of Canvas Apps']);
    target.modelDrivenAppCount = cachedNumber(row['# of Model Driven Apps']);
    target.aiModelCount = cachedNumber(row['# of AI models']);
    target.copilotStudioAgentCount = cachedNumber(row['# of Copilot Studio Agents']);
    if (Object.prototype.hasOwnProperty.call(row, 'Custom Dataverse tables')) {
      target.dataverseTableCount = cachedNumber(row['Custom Dataverse tables']);
    }
  }

  const modelMix = new Map();
  for (const row of aiRaw) {
    const model = String(row.Model || '').trim() || 'Unspecified model';
    modelMix.set(model, (modelMix.get(model) || 0) + 1);
  }
  const rows = [...environments.values()]
    .map((environment) => ({ ...environment, dataverseTableCount: Number(environment.dataverseTableCount || 0) }))
    .sort((left, right) => left.environmentDisplayName.localeCompare(right.environmentDisplayName));
  if (!rows.length) {
    return null;
  }
  return {
    cached: true,
    generatedAt: files[0]?.createdAt || new Date().toISOString(),
    rows,
    modelMix: [...modelMix.entries()]
      .map(([model, eventCount]) => ({ model, eventCount }))
      .sort((left, right) => right.eventCount - left.eventCount || left.model.localeCompare(right.model)),
  };
}

async function readCachedWorkbookRows(file) {
  if (!file?.base64) {
    return [];
  }
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(file.base64, 'base64'));
    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      return [];
    }
    const headers = new Map();
    worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      headers.set(columnNumber, String(cell.text || '').trim());
    });
    const rows = [];
    worksheet.eachRow({ includeEmpty: false }, (worksheetRow, rowNumber) => {
      if (rowNumber === 1) return;
      const row = {};
      for (const [columnNumber, header] of headers) {
        row[header] = cachedCellValue(worksheetRow.getCell(columnNumber).value);
      }
      rows.push(row);
    });
    return rows;
  } catch {
    return [];
  }
}

function cachedCellValue(value) {
  if (value && typeof value === 'object' && 'result' in value) {
    return value.result;
  }
  return value ?? '';
}

function cachedNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function enqueueReportTrendWrite(action) {
  const run = reportTrendWriteQueue.then(action, action);
  reportTrendWriteQueue = run.catch(() => {});
  return run;
}

async function saveAutomatedReportTrendSnapshot({ accountHomeId, group, rows, dateRange = null, sourceGroups = [], solutionOptions = null }) {
  const definition = reportTotalTableDefinition(group);
  if (!definition) {
    return;
  }
  const totalRows = Array.isArray(rows) ? rows : [];
  if (!totalRows.length) {
    return;
  }
  const collectedAt = new Date().toISOString();
  const dateRan = reportCacheDateKey();
  const rangeKey = dateRange ? `${dateRange.range || 'custom'}:${dateRange.startDate || ''}:${dateRange.endDate || ''}` : 'snapshot';
  const rangeLabel = dateRange ? dateRangeLabel(dateRange) : 'snapshot';
  const backfillSnapshots = buildAutomatedReportTrendBackfillSnapshots({
    group,
    sourceGroups,
    dateRange,
    dateRan,
  });
  const buildSolutionBackfillRows = buildSolutionTrendBackfillRowsBuilder({ group, sourceGroups, solutionOptions });
  const normalizedAccountHomeId = String(accountHomeId || '').trim();
  await enqueueReportTrendWrite(async () => {
    const storedRows = await trendSelectRows(definition.tableName);
    const missingDaySnapshots = [...backfillSnapshots];
    if (buildSolutionBackfillRows && isDateOnlyString(dateRan)) {
      // Solutions are a point-in-time inventory with no date range, so any
      // day missed since tracking began is identified from the stored
      // snapshot dates and rebuilt from each solution's createdOn date.
      const existingDates = [...new Set(storedRows
        .filter((row) => row.account_home_id === normalizedAccountHomeId && row.date_ran < dateRan)
        .map((row) => String(row.date_ran || ''))
        .filter(isDateOnlyString))]
        .sort();
      if (existingDates.length) {
        const existingDateSet = new Set(existingDates);
        for (let cursor = addDays(parseDateOnly(existingDates[0], 'start'), 1); toDateOnlyString(cursor) < dateRan; cursor = addDays(cursor, 1)) {
          const snapshotDate = toDateOnlyString(cursor);
          if (!existingDateSet.has(snapshotDate)) {
            missingDaySnapshots.push({ dateRan: snapshotDate, rows: buildSolutionBackfillRows(snapshotDate) });
          }
        }
      }
    }
    const firstBackfillDate = missingDaySnapshots
      .map((snapshot) => snapshot.dateRan)
      .filter(isDateOnlyString)
      .sort()[0] || '';
    const existingBackfillRows = firstBackfillDate
      ? storedRows.filter((row) =>
          row.account_home_id === normalizedAccountHomeId
          && row.date_ran >= firstBackfillDate
          && row.date_ran < dateRan)
      : [];
    const existingBackfillKeys = new Set(existingBackfillRows.map((row) =>
      `${row.date_ran}:${reportTrendEnvironmentKey(row)}`));
    const records = [];
    const appendRows = (snapshotDate, snapshotRows, { onlyMissing = false } = {}) => {
      for (const row of snapshotRows) {
        const snapshotKey = `${snapshotDate}:${reportTrendEnvironmentKey(row)}`;
        if (onlyMissing && existingBackfillKeys.has(snapshotKey)) {
          continue;
        }
        records.push({
          account_home_id: normalizedAccountHomeId,
          date_ran: snapshotDate,
          collected_at: collectedAt,
          range_key: rangeKey,
          range_label: rangeLabel,
          ...Object.fromEntries(definition.columns.map(([header, key, type]) => [
            key,
            sqlReportTotalValue(row[header], type),
          ])),
        });
        existingBackfillKeys.add(snapshotKey);
      }
    };
    appendRows(dateRan, totalRows);
    for (const snapshot of missingDaySnapshots) {
      appendRows(snapshot.dateRan, snapshot.rows, { onlyMissing: true });
    }
    await trendDeleteRows(
      definition.tableName,
      (row) => row.account_home_id === normalizedAccountHomeId && row.date_ran === dateRan,
    );
    await trendInsertRows(definition.tableName, records);
    await trendDeleteRows(
      definition.tableName,
      (row) => row.date_ran < reportTrendRetentionCutoffDate(),
    );
  });
}

function buildAutomatedReportTrendBackfillSnapshots({ group, sourceGroups, dateRange, dateRan }) {
  const totalsBuilder = {
    'ai-events': buildAutomatedAiEventTotalsRows,
    'agent-sessions': buildAutomatedAgentSessionTotalsRows,
    'flow-runs': buildAutomatedFlowRunTotalsRows,
  }[group];
  const groups = Array.isArray(sourceGroups) ? sourceGroups : [];
  const startDate = String(dateRange?.startDate || '');
  if (!totalsBuilder || !groups.length || !isDateOnlyString(startDate)
    || !isDateOnlyString(dateRan) || startDate >= dateRan) {
    return [];
  }
  const endDate = isDateOnlyString(String(dateRange?.endDate || '')) ? String(dateRange.endDate) : dateRan;

  const timestampedGroups = groups.map(({ environment, rows }) => ({
    environment,
    rows: (Array.isArray(rows) ? rows : [])
      .map((row) => ({ row, date: reportSourceRowDate(group, row) }))
      .filter((item) => item.date && item.date >= startDate && item.date <= dateRan),
  }));
  const snapshots = [];
  for (let cursor = parseDateOnly(startDate, 'start');
    toDateOnlyString(cursor) < dateRan && toDateOnlyString(cursor) <= endDate;
    cursor = addDays(cursor, 1)) {
    const snapshotDate = toDateOnlyString(cursor);
    snapshots.push({
      dateRan: snapshotDate,
      rows: totalsBuilder(timestampedGroups.map(({ environment, rows }) => ({
        environment,
        rows: rows.filter((item) => item.date <= snapshotDate).map((item) => item.row),
      }))),
    });
  }
  return snapshots;
}

function buildSolutionTrendBackfillRowsBuilder({ group, sourceGroups, solutionOptions }) {
  if (group !== 'solutions' || !solutionOptions) {
    return null;
  }
  const groups = (Array.isArray(sourceGroups) ? sourceGroups : []).map(({ environment, rows, totalBeforeFilters, dataverseTableCount }) => ({
    environment,
    totalBeforeFilters,
    dataverseTableCount,
    rows: (Array.isArray(rows) ? rows : [])
      .map((row) => ({ row, date: reportSourceRowDate(group, row) })),
  }));
  if (!groups.length) {
    return null;
  }
  return (snapshotDate) => buildAutomatedSolutionTotalsRows(groups.map(({ environment, totalBeforeFilters, dataverseTableCount, rows }) => ({
    environment,
    totalBeforeFilters,
    dataverseTableCount,
    rows: rows.filter((item) => item.date && item.date <= snapshotDate).map((item) => item.row),
  })), solutionOptions);
}

function reportSourceRowDate(group, row = {}) {
  const value = group === 'ai-events'
    ? row.createdOnRaw || row.createdOn
    : group === 'agent-sessions'
      ? row.conversationStartTime
      : group === 'solutions'
        ? row.createdon
        : row.startTimeRaw || row.startTimeDisplay;
  const text = String(value || '').trim();
  const dateOnly = text.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || '';
  if (dateOnly) {
    return isDateOnlyString(dateOnly) ? dateOnly : '';
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function isDateOnlyString(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return false;
  }
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return parsed.getUTCFullYear() === Number(match[1])
    && parsed.getUTCMonth() === Number(match[2]) - 1
    && parsed.getUTCDate() === Number(match[3]);
}

function reportTrendEnvironmentKey(row = {}) {
  return String(row['Environment id'] ?? row.environment_id ?? '').trim()
    || String(row['Environment url'] ?? row.environment_url ?? '').trim()
    || String(row['Environment display name'] ?? row.environment_display_name ?? '').trim();
}

function sqlReportTotalValue(value, type) {
  if (type === 'REAL') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return String(value ?? '');
}

function reportTotalTableDefinition(group) {
  return REPORT_TOTAL_TABLE_DEFINITIONS[group] || null;
}

async function listReportTrendSnapshots(filters = {}) {
  const dateRange = getReportTrendDateRange(filters);
  const accountHomeId = String(filters.accountHomeId || '').trim();
  const tables = [];
  for (const definition of Object.values(REPORT_TOTAL_TABLE_DEFINITIONS)) {
    const result = (await trendSelectRows(definition.tableName))
      .filter((row) =>
        row.account_home_id === accountHomeId
        && row.date_ran >= dateRange.startDate
        && row.date_ran <= dateRange.endDate)
      .sort((left, right) =>
        String(left.collected_at || '').localeCompare(String(right.collected_at || ''))
        || Number(left.id || 0) - Number(right.id || 0));
    const latestRows = new Map();
    for (const row of result) {
      const environmentKey = String(row.environment_id || '').trim()
        || String(row.environment_url || '').trim()
        || String(row.environment_display_name || '').trim()
        || String(row.id);
      latestRows.set(`${row.date_ran}:${environmentKey}`, row);
    }
    let selectedRows = [...latestRows.values()];
    if (filters.latestOnly) {
      const latestByEnvironment = new Map();
      for (const row of selectedRows) {
        const environmentKey = String(row.environment_id || '').trim()
          || String(row.environment_url || '').trim()
          || String(row.environment_display_name || '').trim()
          || String(row.id);
        const existing = latestByEnvironment.get(environmentKey);
        if (!existing || `${row.collected_at}:${row.date_ran}:${row.id}` > `${existing.collected_at}:${existing.date_ran}:${existing.id}`) {
          latestByEnvironment.set(environmentKey, row);
        }
      }
      selectedRows = [...latestByEnvironment.values()];
    }
    const rows = selectedRows.map((row) => ({
      id: row.id,
      dateRan: row.date_ran,
      collectedAt: row.collected_at,
      rangeKey: row.range_key,
      rangeLabel: row.range_label,
      values: Object.fromEntries(definition.columns.map(([label, key, type]) => [
        key,
        type === 'REAL' ? Number(row[key] || 0) : String(row[key] ?? ''),
      ])),
    })).sort((left, right) => `${left.dateRan}:${left.values.environment_display_name || ''}`
      .localeCompare(`${right.dateRan}:${right.values.environment_display_name || ''}`));
    tables.push({
      tableName: definition.tableName,
      reportKey: definition.reportKey,
      reportLabel: definition.reportLabel,
      columns: definition.columns.map(([label, key, type]) => ({
        label,
        key,
        type,
        numeric: type === 'REAL',
      })),
      rows,
    });
  }
  return {
    range: {
      range: dateRange.range,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    },
    retentionDays: REPORT_TREND_RETENTION_DAYS,
    tables,
    rows: tables.flatMap((table) => table.rows.map((row) => ({
      tableName: table.tableName,
      reportKey: table.reportKey,
      reportLabel: table.reportLabel,
      dateRan: row.dateRan,
      collectedAt: row.collectedAt,
    }))),
  };
}

async function listSqlTables() {
  const tableNames = getUserSqlTableNames();
  const tables = await Promise.all(tableNames.map((name) => getSqlTableInfo(name)));
  return {
    database: 'report-trends.sqlite',
    dataPath: 'IndexedDB (pdac-server)',
    tables,
    totalRows: tables.reduce((sum, table) => sum + table.rowCount, 0),
    totalStorageBytes: tables.reduce((sum, table) => sum + table.storageBytes, 0),
  };
}

function getUserSqlTableNames() {
  return Object.values(REPORT_TOTAL_TABLE_DEFINITIONS)
    .map((definition) => definition.tableName)
    .sort();
}

async function getSqlTableInfo(name) {
  const rows = await getFlatSqlTableRows(name);
  const storageBytes = Buffer.byteLength(JSON.stringify(rows), 'utf8');
  const definition = reportTotalTableDefinitionByName(name);
  return {
    name,
    label: definition?.reportLabel || name,
    rowCount: rows.length,
    storageBytes,
  };
}

function reportTotalTableDefinitionByName(tableName) {
  return Object.values(REPORT_TOTAL_TABLE_DEFINITIONS)
    .find((definition) => definition.tableName === tableName) || null;
}

function trendDataImportColumns(definition) {
  return [
    'account_home_id',
    'date_ran',
    'collected_at',
    'range_key',
    'range_label',
    ...definition.columns.map(([, key]) => key),
  ];
}

async function buildTrendDataImportTemplate(accountHomeId = '') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PDAC';
  workbook.created = new Date();
  const instructions = workbook.addWorksheet('Instructions', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  instructions.columns = [
    { header: 'Worksheet', key: 'worksheet', width: 36 },
    { header: 'Report', key: 'report', width: 24 },
    { header: 'Import rules', key: 'rules', width: 90 },
  ];
  instructions.addRows([
    {
      worksheet: 'All trend worksheets',
      report: 'Required fields',
      rules: 'Keep worksheet names and headers unchanged. Each row needs date_ran (YYYY-MM-DD) and at least one of environment_id, environment_url, or environment_display_name.',
    },
    {
      worksheet: 'All trend worksheets',
      report: 'Account',
      rules: `Set account_home_id, or leave it blank to use the currently selected account${accountHomeId ? ` (${accountHomeId})` : ''}.`,
    },
    {
      worksheet: 'All trend worksheets',
      report: 'Optional fields',
      rules: 'collected_at defaults to midnight UTC on date_ran. range_key defaults to import and range_label defaults to Imported trend data.',
    },
    {
      worksheet: 'All trend worksheets',
      report: 'Replacing rows',
      rules: 'An imported row replaces existing rows with the same worksheet, account, date, and environment identity.',
    },
    ...Object.values(REPORT_TOTAL_TABLE_DEFINITIONS).map((definition) => ({
      worksheet: definition.tableName,
      report: definition.reportLabel,
      rules: `Numeric columns: ${definition.columns.filter(([, , type]) => type === 'REAL').map(([, key]) => key).join(', ') || 'none'}.`,
    })),
  ]);
  styleSqlWorksheet(instructions, 3, instructions.rowCount - 1);

  for (const definition of Object.values(REPORT_TOTAL_TABLE_DEFINITIONS)) {
    const worksheet = workbook.addWorksheet(definition.tableName, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const columns = trendDataImportColumns(definition);
    worksheet.columns = columns.map((column) => ({
      header: column,
      key: column,
      width: columnWidth(column),
    }));
    styleSqlWorksheet(worksheet, columns.length, 0);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function parseTrendDataImportWorkbook(xlsxBase64, fallbackAccountHomeId = '') {
  const encoded = String(xlsxBase64 || '').trim();
  if (!encoded) {
    throw new HttpError(400, 'Choose an Excel .xlsx file to import.');
  }
  if (encoded.length > 28 * 1024 * 1024) {
    throw new HttpError(413, 'The trend data workbook is too large. The maximum file size is 20 MB.');
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(encoded, 'base64'));
  } catch {
    throw new HttpError(400, 'The selected file is not a valid Excel .xlsx workbook.');
  }

  const normalizedFallbackAccountHomeId = String(fallbackAccountHomeId || '').trim();
  const imports = [];
  let recognizedWorksheets = 0;
  let importedRows = 0;
  for (const definition of Object.values(REPORT_TOTAL_TABLE_DEFINITIONS)) {
    const worksheet = workbook.getWorksheet(definition.tableName);
    if (!worksheet) {
      continue;
    }
    recognizedWorksheets += 1;
    const expectedHeaders = trendDataImportColumns(definition);
    const headerRow = worksheet.getRow(1);
    const actualHeaders = [];
    for (let column = 1; column <= Math.max(headerRow.cellCount, expectedHeaders.length + 1); column += 1) {
      actualHeaders.push(String(headerRow.getCell(column).text || '').trim());
    }
    while (actualHeaders.at(-1) === '') {
      actualHeaders.pop();
    }
    const legacyIdColumn = actualHeaders[0] === 'id';
    const comparableHeaders = legacyIdColumn ? actualHeaders.slice(1) : actualHeaders;
    if (comparableHeaders.length !== expectedHeaders.length
      || comparableHeaders.some((header, index) => header !== expectedHeaders[index])) {
      throw new HttpError(
        400,
        `Worksheet "${definition.tableName}" headers do not match the PDAC export/import format. Download a new template and keep its headers unchanged.`,
      );
    }

    const rowsByKey = new Map();
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const worksheetRow = worksheet.getRow(rowNumber);
      const values = Object.fromEntries(expectedHeaders.map((header, index) => [
        header,
        trendDataImportCellValue(worksheetRow.getCell(index + 1 + (legacyIdColumn ? 1 : 0))),
      ]));
      if (Object.values(values).every(trendDataImportValueIsBlank)) {
        continue;
      }
      const accountHomeId = String(values.account_home_id || '').trim() || normalizedFallbackAccountHomeId;
      if (!accountHomeId) {
        throw new HttpError(400, `Worksheet "${definition.tableName}", row ${rowNumber}: account_home_id is required when no account is selected.`);
      }
      const dateRan = normalizeTrendImportDate(values.date_ran, definition.tableName, rowNumber);
      const collectedAt = normalizeTrendImportTimestamp(
        values.collected_at,
        dateRan,
        definition.tableName,
        rowNumber,
      );
      const record = {
        account_home_id: accountHomeId,
        date_ran: dateRan,
        collected_at: collectedAt,
        range_key: String(values.range_key || '').trim() || 'import',
        range_label: String(values.range_label || '').trim() || 'Imported trend data',
        ...Object.fromEntries(definition.columns.map(([, key, type]) => [
          key,
          sqlReportTotalValue(values[key], type),
        ])),
      };
      if (!reportTrendEnvironmentKey(record)) {
        throw new HttpError(
          400,
          `Worksheet "${definition.tableName}", row ${rowNumber}: provide environment_id, environment_url, or environment_display_name.`,
        );
      }
      rowsByKey.set(trendDataImportRowKey(record), record);
      importedRows += 1;
      if (importedRows > 50_000) {
        throw new HttpError(400, 'The trend data workbook contains more than 50,000 rows.');
      }
    }
    if (rowsByKey.size) {
      imports.push({ definition, rows: [...rowsByKey.values()] });
    }
  }
  if (!recognizedWorksheets) {
    throw new HttpError(400, 'The workbook does not contain any PDAC trend data worksheets. Use the downloadable import template.');
  }
  if (!imports.length) {
    throw new HttpError(400, 'The workbook does not contain any trend data rows to import.');
  }
  return imports;
}

function trendDataImportCellValue(cell) {
  const value = cachedCellValue(cell?.value);
  if (value instanceof Date || value === null || value === undefined || typeof value !== 'object') {
    return value ?? '';
  }
  if (Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text || '').join('');
  }
  if ('text' in value) {
    return value.text;
  }
  return cell?.text || '';
}

function trendDataImportValueIsBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function normalizeTrendImportDate(value, worksheetName, rowNumber) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value || '').trim();
  const dateOnly = text.match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/)?.[1] || '';
  if (!isDateOnlyString(dateOnly)) {
    throw new HttpError(400, `Worksheet "${worksheetName}", row ${rowNumber}: date_ran must use YYYY-MM-DD.`);
  }
  return dateOnly;
}

function normalizeTrendImportTimestamp(value, dateRan, worksheetName, rowNumber) {
  if (trendDataImportValueIsBlank(value)) {
    return `${dateRan}T00:00:00.000Z`;
  }
  const parsed = value instanceof Date ? value : new Date(String(value).trim());
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, `Worksheet "${worksheetName}", row ${rowNumber}: collected_at must be a valid date and time.`);
  }
  return parsed.toISOString();
}

function trendDataImportRowKey(row) {
  return `${row.account_home_id}:${row.date_ran}:${reportTrendEnvironmentKey(row)}`;
}

function trendDataImportSnapshotKey(row) {
  return `${row.account_home_id}:${row.date_ran}`;
}

async function importTrendDataWorkbook(xlsxBase64, fallbackAccountHomeId = '') {
  const imports = await parseTrendDataImportWorkbook(xlsxBase64, fallbackAccountHomeId);
  return enqueueReportTrendWrite(async () => {
    const tableResults = [];
    for (const { definition, rows } of imports) {
      const importSnapshotKeys = new Set(rows.map(trendDataImportSnapshotKey));
      const replacedRows = await trendReplaceRows(
        definition.tableName,
        (row) => importSnapshotKeys.has(trendDataImportSnapshotKey(row)),
        rows,
      );
      await trendDeleteRows(
        definition.tableName,
        (row) => row.date_ran < reportTrendRetentionCutoffDate(),
      );
      tableResults.push({
        tableName: definition.tableName,
        importedRows: rows.length,
        replacedRows,
      });
    }
    return {
      importedRows: tableResults.reduce((sum, table) => sum + table.importedRows, 0),
      replacedRows: tableResults.reduce((sum, table) => sum + table.replacedRows, 0),
      tables: tableResults,
    };
  });
}

function getSqlTableColumnNames(definition) {
  return [
    'id',
    'account_home_id',
    'date_ran',
    'collected_at',
    'range_key',
    'range_label',
    ...definition.columns.map(([, key]) => key),
  ];
}

async function getFlatSqlTableRows(tableName) {
  const definition = reportTotalTableDefinitionByName(tableName);
  if (!definition) {
    throw new HttpError(404, 'SQL table not found.');
  }
  const columns = getSqlTableColumnNames(definition);
  return (await trendSelectRows(tableName))
    .sort((left, right) => Number(left.id || 0) - Number(right.id || 0))
    .map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? ''])));
}

async function exportSqlTablesWorkbook() {
  const tableNames = getUserSqlTableNames();
  const tableInfos = await Promise.all(tableNames.map((name) => getSqlTableInfo(name)));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PDAC';
  workbook.created = new Date();
  const summary = workbook.addWorksheet('SQL Tables', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  summary.columns = [
    { header: 'Table', key: 'name', width: 36 },
    { header: 'Rows', key: 'rowCount', width: 14 },
    { header: 'Storage bytes', key: 'storageBytes', width: 18 },
  ];
  summary.addRows(tableInfos);
  styleSqlWorksheet(summary, 3, tableInfos.length);

  const usedNames = new Set(['SQL Tables']);
  for (const tableName of tableNames) {
    const definition = reportTotalTableDefinitionByName(tableName);
    const rows = await getFlatSqlTableRows(tableName);
    const columns = trendDataImportColumns(definition);
    const worksheet = workbook.addWorksheet(uniqueWorksheetName(tableName, usedNames), {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    worksheet.columns = columns.map((column) => ({
      header: column,
      key: column,
      width: columnWidth(column),
    }));
    worksheet.addRows(rows);
    styleSqlWorksheet(worksheet, columns.length, rows.length);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function exportSingleSqlTableWorkbook(tableName) {
  const tableNames = getUserSqlTableNames();
  if (!tableNames.includes(tableName)) {
    throw new HttpError(404, 'SQL table not found.');
  }
  const definition = reportTotalTableDefinitionByName(tableName);
  const rows = await getFlatSqlTableRows(tableName);
  const columns = trendDataImportColumns(definition);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PDAC';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(uniqueWorksheetName(tableName, new Set()), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  worksheet.columns = columns.map((column) => ({
    header: column,
    key: column,
    width: columnWidth(column),
  }));
  worksheet.addRows(rows);
  styleSqlWorksheet(worksheet, columns.length, rows.length);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function styleSqlWorksheet(worksheet, columnCount, rowCount) {
  if (columnCount > 0) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columnCount },
    };
  }
  const headerRow = worksheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF111827' } };
    cell.alignment = { vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    cell.border = bottomBorder();
  });
  for (let rowNumber = 2; rowNumber <= rowCount + 1; rowNumber += 1) {
    worksheet.getRow(rowNumber).alignment = { vertical: 'top', wrapText: true };
  }
}

function uniqueWorksheetName(name, usedNames) {
  const base = String(name || 'Table').replace(/[\[\]*?:\/\\]/g, ' ').trim().slice(0, 31) || 'Table';
  let candidate = base;
  let index = 2;
  while (usedNames.has(candidate)) {
    const suffix = ` ${index}`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    index += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

async function deleteSqlTableRecords() {
  return enqueueReportTrendWrite(async () => {
    const tableNames = getUserSqlTableNames();
    const before = await Promise.all(tableNames.map((name) => getSqlTableInfo(name)));
    for (const tableName of tableNames) {
      await trendDeleteRows(tableName, () => true);
    }
    return {
      deletedRows: before.reduce((sum, table) => sum + table.rowCount, 0),
      tables: before.map((table) => table.name),
    };
  });
}

function getReportTrendDateRange(filters = {}) {
  const range = String(filters.range || 'month').trim().toLowerCase();
  if (range === 'custom') {
    const start = parseDateOnly(filters.start, 'start');
    const end = parseDateOnly(filters.end, 'end');
    if (end < start) {
      throw new HttpError(400, 'Custom trend range end must be on or after start.');
    }
    return {
      range,
      startDate: toDateOnlyString(start),
      endDate: toDateOnlyString(end),
    };
  }
  const today = atStartOfDay(new Date());
  if (range === 'today') {
    return { range, startDate: toDateOnlyString(today), endDate: toDateOnlyString(today) };
  }
  if (range === '7d') {
    return { range, startDate: toDateOnlyString(addDays(today, -6)), endDate: toDateOnlyString(today) };
  }
  if (range === '28d') {
    return { range, startDate: toDateOnlyString(addDays(today, -27)), endDate: toDateOnlyString(today) };
  }
  if (range === '365d') {
    return { range, startDate: toDateOnlyString(addDays(today, -364)), endDate: toDateOnlyString(today) };
  }
  if (range === 'month') {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { range, startDate: toDateOnlyString(monthStart), endDate: toDateOnlyString(monthEnd) };
  }
  if (range === '730d' || range === '2y') {
    return { range: '730d', startDate: toDateOnlyString(addDays(today, -729)), endDate: toDateOnlyString(today) };
  }
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { range: 'month', startDate: toDateOnlyString(monthStart), endDate: toDateOnlyString(monthEnd) };
}

function reportTrendRetentionCutoffDate() {
  return toDateOnlyString(addDays(atStartOfDay(new Date()), -REPORT_TREND_RETENTION_DAYS));
}

async function buildAutomatedReport(group, reportType, body = {}) {
  const environments = normalizeAutomatedReportEnvironments(body.environments || body.environmentSelections || []);
  if (!environments.length) {
    throw new HttpError(400, 'Select at least one environment for the report.');
  }

  const accountHomeId = String(body.accountHomeId || body.selectedAccountHomeId || selected.accountHomeId || '').trim();
  const dateRange = getAutomatedReportDateRange(group, body.dateRange || body.filters || {});
  const reportProgress = createAutomatedReportProgressReporter(body);
  const saveTrends = Boolean(body.saveToDatabase);
  if (group === 'ai-events') {
    const rowsByEnvironment = await collectAutomatedAiEventRows(environments, dateRange, accountHomeId, reportProgress);
    if (saveTrends && reportType !== 'raw') {
      await saveAutomatedReportTrendSnapshot({
        accountHomeId,
        group,
        rows: buildAutomatedAiEventTotalsRows(rowsByEnvironment),
        dateRange,
        sourceGroups: rowsByEnvironment,
      });
    }
    if (reportType === 'both') {
      return {
        files: [
          await buildAutomatedAiEventTotalsWorkbook(rowsByEnvironment, dateRange),
          await buildAutomatedAiEventRawWorkbook(rowsByEnvironment, dateRange),
        ],
      };
    }
    return reportType === 'totals'
      ? buildAutomatedAiEventTotalsWorkbook(rowsByEnvironment, dateRange)
      : buildAutomatedAiEventRawWorkbook(rowsByEnvironment, dateRange);
  }

  if (group === 'agent-sessions') {
    const rowsByEnvironment = await collectAutomatedAgentSessionRows(environments, dateRange, accountHomeId, reportProgress);
    if (saveTrends && reportType !== 'raw') {
      await saveAutomatedReportTrendSnapshot({
        accountHomeId,
        group,
        rows: buildAutomatedAgentSessionTotalsRows(rowsByEnvironment),
        dateRange,
        sourceGroups: rowsByEnvironment,
      });
    }
    if (reportType === 'both') {
      return {
        files: [
          await buildAutomatedAgentSessionTotalsWorkbook(rowsByEnvironment, dateRange),
          await buildAutomatedAgentSessionRawWorkbook(rowsByEnvironment, dateRange),
        ],
      };
    }
    return reportType === 'totals'
      ? buildAutomatedAgentSessionTotalsWorkbook(rowsByEnvironment, dateRange)
      : buildAutomatedAgentSessionRawWorkbook(rowsByEnvironment, dateRange);
  }

  if (group === 'flow-runs') {
    const flowRunDateRange = getFlowRunDateRange({ range: '7d' });
    const rowsByEnvironment = await collectAutomatedFlowRunRows(environments, flowRunDateRange, accountHomeId, reportProgress);
    if (saveTrends && reportType !== 'raw') {
      await saveAutomatedReportTrendSnapshot({
        accountHomeId,
        group,
        rows: buildAutomatedFlowRunTotalsRows(rowsByEnvironment),
        dateRange: flowRunDateRange,
        sourceGroups: rowsByEnvironment,
      });
    }
    if (reportType === 'both') {
      return {
        files: [
          await buildAutomatedFlowRunTotalsWorkbook(rowsByEnvironment),
          await buildAutomatedFailedFlowRunsWorkbook(rowsByEnvironment),
        ],
      };
    }
    return reportType === 'totals'
      ? buildAutomatedFlowRunTotalsWorkbook(rowsByEnvironment)
      : buildAutomatedFailedFlowRunsWorkbook(rowsByEnvironment);
  }

  const solutionOptions = normalizeAutomatedSolutionOptions(body.solutionOptions || body.filters || {});
  const rowsByEnvironment = await collectAutomatedSolutionRows(environments, solutionOptions, accountHomeId, reportProgress);
  if (saveTrends && reportType !== 'raw') {
    await saveAutomatedReportTrendSnapshot({
      accountHomeId,
      group,
      rows: buildAutomatedSolutionTotalsRows(rowsByEnvironment, solutionOptions),
      sourceGroups: rowsByEnvironment,
      solutionOptions,
    });
  }
  if (reportType === 'both') {
    return {
      files: [
        await buildAutomatedSolutionTotalsWorkbook(rowsByEnvironment, solutionOptions),
        await buildAutomatedSolutionRawWorkbook(rowsByEnvironment, solutionOptions),
      ],
    };
  }
  return reportType === 'totals'
    ? buildAutomatedSolutionTotalsWorkbook(rowsByEnvironment, solutionOptions)
    : buildAutomatedSolutionRawWorkbook(rowsByEnvironment, solutionOptions);
}

function createAutomatedReportProgressReporter(body = {}) {
  const progressId = String(body.reportRunId || '').trim();
  if (!progressId) {
    return null;
  }
  const activeEnvironments = new Map();
  const completedEnvironmentIds = new Set();
  return (environment, index, total, phase = 'start') => {
    const environmentId = environment.environmentId || environment.environmentName || '';
    if (phase === 'complete') {
      activeEnvironments.delete(environmentId);
      completedEnvironmentIds.add(environmentId);
    } else {
      activeEnvironments.set(environmentId, {
        environmentId,
        displayName: environment.displayName || environmentId,
        environmentIndex: index + 1,
      });
    }
    const active = [...activeEnvironments.values()];
    setAutomatedReportProgress(progressId, {
      status: 'running',
      environmentIndex: index + 1,
      totalEnvironments: total,
      completedEnvironments: completedEnvironmentIds.size,
      currentEnvironment: active[0] || null,
      activeEnvironments: active,
    });
  };
}

function setAutomatedReportProgress(progressId, update) {
  if (!progressId) {
    return;
  }
  automatedReportProgress.set(progressId, {
    ...(automatedReportProgress.get(progressId) || {}),
    ...update,
    updatedAt: new Date().toISOString(),
  });
  if (automatedReportProgress.size > 100) {
    const oldest = automatedReportProgress.keys().next().value;
    automatedReportProgress.delete(oldest);
  }
}

function getAutomatedReportDateRange(group, filters = {}) {
  if (group === 'ai-events') {
    return getAiEventDateRange(filters);
  }
  if (group === 'agent-sessions') {
    return getAgentSessionDateRange(filters);
  }
  if (group === 'flow-runs') {
    return getFlowRunDateRange({ range: '7d' });
  }
  return null;
}

function normalizeAutomatedReportEnvironments(environments) {
  return (Array.isArray(environments) ? environments : [])
    .map((environment) => {
      const environmentName = String(environment?.environmentName || environment?.name || environment?.environmentId || '').trim();
      const orgUrl = normalizeOrgUrl(environment?.orgUrl || '');
      const displayName = String(environment?.displayName || environment?.friendlyName || environmentName || orgUrl).trim();
      return {
        environmentName,
        environmentId: environmentName,
        displayName,
        orgUrl,
      };
    })
    .filter((environment) => environment.environmentName && environment.orgUrl);
}

function normalizeAutomatedSolutionOptions(options = {}) {
  const excludedPublishers = String(options.excludedPublishers || options.publisherExclusions || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return {
    excludedPublishers,
    includeManaged: Boolean(options.includeManaged),
    includeMicrosoftOwned: Boolean(options.includeMicrosoftOwned),
  };
}

async function collectAutomatedAiEventRows(environments, dateRange, accountHomeId = '', onEnvironment = null) {
  const groups = [];
  for (const [index, environment] of environments.entries()) {
    onEnvironment?.(environment, index, environments.length);
    const config = await getAiEventFieldConfig(environment.orgUrl, accountHomeId);
    const selectFields = getAiEventSelectFields(config, { includePayload: false });
    const data = await targetDvGetAll(
      environment.orgUrl,
      buildAiEventListPath(selectFields, dateRange),
      { Prefer: AI_EVENT_BATCH_PREFER },
      accountHomeId,
    );
    groups.push({
      environment,
      rows: data
        .map((row) => normalizeAiEventSummary(row, config))
        .filter((row) => Number(row.creditsConsumed || 0) > 0)
        .map((row) => withReportEnvironmentFields(row, environment)),
    });
    onEnvironment?.(environment, index, environments.length, 'complete');
    await delay(450);
  }
  return groups;
}

async function collectAutomatedAgentSessionRows(environments, dateRange, accountHomeId = '', onEnvironment = null) {
  const groups = [];
  for (const [index, environment] of environments.entries()) {
    onEnvironment?.(environment, index, environments.length);
    const path = `${AGENT_SESSION_ENTITY_SET_NAME}?${buildAiEventQueryString({
      '$select': 'conversationtranscriptid,conversationstarttime,name,metadata,_bot_conversationtranscriptid_value',
      '$expand': 'bot_conversationtranscriptId($select=name)',
      '$filter': `conversationstarttime ge ${toODataDateTime(dateRange.start)} and conversationstarttime lt ${toODataDateTime(dateRange.endExclusive)}`,
      '$orderby': 'conversationstarttime desc,createdon desc',
    })}`;
    const data = await targetDvGetAll(environment.orgUrl, path, {
      Prefer: `odata.include-annotations="${ODATA_FORMATTED_VALUE_ANNOTATION}",odata.maxpagesize=500`,
    }, accountHomeId);
    const rows = await mapWithConcurrency(data, 4, async (row) => ({
      ...await normalizeAgentSessionSummary(row, environment.orgUrl, accountHomeId),
      ...reportEnvironmentFields(environment),
    }));
    groups.push({ environment, rows });
    onEnvironment?.(environment, index, environments.length, 'complete');
    await delay(450);
  }
  return groups;
}

async function collectAutomatedFlowRunRows(environments, dateRange, accountHomeId = '', onEnvironment = null) {
  const groups = [];
  for (const [index, environment] of environments.entries()) {
    onEnvironment?.(environment, index, environments.length);
    const data = await targetDvGetAll(
      environment.orgUrl,
      buildFlowRunListPath(dateRange),
      { Prefer: FLOW_RUN_PREFER },
      accountHomeId,
    );
    groups.push({
      environment,
      rows: data.map((row) => withReportEnvironmentFields(
        normalizeFlowRunSummary(row, environment.environmentName),
        environment,
      )),
    });
    onEnvironment?.(environment, index, environments.length, 'complete');
    await delay(450);
  }
  return groups;
}

async function collectWeeklySolutionEvents(environment, accountHomeId, options = {}) {
  const cutoffDate = options.cutoffDate || weeklyRetentionCutoff();
  const sinceInstant = options.sinceInstant || new Date(`${cutoffDate}T00:00:00`).toISOString();
  const solutions = await listWeeklyChangedSolutionsForEnvironment(environment.orgUrl, accountHomeId, sinceInstant);
  if (!solutions.length) {
    return [];
  }
  const existingByKey = new Map((options.existingEvents || []).map((event) => [event.key, event]));
  const pending = solutions.flatMap((solution) => ['created', 'modified'].flatMap((eventType) => {
    const eventAt = eventType === 'created' ? solution.createdon : solution.modifiedon;
    if (eventType === 'modified' && sameWeeklyEventInstant(solution.createdon, solution.modifiedon)) return [];
    if (!eventAt || formatLocalDateKey(eventAt) < cutoffDate) return [];
    const key = weeklySolutionEventKey(solution, eventType, eventAt, environment, accountHomeId);
    const existing = existingByKey.get(key);
    if (existing && (eventType === 'created' || (
      String(existing.eventAt || '') === String(eventAt || '') &&
      String(existing.version || '') === String(solution.version || '')
    ))) {
      return [];
    }
    return [{ solution, eventType, eventAt }];
  }));
  if (!pending.length) {
    return [];
  }
  const pendingSolutions = [...new Map(pending.map((item) => [normalizeGuid(item.solution.solutionid), item.solution])).values()];
  const rawComponents = await listSolutionComponentsForEnvironment(
    environment.orgUrl,
    pendingSolutions.map((solution) => solution.solutionid),
    accountHomeId,
  );
  const reportComponents = await enrichSolutionReportComponentsForEnvironment(
    environment.orgUrl,
    rawComponents,
    accountHomeId,
  );
  const canvasAppTypes = await listCanvasAppTypesForEnvironment(
    environment.orgUrl,
    reportComponents.filter((component) => Number(component.componenttype) === 300).map((component) => component.objectid),
    accountHomeId,
  );
  const typedComponents = reportComponents.map((component) => {
    if (Number(component.componenttype) !== 300 || Number(canvasAppTypes.get(normalizeGuid(component.objectid))?.canvasapptype) !== 4) {
      return component;
    }
    return { ...component, typeLabel: 'Code App' };
  });
  const weeklyComponents = await buildWeeklyComponentsForEnvironment(environment.orgUrl, typedComponents, accountHomeId);
  const componentsBySolution = groupSolutionComponentsBySolution(weeklyComponents);
  return pending.map(({ solution, eventType, eventAt }) => {
    const components = componentsBySolution.get(normalizeGuid(solution.solutionid)) || [];
    const componentCounts = weeklyComponentCounts(components);
    return weeklySolutionEvent(solution, eventType, eventAt, environment, accountHomeId, cutoffDate, components, componentCounts);
  });
}

async function listWeeklyChangedSolutionsForEnvironment(orgUrl, accountHomeId, cutoffInstant) {
  const data = await targetDvGetAll(
    orgUrl,
    `solutions?$select=solutionid,friendlyname,uniquename,version,ismanaged,isvisible,createdon,modifiedon,_publisherid_value&$expand=publisherid($select=publisherid,friendlyname,uniquename)&$filter=(createdon ge ${cutoffInstant} or modifiedon ge ${cutoffInstant})&$orderby=modifiedon desc`,
    {},
    accountHomeId,
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

async function buildWeeklyComponentsForEnvironment(orgUrl, components, accountHomeId) {
  const tracked = components
    .map((component) => ({ component, kind: weeklyComponentKind(component) }))
    .filter((item) => item.kind);
  if (!tracked.length) {
    return [];
  }
  const names = await loadWeeklyComponentNames(orgUrl, tracked.map((item) => item.component), accountHomeId);
  const seen = new Set();
  return tracked.flatMap(({ component, kind }) => {
    const objectId = normalizeGuid(component.objectid);
    const key = `${normalizeGuid(component.solutionid)}:${kind}:${objectId}`;
    if (!objectId || seen.has(key)) {
      return [];
    }
    seen.add(key);
    const definition = WEEKLY_COMPONENT_TYPES.find((item) => item.key === kind);
    const name = names.get(`${kind}:${objectId}`) || component.displayName || objectId;
    return [{
      solutionid: component.solutionid,
      kind,
      label: definition?.label || 'Other',
      objectId,
      name,
      logicalName: component.logicalName || '',
      typeLabel: component.typeLabel || definition?.label || '',
    }];
  });
}

function weeklyComponentKind(component = {}) {
  const componentType = Number(component.componenttype);
  const logicalName = String(component.logicalName || '').toLowerCase();
  const typeLabel = String(component.typeLabel || '').toLowerCase();
  if (logicalName === 'bot') return 'agents';
  if (componentType === 300 && typeLabel.includes('code app')) return 'codeApps';
  if (componentType === 300) return 'canvasApps';
  if (componentType === 80 || logicalName === 'appmodule') return 'modelDrivenApps';
  if (componentType === 29) return 'flows';
  if (componentType === 1) return 'tables';
  return '';
}

async function loadWeeklyComponentNames(orgUrl, components, accountHomeId) {
  const groups = {
    agents: { collection: 'bots', idField: 'botid', select: 'botid,name,schemaname' },
    canvasApps: { collection: 'canvasapps', idField: 'canvasappid', select: 'canvasappid,name,displayname,canvasapptype' },
    codeApps: { collection: 'canvasapps', idField: 'canvasappid', select: 'canvasappid,name,displayname,canvasapptype' },
    modelDrivenApps: { collection: 'appmodules', idField: 'appmoduleid', select: 'appmoduleid,name,uniquename' },
    flows: { collection: 'workflows', idField: 'workflowid', select: 'workflowid,name,uniquename' },
    tables: { collection: 'EntityDefinitions', idField: 'MetadataId', select: 'MetadataId,LogicalName,SchemaName,DisplayName' },
  };
  const names = new Map();
  await Promise.all(Object.entries(groups).map(async ([kind, definition]) => {
    const ids = [...new Set(components
      .filter((component) => weeklyComponentKind(component) === kind)
      .map((component) => normalizeGuid(component.objectid))
      .filter(Boolean))];
    for (const chunk of chunkArray(ids, 20)) {
      const filter = chunk.map((id) => `${definition.idField} eq ${id}`).join(' or ');
      let rows = [];
      try {
        rows = await targetDvGetAll(
          orgUrl,
          `${definition.collection}?$select=${definition.select}&$filter=${filter}`,
          {},
          accountHomeId,
        );
      } catch {
        // Display names are best-effort; IDs still make the component list useful.
      }
      for (const row of rows) {
        const id = normalizeGuid(row[definition.idField]);
        const name = kind === 'tables'
          ? getLabel(row.DisplayName) || row.SchemaName || row.LogicalName
          : pickDisplayName(row) || pickLogicalName(row);
        if (id && name) {
          names.set(`${kind}:${id}`, name);
        }
      }
    }
  }));
  return names;
}

function weeklyComponentCounts(components) {
  const counts = emptyWeeklyComponentCounts();
  for (const component of components) {
    if (Object.hasOwn(counts, component.kind)) {
      counts[component.kind] += 1;
    }
  }
  return counts;
}

function weeklySolutionEvent(solution, eventType, eventAt, environment, accountHomeId, cutoffDate, components, componentCounts) {
  if (!eventAt || formatLocalDateKey(eventAt) < cutoffDate) {
    return null;
  }
  const solutionId = normalizeGuid(solution.solutionid);
  const weekStart = startOfCalendarWeek(eventAt);
  const event = {
    key: weeklySolutionEventKey(solution, eventType, eventAt, environment, accountHomeId),
    accountHomeId,
    environmentId: environment.environmentId,
    environmentDisplayName: environment.displayName,
    environmentUrl: environment.orgUrl,
    solutionId,
    solutionName: solution.friendlyname || solution.uniquename || solutionId,
    uniqueName: solution.uniquename || '',
    version: solution.version || '',
    isManaged: Boolean(solution.ismanaged),
    publisherName: solution.publisher?.friendlyname || solution.publisher?.uniquename || '',
    publisherUniqueName: solution.publisher?.uniquename || '',
    eventType,
    eventAt,
    eventDate: formatLocalDateKey(eventAt),
    weekStart,
    collectedAt: new Date().toISOString(),
    componentCounts,
    components: components.map((component) => ({
      ...component,
      key: `${accountHomeId}:${environment.environmentId}:${solutionId}:${eventType}:${weekStart}:${component.kind}:${component.objectId}`,
    })),
  };
  event.primaryComponent = primaryWeeklyComponent(event);
  return event;
}

function weeklySolutionEventKey(solution, eventType, eventAt, environment, accountHomeId) {
  return `${accountHomeId}:${weeklyEnvironmentId(environment)}:${normalizeGuid(solution.solutionid)}:${eventType}:${startOfCalendarWeek(eventAt)}`;
}

function sameWeeklyEventInstant(left, right) {
  if (!left || !right) return false;
  const leftTime = Date.parse(String(left));
  const rightTime = Date.parse(String(right));
  return Number.isFinite(leftTime) && Number.isFinite(rightTime)
    ? leftTime === rightTime
    : String(left) === String(right);
}

async function collectAutomatedSolutionRows(environments, options, accountHomeId = '', onEnvironment = null) {
  return mapWithConcurrency(environments, AUTOMATED_SOLUTION_ENVIRONMENT_CONCURRENCY, async (environment, index) => {
    onEnvironment?.(environment, index, environments.length);
    const [allSolutions, customDataverseTables] = await Promise.all([
      listSolutionsForEnvironment(environment.orgUrl, accountHomeId),
      targetDvGetAll(environment.orgUrl, dataverseTableMetadataPath('custom'), {}, accountHomeId),
    ]);
    const filteredSolutions = allSolutions.filter((solution) => shouldIncludeAutomatedSolution(solution, options));
    const components = await listSolutionComponentsForEnvironment(
      environment.orgUrl,
      filteredSolutions.map((solution) => solution.solutionid),
      accountHomeId,
    );
    const reportComponents = await enrichSolutionReportComponentsForEnvironment(
      environment.orgUrl,
      components,
      accountHomeId,
    );
    const canvasAppTypes = await listCanvasAppTypesForEnvironment(
      environment.orgUrl,
      reportComponents.filter((component) => Number(component.componenttype) === 300).map((component) => component.objectid),
      accountHomeId,
    );
    const typedComponents = reportComponents.map((component) => {
      if (Number(component.componenttype) !== 300 || Number(canvasAppTypes.get(normalizeGuid(component.objectid))?.canvasapptype) !== 4) {
        return component;
      }
      return { ...component, typeLabel: 'Code App' };
    });
    const componentsBySolution = groupSolutionComponentsBySolution(typedComponents);
    const group = {
      environment,
      rows: filteredSolutions.map((solution) => ({
        ...solution,
        ...solutionReportCountFields(componentsBySolution.get(normalizeGuid(solution.solutionid)) || []),
        ...reportEnvironmentFields(environment),
      })),
      totalBeforeFilters: allSolutions.length,
      dataverseTableCount: customDataverseTables.length,
    };
    onEnvironment?.(environment, index, environments.length, 'complete');
    await delay(450);
    return group;
  });
}

async function listCanvasAppTypesForEnvironment(orgUrl, canvasAppIds, accountHomeId = '') {
  const ids = [...new Set(canvasAppIds.map((value) => normalizeGuid(value)).filter(Boolean))];
  if (!ids.length) {
    return new Map();
  }
  const pages = [];
  for (const chunk of chunkArray(ids, 20)) {
    const filter = chunk.map((canvasAppId) => `canvasappid eq ${canvasAppId}`).join(' or ');
    pages.push(...await targetDvGetAll(
      orgUrl,
      `canvasapps?$select=canvasappid,canvasapptype&$filter=${filter}`,
      {},
      accountHomeId,
    ));
  }
  return new Map(pages.map((app) => [normalizeGuid(app.canvasappid), app]));
}

async function buildReportsSummary(body = {}) {
  const environments = normalizeAutomatedReportEnvironments(body.environments || body.environmentSelections || []);
  if (!environments.length) {
    throw new HttpError(400, 'Select at least one environment for the reports dashboard.');
  }

  const accountHomeId = String(body.accountHomeId || body.selectedAccountHomeId || selected.accountHomeId || '').trim();
  const aiEventDateRange = getAiEventDateRange({ range: 'month' });
  const agentSessionDateRange = getAgentSessionDateRange({ range: 'month' });
  const flowRunDateRange = getFlowRunDateRange({ range: '7d' });
  // Keep the cross-environment dashboard deliberately rate-limited. Each collector
  // already walks environments sequentially with a short pause between calls.
  const aiEventGroups = await collectAutomatedAiEventRows(environments, aiEventDateRange, accountHomeId);
  const agentSessionGroups = await collectAutomatedAgentSessionRows(environments, agentSessionDateRange, accountHomeId);
  const flowRunGroups = await collectAutomatedFlowRunRows(environments, flowRunDateRange, accountHomeId);
  const solutionGroups = await collectAutomatedSolutionRows(environments, {
    excludedPublishers: [],
    includeManaged: true,
    includeMicrosoftOwned: true,
  }, accountHomeId);
  const groupRowsByEnvironment = (groups) => new Map(groups.map((group) => [group.environment.environmentId, group.rows]));
  const aiEventsByEnvironment = groupRowsByEnvironment(aiEventGroups);
  const sessionsByEnvironment = groupRowsByEnvironment(agentSessionGroups);
  const flowRunsByEnvironment = groupRowsByEnvironment(flowRunGroups);
  const solutionsByEnvironment = groupRowsByEnvironment(solutionGroups);
  const solutionGroupsByEnvironment = new Map(solutionGroups.map((group) => [group.environment.environmentId, group]));
  const modelMix = new Map();

  const rows = environments.map((environment) => {
    const aiEvents = aiEventsByEnvironment.get(environment.environmentId) || [];
    const flowRuns = flowRunsByEnvironment.get(environment.environmentId) || [];
    const solutionRows = solutionsByEnvironment.get(environment.environmentId) || [];
    for (const event of aiEvents) {
      const model = String(event.model || '').trim() || 'Unspecified model';
      const current = modelMix.get(model) || { model, eventCount: 0 };
      current.eventCount += 1;
      modelMix.set(model, current);
    }
    const aiBuilderCredits = sumBy(aiEvents.filter((event) => String(event.creditType || '').trim().toLowerCase() === 'ai builder'), 'creditsConsumed');
    const copilotStudioCredits = sumBy(aiEvents.filter((event) => String(event.creditType || '').trim().toLowerCase() === 'copilot studio'), 'creditsConsumed');
    const totalRuns = flowRuns.length;
    const successfulRuns = flowRuns.filter(isSuccessfulFlowRun).length;
    const failedRuns = flowRuns.filter(isFailedFlowRun).length;
    const componentTotals = sumSolutionReportCountFields(solutionRows);
    return {
      environmentDisplayName: environment.displayName,
      environmentId: environment.environmentId,
      flowRuns: {
        total: totalRuns,
        successful: successfulRuns,
        failed: failedRuns,
        successRate: totalRuns ? successfulRuns / totalRuns : 0,
        failureRate: totalRuns ? failedRuns / totalRuns : 0,
      },
      aiFlow: {
        aiBuilderCredits,
        copilotStudioCredits,
      },
      copilotSessions: (sessionsByEnvironment.get(environment.environmentId) || []).length,
      solutionCount: solutionRows.length,
      flowCount: Number(componentTotals['# of flows'] || 0),
      codeAppCount: Number(componentTotals['# of Code Apps'] || 0),
      canvasAppCount: Number(componentTotals['# of Canvas Apps'] || 0),
      modelDrivenAppCount: Number(componentTotals['# of Model Driven Apps'] || 0),
      aiModelCount: Number(componentTotals['# of AI models'] || 0),
      dataverseTableCount: Number(solutionGroupsByEnvironment.get(environment.environmentId)?.dataverseTableCount || 0),
      copilotStudioAgentCount: Number(componentTotals['# of Copilot Studio Agents'] || 0),
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    dateRanges: {
      aiFlow: aiEventDateRange,
      copilotSessions: agentSessionDateRange,
      flowRuns: flowRunDateRange,
    },
    rows,
    modelMix: [...modelMix.values()].sort((left, right) => right.eventCount - left.eventCount || left.model.localeCompare(right.model)),
  };
}

function sumBy(rows, field) {
  return rows.reduce((total, row) => total + Number(row?.[field] || 0), 0);
}

async function listSolutionsForEnvironment(orgUrl, accountHomeId = '') {
  const data = await targetDvGetAll(
    orgUrl,
    'solutions?$select=solutionid,friendlyname,uniquename,version,ismanaged,isvisible,createdon,modifiedon,_publisherid_value&$expand=publisherid($select=publisherid,friendlyname,uniquename)&$orderby=friendlyname',
    {},
    accountHomeId,
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

async function listSolutionComponentsForEnvironment(orgUrl, solutionIds, accountHomeId = '') {
  const normalizedIds = [...new Set(solutionIds.map((value) => normalizeGuid(value)).filter(Boolean))];
  if (!normalizedIds.length) {
    return [];
  }

  const chunks = chunkArray(normalizedIds, 20);
  const pages = [];
  for (const chunk of chunks) {
    const filter = chunk.map((solutionId) => `_solutionid_value eq ${solutionId}`).join(' or ');
    const rows = await targetDvGetAll(
      orgUrl,
      `solutioncomponents?$select=_solutionid_value,solutioncomponentid,componenttype,objectid&$filter=${filter}`,
      { Prefer: `odata.include-annotations="${ODATA_FORMATTED_VALUE_ANNOTATION}"` },
      accountHomeId,
    );
    pages.push(...rows);
    await delay(250);
  }
  return pages.map((component) => ({
    solutionid: component._solutionid_value,
    solutioncomponentid: component.solutioncomponentid,
    componenttype: Number(component.componenttype),
    objectid: component.objectid || '',
    typeLabel: component[`componenttype@${ODATA_FORMATTED_VALUE_ANNOTATION}`] || SOLUTION_COMPONENT_TYPES[Number(component.componenttype)] || '',
  }));
}

async function enrichSolutionReportComponentsForEnvironment(orgUrl, components, accountHomeId = '') {
  const componentTypes = [...new Set(components
    .map((component) => Number(component.componenttype))
    .filter((componentType) => componentType > 0 && !SOLUTION_COMPONENT_TYPES[componentType]))];
  const entityDetails = new Map(await mapWithConcurrency(componentTypes, 4, async (componentType) => [
    componentType,
    await resolveEntityForComponentTypeForEnvironment(orgUrl, componentType, accountHomeId).catch(() => ({})),
  ]));
  return components.map((component) => {
    const entity = entityDetails.get(Number(component.componenttype)) || {};
    return {
      ...component,
      logicalName: component.logicalName || entity.logicalName || '',
      typeLabel: component.typeLabel || entity.typeLabel || SOLUTION_COMPONENT_TYPES[Number(component.componenttype)] || '',
    };
  });
}

function groupSolutionComponentsBySolution(components) {
  const componentsBySolution = new Map();
  for (const component of components) {
    const solutionId = normalizeGuid(component.solutionid);
    if (!solutionId) {
      continue;
    }
    if (!componentsBySolution.has(solutionId)) {
      componentsBySolution.set(solutionId, []);
    }
    componentsBySolution.get(solutionId).push(component);
  }
  return componentsBySolution;
}

function shouldIncludeAutomatedSolution(solution, options) {
  const publisherNames = [
    solution.publisher?.friendlyname,
    solution.publisher?.uniquename,
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  if (!options.includeManaged && solution.ismanaged) {
    return false;
  }
  if (!options.includeMicrosoftOwned && publisherNames.some((name) => isDefaultExcludedPublisher(name))) {
    return false;
  }
  if (options.excludedPublishers.some((excluded) => publisherNames.includes(excluded))) {
    return false;
  }
  return true;
}

function withReportEnvironmentFields(row, environment) {
  return {
    ...row,
    ...reportEnvironmentFields(environment),
  };
}

function reportEnvironmentFields(environment) {
  return {
    environmentDisplayName: environment.displayName || '',
    environmentId: environment.environmentId || environment.environmentName || '',
    environmentUrl: environment.orgUrl || '',
  };
}

function getAgentSessionDateRange(filters = {}) {
  return getAiEventDateRange({
    range: filters.range || 'month',
    start: filters.start || '',
    end: filters.end || '',
  });
}

function getFlowRunDateRange(filters = {}) {
  return getAiEventDateRange({
    range: filters.range || '7d',
    start: filters.start || '',
    end: filters.end || '',
  });
}

function buildFlowRunListPath(dateRange) {
  const selectFields = [
    'flowrunid',
    'name',
    'clienttrackingid',
    'resourceid',
    'triggertype',
    'status',
    'errorcode',
    'errormessage',
    'starttime',
    'endtime',
    'duration',
    'workflowid',
    '_workflow_value',
  ];
  return `flowruns?${buildAiEventQueryString({
    '$select': selectFields.join(','),
    '$filter': `starttime ge ${toODataDateTime(dateRange.start)} and starttime lt ${toODataDateTime(dateRange.endExclusive)}`,
    '$orderby': 'starttime desc',
  })}`;
}

function normalizeFlowRunSummary(row, environmentName = selected.environmentName) {
  const durationMs = normalizeFlowRunDuration(row);
  const resourceId = String(row.resourceid || '').trim();
  const name = String(row.name || '').trim();
  return {
    id: normalizeGuid(row.flowrunid),
    name,
    clientTrackingId: String(row.clienttrackingid || '').trim(),
    flowName: pickFormattedLookupValue(row, '_workflow_value') || String(row.Workflow?.name || row.workflowid || row._workflow_value || '').trim() || 'Unknown flow',
    triggerType: readFlowRunValue(row, 'triggertype'),
    status: readFlowRunValue(row, 'status'),
    errorCode: readFlowRunValue(row, 'errorcode'),
    errorMessage: readFlowRunValue(row, 'errormessage'),
    startTimeDisplay: formatFlowRunDateTime(row.starttime),
    startTimeRaw: row.starttime || '',
    endTimeDisplay: formatFlowRunDateTime(row.endtime),
    endTimeRaw: row.endtime || '',
    durationMs,
    resourceId,
    workflowId: String(row.workflowid || row._workflow_value || '').trim(),
    openUrl: makeFlowRunUrl(environmentName, resourceId, name),
  };
}

function readFlowRunValue(row, logicalName) {
  const formatted = row[`${logicalName}@${ODATA_FORMATTED_VALUE_ANNOTATION}`];
  if (formatted !== undefined && formatted !== null && String(formatted).trim()) {
    return String(formatted).trim();
  }
  const raw = row[logicalName];
  if (raw === undefined || raw === null) {
    return '';
  }
  return String(raw).trim();
}

function normalizeFlowRunDuration(row) {
  const explicit = Number(row.duration);
  if (Number.isFinite(explicit) && explicit >= 0) {
    return explicit;
  }
  const start = row.starttime ? new Date(row.starttime) : null;
  const end = row.endtime ? new Date(row.endtime) : null;
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    return Math.max(0, end.getTime() - start.getTime());
  }
  return 0;
}

function formatFlowRunDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatTranscriptDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString();
}

function makeFlowRunUrl(environmentName, resourceId, runName) {
  const environmentId = environmentUrlName(environmentName);
  if (!environmentId || !resourceId || !runName) {
    return '';
  }
  return `https://make.powerautomate.com/environments/${encodeURIComponent(environmentId)}/solutions/~preferred/flows/${encodeURIComponent(resourceId)}/runs/${encodeURIComponent(runName)}`;
}

async function exportAiEventsWorkbook(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new HttpError(400, 'No AI Flow rows were provided for export.');
  }

  const columns = [
    ['Owner', 28],
    ['Copilot Or AI Builder Credits', 32],
    ['Credits Consumed', 18],
    ['Data Type', 22],
    ['Source', 24],
    ['Tool name', 34],
    ['Model', 28],
    ['Created', 22],
  ];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PDAC';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('AI Flow', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.columns = columns.map(([header, width]) => ({
    header,
    key: header,
    width,
  }));
  worksheet.addRows(rows.map((row) => ({
    Owner: aiEventExportText(row.ownerName),
    'Copilot Or AI Builder Credits': aiEventExportText(row.creditType),
    'Credits Consumed': Number(row.creditsConsumed || 0),
    'Data Type': aiEventExportText(row.dataType),
    Source: aiEventExportText(row.source),
    'Tool name': aiEventExportText(row.toolName),
    Model: aiEventExportText(row.model),
    Created: aiEventExportText(row.createdOn),
  })));
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
  worksheet.getColumn(3).numFmt = '0.##';

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function aiEventExportText(value) {
  return String(value ?? '').trim();
}

async function exportFlowRunsWorkbook(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new HttpError(400, 'No flow run rows were provided for export.');
  }

  const columns = [
    ['Flow Name', 34],
    ['Trigger', 18],
    ['Status', 16],
    ['Error Code', 22],
    ['Start Time', 22],
    ['End Time', 22],
    ['Duration Seconds', 18],
    ['Workflow ID', 38],
    ['Error Message', 56],
    ['Flow Run URL', 92],
  ];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PDAC';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('Flow Runs', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.addTable({
    name: 'FlowRuns',
    ref: 'A1',
    headerRow: true,
    totalsRow: false,
    style: {
      theme: 'TableStyleMedium2',
      showRowStripes: true,
    },
    columns: columns.map(([name]) => ({ name, filterButton: true })),
    rows: rows.map((row) => [
      flowRunExportText(row.flowName),
      flowRunExportText(row.triggerType),
      flowRunExportText(row.status),
      flowRunExportText(row.errorCode),
      flowRunExportText(row.startTimeDisplay),
      flowRunExportText(row.endTimeDisplay),
      Math.round(Number(row.durationMs || 0) / 1000),
      flowRunExportText(row.workflowId),
      flowRunExportText(row.errorMessage),
      flowRunExportText(row.openUrl),
    ]),
  });

  columns.forEach(([, width], index) => {
    worksheet.getColumn(index + 1).width = width;
  });
  const headerRow = worksheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF111827' } };
    cell.alignment = { vertical: 'middle' };
  });
  for (let rowNumber = 2; rowNumber <= rows.length + 1; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    row.alignment = { vertical: 'top', wrapText: true };
    const urlCell = row.getCell(10);
    const url = String(urlCell.value || '').trim();
    if (url) {
      urlCell.value = { text: 'Open flow run', hyperlink: url };
      urlCell.font = { color: { argb: 'FF1D4ED8' }, underline: true };
    }
  }
  worksheet.getColumn(7).numFmt = '0';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function flowRunExportText(value) {
  return String(value ?? '').trim();
}

async function exportAgentSessionTotalsWorkbook(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new HttpError(400, 'No agent session totals were provided for export.');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PDAC';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('Agent Totals', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const columns = [
    ['Agent Name', 36],
    ['Total Sessions', 18],
  ];
  worksheet.addTable({
    name: 'AgentSessionTotals',
    ref: 'A1',
    headerRow: true,
    totalsRow: false,
    style: {
      theme: 'TableStyleMedium2',
      showRowStripes: true,
    },
    columns: columns.map(([name]) => ({ name, filterButton: true })),
    rows: rows.map((row) => [
      String(row.agentName || 'Unknown agent').trim() || 'Unknown agent',
      Number(row.totalSessions || 0),
    ]),
  });

  columns.forEach(([, width], index) => {
    worksheet.getColumn(index + 1).width = width;
  });
  const headerRow = worksheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF111827' } };
    cell.alignment = { vertical: 'middle' };
  });
  for (let rowNumber = 2; rowNumber <= rows.length + 1; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.alignment = { vertical: 'top' };
    row.getCell(2).numFmt = '0';
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function buildAutomatedAiEventTotalsRows(groups) {
  return groups.map(({ environment, rows: eventRows }) => {
    let aiBuilderCredits = 0;
    let copilotStudioCredits = 0;
    for (const row of eventRows) {
      const credits = Number(row.creditsConsumed || 0);
      const creditType = String(row.creditType || '').trim().toLowerCase();
      if (creditType === 'ai builder') {
        aiBuilderCredits += credits;
      }
      if (creditType === 'copilot studio') {
        copilotStudioCredits += credits;
      }
    }
    const totalCredits = Math.floor(aiBuilderCredits / 15) + copilotStudioCredits;
    return {
      'Environment display name': environment.displayName,
      'Environment id': environment.environmentId,
      'Environment url': environment.orgUrl,
      'Count of Events': eventRows.length,
      'Sum AI Builder Credits used': aiBuilderCredits,
      'Sum Copilot Studio credits used': copilotStudioCredits,
      'Total credits consumed': totalCredits,
    };
  });
}

async function buildAutomatedAiEventTotalsWorkbook(groups, dateRange) {
  const rows = buildAutomatedAiEventTotalsRows(groups);
  return {
    filename: `ai-flow-events-totals-by-environment-${safeFilename(dateRangeLabel(dateRange))}.xlsx`,
    bytes: await exportSimpleWorkbook('AI Flow Totals', [
      ['Environment display name', 30],
      ['Environment id', 38],
      ['Environment url', 44],
      ['Count of Events', 18],
      ['Sum AI Builder Credits used', 28],
      ['Sum Copilot Studio credits used', 32],
      ['Total credits consumed', 24],
    ], rows, { numericColumns: [4, 5, 6, 7] }),
  };
}

async function buildAutomatedAiEventRawWorkbook(groups, dateRange) {
  const rows = groups.flatMap(({ rows: eventRows }) => eventRows.map((row) => ({
    'Environment display name': row.environmentDisplayName,
    'Environment id': row.environmentId,
    'Environment url': row.environmentUrl,
    Owner: aiEventExportText(row.ownerName),
    'Copilot Or AI Builder Credits': aiEventExportText(row.creditType),
    'Credits Consumed': Number(row.creditsConsumed || 0),
    'Data Type': aiEventExportText(row.dataType),
    Source: aiEventExportText(row.source),
    'Tool name': aiEventExportText(row.toolName),
    Model: aiEventExportText(row.model),
    Created: aiEventExportText(row.createdOn),
  })));
  return {
    filename: `ai-flow-events-raw-stacked-${safeFilename(dateRangeLabel(dateRange))}.xlsx`,
    bytes: await exportSimpleWorkbook('AI Flow Raw', [
      ['Environment display name', 30],
      ['Environment id', 38],
      ['Environment url', 44],
      ['Owner', 28],
      ['Copilot Or AI Builder Credits', 32],
      ['Credits Consumed', 18],
      ['Data Type', 22],
      ['Source', 24],
      ['Tool name', 34],
      ['Model', 28],
      ['Created', 22],
    ], rows, { numericColumns: [6] }),
  };
}

function buildAutomatedAgentSessionTotalsRows(groups) {
  return groups.map(({ environment, rows: sessionRows }) => ({
    'Environment display name': environment.displayName,
    'Environment id': environment.environmentId,
    'Environment url': environment.orgUrl,
    'Total Sessions': sessionRows.length,
    'Distinct Agents': new Set(sessionRows.map((row) => String(row.agentName || 'Unknown agent'))).size,
  }));
}

async function buildAutomatedAgentSessionTotalsWorkbook(groups, dateRange) {
  const rows = buildAutomatedAgentSessionTotalsRows(groups);
  return {
    filename: `agent-sessions-totals-by-environment-${safeFilename(dateRangeLabel(dateRange))}.xlsx`,
    bytes: await exportSimpleWorkbook('Agent Session Totals', [
      ['Environment display name', 30],
      ['Environment id', 38],
      ['Environment url', 44],
      ['Total Sessions', 18],
      ['Distinct Agents', 18],
    ], rows, { numericColumns: [4, 5] }),
  };
}

async function buildAutomatedAgentSessionRawWorkbook(groups, dateRange) {
  const rows = groups.flatMap(({ rows: sessionRows }) => sessionRows.map((row) => ({
    'Environment display name': row.environmentDisplayName,
    'Environment id': row.environmentId,
    'Environment url': row.environmentUrl,
    'Agent Name': String(row.agentName || 'Unknown agent').trim() || 'Unknown agent',
    'Conversation Start Time': formatTranscriptDateTime(row.conversationStartTime),
    'Conversation Id': row.conversationId || '',
  })));
  return {
    filename: `agent-sessions-raw-stacked-${safeFilename(dateRangeLabel(dateRange))}.xlsx`,
    bytes: await exportSimpleWorkbook('Agent Sessions Raw', [
      ['Environment display name', 30],
      ['Environment id', 38],
      ['Environment url', 44],
      ['Agent Name', 36],
      ['Conversation Start Time', 24],
      ['Conversation Id', 38],
    ], rows),
  };
}

function buildAutomatedFlowRunTotalsRows(groups) {
  return groups.map(({ environment, rows: flowRuns }) => {
    const successfulRuns = flowRuns.filter(isSuccessfulFlowRun).length;
    const failedRuns = flowRuns.filter(isFailedFlowRun).length;
    const totalRuns = flowRuns.length;
    return {
      'Environment display name': environment.displayName,
      'Environment id': environment.environmentId,
      'Environment url': environment.orgUrl,
      'Total flow runs': totalRuns,
      'Successful flow runs': successfulRuns,
      'Failed flow runs': failedRuns,
      'Success rate': totalRuns ? successfulRuns / totalRuns : 0,
      'Failure rate': totalRuns ? failedRuns / totalRuns : 0,
    };
  });
}

async function buildAutomatedFlowRunTotalsWorkbook(groups) {
  const rows = buildAutomatedFlowRunTotalsRows(groups);
  return {
    filename: `flow-runs-totals-by-environment-${safeFilename(dateRangeLabel(getFlowRunDateRange({ range: '7d' })))}.xlsx`,
    bytes: await exportSimpleWorkbook('Flow Run Totals', [
      ['Environment display name', 30],
      ['Environment id', 38],
      ['Environment url', 44],
      ['Total flow runs', 18],
      ['Successful flow runs', 22],
      ['Failed flow runs', 18],
      ['Success rate', 16],
      ['Failure rate', 16],
    ], rows, { numericColumns: [4, 5, 6, 7, 8], percentageColumns: [7, 8] }),
  };
}

async function buildAutomatedFailedFlowRunsWorkbook(groups) {
  const rows = groups.flatMap(({ rows: flowRuns }) => flowRuns
    .filter(isFailedFlowRun)
    .map((row) => ({
      'Environment display name': row.environmentDisplayName,
      'Environment id': row.environmentId,
      'Environment url': row.environmentUrl,
      'Flow name': row.flowName || '',
      Trigger: row.triggerType || '',
      Status: row.status || '',
      'Error code': row.errorCode || '',
      'Error message': row.errorMessage || '',
      'Start time': row.startTimeDisplay || '',
      'End time': row.endTimeDisplay || '',
      'Duration seconds': Math.round(Number(row.durationMs || 0) / 1000),
      'Flow run URL': row.openUrl || '',
    })));
  return {
    filename: `flow-runs-failed-raw-stacked-${safeFilename(dateRangeLabel(getFlowRunDateRange({ range: '7d' })))}.xlsx`,
    bytes: await exportSimpleWorkbook('Failed Flow Runs', [
      ['Environment display name', 30],
      ['Environment id', 38],
      ['Environment url', 44],
      ['Flow name', 34],
      ['Trigger', 18],
      ['Status', 18],
      ['Error code', 22],
      ['Error message', 56],
      ['Start time', 22],
      ['End time', 22],
      ['Duration seconds', 18],
      ['Flow run URL', 92],
    ], rows, { numericColumns: [11] }),
  };
}

function isSuccessfulFlowRun(row) {
  return String(row?.status || '').trim().toLowerCase() === 'succeeded';
}

function isFailedFlowRun(row) {
  const status = String(row?.status || '').trim().toLowerCase();
  return status.includes('fail') || status.includes('cancel') || status.includes('time out') || status.includes('timedout');
}

function buildAutomatedSolutionTotalsRows(groups, options) {
  return groups.map(({ environment, rows: solutionRows, totalBeforeFilters, dataverseTableCount }) => {
    const publishers = new Set(solutionRows.map((solution) => solution.publisher?.friendlyname || solution.publisher?.uniquename || '').filter(Boolean));
    const componentTotals = sumSolutionReportCountFields(solutionRows);
    delete componentTotals['# of Dataverse tables'];
    return {
      'Environment display name': environment.displayName,
      'Environment id': environment.environmentId,
      'Environment url': environment.orgUrl,
      'Included solutions': solutionRows.length,
      'Managed solutions': solutionRows.filter((solution) => solution.ismanaged).length,
      'Unmanaged solutions': solutionRows.filter((solution) => !solution.ismanaged).length,
      'Visible solutions': solutionRows.filter((solution) => solution.isvisible !== false).length,
      'Hidden solutions': solutionRows.filter((solution) => solution.isvisible === false).length,
      'Distinct publishers': publishers.size,
      ...componentTotals,
      'Custom Dataverse tables': Number(dataverseTableCount || 0),
      'Before filters': totalBeforeFilters,
      'Publisher exclusions': options.excludedPublishers.join(', '),
      'Managed included': options.includeManaged ? 'Yes' : 'No',
      'Microsoft owned included': options.includeMicrosoftOwned ? 'Yes' : 'No',
    };
  });
}

async function buildAutomatedSolutionTotalsWorkbook(groups, options) {
  const rows = buildAutomatedSolutionTotalsRows(groups, options);
  return {
    filename: `solutions-totals-by-environment-${safeFilename(new Date().toISOString().slice(0, 10))}.xlsx`,
    bytes: await exportSimpleWorkbook('Solution Totals', [
      ['Environment display name', 30],
      ['Environment id', 38],
      ['Environment url', 44],
      ['Included solutions', 18],
      ['Managed solutions', 18],
      ['Unmanaged solutions', 20],
      ['Visible solutions', 18],
      ['Hidden solutions', 18],
      ['Distinct publishers', 20],
      ['# of flows', 14],
      ['# of Code Apps', 16],
      ['# of Canvas Apps', 18],
      ['# of Model Driven Apps', 22],
      ['# of Copilot Studio Agents', 24],
      ['Custom Dataverse tables', 24],
      ['# of AI models', 16],
      ['# of connection references', 23],
      ['# of environment variables', 23],
      ['# of dataflows', 16],
      ['Before filters', 16],
      ['Publisher exclusions', 34],
      ['Managed included', 18],
      ['Microsoft owned included', 24],
    ], rows, { numericColumns: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] }),
  };
}

async function buildAutomatedSolutionRawWorkbook(groups, options) {
  const rows = groups.flatMap(({ rows: solutionRows }) => solutionRows.map((solution) => ({
    'Environment display name': solution.environmentDisplayName,
    'Environment id': solution.environmentId,
    'Environment url': solution.environmentUrl,
    'Solution name': solution.friendlyname || solution.uniquename || '',
    'Solution unique name': solution.uniquename || '',
    Version: solution.version || '',
    Managed: solution.ismanaged ? 'Yes' : 'No',
    Visible: solution.isvisible === false ? 'No' : 'Yes',
    'Publisher display name': solution.publisher?.friendlyname || '',
    'Publisher unique name': solution.publisher?.uniquename || '',
    'Created on': formatAiEventDate(solution.createdon),
    'Modified on': formatAiEventDate(solution.modifiedon),
    '# of flows': Number(solution['# of flows'] || 0),
    '# of Code Apps': Number(solution['# of Code Apps'] || 0),
    '# of Canvas Apps': Number(solution['# of Canvas Apps'] || 0),
    '# of Model Driven Apps': Number(solution['# of Model Driven Apps'] || 0),
    '# of Copilot Studio Agents': Number(solution['# of Copilot Studio Agents'] || 0),
    '# of Dataverse tables': Number(solution['# of Dataverse tables'] || 0),
    '# of AI models': Number(solution['# of AI models'] || 0),
    '# of connection references': Number(solution['# of connection references'] || 0),
    '# of environment variables': Number(solution['# of environment variables'] || 0),
    '# of dataflows': Number(solution['# of dataflows'] || 0),
  })));
  return {
    filename: `solutions-raw-stacked-${safeFilename(new Date().toISOString().slice(0, 10))}.xlsx`,
    bytes: await exportSimpleWorkbook('Solutions Raw', [
      ['Environment display name', 30],
      ['Environment id', 38],
      ['Environment url', 44],
      ['Solution name', 32],
      ['Solution unique name', 36],
      ['Version', 18],
      ['Managed', 12],
      ['Visible', 12],
      ['Publisher display name', 28],
      ['Publisher unique name', 28],
      ['Created on', 22],
      ['Modified on', 22],
      ['# of flows', 14],
      ['# of Code Apps', 16],
      ['# of Canvas Apps', 18],
      ['# of Model Driven Apps', 22],
      ['# of Copilot Studio Agents', 24],
      ['# of Dataverse tables', 20],
      ['# of AI models', 16],
      ['# of connection references', 23],
      ['# of environment variables', 23],
      ['# of dataflows', 16],
    ], rows, { numericColumns: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22] }),
  };
}

function sumSolutionReportCountFields(rows) {
  const fields = [
    '# of flows',
    '# of Code Apps',
    '# of Canvas Apps',
    '# of Model Driven Apps',
    '# of Copilot Studio Agents',
    '# of Dataverse tables',
    '# of AI models',
    '# of connection references',
    '# of environment variables',
    '# of dataflows',
  ];
  return Object.fromEntries(fields.map((field) => [
    field,
    rows.reduce((total, row) => total + Number(row[field] || 0), 0),
  ]));
}

async function exportSimpleWorkbook(sheetName, columns, rows, options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PDAC';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  worksheet.columns = columns.map(([header, width]) => ({ header, key: header, width }));
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
  for (let rowNumber = 2; rowNumber <= rows.length + 1; rowNumber += 1) {
    worksheet.getRow(rowNumber).alignment = { vertical: 'top', wrapText: true };
  }
  for (const columnNumber of options.numericColumns || []) {
    worksheet.getColumn(columnNumber).numFmt = '0.##';
  }
  for (const columnNumber of options.percentageColumns || []) {
    worksheet.getColumn(columnNumber).numFmt = '0.0%';
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function dateRangeLabel(dateRange) {
  if (!dateRange?.startDate || !dateRange?.endDate) {
    return 'report';
  }
  return `${dateRange.startDate}-to-${dateRange.endDate}`;
}

async function getAiEventDetail(aiEventId) {
  const config = await getAiEventFieldConfig();
  const selectFields = getAiEventSelectFields(config, { includePayload: true });
  const responses = await dvBatchGet([
    {
      path: `${AI_EVENT_ENTITY_SET_NAME}(${encodeURIComponent(normalizeGuid(aiEventId))})?${buildAiEventQueryString({
        '$select': selectFields.join(','),
      })}`,
      headers: {
        Prefer: AI_EVENT_BATCH_PREFER,
      },
    },
  ]);
  const data = responses[0]?.data || {};
  if (!data?.msdyn_aieventid) {
    throw new HttpError(404, 'AI event not found.');
  }
  return {
    fieldMappings: config.labels,
    fieldCandidates: config.resolved,
    unresolvedFields: config.unresolved,
    event: normalizeAiEventDetail(data, config),
  };
}

async function getAgentSessionDetail(conversationTranscriptId) {
  const id = normalizeGuid(conversationTranscriptId);
  if (!id) {
    throw new HttpError(400, 'Conversation transcript id is required.');
  }

  const response = await dvGet(`${AGENT_SESSION_ENTITY_SET_NAME}(${id})?$select=conversationtranscriptid,conversationstarttime,name,content,metadata,createdon,_bot_conversationtranscriptid_value&$expand=bot_conversationtranscriptId($select=name)`);
  if (!response?.conversationtranscriptid) {
    throw new HttpError(404, 'Conversation transcript not found.');
  }

  const transcript = parseTranscriptContent(response.content);
  const metadata = parseTranscriptMetadata(response.metadata);
  const redactionState = { count: 0, types: new Set() };
  const sanitizedTranscript = sanitizeTranscriptValue(transcript, redactionState);
  const sanitizedMetadata = sanitizeTranscriptValue(metadata, redactionState);
  const agentName = sanitizeTranscriptText(await resolveTranscriptAgentName(response, metadata, transcript), redactionState);
  const activityCount = Array.isArray(sanitizedTranscript?.activities) ? sanitizedTranscript.activities.length : 0;

  return {
    session: {
      conversationId: normalizeGuid(response.conversationtranscriptid) || '',
      conversationStartTime: response.conversationstarttime || '',
      conversationName: sanitizeTranscriptText(String(response.name || '').trim(), redactionState),
      agentName,
      activityCount,
      redactions: {
        count: redactionState.count,
        types: [...redactionState.types],
      },
      metadata: sanitizedMetadata && Object.keys(sanitizedMetadata).length ? sanitizedMetadata : null,
      transcript: sanitizedTranscript,
    },
  };
}

async function normalizeAgentSessionSummary(row, orgUrl = selected.orgUrl, accountHomeId = '') {
  const metadata = parseTranscriptMetadata(row.metadata);
  const redactionState = { count: 0, types: new Set() };
  return {
    conversationId: normalizeGuid(row.conversationtranscriptid) || '',
    conversationStartTime: row.conversationstarttime || '',
    agentName: sanitizeTranscriptText(await resolveTranscriptAgentName(row, metadata, null, orgUrl, accountHomeId), redactionState),
  };
}

async function resolveTranscriptAgentName(row, metadata, transcript = null, orgUrl = selected.orgUrl, accountHomeId = '') {
  const expandedBotName = String(row?.bot_conversationtranscriptId?.name || row?.bot_conversationtranscriptid?.name || '').trim();
  if (expandedBotName) {
    return expandedBotName;
  }
  const metadataAgentName = findTranscriptValueByKeys(metadata, [
    'botname',
    'agentname',
    'displayname',
    'friendlyname',
    'name',
    'title',
  ]);
  if (metadataAgentName) {
    return metadataAgentName;
  }
  const botIds = extractTranscriptBotIds([
    row?._bot_conversationtranscriptid_value,
    row?.botid,
    row?.botId,
    row?._botid_value,
    row?.agentid,
    row?.agentId,
    row?.name,
    row?.metadata,
  ]);
  for (const botId of botIds) {
    const botName = await lookupTranscriptBotName(botId, orgUrl, accountHomeId);
    if (botName) {
      return botName;
    }
  }

  const transcriptName = inferTranscriptAgentNameFromTranscript(transcript);
  if (transcriptName) {
    return transcriptName;
  }

  const rowName = String(row?.name || '').trim();
  if (rowName && !looksLikeTranscriptGuidComposite(rowName)) {
    return rowName;
  }

  return 'Unknown agent';
}

function findTranscriptValueByKeys(value, targetKeys = []) {
  if (!value || typeof value !== 'object') {
    return '';
  }

  const normalizedTargets = new Set(targetKeys.map((key) => String(key || '').trim().toLowerCase()).filter(Boolean));

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findTranscriptValueByKeys(item, targetKeys);
      if (match) {
        return match;
      }
    }
    return '';
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (normalizedTargets.has(normalizedKey)) {
      const directText = String(nestedValue || '').trim();
      if (directText) {
        return directText;
      }
    }
    const deepMatch = findTranscriptValueByKeys(nestedValue, targetKeys);
    if (deepMatch) {
      return deepMatch;
    }
  }

  return '';
}

function extractTranscriptBotIds(values) {
  const ids = [];
  const seen = new Set();
  const queue = [...values];
  while (queue.length) {
    const value = queue.shift();
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        queue.push(...value);
      } else {
        queue.push(...Object.values(value));
      }
      continue;
    }
    const text = String(value).trim();
    if (!text) {
      continue;
    }
    const matches = text.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g) || [];
    for (const match of matches) {
      const id = normalizeGuid(match);
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

async function lookupTranscriptBotName(botId, orgUrl = selected.orgUrl, accountHomeId = '') {
  const id = normalizeGuid(botId);
  if (!id) {
    return '';
  }
  const cacheKey = `${normalizeOrgUrl(orgUrl)}:${id}`;
  if (AGENT_SESSION_BOT_NAME_CACHE.has(cacheKey)) {
    return AGENT_SESSION_BOT_NAME_CACHE.get(cacheKey) || '';
  }
  try {
    const response = normalizeOrgUrl(orgUrl) === selected.orgUrl
      ? await dvGet(`bots(${id})?$select=botid,name`)
      : await targetDvGet(orgUrl, `bots(${id})?$select=botid,name`, accountHomeId);
    const name = String(response?.name || '').trim();
    AGENT_SESSION_BOT_NAME_CACHE.set(cacheKey, name);
    return name;
  } catch (error) {
    console.error('Could not resolve bot name for transcript:', id, error);
    AGENT_SESSION_BOT_NAME_CACHE.set(cacheKey, '');
    return '';
  }
}

function inferTranscriptAgentNameFromTranscript(transcript) {
  const activities = Array.isArray(transcript?.activities) ? transcript.activities : [];
  for (const activity of activities) {
    const explicitName = String(activity?.from?.displayName || activity?.from?.name || '').trim();
    if (explicitName) {
      return explicitName;
    }
  }
  for (const activity of activities) {
    const text = String(activity?.text || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      continue;
    }
    const match = text.match(/\b(?:hello|hi|hey)[^A-Za-z0-9]{0,12}(?:i['’]?m|i am)\s+([A-Z][A-Za-z0-9 .'\-]{1,80})/i)
      || text.match(/\bmy name is\s+([A-Z][A-Za-z0-9 .'\-]{1,80})/i);
    if (match?.[1]) {
      return match[1].trim().replace(/[!?.:,;]+$/, '');
    }
  }
  return '';
}

function looksLikeTranscriptGuidComposite(value) {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(text)) {
    return true;
  }
  const parts = text.split('_').filter(Boolean);
  if (parts.length < 2) {
    return false;
  }
  const lastPart = parts[parts.length - 1];
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(lastPart) || parts.some((part) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(part));
}

function parseTranscriptMetadata(value) {
  const parsed = parseStructuredValue(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function parseTranscriptContent(value) {
  const parsed = parseStructuredValue(value);
  if (parsed === null || parsed === undefined || parsed === '') {
    return { text: '' };
  }
  if (typeof parsed === 'object') {
    return parsed;
  }
  return { text: String(parsed) };
}

function parseStructuredValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    return value;
  }
  const text = value.trim();
  if (!text) {
    return '';
  }
  let current = text;
  for (let index = 0; index < 3; index += 1) {
    try {
      const parsed = JSON.parse(current);
      if (typeof parsed === 'string' && looksLikeJson(parsed) && parsed.trim() !== current) {
        current = parsed.trim();
        continue;
      }
      return parsed;
    } catch {
      return text;
    }
  }
  return text;
}

function sanitizeTranscriptValue(value, state, keyPath = '') {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeTranscriptText(value, state);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeTranscriptValue(item, state, `${keyPath}[${index}]`));
  }

  if (typeof value !== 'object') {
    return value;
  }

  const result = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (isSensitiveTranscriptField(key)) {
      recordTranscriptRedaction(state, key);
      result[key] = '[redacted]';
      continue;
    }
    result[key] = sanitizeTranscriptValue(nestedValue, state, keyPath ? `${keyPath}.${key}` : key);
  }
  return result;
}

function sanitizeTranscriptText(value, state) {
  let output = String(value);
  output = output.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, () => {
    recordTranscriptRedaction(state, 'email');
    return '[redacted email]';
  });
  output = output.replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, (match) => {
    if (match.replace(/\D/g, '').length < 7) {
      return match;
    }
    recordTranscriptRedaction(state, 'phone');
    return '[redacted phone]';
  });
  output = output.replace(/\b\d{3}-\d{2}-\d{4}\b/g, () => {
    recordTranscriptRedaction(state, 'ssn');
    return '[redacted ssn]';
  });
  output = output.replace(/\b(?:\d[ -]*?){13,19}\b/g, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) {
      return match;
    }
    recordTranscriptRedaction(state, 'credit-card');
    return '[redacted card]';
  });
  output = output.replace(/https?:\/\/[^\s<>"']+/gi, (match) => {
    try {
      const url = new URL(match);
      const hadSensitiveParts = Boolean(url.search || url.hash);
      url.search = '';
      url.hash = '';
      if (hadSensitiveParts) {
        recordTranscriptRedaction(state, 'url');
      }
      return url.toString();
    } catch {
      return match;
    }
  });
  output = output.replace(/\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, () => {
    recordTranscriptRedaction(state, 'token');
    return '[redacted token]';
  });
  return output;
}

function isSensitiveTranscriptField(key) {
  return new Set([
    'password',
    'secret',
    'token',
    'accesstoken',
    'refreshtoken',
    'authorization',
    'cookie',
    'setcookie',
    'apikey',
    'clientsecret',
    'privatekey',
    'connectionstring',
    'aadobjectid',
  ]).has(String(key || '').trim().toLowerCase());
}

function recordTranscriptRedaction(state, type) {
  if (!state) {
    return;
  }
  state.count += 1;
  state.types.add(type);
}

async function getAiEventFieldConfig(orgUrl = selected.orgUrl, accountHomeId = '') {
  const cacheKey = normalizeOrgUrl(orgUrl);
  const cached = aiEventMetadataCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await dvRequestUrl(
    'GET',
    `${cacheKey}/api/data/v9.2/EntityDefinitions(LogicalName='${AI_EVENT_ENTITY_LOGICAL_NAME}')/Attributes?$select=LogicalName,DisplayName,AttributeType,IsValidForRead`,
    undefined,
    {},
    cacheKey,
    accountHomeId,
  );
  const config = resolveAiEventFieldConfig(response.data.value || []);
  aiEventMetadataCache.set(cacheKey, config);
  return config;
}

function resolveAiEventFieldConfig(attributes) {
  const normalized = attributes.map((attribute) => ({
    logicalName: String(attribute.LogicalName || '').trim().toLowerCase(),
    label: getLabel(attribute.DisplayName),
    normalizedLabel: normalizeAiEventText(getLabel(attribute.DisplayName)),
    normalizedLogicalName: normalizeAiEventText(attribute.LogicalName),
    attributeType: String(attribute.AttributeType || '').trim(),
    isValidForRead: attribute.IsValidForRead !== false,
  }));
  const resolved = {};
  const labels = {};
  const unresolved = [];
  const attributesByLogicalName = Object.fromEntries(normalized.map((attribute) => [attribute.logicalName, attribute]));

  for (const [key, rule] of Object.entries(AI_EVENT_FIELD_RULES)) {
    const configuredFields = [];
    for (const logicalName of rule.logicalNames || []) {
      const normalizedLogicalName = String(logicalName || '').trim().toLowerCase();
      if (!normalizedLogicalName) {
        continue;
      }
      if (attributesByLogicalName[normalizedLogicalName]) {
        configuredFields.push(normalizedLogicalName === 'msdyn_aimodelid' ? '_msdyn_aimodelid_value' : normalizedLogicalName);
      }
    }
    resolved[key] = configuredFields;
    labels[key] = configuredFields.map((logicalName) => {
      if (logicalName === '_msdyn_aimodelid_value') {
        return attributesByLogicalName.msdyn_aimodelid?.label || 'AI Model';
      }
      return attributesByLogicalName[logicalName]?.label || logicalName;
    }).join(' | ');
    if (!configuredFields.length && key !== 'eventName' && key !== 'dataType' && key !== 'toolName') {
      unresolved.push(key);
    }
  }

  return { resolved, labels, unresolved, attributesByLogicalName };
}

function matchAiEventAttributes(attributes, rule) {
  const exactLogicalNames = new Set((rule.logicalNames || []).map((value) => String(value).toLowerCase()));
  const exactLabels = new Set((rule.exactLabels || []).map(normalizeAiEventText));
  const scored = [];

  for (const attribute of attributes) {
    if (!attribute.isValidForRead) {
      continue;
    }
    const score = scoreAiEventAttribute(attribute, rule, exactLogicalNames, exactLabels);
    if (score > 0) {
      scored.push({ ...attribute, score });
    }
  }

  return scored.sort((left, right) => right.score - left.score || left.logicalName.localeCompare(right.logicalName));
}

function scoreAiEventAttribute(attribute, rule, exactLogicalNames, exactLabels) {
  let score = 0;
  const exactLogicalMatch = exactLogicalNames.has(attribute.logicalName);
  const exactLabelMatch = exactLabels.has(attribute.normalizedLabel);
  if (exactLogicalMatch) {
    score += 1000;
  }
  if (exactLabelMatch) {
    score += 900;
  }

  for (const [index, group] of (rule.tokenGroups || []).entries()) {
    if (containsAiEventTokenGroup(attribute.normalizedLabel, group)) {
      score += 300 - (index * 10);
    }
    if (containsAiEventTokenGroup(attribute.normalizedLogicalName, group)) {
      score += 260 - (index * 10);
    }
  }

  // For fuzzy matches, stay inside the AI-event namespace and avoid shadow lookup fields
  // like createdbyname/owneridtype that appear in metadata but are not queryable columns.
  if (score > 0 && !exactLogicalMatch && !exactLabelMatch && !attribute.logicalName.startsWith('msdyn_')) {
    return 0;
  }

  if (score > 0 && (rule.preferredTypes || []).includes(attribute.attributeType)) {
    score += 40;
  }
  return score;
}

function containsAiEventTokenGroup(text, group) {
  return group.every((token) => text.includes(normalizeAiEventText(token)));
}

function normalizeAiEventText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getAiEventSelectFields(config, options = {}) {
  const fields = new Set([
    'msdyn_aieventid',
    'createdon',
    'msdyn_creditconsumed',
    '_ownerid_value',
    '_createdby_value',
  ]);

  for (const key of ['creditType', 'dataType', 'source', 'toolName', 'model', 'eventName']) {
    for (const logicalName of config.resolved[key] || []) {
      fields.add(logicalName);
    }
  }

  // Summary fields depend on payload metadata stored in the event row.
  for (const key of ['input']) {
    for (const logicalName of config.resolved[key] || []) {
      fields.add(logicalName);
    }
  }

  if (options.includePayload) {
    for (const key of ['input', 'output']) {
      for (const logicalName of config.resolved[key] || []) {
        fields.add(logicalName);
      }
    }
  }

  return [...fields];
}

function buildAiEventListPath(selectFields, dateRange) {
  return `${AI_EVENT_ENTITY_SET_NAME}?${buildAiEventQueryString({
    '$select': selectFields.join(','),
    '$filter': `createdon ge ${toODataDateTime(dateRange.start)} and createdon lt ${toODataDateTime(dateRange.endExclusive)}`,
    '$orderby': 'createdon desc',
  })}`;
}

function buildAiEventQueryString(parts) {
  return Object.entries(parts)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

async function fetchAiEventData(path, preferHeader) {
  const responses = await dvBatchGet([
    {
      path,
      headers: {
        Prefer: preferHeader,
      },
    },
  ]);

  const rows = [...(responses[0]?.data?.value || [])];
  let nextLink = responses[0]?.data?.['@odata.nextLink'] || '';
  while (nextLink) {
    const response = await dvRequestUrl('GET', nextLink, undefined, { Prefer: preferHeader }, selected.orgUrl);
    rows.push(...(response.data.value || []));
    nextLink = response.data['@odata.nextLink'] || '';
  }

  return rows;
}

function getAiEventDateRange(filters = {}) {
  const now = new Date();
  const range = String(filters.range || 'month').trim().toLowerCase();
  if (range === 'custom') {
    const start = parseDateOnly(filters.start, 'start');
    const end = parseDateOnly(filters.end, 'end');
    if (end < start) {
      throw new HttpError(400, 'Custom date range end must be on or after start.');
    }
    return {
      range,
      start: atStartOfDay(start),
      endExclusive: addDays(atStartOfDay(end), 1),
      startDate: toDateOnlyString(start),
      endDate: toDateOnlyString(end),
    };
  }

  const today = atStartOfDay(now);
  if (range === 'today') {
    return makeAiEventRange(range, today, addDays(today, 1));
  }
  if (range === '7d') {
    return makeAiEventRange(range, addDays(today, -6), addDays(today, 1));
  }
  if (range === '28d') {
    return makeAiEventRange(range, addDays(today, -27), addDays(today, 1));
  }
  if (range === '365d') {
    return makeAiEventRange(range, addDays(today, -364), addDays(today, 1));
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return makeAiEventRange('month', monthStart, nextMonthStart);
}

function makeAiEventRange(range, start, endExclusive) {
  return {
    range,
    start,
    endExclusive,
    startDate: toDateOnlyString(start),
    endDate: toDateOnlyString(addDays(endExclusive, -1)),
  };
}

function parseDateOnly(value, name) {
  const text = requireString(value, name);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new HttpError(400, `${name} must use YYYY-MM-DD.`);
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${name} is not a valid date.`);
  }
  return date;
}

function atStartOfDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function toDateOnlyString(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toODataDateTime(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T00:00:00Z`;
}

function normalizeAiEventSummary(row, config) {
  const derived = deriveAiEventDisplayValues(row, config);
  const fallbackSource = formatAiEventCategoryValue(pickAiEventValue(row, config, 'creditType'));
  const creditsConsumed = deriveAiEventCreditsConsumed(row, config);
  return {
    id: normalizeGuid(row.msdyn_aieventid),
    ownerName: pickFormattedLookupValue(row, '_ownerid_value'),
    createdByName: pickFormattedLookupValue(row, '_createdby_value'),
    creditType: derived.creditType || deriveAiEventFallbackCreditType(row, config),
    creditsConsumed,
    dataType: derived.dataType || pickAiEventValue(row, config, 'dataType'),
    source: derived.source || fallbackSource,
    toolName: derived.toolName || pickAiEventValue(row, config, 'toolName') || pickAiEventValue(row, config, 'model') || pickAiEventValue(row, config, 'eventName'),
    model: derived.model || pickAiEventValue(row, config, 'model'),
    createdOn: formatAiEventDate(row.createdon),
    createdOnRaw: row.createdon || '',
  };
}

function normalizeAiEventDetail(row, config) {
  const summary = normalizeAiEventSummary(row, config);
  return {
    ...summary,
    input: normalizeAiEventPayloadValue(row, config, 'input'),
    output: normalizeAiEventPayloadValue(row, config, 'output'),
  };
}

function deriveAiEventDisplayValues(row, config) {
  const inputPayload = getAiEventParsedPayload(row, config, 'input');
  const dataInfoRaw = readAiEventColumnValue(row, 'msdyn_datainfo');
  const dataInfoPayload = parseAiEventStructuredValue(dataInfoRaw);
  const toolName = pickAiEventValue(row, config, 'model');
  const partnerSource = readAiEventPayloadProperty(inputPayload, ['partnerSource']);
  const consumptionSource = readAiEventPayloadProperty(inputPayload, ['consumptionSource']);
  const llmModelName = readAiEventPayloadProperty(inputPayload, ['llmModelName', 'modelName', 'model']);
  const hasMessageConsumption = isAiEventObject(inputPayload?.messageConsumption);
  const featureName = readAiEventNestedPayloadProperty(inputPayload, ['messageConsumption', 'featureName']);
  const aiBuilderCreditCost = findAiEventNumericValue(dataInfoPayload, 'costAsAiBuilderCredits');
  const copilotCreditCost = findAiEventNumericValue(dataInfoPayload, 'costAsCopilotCredits');
  return {
    creditType: deriveAiEventCreditType({
      partnerSource,
      llmModelName,
      featureName,
      hasMessageConsumption,
      aiBuilderCreditCost,
      copilotCreditCost,
    }),
    source: formatAiEventCategoryValue(consumptionSource),
    toolName,
    model: formatAiEventModelValue(llmModelName),
    dataType: detectAiEventDataType(dataInfoRaw, toolName, inputPayload),
  };
}

function deriveAiEventCreditType({
  partnerSource,
  llmModelName,
  featureName,
  hasMessageConsumption,
  aiBuilderCreditCost,
  copilotCreditCost,
}) {
  const partner = String(partnerSource || '').trim();
  const model = String(llmModelName || '').trim();
  const feature = String(featureName || '').trim();
  const usesGenerativeFeatureMeter = hasMessageConsumption && /generative ai tools|copilot/iu.test(feature);
  const aiBuilderCost = Number(aiBuilderCreditCost);
  const copilotCost = Number(copilotCreditCost);

  if (Number.isFinite(aiBuilderCost) || Number.isFinite(copilotCost)) {
    if (copilotCost > 0 && copilotCost >= aiBuilderCost) {
      return 'Copilot Studio';
    }
    if (aiBuilderCost > 0 && aiBuilderCost >= copilotCost) {
      return 'AI Builder';
    }
  }

  if (partner === 'AIBStudio') {
    return 'Copilot Studio';
  }
  if (partner === 'AIBuilder') {
    return usesGenerativeFeatureMeter ? 'Copilot Studio' : 'AI Builder';
  }
  if (partner) {
    return formatAiEventCategoryValue(partner);
  }
  if (usesGenerativeFeatureMeter) {
    return 'Copilot Studio';
  }
  if (model || /copilot|generative ai tools/iu.test(feature)) {
    return 'Copilot';
  }
  return '';
}

function findAiEventNumericValue(value, targetKey, depth = 0) {
  if (!targetKey || depth > 6 || value === undefined || value === null) {
    return NaN;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findAiEventNumericValue(item, targetKey, depth + 1);
      if (Number.isFinite(match)) {
        return match;
      }
    }
    return NaN;
  }

  if (isAiEventObject(value)) {
    if (value[targetKey] !== undefined && value[targetKey] !== null) {
      const numeric = Number(value[targetKey]);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
    for (const nestedValue of Object.values(value)) {
      const match = findAiEventNumericValue(nestedValue, targetKey, depth + 1);
      if (Number.isFinite(match)) {
        return match;
      }
    }
    return NaN;
  }

  if (typeof value === 'string' && looksLikeJson(value)) {
    const parsed = parseAiEventStructuredValue(value);
    if (parsed !== value) {
      return findAiEventNumericValue(parsed, targetKey, depth + 1);
    }
  }

  return NaN;
}

function deriveAiEventCreditsConsumed(row, config) {
  const rawCreditsConsumed = Number(row.msdyn_creditconsumed || 0);
  if (rawCreditsConsumed > 0) {
    return rawCreditsConsumed;
  }

  const inputPayload = getAiEventParsedPayload(row, config, 'input');
  const payloadConsumption = Number(readAiEventNestedPayloadProperty(inputPayload, ['messageConsumption', 'consumption']));
  if (Number.isFinite(payloadConsumption) && payloadConsumption > 0) {
    return payloadConsumption;
  }

  return rawCreditsConsumed;
}

function deriveAiEventFallbackCreditType(row, config) {
  const toolName = pickAiEventValue(row, config, 'toolName') || pickAiEventValue(row, config, 'model') || pickAiEventValue(row, config, 'eventName');
  if (!toolName) {
    return '';
  }

  const inputPayload = normalizeAiEventPayloadValue(row, config, 'input').raw.trim();
  if (inputPayload && inputPayload !== '{}') {
    return '';
  }

  return 'AI Builder';
}

function getAiEventParsedPayload(row, config, key) {
  const payload = normalizeAiEventPayloadValue(row, config, key).parsed;
  return isAiEventObject(payload) ? payload : null;
}

function readAiEventPayloadProperty(payload, keys) {
  if (!isAiEventObject(payload)) {
    return '';
  }
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function readAiEventNestedPayloadProperty(payload, path) {
  let current = payload;
  for (const segment of path) {
    if (!isAiEventObject(current) || !(segment in current)) {
      return '';
    }
    current = current[segment];
  }
  if (current === undefined || current === null) {
    return '';
  }
  const text = String(current).trim();
  return text || '';
}

function detectAiEventDataType(dataInfoRaw, toolName, inputPayload) {
  const text = String(dataInfoRaw || '');
  if (text.includes('%PDF')) {
    return 'PDF';
  }
  if (text.includes('word/')) {
    return 'Word document';
  }
  if (text.includes('ppt/')) {
    return 'PowerPoint presentation';
  }
  if (text.includes('xl/')) {
    return 'Excel workbook';
  }
  if (text.includes('[Content_Types].xml')) {
    return 'Office document';
  }
  if (/Prompt$/iu.test(String(toolName || '').trim())) {
    return 'Prompt';
  }
  if (text.trim() || isAiEventObject(inputPayload)) {
    return 'Text';
  }
  return '';
}

function formatAiEventCategoryValue(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  if (/^AIBuilder$/iu.test(text)) {
    return 'AI Builder';
  }
  if (/^AIBStudio$/iu.test(text)) {
    return 'Copilot Studio';
  }
  if (/^AICopilot$/iu.test(text)) {
    return 'AI Copilot';
  }
  if (/^PowerAutomation$/iu.test(text)) {
    return 'Power Automate';
  }
  if (/^Api$/iu.test(text)) {
    return 'API';
  }
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/AI Builder/gi, 'AI Builder')
    .replace(/Power Automate/gi, 'Power Automate');
}

function formatAiEventModelValue(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const normalized = raw.replace(/-\d{4}-\d{2}-\d{2}$/u, '');
  const gptMatch = normalized.match(/^gpt-(\d)(\d)(?:-(.+))?$/iu);
  if (gptMatch) {
    const variant = gptMatch[3] ? ` ${humanizeAiEventToken(gptMatch[3])}` : '';
    return `GPT ${gptMatch[1]}.${gptMatch[2]}${variant}`.trim();
  }
  return normalized.split('-').map(humanizeAiEventToken).join(' ');
}

function humanizeAiEventToken(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  if (/^gpt$/iu.test(text)) {
    return 'GPT';
  }
  if (/^ai$/iu.test(text)) {
    return 'AI';
  }
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function isAiEventObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pickAiEventValue(row, config, key) {
  for (const logicalName of config.resolved[key] || []) {
    const value = readAiEventColumnValue(row, logicalName);
    if (value) {
      return value;
    }
  }
  return findAiEventValueByHeuristic(row, config, key);
}

function pickFormattedLookupValue(row, logicalName) {
  return String(row[`${logicalName}@${ODATA_FORMATTED_VALUE_ANNOTATION}`] || '').trim();
}

function formatAiEventDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeAiEventPayloadValue(row, config, key) {
  const raw = pickAiEventValue(row, config, key);
  const parsed = parseAiEventStructuredValue(raw);
  return {
    raw,
    parsed,
  };
}

function readAiEventColumnValue(row, logicalName) {
  if (!logicalName) {
    return '';
  }
  const formatted = row[`${logicalName}@${ODATA_FORMATTED_VALUE_ANNOTATION}`];
  if (formatted !== undefined && formatted !== null && String(formatted).trim()) {
    return String(formatted).trim();
  }
  const raw = row[logicalName];
  if (raw === undefined || raw === null) {
    return '';
  }
  return typeof raw === 'string' ? raw.trim() : JSON.stringify(raw);
}

function findAiEventValueByHeuristic(row, config, key) {
  const rule = AI_EVENT_FIELD_RULES[key];
  if (!rule) {
    return '';
  }
  let best = { score: 0, value: '' };
  for (const [columnName] of Object.entries(row)) {
    if (!columnName || columnName.includes('@') || columnName.startsWith('_') || ['msdyn_aieventid', 'createdon', 'msdyn_creditconsumed'].includes(columnName)) {
      continue;
    }
    const value = readAiEventColumnValue(row, columnName);
    if (!value) {
      continue;
    }
    const attribute = config.attributesByLogicalName[columnName];
    if (!attribute) {
      continue;
    }
    let score = scoreAiEventAttribute(attribute, rule, new Set(), new Set());
    if ((key === 'input' || key === 'output') && looksLikeJson(value)) {
      score += 220;
    }
    if ((key === 'input' || key === 'output') && value.length > 40) {
      score += 80;
    }
    if (key === 'creditType' && /copilot|ai builder/i.test(value)) {
      score += 250;
    }
    if (score > best.score) {
      best = { score, value };
    }
  }
  return best.value;
}

function parseAiEventStructuredValue(value) {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }
  let current = text;
  for (let index = 0; index < 3; index += 1) {
    try {
      const parsed = JSON.parse(current);
      if (typeof parsed === 'string' && looksLikeJson(parsed) && parsed.trim() !== current) {
        current = parsed.trim();
        continue;
      }
      return parsed;
    } catch {
      return text;
    }
  }
  return text;
}

function looksLikeJson(value) {
  return /^[\[{\"]/.test(String(value || '').trim());
}

async function dvBatchGet(requests) {
  const boundary = `batch_${randomUUID().replace(/-/g, '')}`;
  const body = `${requests.map((request) => buildBatchGetPart(boundary, request)).join('\r\n')}\r\n--${boundary}--`;
  const response = await apiTextRequest('POST', `${selected.orgUrl}/api/data/v9.2/$batch`, {
    authResource: selected.orgUrl,
    headers: {
      Accept: 'application/json',
      'Content-Type': `multipart/mixed;boundary=${boundary}`,
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    },
    body,
  });
  return parseBatchResponse(response.text, response.contentType);
}

function buildBatchGetPart(boundary, request) {
  const headers = Object.entries(request.headers || {}).map(([name, value]) => `${name}: ${value}`);
  return [
    `--${boundary}`,
    'Content-Type: application/http',
    'Content-Transfer-Encoding: binary',
    '',
    `GET ${request.path} HTTP/1.1`,
    'Accept: application/json',
    ...headers,
    '',
    '',
  ].join('\r\n');
}

function parseBatchResponse(text, contentType) {
  const boundaryMatch = String(contentType || '').match(/boundary=([^;]+)/i);
  if (!boundaryMatch) {
    throw new HttpError(500, 'Dataverse batch response did not include a boundary.');
  }
  const boundary = boundaryMatch[1].trim().replace(/^"|"$/g, '');
  return text
    .split(`--${boundary}`)
    .map((part) => part.trim())
    .filter((part) => part && part !== '--')
    .map(parseBatchPart);
}

function parseBatchPart(part) {
  const normalized = String(part || '').replace(/\r\n/g, '\n');
  const httpIndex = normalized.indexOf('HTTP/1.1');
  if (httpIndex < 0) {
    throw new HttpError(500, 'Dataverse batch part did not contain an HTTP payload.');
  }
  const httpPayload = normalized.slice(httpIndex).trim();
  const separatorIndex = httpPayload.indexOf('\n\n');
  const headerText = separatorIndex >= 0 ? httpPayload.slice(0, separatorIndex) : httpPayload;
  const bodyText = separatorIndex >= 0 ? httpPayload.slice(separatorIndex + 2).trim() : '';
  const headerLines = headerText.split('\n');
  const statusMatch = headerLines[0]?.match(/^HTTP\/1\.1\s+(\d+)/i);
  const status = statusMatch ? Number(statusMatch[1]) : 500;
  const data = parseJsonResponse(bodyText);
  if (status >= 400) {
    throw new HttpError(status, errorMessageFromResponse(data) || bodyText || `Batch request failed: ${status}`);
  }
  return { status, data };
}

async function dvGetAll(path, extraHeaders = {}) {
  const rows = [];
  let next = `${selected.orgUrl}/api/data/v9.2/${path}`;
  while (next) {
    const response = await dvRequestUrl('GET', next, undefined, extraHeaders);
    rows.push(...(response.data.value || []));
    next = response.data['@odata.nextLink'] || '';
  }
  return rows;
}

async function dvGetPage(path, pageToken = '', extraHeaders = {}) {
  const next = decodePageToken(pageToken);
  const response = await dvRequestUrl('GET', next || `${selected.orgUrl}/api/data/v9.2/${path}`, undefined, extraHeaders);
  return {
    rows: response.data.value || [],
    nextPageToken: encodePageToken(response.data['@odata.nextLink'] || ''),
  };
}

async function dvGet(path) {
  const response = await dvRequest('GET', path);
  return response.data;
}

function encodePageToken(nextLink) {
  const normalized = String(nextLink || '').trim();
  return normalized ? Buffer.from(normalized, 'utf8').toString('base64url') : '';
}

function decodePageToken(pageToken) {
  const normalized = String(pageToken || '').trim();
  if (!normalized) {
    return '';
  }
  try {
    const decoded = Buffer.from(normalized, 'base64url').toString('utf8');
    if (!decoded.startsWith(`${selected.orgUrl}/api/data/v9.2/`)) {
      throw new Error('Unexpected page token target.');
    }
    return decoded;
  } catch {
    throw new HttpError(400, 'Invalid page token. Refresh users or teams and try again.');
  }
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

async function targetDvGet(orgUrl, path, accountHomeId = '') {
  const response = await targetDvRequest('GET', orgUrl, path, undefined, accountHomeId);
  return response.data;
}

async function targetDvGetAll(orgUrl, path, extraHeaders = {}, accountHomeId = '') {
  const rows = [];
  const normalizedOrgUrl = normalizeOrgUrl(orgUrl);
  let next = `${normalizedOrgUrl}/api/data/v9.2/${path}`;
  while (next) {
    const response = await dvRequestUrl('GET', next, undefined, extraHeaders, normalizedOrgUrl, accountHomeId);
    rows.push(...(response.data.value || []));
    next = response.data['@odata.nextLink'] || '';
  }
  return rows;
}

async function targetDvPost(orgUrl, path, body) {
  const response = await targetDvRequest('POST', orgUrl, path, body);
  return response.data;
}

function targetDvRequest(method, orgUrl, path, body, accountHomeId = '') {
  return dvRequestUrl(method, `${normalizeOrgUrl(orgUrl)}/api/data/v9.2/${path}`, body, {}, normalizeOrgUrl(orgUrl), accountHomeId);
}

async function dvRequestUrl(method, url, body, extraHeaders = {}, authResource = selected.orgUrl, accountHomeId = '') {
  try {
    return await apiHttpRequest(method, url, {
      authResource,
      accountHomeId,
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
  const accessToken = options.accountHomeId
    ? await getAccessTokenForAccount(authResource, options.accountHomeId)
    : await getAccessTokenForSelectedAccount(authResource);
  for (let attempt = 0; attempt <= DATAVERSE_THROTTLE_MAX_RETRIES; attempt += 1) {
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
    if (response.status === 429 && attempt < DATAVERSE_THROTTLE_MAX_RETRIES) {
      await delay(dataverseRetryDelayMs(response.headers.get('retry-after'), attempt));
      continue;
    }
    if (!response.ok) {
      throw new HttpError(response.status, errorMessageFromResponse(data) || `Request failed: ${response.status}`);
    }
    return { data };
  }
  throw new HttpError(429, 'Dataverse request remained throttled after retrying.');
}

function dataverseRetryDelayMs(retryAfter, attempt) {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(250, seconds * 1000);
  const date = Date.parse(String(retryAfter || ''));
  if (Number.isFinite(date)) return Math.max(250, date - Date.now());
  return Math.min(30_000, 1000 * (2 ** attempt)) + Math.floor(Math.random() * 250);
}

async function apiTextRequest(method, url, options = {}) {
  const authResource = options.authResource || selected.orgUrl;
  const accessToken = await getAccessTokenForSelectedAccount(authResource);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
    body: options.body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(response.status, text || `Request failed: ${response.status}`);
  }
  return {
    text,
    contentType: response.headers.get('content-type') || '',
  };
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

async function readJson(req) {
  // bootstrap.js delivers the request body as a string on the fake req.
  const raw = typeof req.body === 'string' ? req.body : '';
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function normalizeReportEnvironment(environment) {
  return {
    displayName: String(environment.displayName || environment.environmentDisplayName || environment.friendlyName || '').trim(),
    environmentId: String(environment.environmentId || environment.environmentName || environment.name || selected.environmentName || '').trim(),
    orgUrl: normalizeOrgUrl(environment.orgUrl || selected.orgUrl || ''),
  };
}

function safeFilename(value) {
  return String(value || 'security-role').replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'security-role';
}

function isDefaultExcludedPublisher(name) {
  return /microsoft|dynamics/i.test(String(name || ''));
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

function sendAutomatedReportResponse(res, report) {
  if (Array.isArray(report?.files)) {
    sendJson(res, 200, {
      files: report.files.map((file) => ({
        filename: file.filename,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        base64: Buffer.from(file.bytes).toString('base64'),
      })),
    });
    return;
  }
  sendXlsx(res, 200, report.filename, report.bytes);
}

function sendZip(res, status, filename, bytes) {
  res.writeHead(status, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': bytes.length,
  });
  res.end(bytes);
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

export {
  buildAutomatedSolutionTotalsRows,
  dataverseTableMetadataPath,
  extractConnectionReferences,
  extractEnvironmentVariables,
  extractSolutionComponents,
};
