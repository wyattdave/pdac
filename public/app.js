import {
  addCalendarDays,
  buildStandaloneWeeklyReportHtml,
  buildWeeklyReportModel,
  filterWeeklyReportEvents,
  formatLocalDateKey,
  historyDateRange,
  startOfCalendarWeek,
} from './weekly-report.js';

const el = {
  themeButton: document.querySelector('#themeButton'),
  accountSelect: document.querySelector('#accountSelect'),
  environmentDropdownButton: document.querySelector('#environmentDropdownButton'),
  environmentDropdown: document.querySelector('#environmentDropdown'),
  environmentPickerSearch: document.querySelector('#environmentPickerSearch'),
  environmentPickerList: document.querySelector('#environmentPickerList'),
  tabs: document.querySelectorAll('.tab'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  signInButton: document.querySelector('#signInButton'),
  signInDifferentButton: document.querySelector('#signInDifferentButton'),
  logoutButton: document.querySelector('#logoutButton'),
  loadEnvironmentsButton: document.querySelector('#loadEnvironmentsButton'),
  loadUsersTeamsButton: document.querySelector('#loadUsersTeamsButton'),
  loadConnectionsButton: document.querySelector('#loadConnectionsButton'),
  toggleCreateUserButton: document.querySelector('#toggleCreateUserButton'),
  toggleCreateTeamButton: document.querySelector('#toggleCreateTeamButton'),
  createUserPanel: document.querySelector('#createUserPanel'),
  createTeamPanel: document.querySelector('#createTeamPanel'),
  userSearch: document.querySelector('#userSearch'),
  usersList: document.querySelector('#usersList'),
  syncUserForm: document.querySelector('#syncUserForm'),
  teamSearch: document.querySelector('#teamSearch'),
  teamsList: document.querySelector('#teamsList'),
  createTeamForm: document.querySelector('#createTeamForm'),
  teamBusinessUnit: document.querySelector('#teamBusinessUnit'),
  teamMembersPanel: document.querySelector('#teamMembersPanel'),
  connectionSearch: document.querySelector('#connectionSearch'),
  myConnectionsOnly: document.querySelector('#myConnectionsOnly'),
  brokenConnectionsOnly: document.querySelector('#brokenConnectionsOnly'),
  connectionSummary: document.querySelector('#connectionSummary'),
  connectionsList: document.querySelector('#connectionsList'),
  connectionDeleteModal: document.querySelector('#connectionDeleteModal'),
  connectionDeleteTitle: document.querySelector('#connectionDeleteTitle'),
  connectionDeleteMeta: document.querySelector('#connectionDeleteMeta'),
  connectionDeleteClose: document.querySelector('#connectionDeleteClose'),
  connectionDeleteConfirm: document.querySelector('#connectionDeleteConfirm'),
  connectionDeleteCancel: document.querySelector('#connectionDeleteCancel'),
  roleAssignmentModal: document.querySelector('#roleAssignmentModal'),
  roleAssignmentTitle: document.querySelector('#roleAssignmentTitle'),
  roleAssignmentMeta: document.querySelector('#roleAssignmentMeta'),
  roleAssignmentClose: document.querySelector('#roleAssignmentClose'),
  roleAssignmentSearch: document.querySelector('#roleAssignmentSearch'),
  roleAssignmentRoles: document.querySelector('#roleAssignmentRoles'),
  loadRolesButton: document.querySelector('#loadRolesButton'),
  createRoleForm: document.querySelector('#createRoleForm'),
  toggleCreateRoleButton: document.querySelector('#toggleCreateRoleButton'),
  createRoleBusinessUnit: document.querySelector('#createRoleBusinessUnit'),
  renameButton: document.querySelector('#renameButton'),
  downloadButton: document.querySelector('#downloadButton'),
  downloadMiscButton: document.querySelector('#downloadMiscButton'),
  uploadButton: document.querySelector('#uploadButton'),
  csvFile: document.querySelector('#csvFile'),
  filePickerText: document.querySelector('#filePickerText'),
  uploadLabel: document.querySelector('#uploadLabel'),
  roleFileFormats: document.querySelectorAll('input[name="roleFileFormat"]'),
  selectedEnvironmentId: document.querySelector('#selectedEnvironmentId'),
  selectedEnvironmentUrl: document.querySelector('#selectedEnvironmentUrl'),
  copyEnvironmentButton: document.querySelector('#copyEnvironmentButton'),
  sqlTablesSummary: document.querySelector('#sqlTablesSummary'),
  refreshSqlTablesButton: document.querySelector('#refreshSqlTablesButton'),
  exportSqlTablesButton: document.querySelector('#exportSqlTablesButton'),
  downloadTrendTemplateButton: document.querySelector('#downloadTrendTemplateButton'),
  importTrendDataButton: document.querySelector('#importTrendDataButton'),
  trendDataImportFile: document.querySelector('#trendDataImportFile'),
  deleteSqlRecordsButton: document.querySelector('#deleteSqlRecordsButton'),
  sqlTablesList: document.querySelector('#sqlTablesList'),
  sqlDeleteModal: document.querySelector('#sqlDeleteModal'),
  sqlDeleteTitle: document.querySelector('#sqlDeleteTitle'),
  sqlDeleteMeta: document.querySelector('#sqlDeleteMeta'),
  sqlDeleteClose: document.querySelector('#sqlDeleteClose'),
  sqlDeleteConfirm: document.querySelector('#sqlDeleteConfirm'),
  sqlDeleteCancel: document.querySelector('#sqlDeleteCancel'),
  automatedReportStatusTitle: document.querySelector('#automatedReportStatusTitle'),
  automatedReportStatusList: document.querySelector('#automatedReportStatusList'),
  automatedReportDownloads: document.querySelector('#automatedReportDownloads'),
  automatedReportsRunOnLoad: document.querySelector('#automatedReportsRunOnLoad'),
  automatedReportsSaveTrends: document.querySelector('#automatedReportsSaveTrends'),
  automatedAiEventsRange: document.querySelector('#automatedAiEventsRange'),
  automatedAiEventsStart: document.querySelector('#automatedAiEventsStart'),
  automatedAiEventsEnd: document.querySelector('#automatedAiEventsEnd'),
  automatedAiEventsAutoDownload: document.querySelector('#automatedAiEventsAutoDownload'),
  automatedAiEventsEnvironments: document.querySelector('#automatedAiEventsEnvironments'),
  automatedAiEventsDownloads: document.querySelector('#automatedAiEventsDownloads'),
  automatedAgentSessionsRange: document.querySelector('#automatedAgentSessionsRange'),
  automatedAgentSessionsStart: document.querySelector('#automatedAgentSessionsStart'),
  automatedAgentSessionsEnd: document.querySelector('#automatedAgentSessionsEnd'),
  automatedAgentSessionsAutoDownload: document.querySelector('#automatedAgentSessionsAutoDownload'),
  automatedAgentSessionsEnvironments: document.querySelector('#automatedAgentSessionsEnvironments'),
  automatedAgentSessionsDownloads: document.querySelector('#automatedAgentSessionsDownloads'),
  automatedSolutionsPublisherExclusions: document.querySelector('#automatedSolutionsPublisherExclusions'),
  automatedSolutionsIncludeManaged: document.querySelector('#automatedSolutionsIncludeManaged'),
  automatedSolutionsIncludeMicrosoft: document.querySelector('#automatedSolutionsIncludeMicrosoft'),
  automatedSolutionsAutoDownload: document.querySelector('#automatedSolutionsAutoDownload'),
  automatedSolutionsEnvironments: document.querySelector('#automatedSolutionsEnvironments'),
  automatedSolutionsDownloads: document.querySelector('#automatedSolutionsDownloads'),
  automatedFlowRunsAutoDownload: document.querySelector('#automatedFlowRunsAutoDownload'),
  automatedFlowRunsEnvironments: document.querySelector('#automatedFlowRunsEnvironments'),
  automatedFlowRunsDownloads: document.querySelector('#automatedFlowRunsDownloads'),
  reportsEnvironments: document.querySelector('#reportsEnvironments'),
  trendRange: document.querySelector('#trendRange'),
  trendStart: document.querySelector('#trendStart'),
  trendEnd: document.querySelector('#trendEnd'),
  chartsStatus: document.querySelector('#chartsStatus'),
  chartsGrid: document.querySelector('#chartsGrid'),
  reportsStatus: document.querySelector('#reportsStatus'),
  reportsCharts: document.querySelector('#reportsCharts'),
  standardReportsContent: document.querySelector('#standardReportsContent'),
  weeklyReportButton: document.querySelector('#weeklyReportButton'),
  weeklyReportPanel: document.querySelector('#weeklyReportPanel'),
  weeklyReportEnabled: document.querySelector('#weeklyReportEnabled'),
  weeklyReportRefreshButton: document.querySelector('#weeklyReportRefreshButton'),
  weeklyReportDownloadButton: document.querySelector('#weeklyReportDownloadButton'),
  weeklyReportStatus: document.querySelector('#weeklyReportStatus'),
  weeklyReportLoading: document.querySelector('#weeklyReportLoading'),
  weeklyReportLoadingText: document.querySelector('#weeklyReportLoadingText'),
  weeklyReportEnvironment: document.querySelector('#weeklyReportEnvironment'),
  weeklyReportWeek: document.querySelector('#weeklyReportWeek'),
  weeklyReportCurrent: document.querySelector('#weeklyReportCurrent'),
  weeklyReportHistoryRange: document.querySelector('#weeklyReportHistoryRange'),
  weeklyReportHistoryStart: document.querySelector('#weeklyReportHistoryStart'),
  weeklyReportHistoryEnd: document.querySelector('#weeklyReportHistoryEnd'),
  weeklyReportHistory: document.querySelector('#weeklyReportHistory'),
  status: document.querySelector('#status'),
  environmentSearch: document.querySelector('#environmentSearch'),
  environmentList: document.querySelector('#environmentList'),
  roles: document.querySelector('#roles'),
  roleSearch: document.querySelector('#roleSearch'),
  selectedRoleName: document.querySelector('#selectedRoleName'),
  selectedRoleId: document.querySelector('#selectedRoleId'),
  roleNameInput: document.querySelector('#roleNameInput'),
  loadSolutionsButton: document.querySelector('#loadSolutionsButton'),
  downloadSolutionsReportButton: document.querySelector('#downloadSolutionsReportButton'),
  solutionSearch: document.querySelector('#solutionSearch'),
  solutionCount: document.querySelector('#solutionCount'),
  unmanagedOnly: document.querySelector('#unmanagedOnly'),
  includeActiveSolution: document.querySelector('#includeActiveSolution'),
  includeDefaultSolution: document.querySelector('#includeDefaultSolution'),
  publisherDropdownButton: document.querySelector('#publisherDropdownButton'),
  publisherDropdown: document.querySelector('#publisherDropdown'),
  publisherSelectAllButton: document.querySelector('#publisherSelectAllButton'),
  publisherSelectNoneButton: document.querySelector('#publisherSelectNoneButton'),
  publisherFilter: document.querySelector('#publisherFilter'),
  solutions: document.querySelector('#solutions'),
  selectedSolutionName: document.querySelector('#selectedSolutionName'),
  selectedSolutionMeta: document.querySelector('#selectedSolutionMeta'),
  selectedSolutionPowerAutomateLink: document.querySelector('#selectedSolutionPowerAutomateLink'),
  selectedSolutionPowerAppsLink: document.querySelector('#selectedSolutionPowerAppsLink'),
  selectedSolutionCopilotLink: document.querySelector('#selectedSolutionCopilotLink'),
  loadComponentsButton: document.querySelector('#loadComponentsButton'),
  exportSolutionButton: document.querySelector('#exportSolutionButton'),
  deploySolutionButton: document.querySelector('#deploySolutionButton'),
  solutionTableActions: document.querySelector('#solutionTableActions'),
  createSolutionDiagramButton: document.querySelector('#createSolutionDiagramButton'),
  createSolutionTableButton: document.querySelector('#createSolutionTableButton'),
  solutionVersionInput: document.querySelector('#solutionVersionInput'),
  exportManaged: document.querySelector('#exportManaged'),
  solutionComponentSearchLabel: document.querySelector('#solutionComponentSearchLabel'),
  solutionComponentSearch: document.querySelector('#solutionComponentSearch'),
  solutionComponents: document.querySelector('#solutionComponents'),
  loadTablesButton: document.querySelector('#loadTablesButton'),
  loadAiEventsButton: document.querySelector('#loadAiEventsButton'),
  downloadAiEventsButton: document.querySelector('#downloadAiEventsButton'),
  loadFlowRunsButton: document.querySelector('#loadFlowRunsButton'),
  downloadFlowRunsButton: document.querySelector('#downloadFlowRunsButton'),
  loadAgentSessionsButton: document.querySelector('#loadAgentSessionsButton'),
  loadMoreAgentSessionsButton: document.querySelector('#loadMoreAgentSessionsButton'),
  downloadAgentSessionsButton: document.querySelector('#downloadAgentSessionsButton'),
  agentSessionsRange: document.querySelector('#agentSessionsRange'),
  agentSessionsStart: document.querySelector('#agentSessionsStart'),
  agentSessionsEnd: document.querySelector('#agentSessionsEnd'),
  agentSessionsSearch: document.querySelector('#agentSessionsSearch'),
  agentSessionsTotals: document.querySelector('#agentSessionsTotals'),
  agentSessionsTotalsTable: document.querySelector('#agentSessionsTotalsTable'),
  tableSearch: document.querySelector('#tableSearch'),
  tableScopes: document.querySelectorAll('input[name="tableScope"]'),
  tableSummary: document.querySelector('#tableSummary'),
  tablesList: document.querySelector('#tablesList'),
  selectedTableName: document.querySelector('#selectedTableName'),
  selectedTableMeta: document.querySelector('#selectedTableMeta'),
  selectedTablePowerAppsLink: document.querySelector('#selectedTablePowerAppsLink'),
  selectedTableDescription: document.querySelector('#selectedTableDescription'),
  columnScopes: document.querySelectorAll('input[name="columnScope"]'),
  columnsList: document.querySelector('#columnsList'),
  createTableDiagramButton: document.querySelector('#createTableDiagramButton'),
  createTableDocumentButton: document.querySelector('#createTableDocumentButton'),
  tableDiagramPanel: document.querySelector('#tableDiagramPanel'),
  tableDiagramMeta: document.querySelector('#tableDiagramMeta'),
  tableDiagramCanvas: document.querySelector('#tableDiagramCanvas'),
  tableDiagramSource: document.querySelector('#tableDiagramSource'),
  copyDiagramButton: document.querySelector('#copyDiagramButton'),
  aiEventsRange: document.querySelector('#aiEventsRange'),
  aiEventsStart: document.querySelector('#aiEventsStart'),
  aiEventsEnd: document.querySelector('#aiEventsEnd'),
  aiEventsCreditType: document.querySelector('#aiEventsCreditType'),
  aiEventsCreatedBy: document.querySelector('#aiEventsCreatedBy'),
  aiEventsToolName: document.querySelector('#aiEventsToolName'),
  aiEventsModel: document.querySelector('#aiEventsModel'),
  aiEventsSource: document.querySelector('#aiEventsSource'),
  aiEventsSummary: document.querySelector('#aiEventsSummary'),
  aiEventsWarnings: document.querySelector('#aiEventsWarnings'),
  aiEventsTotalsToggle: document.querySelector('#aiEventsTotalsToggle'),
  aiEventsTotals: document.querySelector('#aiEventsTotals'),
  aiEventsTable: document.querySelector('#aiEventsTable'),
  flowRunsRange: document.querySelector('#flowRunsRange'),
  flowRunsStart: document.querySelector('#flowRunsStart'),
  flowRunsEnd: document.querySelector('#flowRunsEnd'),
  flowRunsStatus: document.querySelector('#flowRunsStatus'),
  flowRunsTrigger: document.querySelector('#flowRunsTrigger'),
  flowRunsSearch: document.querySelector('#flowRunsSearch'),
  flowRunsMinDuration: document.querySelector('#flowRunsMinDuration'),
  flowRunsErrorsOnly: document.querySelector('#flowRunsErrorsOnly'),
  flowRunsSummary: document.querySelector('#flowRunsSummary'),
  flowRunsTotals: document.querySelector('#flowRunsTotals'),
  flowRunsTable: document.querySelector('#flowRunsTable'),
  agentSessionsSummary: document.querySelector('#agentSessionsSummary'),
  agentSessionsTable: document.querySelector('#agentSessionsTable'),
  diagramModal: document.querySelector('#diagramModal'),
  diagramModalTitle: document.querySelector('#diagramModalTitle'),
  diagramModalMeta: document.querySelector('#diagramModalMeta'),
  diagramExternalLegend: document.querySelector('#diagramExternalLegend'),
  diagramModalCanvas: document.querySelector('#diagramModalCanvas'),
  diagramZoomOutButton: document.querySelector('#diagramZoomOutButton'),
  diagramZoomInButton: document.querySelector('#diagramZoomInButton'),
  downloadDiagramSvgButton: document.querySelector('#downloadDiagramSvgButton'),
  downloadDiagramPngButton: document.querySelector('#downloadDiagramPngButton'),
  copyDiagramModalButton: document.querySelector('#copyDiagramModalButton'),
  diagramModalClose: document.querySelector('#diagramModalClose'),
  tableDocumentModal: document.querySelector('#tableDocumentModal'),
  tableDocumentTitle: document.querySelector('#tableDocumentTitle'),
  tableDocumentMeta: document.querySelector('#tableDocumentMeta'),
  tableDocumentBody: document.querySelector('#tableDocumentBody'),
  exportTableDocumentButton: document.querySelector('#exportTableDocumentButton'),
  tableDocumentClose: document.querySelector('#tableDocumentClose'),
  aiEventDetailModal: document.querySelector('#aiEventDetailModal'),
  aiEventDetailTitle: document.querySelector('#aiEventDetailTitle'),
  aiEventDetailMeta: document.querySelector('#aiEventDetailMeta'),
  aiEventDetailBody: document.querySelector('#aiEventDetailBody'),
  aiEventDetailClose: document.querySelector('#aiEventDetailClose'),
  agentSessionDetailModal: document.querySelector('#agentSessionDetailModal'),
  agentSessionDetailTitle: document.querySelector('#agentSessionDetailTitle'),
  agentSessionDetailMeta: document.querySelector('#agentSessionDetailMeta'),
  agentSessionDetailBody: document.querySelector('#agentSessionDetailBody'),
  agentSessionDetailClose: document.querySelector('#agentSessionDetailClose'),
  componentModal: document.querySelector('#componentModal'),
  componentModalTitle: document.querySelector('#componentModalTitle'),
  componentModalMeta: document.querySelector('#componentModalMeta'),
  componentModalBody: document.querySelector('#componentModalBody'),
  componentModalClose: document.querySelector('#componentModalClose'),
  solutionZipFile: document.querySelector('#solutionZipFile'),
  solutionZipText: document.querySelector('#solutionZipText'),
  importPackageSummary: document.querySelector('#importPackageSummary'),
  importEnvironmentSelect: document.querySelector('#importEnvironmentSelect'),
  prepareImportButton: document.querySelector('#prepareImportButton'),
  refreshImportTargetButton: document.querySelector('#refreshImportTargetButton'),
  importStatus: document.querySelector('#importStatus'),
  importConnections: document.querySelector('#importConnections'),
  importEnvironmentVariables: document.querySelector('#importEnvironmentVariables'),
  downloadImportSettingsButton: document.querySelector('#downloadImportSettingsButton'),
  importSettingsButton: document.querySelector('#importSettingsButton'),
  importSettingsFile: document.querySelector('#importSettingsFile'),
  importOverwrite: document.querySelector('#importOverwrite'),
  importPublishWorkflows: document.querySelector('#importPublishWorkflows'),
  importSolutionButton: document.querySelector('#importSolutionButton'),
  toast: document.querySelector('#toast'),
};

const state = {
  accounts: [],
  selectedAccountHomeId: '',
  environments: [],
  environmentsLoaded: false,
  hiddenEnvironmentIds: new Set(),
  selectedEnvironment: {
    environmentName: '',
    orgUrl: '',
  },
  automatedReports: {
    running: false,
    currentLabel: '',
    activeRunId: '',
    queue: [],
    history: [],
    selectedEnvironmentIds: {
      aiEvents: null,
      agentSessions: null,
      solutions: null,
      flowRuns: null,
      reports: null,
    },
    reportOptions: {
      aiEvents: { autoDownload: false },
      agentSessions: { autoDownload: false },
      solutions: { autoDownload: false },
      flowRuns: { autoDownload: false },
    },
    saveTrendData: false,
    charts: [],
    trendCharts: [],
    chartDashboardData: null,
    dashboardData: null,
    scheduleWatchTimer: 0,
    scheduleCompletionKey: '',
  },
  automatedReportSchedule: null,
  weeklyReport: {
    open: false,
    loading: false,
    settings: null,
    events: [],
    model: null,
    charts: [],
  },
  sqlTables: [],
  businessUnits: [],
  businessUnitsLoaded: false,
  users: [],
  usersLoaded: false,
  usersLoading: false,
  usersError: '',
  usersNextPageToken: '',
  usersRequestId: 0,
  teams: [],
  teamsLoaded: false,
  teamsLoading: false,
  teamsError: '',
  teamsNextPageToken: '',
  teamsRequestId: 0,
  connections: [],
  connectionsLoaded: false,
  connectionUser: null,
  connectionWarnings: [],
  pendingConnectionDeleteId: '',
  pendingSqlDelete: false,
  roles: [],
  selectedTeamId: '',
  roleAssignmentPrincipal: null,
  solutions: [],
  publisherFilterActive: false,
  selectedPublisherIds: null,
  selectedSolutionId: '',
  solutionComponents: [],
  solutionTableCount: 0,
  tables: [],
  tablesLoaded: false,
  aiEvents: [],
  aiEventsLoaded: false,
  aiEventFieldMappings: {},
  aiEventUnresolvedFields: [],
  aiEventDateRange: {
    range: 'month',
    startDate: '',
    endDate: '',
  },
  aiEventTotalsGroupBy: 'flow',
  aiEventTotalsSort: {
    column: 'eventCount',
    direction: 'desc',
  },
  aiEventSort: {
    column: 'created',
    direction: 'desc',
  },
  aiEventDetailCache: new Map(),
  selectedAiEventId: '',
  agentSessions: [],
  agentSessionsLoaded: false,
  agentSessionsLoading: false,
  agentSessionsNextPageToken: '',
  agentSessionDateRange: {
    range: 'month',
    startDate: '',
    endDate: '',
  },
  agentSessionDetailCache: new Map(),
  selectedAgentSessionId: '',
  flowRuns: [],
  flowRunsLoaded: false,
  flowRunDateRange: {
    range: '7d',
    startDate: '',
    endDate: '',
  },
  flowRunSort: {
    column: 'startTime',
    direction: 'desc',
  },
  flowRunTotalsSort: {
    column: 'totalRuns',
    direction: 'desc',
  },
  selectedTableLogicalName: '',
  selectedTableDetails: null,
  selectedTableDiagram: null,
  activeDiagram: null,
  diagramZoom: 1,
  activeTableDocument: null,
  selectedComponent: null,
  componentPrincipals: [],
  importPackage: null,
  importTargetPrepared: null,
};

const LAST_ACCOUNT_KEY = 'pdacLastAccountHomeId';
const LAST_ENVIRONMENT_PREFIX = 'pdacLastEnvironment';
const AUTOMATED_REPORTS_RUN_ON_LOAD_KEY = 'pdacAutomatedReportsRunOnLoad';
const AUTOMATED_REPORT_AUTO_DOWNLOAD_DATE_PREFIX = 'pdacAutomatedReportAutoDownloadDate';
const AUTOMATED_SOLUTIONS_PUBLISHER_EXCLUSIONS_KEY = 'pdacAutomatedSolutionsPublisherExclusions';
const AUTOMATED_REPORT_SETTINGS_KEY = 'pdacAutomatedReportSettings';
const REPORT_CHART_SETTINGS_KEY = 'pdacReportChartSettings';
const WEEKLY_REPORT_RANGE_KEY = 'pdacWeeklyReportRange';
const USERS_TEAMS_SEARCH_DELAY_MS = 220;

let userSearchTimer = 0;
let teamSearchTimer = 0;

el.tabs.forEach((tab) => tab.addEventListener('click', () => activateTab(tab.dataset.tab)));
el.themeButton.addEventListener('click', toggleTheme);
el.accountSelect.addEventListener('change', () => withBusy(el.accountSelect, switchAccount));
el.environmentDropdownButton.addEventListener('click', toggleEnvironmentDropdown);
el.environmentPickerSearch.addEventListener('input', renderEnvironmentPicker);
el.environmentPickerSearch.addEventListener('keydown', handleEnvironmentPickerKeydown);
el.environmentPickerList.addEventListener('click', (event) => {
  const button = event.target.closest('.environment-picker-option');
  if (!button) {
    return;
  }
  selectHeaderEnvironment(button.dataset.name || '').catch((error) => {
    toast(error.message);
    console.error(error);
  });
});
el.copyEnvironmentButton.addEventListener('click', () => copySelectedEnvironment().catch((error) => {
  toast(error.message);
  console.error(error);
}));
el.refreshSqlTablesButton?.addEventListener('click', () => withBusy(el.refreshSqlTablesButton, loadSqlTables, 'Refreshing'));
el.exportSqlTablesButton?.addEventListener('click', () => withBusy(el.exportSqlTablesButton, exportSqlTables, 'Exporting'));
el.downloadTrendTemplateButton?.addEventListener('click', () => withBusy(
  el.downloadTrendTemplateButton,
  downloadTrendDataTemplate,
  'Downloading',
));
el.importTrendDataButton?.addEventListener('click', () => el.trendDataImportFile?.click());
el.trendDataImportFile?.addEventListener('change', () => {
  importTrendData().catch((error) => {
    toast(error.message, 'error');
    console.error(error);
  });
});
el.sqlTablesList?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-sql-table-export]');
  if (!button) {
    return;
  }
  withBusy(button, () => exportSqlTable(button.dataset.sqlTableExport || ''), 'Downloading');
});
el.deleteSqlRecordsButton?.addEventListener('click', openSqlDeleteModal);
el.automatedReportsRunOnLoad?.addEventListener('change', () => {
  localStorage.setItem(AUTOMATED_REPORTS_RUN_ON_LOAD_KEY, el.automatedReportsRunOnLoad.checked ? 'true' : 'false');
  saveAutomatedReportSettings();
});
el.automatedReportsSaveTrends?.addEventListener('change', saveAutomatedReportSettings);
el.weeklyReportButton?.addEventListener('click', () => {
  openWeeklyReport().catch((error) => {
    toast(error.message, 'error');
    console.error(error);
  });
});
el.weeklyReportEnabled?.addEventListener('change', () => {
  saveWeeklyReportSettings().catch((error) => {
    el.weeklyReportEnabled.checked = !el.weeklyReportEnabled.checked;
    toast(error.message, 'error');
    console.error(error);
  });
});
el.weeklyReportRefreshButton?.addEventListener('click', () => withBusy(
  el.weeklyReportRefreshButton,
  () => refreshWeeklyReportData({ sync: true }),
  'Refreshing',
));
el.weeklyReportDownloadButton?.addEventListener('click', downloadWeeklyReportHtml);
el.weeklyReportEnvironment?.addEventListener('change', renderWeeklyReport);
el.weeklyReportWeek?.addEventListener('change', renderWeeklyReport);
el.weeklyReportHistoryRange?.addEventListener('change', handleWeeklyHistoryRangeChange);
el.weeklyReportHistoryStart?.addEventListener('change', handleWeeklyHistoryRangeChange);
el.weeklyReportHistoryEnd?.addEventListener('change', handleWeeklyHistoryRangeChange);
el.weeklyReportCurrent?.addEventListener('click', handleWeeklySolutionToggle);
el.weeklyReportHistory?.addEventListener('click', handleWeeklySolutionToggle);
el.weeklyReportCurrent?.addEventListener('change', handleWeeklyReportFilter);
el.weeklyReportHistory?.addEventListener('change', handleWeeklyReportFilter);
el.sqlDeleteClose?.addEventListener('click', closeSqlDeleteModal);
el.sqlDeleteCancel?.addEventListener('click', closeSqlDeleteModal);
el.sqlDeleteConfirm?.addEventListener('click', () => {
  confirmDeleteSqlRecords().catch((error) => {
    toast(error.message, 'error');
    console.error(error);
  });
});
el.signInButton.addEventListener('click', () => withBusy(el.signInButton, signIn));
el.signInDifferentButton.addEventListener('click', () => withBusy(el.signInDifferentButton, signInDifferent));
el.logoutButton.addEventListener('click', () => withBusy(el.logoutButton, logout));
el.loadEnvironmentsButton.addEventListener('click', () => withBusy(el.loadEnvironmentsButton, loadEnvironments));
el.loadUsersTeamsButton.addEventListener('click', () => withBusy(el.loadUsersTeamsButton, loadUsersAndTeams));
el.loadConnectionsButton.addEventListener('click', () => withBusy(el.loadConnectionsButton, loadConnections, 'Loading connections'));
el.toggleCreateUserButton.addEventListener('click', () => toggleUsersTeamsCreatePanel('user'));
el.toggleCreateTeamButton.addEventListener('click', () => toggleUsersTeamsCreatePanel('team'));
el.userSearch.addEventListener('input', scheduleUserSearch);
el.teamSearch.addEventListener('input', scheduleTeamSearch);
el.connectionSearch.addEventListener('input', renderConnections);
el.myConnectionsOnly.addEventListener('change', renderConnections);
el.brokenConnectionsOnly.addEventListener('change', renderConnections);
el.syncUserForm.addEventListener('submit', syncEnvironmentUser);
el.createTeamForm.addEventListener('submit', createEnvironmentTeam);
el.roleAssignmentClose.addEventListener('click', closeRoleAssignmentModal);
el.roleAssignmentSearch.addEventListener('input', renderRoleAssignmentList);
el.roleAssignmentRoles.addEventListener('click', (event) => {
  const button = event.target.closest('[data-role-assignment-id]');
  if (!button) {
    return;
  }
  assignSecurityRole(button.dataset.roleAssignmentId || '', button).catch((error) => {
    toast(error.message, 'error');
    console.error(error);
  });
});
el.usersList.addEventListener('click', (event) => {
  const nextPageButton = event.target.closest('[data-users-next-page]');
  if (nextPageButton) {
    loadUsersPage({ append: true }).catch((error) => {
      toast(error.message, 'error');
      console.error(error);
    });
    return;
  }
  const button = event.target.closest('[data-principal-action="assign-role"]');
  if (button) {
    openRoleAssignmentModal(button.dataset.principalType || '', button.dataset.principalId || '');
  }
});
el.teamsList.addEventListener('click', (event) => {
  const nextPageButton = event.target.closest('[data-teams-next-page]');
  if (nextPageButton) {
    loadTeamsPage({ append: true }).catch((error) => {
      toast(error.message, 'error');
      console.error(error);
    });
    return;
  }
  const assignButton = event.target.closest('[data-principal-action="assign-role"]');
  if (assignButton) {
    openRoleAssignmentModal(assignButton.dataset.principalType || '', assignButton.dataset.principalId || '');
    return;
  }
  const selectButton = event.target.closest('[data-team-select]');
  if (selectButton) {
    selectTeam(selectButton.dataset.id || '');
  }
});
el.teamMembersPanel.addEventListener('click', (event) => {
  const button = event.target.closest('[data-team-action]');
  if (!button) {
    return;
  }
  handleTeamAction(button.dataset.teamAction || '', button).catch((error) => {
    toast(error.message, 'error');
    console.error(error);
  });
});
el.connectionsList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-connection-action="delete"]');
  if (!button) {
    return;
  }
  openConnectionDeleteModal(button.dataset.connectionId || '');
});
el.connectionDeleteClose.addEventListener('click', closeConnectionDeleteModal);
el.connectionDeleteCancel.addEventListener('click', closeConnectionDeleteModal);
el.connectionDeleteConfirm.addEventListener('click', () => {
  confirmDeleteConnection().catch((error) => {
    toast(error.message, 'error');
    console.error(error);
  });
});
el.loadRolesButton.addEventListener('click', () => withBusy(el.loadRolesButton, loadRoles));
el.toggleCreateRoleButton.addEventListener('click', toggleCreateRoleForm);
el.createRoleForm.addEventListener('submit', createRole);
el.createRoleBusinessUnit.addEventListener('focus', () => {
  if (!state.businessUnitsLoaded && state.selectedEnvironment.orgUrl) {
    loadBusinessUnits().catch((error) => {
      toast(error.message);
      console.error(error);
    });
  }
});
el.teamBusinessUnit.addEventListener('focus', () => {
  if (!state.businessUnitsLoaded && state.selectedEnvironment.orgUrl) {
    loadBusinessUnits().catch((error) => {
      toast(error.message);
      console.error(error);
    });
  }
});
el.renameButton.addEventListener('click', () => withBusy(el.renameButton, renameRole));
el.downloadButton.addEventListener('click', () => downloadRoleFile('table'));
el.downloadMiscButton.addEventListener('click', () => downloadRoleFile('misc'));
el.uploadButton.addEventListener('click', () => withBusy(el.uploadButton, uploadRoleFile, `Processing ${getRoleFileFormat().toUpperCase()}`));
el.roleFileFormats.forEach((input) => input.addEventListener('change', handleRoleFileFormatChange));
el.environmentSearch.addEventListener('input', renderEnvironmentList);
document.querySelectorAll('[data-automated-run]').forEach((button) => {
  button.addEventListener('click', () => queueAutomatedReports(button.dataset.automatedRun || '').catch((error) => {
    toast(error.message, 'error');
    console.error(error);
  }));
});
document.querySelectorAll('[data-automated-auto-download]').forEach((input) => {
  input.addEventListener('change', saveAutomatedReportSettings);
});
el.automatedSolutionsPublisherExclusions.addEventListener('input', () => {
  localStorage.setItem(AUTOMATED_SOLUTIONS_PUBLISHER_EXCLUSIONS_KEY, el.automatedSolutionsPublisherExclusions.value || '');
  saveAutomatedReportSettings();
});
el.automatedAiEventsRange.addEventListener('change', handleAutomatedReportSettingsChange);
el.automatedAiEventsStart.addEventListener('change', handleAutomatedReportSettingsChange);
el.automatedAiEventsEnd.addEventListener('change', handleAutomatedReportSettingsChange);
el.automatedAgentSessionsRange.addEventListener('change', handleAutomatedReportSettingsChange);
el.automatedAgentSessionsStart.addEventListener('change', handleAutomatedReportSettingsChange);
el.automatedAgentSessionsEnd.addEventListener('change', handleAutomatedReportSettingsChange);
el.automatedSolutionsIncludeManaged.addEventListener('change', saveAutomatedReportSettings);
el.automatedSolutionsIncludeMicrosoft.addEventListener('change', saveAutomatedReportSettings);
el.automatedAiEventsEnvironments.addEventListener('change', () => handleAutomatedEnvironmentSelection('aiEvents'));
el.automatedAgentSessionsEnvironments.addEventListener('change', () => handleAutomatedEnvironmentSelection('agentSessions'));
el.automatedSolutionsEnvironments.addEventListener('change', () => handleAutomatedEnvironmentSelection('solutions'));
el.automatedFlowRunsEnvironments.addEventListener('change', () => handleAutomatedEnvironmentSelection('flowRuns'));
el.reportsEnvironments?.addEventListener('change', () => handleAutomatedEnvironmentSelection('reports'));
el.trendRange?.addEventListener('change', () => {
  syncTrendRangeVisibility();
  loadCachedReportsDashboard().catch((error) => {
    toast(error.message, 'error');
    console.error(error);
  });
});
el.trendStart?.addEventListener('change', () => loadCachedReportsDashboard().catch((error) => {
  toast(error.message, 'error');
  console.error(error);
}));
el.trendEnd?.addEventListener('change', () => loadCachedReportsDashboard().catch((error) => {
  toast(error.message, 'error');
  console.error(error);
}));
el.reportsCharts?.addEventListener('click', handleReportChartClick);
el.reportsCharts?.addEventListener('change', handleReportChartChange);
el.chartsGrid?.addEventListener('click', handleReportChartClick);
document.addEventListener('input', (event) => {
  const search = event.target.closest('[data-automated-environment-search]');
  if (search) {
    const groupKey = search.dataset.automatedEnvironmentSearch || '';
    const container = automatedEnvironmentContainer(groupKey);
    const query = search.value;
    renderAutomatedEnvironmentSelector(groupKey, container);
    const replacement = container?.querySelector('[data-automated-environment-search]');
    replacement?.focus();
    replacement?.setSelectionRange(query.length, query.length);
  }
});
document.addEventListener('click', (event) => {
  const copyButton = event.target.closest('[data-copy-automated-environments]');
  if (copyButton) {
    copyAutomatedReportEnvironments(copyButton.dataset.copyAutomatedEnvironments || '').catch((error) => {
      toast(error.message, 'error');
      console.error(error);
    });
    return;
  }
  const pasteButton = event.target.closest('[data-paste-automated-environments]');
  if (pasteButton) {
    pasteAutomatedReportEnvironments(pasteButton.dataset.pasteAutomatedEnvironments || '').catch((error) => {
      toast(error.message, 'error');
      console.error(error);
    });
  }
});
el.roleSearch.addEventListener('input', filterRoles);
el.csvFile.addEventListener('change', () => {
  updateRoleFileFormatUi();
});
el.loadSolutionsButton.addEventListener('click', () => withBusy(el.loadSolutionsButton, loadSolutions));
el.downloadSolutionsReportButton.addEventListener('click', () => withBusy(el.downloadSolutionsReportButton, downloadSolutionsReport, 'Creating report'));
el.solutionSearch.addEventListener('input', renderSolutions);
el.solutionComponentSearch.addEventListener('input', renderSolutionComponents);
el.unmanagedOnly.addEventListener('change', renderSolutions);
el.includeActiveSolution.addEventListener('change', renderSolutions);
el.includeDefaultSolution.addEventListener('change', renderSolutions);
el.publisherFilter.addEventListener('change', handlePublisherFilterChange);
el.publisherSelectAllButton.addEventListener('click', () => setPublisherSelection(true));
el.publisherSelectNoneButton.addEventListener('click', () => setPublisherSelection(false));
el.loadTablesButton.addEventListener('click', () => withBusy(el.loadTablesButton, loadTables));
el.loadAiEventsButton.addEventListener('click', () => withBusy(el.loadAiEventsButton, () => loadAiEvents(), 'Loading AI Flow'));
el.downloadAiEventsButton.addEventListener('click', () => withBusy(el.downloadAiEventsButton, downloadAiEventsExcel, 'Downloading'));
el.loadFlowRunsButton.addEventListener('click', () => withBusy(el.loadFlowRunsButton, () => loadFlowRuns(), 'Loading flow runs'));
el.downloadFlowRunsButton.addEventListener('click', () => withBusy(el.downloadFlowRunsButton, downloadFlowRunsExcel, 'Downloading'));
el.loadAgentSessionsButton.addEventListener('click', () => withBusy(el.loadAgentSessionsButton, () => loadAgentSessions(), 'Loading sessions'));
el.loadMoreAgentSessionsButton.addEventListener('click', () => withBusy(el.loadMoreAgentSessionsButton, () => loadAgentSessions({ append: true }), 'Loading more'));
el.downloadAgentSessionsButton.addEventListener('click', () => withBusy(el.downloadAgentSessionsButton, downloadAgentSessionTotalsExcel, 'Downloading'));
el.tableSearch.addEventListener('input', renderTables);
el.aiEventsRange.addEventListener('change', handleAiEventRangeChange);
el.aiEventsStart.addEventListener('change', handleAiEventCustomRangeChange);
el.aiEventsEnd.addEventListener('change', handleAiEventCustomRangeChange);
el.aiEventsTotalsToggle?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-ai-event-total-group]');
  if (!button) {
    return;
  }
  setAiEventTotalsGroupBy(button.dataset.aiEventTotalGroup || 'flow');
});
el.aiEventsCreditType.addEventListener('change', renderAiEvents);
el.aiEventsCreatedBy.addEventListener('input', renderAiEvents);
el.aiEventsToolName.addEventListener('input', renderAiEvents);
el.aiEventsModel.addEventListener('input', renderAiEvents);
el.aiEventsSource.addEventListener('input', renderAiEvents);
el.aiEventsTotals.addEventListener('click', (event) => {
  const button = event.target.closest('[data-ai-event-total-sort]');
  if (!button) {
    return;
  }
  toggleAiEventTotalsSort(button.dataset.aiEventTotalSort || '');
});
el.flowRunsRange.addEventListener('change', handleFlowRunRangeChange);
el.flowRunsStart.addEventListener('change', handleFlowRunCustomRangeChange);
el.flowRunsEnd.addEventListener('change', handleFlowRunCustomRangeChange);
el.flowRunsStatus.addEventListener('change', renderFlowRuns);
el.flowRunsTrigger.addEventListener('change', renderFlowRuns);
el.flowRunsSearch.addEventListener('input', renderFlowRuns);
el.flowRunsMinDuration.addEventListener('input', renderFlowRuns);
el.flowRunsErrorsOnly.addEventListener('change', renderFlowRuns);
el.flowRunsTotals.addEventListener('click', (event) => {
  const button = event.target.closest('[data-flow-run-total-sort]');
  if (!button) {
    return;
  }
  toggleFlowRunTotalsSort(button.dataset.flowRunTotalSort || '');
});
el.agentSessionsRange.addEventListener('change', handleAgentSessionRangeChange);
el.agentSessionsStart.addEventListener('change', handleAgentSessionCustomRangeChange);
el.agentSessionsEnd.addEventListener('change', handleAgentSessionCustomRangeChange);
el.agentSessionsSearch.addEventListener('input', renderAgentSessions);
el.agentSessionsTable.addEventListener('click', (event) => {
  const row = event.target.closest('[data-agent-session-id]');
  if (!row) {
    return;
  }
  openAgentSessionDetail(row.dataset.agentSessionId || '').catch((error) => {
    toast(error.message, 'error');
    console.error(error);
  });
});
el.agentSessionsTable.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }
  const row = event.target.closest('[data-agent-session-id]');
  if (!row) {
    return;
  }
  event.preventDefault();
  openAgentSessionDetail(row.dataset.agentSessionId || '').catch((error) => {
    toast(error.message, 'error');
    console.error(error);
  });
});
el.tableScopes.forEach((input) => input.addEventListener('change', () => {
  state.tablesLoaded = false;
  state.tables = [];
  state.selectedTableLogicalName = '';
  state.selectedTableDetails = null;
  state.selectedTableDiagram = null;
  renderTables();
  clearTableSelection();
}));
el.columnScopes.forEach((input) => input.addEventListener('change', () => {
  if (state.selectedTableLogicalName) {
    loadSelectedTableDetails().catch((error) => {
      toast(error.message, 'error');
      console.error(error);
    });
  }
}));
el.tablesList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-table-logical-name]');
  if (!button) {
    return;
  }
  selectTable(button.dataset.tableLogicalName || '').catch((error) => {
    toast(error.message, 'error');
    console.error(error);
  });
});
el.aiEventsTable.addEventListener('click', (event) => {
  const sortButton = event.target.closest('[data-ai-event-sort]');
  if (sortButton) {
    event.preventDefault();
    toggleAiEventSort(sortButton.dataset.aiEventSort || '');
    return;
  }
  const row = event.target.closest('[data-ai-event-id]');
  if (!row) {
    return;
  }
  openAiEventDetail(row.dataset.aiEventId || '').catch((error) => {
    toast(error.message, 'error');
    console.error(error);
  });
});
el.flowRunsTable.addEventListener('click', (event) => {
  const sortButton = event.target.closest('[data-flow-run-sort]');
  if (!sortButton) {
    return;
  }
  event.preventDefault();
  toggleFlowRunSort(sortButton.dataset.flowRunSort || '');
});
el.createTableDiagramButton.addEventListener('click', () => withBusy(el.createTableDiagramButton, loadTableDiagram, 'Creating diagram'));
el.createTableDocumentButton.addEventListener('click', () => withBusy(el.createTableDocumentButton, loadTableDocument, 'Creating table'));
el.copyDiagramButton.addEventListener('click', () => {
  const source = state.selectedTableDiagram?.mermaid || '';
  if (!source) {
    toast('Create a diagram first.', 'error');
    return;
  }
  writeClipboard(source).then(() => toast('Mermaid source copied.')).catch((error) => {
    toast(error.message, 'error');
    console.error(error);
  });
});
el.createSolutionDiagramButton.addEventListener('click', () => withBusy(el.createSolutionDiagramButton, loadSolutionTableDiagram, 'Creating diagram'));
el.createSolutionTableButton.addEventListener('click', () => withBusy(el.createSolutionTableButton, loadSolutionTableDocument, 'Creating table'));
el.diagramZoomOutButton.addEventListener('click', () => setDiagramZoom(state.diagramZoom - 0.15));
el.diagramZoomInButton.addEventListener('click', () => setDiagramZoom(state.diagramZoom + 0.15));
el.downloadDiagramSvgButton.addEventListener('click', downloadActiveDiagramSvg);
el.downloadDiagramPngButton.addEventListener('click', () => downloadActiveDiagramPng().catch((error) => {
  toast(error.message, 'error');
  console.error(error);
}));
el.copyDiagramModalButton.addEventListener('click', () => copyActiveMermaid().catch((error) => {
  toast(error.message, 'error');
  console.error(error);
}));
el.diagramModalClose.addEventListener('click', closeDiagramModal);
el.tableDocumentClose.addEventListener('click', closeTableDocumentModal);
el.aiEventDetailClose.addEventListener('click', closeAiEventDetailModal);
el.agentSessionDetailClose.addEventListener('click', closeAgentSessionDetailModal);
el.exportTableDocumentButton.addEventListener('click', () => exportActiveTableDocument().catch((error) => {
  toast(error.message, 'error');
  console.error(error);
}));
el.publisherDropdownButton.addEventListener('click', () => {
  el.environmentDropdown.hidden = true;
  el.publisherDropdown.hidden = !el.publisherDropdown.hidden;
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.combo')) {
    el.environmentDropdown.hidden = true;
    el.publisherDropdown.hidden = true;
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') {
    return;
  }
  if (!el.agentSessionDetailModal.hidden) {
    closeAgentSessionDetailModal();
  } else if (!el.aiEventDetailModal.hidden) {
    closeAiEventDetailModal();
  } else if (!el.diagramModal.hidden) {
    closeDiagramModal();
  } else if (!el.tableDocumentModal.hidden) {
    closeTableDocumentModal();
  } else if (!el.connectionDeleteModal.hidden) {
    closeConnectionDeleteModal();
  } else if (el.sqlDeleteModal && !el.sqlDeleteModal.hidden) {
    closeSqlDeleteModal();
  }
});
el.loadComponentsButton.addEventListener('click', () => withBusy(el.loadComponentsButton, loadSolutionComponents));
el.solutionComponents.addEventListener('click', (event) => {
  const button = event.target.closest('[data-component-action="manage"]');
  if (!button) {
    return;
  }
  openComponentManager(Number(button.dataset.type), button.dataset.id || '').catch((error) => {
    toast(error.message, 'error');
    console.error(error);
  });
});
el.componentModalClose.addEventListener('click', closeComponentManager);
el.componentModalBody.addEventListener('input', handleComponentModalInput);
el.componentModalBody.addEventListener('click', (event) => {
  const actionElement = event.target.closest('[data-modal-action]');
  const action = actionElement?.dataset.modalAction || '';
  if (!action) {
    return;
  }
  handleComponentModalAction(action, actionElement).catch((error) => {
    toast(error.message, 'error');
    console.error(error);
  });
});
el.exportSolutionButton.addEventListener('click', () => withBusy(el.exportSolutionButton, exportSolutionZip));
el.deploySolutionButton.addEventListener('click', () => withBusy(el.deploySolutionButton, deploySolution, 'Deploying'));
el.solutionZipFile.addEventListener('change', async () => {
  const originalText = el.solutionZipText.textContent;
  el.solutionZipText.textContent = el.solutionZipFile.files?.[0]?.name || 'Choose solution ZIP';
  if (!el.solutionZipFile.files?.[0]) {
    setImportPackage(null);
    return;
  }
  el.solutionZipFile.disabled = true;
  el.solutionZipText.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Analyzing ZIP</span>';
  try {
    await analyzeUploadedSolutionZip();
  } finally {
    el.solutionZipFile.disabled = false;
    el.solutionZipText.textContent = el.solutionZipFile.files?.[0]?.name || originalText || 'Choose solution ZIP';
  }
});
el.importEnvironmentSelect.addEventListener('change', () => {
  state.importTargetPrepared = null;
  renderImportTarget();
});
el.prepareImportButton.addEventListener('click', () => withBusy(el.prepareImportButton, prepareImportTarget, 'Preparing import'));
el.refreshImportTargetButton.addEventListener('click', () => withBusy(el.refreshImportTargetButton, prepareImportTarget, 'Refreshing target'));
el.importConnections.addEventListener('click', (event) => {
  const button = event.target.closest('[data-import-action]');
  if (!button) {
    return;
  }
  const action = button.dataset.importAction || '';
  if (action === 'create-connection') {
    withBusy(button, () => createImportConnection(button), 'Creating connection');
  } else if (action === 'refresh-connections') {
    withImportButtonBusy(button, () => refreshImportConnectionRow(button), '<span class="spinner" aria-hidden="true"></span>');
  }
});
el.downloadImportSettingsButton.addEventListener('click', downloadImportSettings);
el.importSettingsButton.addEventListener('click', () => el.importSettingsFile.click());
el.importSettingsFile.addEventListener('change', () => importSettingsFile().catch((error) => {
  toast(error.message, 'error');
  console.error(error);
}));
el.importSolutionButton.addEventListener('click', () => withBusy(el.importSolutionButton, importSolutionToTarget, 'Importing solution'));

initTheme();
updateRoleFileFormatUi();
clearTableSelection();
resetAiEventFilters();
resetAgentSessionFilters();
resetFlowRunFilters();
resetAutomatedReportFilters();
initAutomatedReportSettings();
initWeeklyReportControls();
renderAiEvents();
renderAgentSessions();
renderFlowRuns();
renderAutomatedReportControls();
renderAutomatedReportStatus();
updateChartsTabAvailability();
updateReportsTabAvailability();
await loadAutomatedReportScheduleSettings();
await loadStatus();
await loadWeeklyReportSettings();
loadSqlTables().catch((error) => {
  console.warn('Unable to load trend data tables.', error);
});

async function loadAutomatedReportScheduleSettings() {
  const schedule = await api('/api/automated-reports/schedule', { quiet: true });
  state.automatedReportSchedule = schedule;
  state.automatedReports.scheduleCompletionKey = automatedReportScheduleCompletionKey(schedule);
  applyAutomatedReportSchedule(schedule);
  el.automatedReportsRunOnLoad.checked = Boolean(schedule.enabled);
  localStorage.setItem(AUTOMATED_REPORTS_RUN_ON_LOAD_KEY, schedule.enabled ? 'true' : 'false');
}

function applyAutomatedReportSchedule(schedule = {}) {
  const groups = schedule.groups || {};
  const groupMap = {
    'ai-events': 'aiEvents',
    'agent-sessions': 'agentSessions',
    solutions: 'solutions',
    'flow-runs': 'flowRuns',
  };
  for (const [apiGroup, groupKey] of Object.entries(groupMap)) {
    const group = groups[apiGroup] || {};
    if (Array.isArray(group.environments)) {
      state.automatedReports.selectedEnvironmentIds[groupKey] = new Set(group.environments
        .map((environment) => String(environment.environmentName || environment.environmentId || environment.name || '').trim())
        .filter(Boolean));
    }
  }
  const legacySaveTrendData = Object.values(groups).some((group) => Boolean(group?.saveToDatabase));
  state.automatedReports.saveTrendData = schedule.saveTrendData ?? legacySaveTrendData;
  el.automatedReportsSaveTrends.checked = Boolean(state.automatedReports.saveTrendData);

  const aiRange = groups['ai-events']?.dateRange || {};
  if (aiRange.range) {
    el.automatedAiEventsRange.value = selectValueOrDefault(el.automatedAiEventsRange, aiRange.range, el.automatedAiEventsRange.value);
    el.automatedAiEventsStart.value = aiRange.start || el.automatedAiEventsStart.value;
    el.automatedAiEventsEnd.value = aiRange.end || el.automatedAiEventsEnd.value;
  }
  const sessionsRange = groups['agent-sessions']?.dateRange || {};
  if (sessionsRange.range) {
    el.automatedAgentSessionsRange.value = selectValueOrDefault(el.automatedAgentSessionsRange, sessionsRange.range, el.automatedAgentSessionsRange.value);
    el.automatedAgentSessionsStart.value = sessionsRange.start || el.automatedAgentSessionsStart.value;
    el.automatedAgentSessionsEnd.value = sessionsRange.end || el.automatedAgentSessionsEnd.value;
  }
  const solutionOptions = groups.solutions?.solutionOptions || {};
  if (Object.keys(solutionOptions).length) {
    el.automatedSolutionsPublisherExclusions.value = Array.isArray(solutionOptions.excludedPublishers)
      ? solutionOptions.excludedPublishers.join(', ')
      : String(solutionOptions.excludedPublishers || '');
    el.automatedSolutionsIncludeManaged.checked = Boolean(solutionOptions.includeManaged);
    el.automatedSolutionsIncludeMicrosoft.checked = Boolean(solutionOptions.includeMicrosoftOwned);
  }
  syncAutomatedReportDateRanges();
}

function initWeeklyReportControls() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(WEEKLY_REPORT_RANGE_KEY) || '{}');
  } catch {}
  el.weeklyReportHistoryRange.value = selectValueOrDefault(
    el.weeklyReportHistoryRange,
    saved.range || '3m',
    '3m',
  );
  const defaultRange = historyDateRange('3m');
  el.weeklyReportHistoryStart.value = saved.start || defaultRange.start;
  el.weeklyReportHistoryEnd.value = saved.end || defaultRange.end;
  syncWeeklyHistoryRangeVisibility();
  populateWeeklyReportWeeks();
  el.weeklyReportCurrent.innerHTML = empty('Open the weekly report to load locally saved solution changes.');
  el.weeklyReportHistory.innerHTML = empty('Choose a date range after the report data loads.');
}

async function loadWeeklyReportSettings() {
  const settings = await api('/api/weekly-report/settings', { quiet: true });
  state.weeklyReport.settings = settings;
  applyWeeklyReportSettings(settings);
}

function applyWeeklyReportSettings(settings = {}) {
  const accountHomeId = resolveRequestAccountId();
  const belongsToSelectedAccount = Boolean(accountHomeId && settings.accountHomeId === accountHomeId);
  const enabled = Boolean(settings.enabled && belongsToSelectedAccount);
  el.weeklyReportEnabled.checked = enabled;
  el.weeklyReportRefreshButton.disabled = state.weeklyReport.loading || !enabled;
  if (settings.enabled && !belongsToSelectedAccount) {
    el.weeklyReportStatus.textContent = 'Weekly tracking is configured for another signed-in account.';
    return;
  }
  if (settings.lastError) {
    el.weeklyReportStatus.textContent = `Last collection warning: ${settings.lastError}`;
    return;
  }
  if (settings.lastCompletedAt) {
    el.weeklyReportStatus.textContent = `Last collected ${formatWeeklyDateTime(settings.lastCompletedAt)} · ${Number(settings.lastCapturedEvents || 0)} weekly event${Number(settings.lastCapturedEvents || 0) === 1 ? '' : 's'} refreshed.`;
    return;
  }
  el.weeklyReportStatus.textContent = enabled
    ? 'Tracking is enabled. Refresh now or leave the server running for the hourly check.'
    : 'Tracking is off. Previously collected data remains available for up to three months.';
}

function setWeeklyReportLoading(loading, message = 'Loading weekly report data...') {
  state.weeklyReport.loading = Boolean(loading);
  el.weeklyReportPanel.setAttribute('aria-busy', loading ? 'true' : 'false');
  el.weeklyReportLoading.hidden = !loading;
  el.weeklyReportLoadingText.textContent = message;
  el.weeklyReportEnabled.disabled = Boolean(loading);
  if (loading) {
    el.weeklyReportRefreshButton.disabled = true;
    el.weeklyReportDownloadButton.disabled = true;
    return;
  }
  applyWeeklyReportSettings(state.weeklyReport.settings || {});
  el.weeklyReportDownloadButton.disabled = !state.weeklyReport.events.length;
}

async function openWeeklyReport() {
  state.weeklyReport.open = true;
  el.standardReportsContent.hidden = true;
  el.weeklyReportPanel.hidden = false;
  el.weeklyReportButton.setAttribute('aria-expanded', 'true');
  await refreshWeeklyReportData();
  if (weeklyReportRefreshDue()) {
    await refreshWeeklyReportData({ sync: true });
  }
  if (state.weeklyReport.open) {
    el.weeklyReportPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function weeklyReportRefreshDue(now = Date.now()) {
  const settings = state.weeklyReport.settings || {};
  if (!settings.enabled || settings.accountHomeId !== resolveRequestAccountId()) return false;
  const lastChecked = Date.parse(settings.lastCheckedAt || '');
  return !Number.isFinite(lastChecked) || now - lastChecked >= 60 * 60 * 1000;
}

function resetWeeklyReportView() {
  state.weeklyReport.open = false;
  el.standardReportsContent.hidden = false;
  el.weeklyReportPanel.hidden = true;
  el.weeklyReportButton.setAttribute('aria-expanded', 'false');
}

async function saveWeeklyReportSettings() {
  const enabled = Boolean(el.weeklyReportEnabled.checked);
  const accountHomeId = resolveRequestAccountId();
  if (enabled && !accountHomeId) {
    throw new Error('Select a signed-in account before enabling weekly tracking.');
  }
  const environments = enabled
    ? getAutomatedReportEnvironments('solutions')
    : state.weeklyReport.settings?.environments || [];
  el.weeklyReportEnabled.disabled = true;
  try {
    const settings = await api('/api/weekly-report/settings', {
      method: 'PUT',
      body: {
        enabled,
        accountHomeId: accountHomeId || state.weeklyReport.settings?.accountHomeId || '',
        environments,
      },
      quiet: true,
    });
    state.weeklyReport.settings = settings;
    applyWeeklyReportSettings(settings);
    if (enabled) {
      try {
        const result = await refreshWeeklyReportData({ sync: true, full: true });
        toast(result?.status === 'error' || result?.status === 'partial'
          ? 'Weekly solution tracking enabled. The initial history check completed with warnings.'
          : 'Weekly solution tracking enabled and three-month history checked.', result?.status === 'error' ? 'error' : 'success');
      } catch (error) {
        el.weeklyReportStatus.textContent = `Tracking is enabled, but the initial history check failed: ${error.message}`;
        toast('Weekly solution tracking is enabled, but the initial history check failed.', 'error');
        console.error(error);
      }
    } else {
      toast('Weekly solution tracking disabled.');
    }
  } finally {
    el.weeklyReportEnabled.disabled = false;
  }
}

async function syncWeeklyReportEnvironmentSettings() {
  const settings = state.weeklyReport.settings;
  const accountHomeId = resolveRequestAccountId();
  if (!settings?.enabled || !accountHomeId || settings.accountHomeId !== accountHomeId || !state.environmentsLoaded) {
    return;
  }
  const environments = getAutomatedReportEnvironments('solutions');
  const saved = await api('/api/weekly-report/settings', {
    method: 'PUT',
    body: { enabled: true, accountHomeId, environments },
    quiet: true,
  });
  state.weeklyReport.settings = saved;
  applyWeeklyReportSettings(saved);
}

async function refreshWeeklyReportData(options = {}) {
  const accountHomeId = resolveRequestAccountId();
  if (!accountHomeId) {
    state.weeklyReport.events = [];
    renderWeeklyReport();
    el.weeklyReportStatus.textContent = 'Select a signed-in account to load weekly report data.';
    return;
  }
  const loadingMessage = options.full
    ? 'Loading up to three months of solution history...'
    : options.sync
      ? 'Checking for new and changed solutions...'
      : 'Loading locally saved weekly report data...';
  setWeeklyReportLoading(true, loadingMessage);
  el.weeklyReportStatus.textContent = loadingMessage;
  let syncResult = null;
  try {
    if (options.sync) {
      const environments = getAutomatedReportEnvironments('solutions');
      if (state.weeklyReport.settings?.enabled) {
        await syncWeeklyReportEnvironmentSettings();
      }
      syncResult = await api('/api/weekly-report/sync', {
        method: 'POST',
        body: { accountHomeId, environments, full: Boolean(options.full) },
        quiet: true,
      });
      state.weeklyReport.settings = syncResult;
    }
    const data = await api(`/api/weekly-report?accountHomeId=${encodeURIComponent(accountHomeId)}`, { quiet: true });
    state.weeklyReport.settings = data.settings || state.weeklyReport.settings;
    state.weeklyReport.events = data.events || [];
    applyWeeklyReportSettings(state.weeklyReport.settings);
    renderWeeklyReport();
    el.weeklyReportDownloadButton.disabled = !state.weeklyReport.events.length;
  } finally {
    setWeeklyReportLoading(false);
  }
  return syncResult;
}

function populateWeeklyReportWeeks(events = state.weeklyReport.events) {
  const selected = el.weeklyReportWeek.value || startOfCalendarWeek();
  const weeks = new Set([startOfCalendarWeek()]);
  for (let index = 0; index < 14; index += 1) {
    weeks.add(addCalendarDays(startOfCalendarWeek(), index * -7));
  }
  for (const event of events) {
    if (event.weekStart) weeks.add(event.weekStart);
  }
  const sorted = [...weeks].sort().reverse();
  el.weeklyReportWeek.innerHTML = sorted.map((weekStart) => `
    <option value="${escapeAttr(weekStart)}">Week of ${escapeHtml(formatWeeklyDateLabel(weekStart))}</option>
  `).join('');
  el.weeklyReportWeek.value = sorted.includes(selected) ? selected : sorted[0];
}

function populateWeeklyReportEnvironments(events) {
  const selected = el.weeklyReportEnvironment.value || '';
  const environments = new Map();
  for (const event of events) {
    const environmentId = String(event.environmentId || '').trim();
    if (!environmentId) continue;
    const current = environments.get(environmentId) || {
      id: environmentId,
      label: event.environmentDisplayName || environmentId,
      solutions: new Set(),
    };
    current.solutions.add(event.solutionId || event.solutionName || '');
    environments.set(environmentId, current);
  }
  const rows = [...environments.values()].sort((left, right) => left.label.localeCompare(right.label));
  el.weeklyReportEnvironment.innerHTML = [
    `<option value="">All environments (${rows.length})</option>`,
    ...rows.map((environment) => `<option value="${escapeAttr(environment.id)}">${escapeHtml(environment.label)} (${environment.solutions.size})</option>`),
  ].join('');
  el.weeklyReportEnvironment.value = rows.some((environment) => environment.id === selected) ? selected : '';
}

function weeklySolutionReportFilters() {
  return {
    excludedPublishers: el.automatedSolutionsPublisherExclusions.value || '',
    includeManaged: Boolean(el.automatedSolutionsIncludeManaged.checked),
    includeMicrosoftOwned: Boolean(el.automatedSolutionsIncludeMicrosoft.checked),
  };
}

function handleWeeklyHistoryRangeChange() {
  syncWeeklyHistoryRangeVisibility();
  localStorage.setItem(WEEKLY_REPORT_RANGE_KEY, JSON.stringify({
    range: el.weeklyReportHistoryRange.value,
    start: el.weeklyReportHistoryStart.value,
    end: el.weeklyReportHistoryEnd.value,
  }));
  renderWeeklyReport();
}

function syncWeeklyHistoryRangeVisibility() {
  const custom = el.weeklyReportHistoryRange.value === 'custom';
  el.weeklyReportHistoryStart.disabled = !custom;
  el.weeklyReportHistoryEnd.disabled = !custom;
}

function renderWeeklyReport() {
  destroyWeeklyReportCharts();
  const solutionFilteredEvents = filterWeeklyReportEvents(
    state.weeklyReport.events,
    weeklySolutionReportFilters(),
  );
  populateWeeklyReportEnvironments(solutionFilteredEvents);
  const filteredEvents = filterWeeklyReportEvents(solutionFilteredEvents, {
    includeManaged: true,
    includeMicrosoftOwned: true,
    environmentId: el.weeklyReportEnvironment.value,
  });
  populateWeeklyReportWeeks(filteredEvents);
  const history = historyDateRange(
    el.weeklyReportHistoryRange.value,
    el.weeklyReportHistoryStart.value,
    el.weeklyReportHistoryEnd.value,
  );
  state.weeklyReport.model = buildWeeklyReportModel(filteredEvents, {
    selectedWeekStart: el.weeklyReportWeek.value || startOfCalendarWeek(),
    historyRange: history,
  });
  el.weeklyReportCurrent.innerHTML = renderWeeklyPeriod(
    state.weeklyReport.model.selectedWeek,
    'weekly-current',
    false,
  );
  el.weeklyReportHistory.innerHTML = renderWeeklyPeriod(
    state.weeklyReport.model.history,
    'weekly-history',
    true,
  );
  createWeeklyReportCharts(state.weeklyReport.model);
}

function renderWeeklyPeriod(period, prefix, history) {
  const dateLabel = history
    ? `${period.label} · ${formatWeeklyDateLabel(period.start)} to ${formatWeeklyDateLabel(period.end)}`
    : period.label;
  return `<section class="weekly-period">
    <div class="weekly-period-heading">
      <h4>${escapeHtml(dateLabel)}</h4>
      <div class="weekly-summary-badges">
        <span class="weekly-summary-badge">${period.deployed.length} deployed</span>
        <span class="weekly-summary-badge">${period.updated.length} updated</span>
      </div>
    </div>
    ${renderWeeklyReportGroup(period, prefix)}
    <article class="weekly-chart-card weekly-comparison-card">
      <h5>${history ? 'Deployed and updated by week' : 'Selected week compared with previous week'}</h5>
      <div class="weekly-chart-canvas"><canvas id="${escapeAttr(prefix)}-comparison"></canvas></div>
    </article>
  </section>`;
}

function renderWeeklyReportGroup(period, prefix) {
  const records = period.solutions || [];
  const tableId = `${prefix}-solutions-table`;
  return `<section class="weekly-report-group">
    <div class="weekly-report-group-heading">
      <h4>Solutions</h4>
      <label class="weekly-change-filter">Show
        <select data-weekly-change-filter data-weekly-table="${escapeAttr(tableId)}">
          <option value="all">All</option>
          <option value="deployed">Deployed</option>
          <option value="updated">Updated</option>
        </select>
      </label>
    </div>
    <div class="weekly-report-layout">
      <div class="weekly-table-wrap">${renderWeeklySolutionTable(records, `${prefix}-solutions`, tableId)}</div>
      <div class="weekly-chart-stack">
        <article class="weekly-chart-card">
          <h5>Deployed solutions by primary component</h5>
          <div class="weekly-chart-canvas"><canvas id="${escapeAttr(prefix)}-deployed-primary"></canvas></div>
        </article>
        <article class="weekly-chart-card">
          <h5>Updated solutions by primary component</h5>
          <div class="weekly-chart-canvas"><canvas id="${escapeAttr(prefix)}-updated-primary"></canvas></div>
        </article>
      </div>
    </div>
  </section>`;
}

function renderWeeklySolutionTable(records, prefix, tableId) {
  if (!records.length) {
    return empty('No solutions in this period.');
  }
  return `<table id="${escapeAttr(tableId)}" class="weekly-report-table">
    ${weeklyReportTableColgroup()}
    <thead><tr>${weeklySortableHeader('Solution', 'solution')}${weeklySortableHeader('Agent', 'agent', true)}${weeklySortableHeader('Canvas', 'canvas', true)}${weeklySortableHeader('Code', 'code', true)}${weeklySortableHeader('Model driven', 'model', true)}${weeklySortableHeader('Flow', 'flow', true)}${weeklySortableHeader('Table', 'table', true)}${weeklySortableHeader('Event', 'event', true)}</tr></thead>
    <tbody>${records.map((record, index) => renderWeeklySolutionRows(record, `${prefix}-${index}`)).join('')}</tbody>
  </table>`;
}

function weeklySortableHeader(label, key, numeric = false) {
  return `<th${numeric ? ' class="numeric"' : ''} data-weekly-sort-heading="${escapeAttr(key)}" aria-sort="none"><button class="weekly-sort-button" type="button" data-weekly-sort="${escapeAttr(key)}" data-weekly-sort-type="${numeric ? 'number' : 'text'}">${escapeHtml(label)}</button></th>`;
}

function weeklyReportTableColgroup() {
  return `<colgroup>
    <col class="weekly-col-solution" />
    ${Array.from({ length: 6 }, () => '<col class="weekly-col-count" />').join('')}
    <col class="weekly-col-event" />
  </colgroup>`;
}

function renderWeeklySolutionRows(record, rowId) {
  const counts = record.componentCounts || {};
  const detailsId = `${rowId}-components`;
  const environment = record.environmentDisplayName || record.environmentId || '';
  const solutionName = record.solutionName || record.uniqueName || 'Unnamed solution';
  const indicators = Array.isArray(record.changeIndicators) ? record.changeIndicators : [];
  const eventSort = Date.parse(record.eventAt || '');
  return `<tr data-weekly-solution-row data-weekly-detail-id="${escapeAttr(detailsId)}" data-weekly-change-types="${escapeAttr(indicators.join(' '))}" data-sort-solution="${escapeAttr(solutionName.toLocaleLowerCase())}" data-sort-agent="${Number(counts.agents || 0)}" data-sort-canvas="${Number(counts.canvasApps || 0)}" data-sort-code="${Number(counts.codeApps || 0)}" data-sort-model="${Number(counts.modelDrivenApps || 0)}" data-sort-flow="${Number(counts.flows || 0)}" data-sort-table="${Number(counts.tables || 0)}" data-sort-event="${Number.isFinite(eventSort) ? eventSort : 0}">
    <td class="weekly-solution-cell">
      <button class="weekly-solution-button" type="button" data-weekly-detail="${escapeAttr(detailsId)}" aria-expanded="false">${escapeHtml(solutionName)}</button>
      ${renderWeeklyChangeIndicators(record)}
      <div class="weekly-solution-meta">
        <span class="weekly-solution-version-type">${record.version ? `<span>Version ${escapeHtml(record.version)}</span>` : ''}<span>Type: ${escapeHtml(record.primaryComponent || 'Other')}</span></span>
        ${record.publisherName ? `<span>Publisher: ${escapeHtml(record.publisherName)}</span>` : ''}
        ${environment ? `<span>Environment: ${escapeHtml(environment)}</span>` : ''}
      </div>
    </td>
    ${['agents', 'canvasApps', 'codeApps', 'modelDrivenApps', 'flows', 'tables'].map((key) => `<td class="numeric">${Number(counts[key] || 0)}</td>`).join('')}
    <td>${escapeHtml(formatWeeklyDateTime(record.eventAt))}</td>
  </tr>
  <tr id="${escapeAttr(detailsId)}" class="weekly-component-row" hidden><td colspan="8">${renderWeeklyComponents(record.components || [])}</td></tr>`;
}

function renderWeeklyChangeIndicators(record) {
  const indicators = Array.isArray(record.changeIndicators) && record.changeIndicators.length
    ? record.changeIndicators
    : [record.eventType === 'modified' ? 'updated' : 'deployed'];
  return `<div class="weekly-change-indicators">${indicators.map((indicator) => `
    <span class="weekly-change-indicator ${escapeAttr(indicator)}">${indicator === 'updated' ? 'Updated' : 'Deployed'}</span>
  `).join('')}</div>`;
}

function renderWeeklyComponents(components) {
  if (!components.length) {
    return '<span class="muted">No tracked components in this solution.</span>';
  }
  return `<div class="weekly-component-list">${components.map((component) => `
    <div class="weekly-component-item">
      <span class="weekly-component-kind">${escapeHtml(component.label || component.kind || 'Component')}</span>
      <strong>${escapeHtml(component.name || component.objectId || 'Unnamed component')}</strong>
      ${component.logicalName ? `<span class="role-id">${escapeHtml(component.logicalName)}</span>` : ''}
    </div>
  `).join('')}</div>`;
}

function handleWeeklySolutionToggle(event) {
  const sortButton = event.target.closest('[data-weekly-sort]');
  if (sortButton) {
    sortWeeklySolutionTable(sortButton);
    return;
  }
  const button = event.target.closest('[data-weekly-detail]');
  if (!button) return;
  const details = document.getElementById(button.dataset.weeklyDetail || '');
  if (!details) return;
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!expanded));
  details.hidden = expanded;
}

function handleWeeklyReportFilter(event) {
  const select = event.target.closest('[data-weekly-change-filter]');
  if (!select) return;
  const table = document.getElementById(select.dataset.weeklyTable || '');
  if (!table) return;
  const filter = select.value || 'all';
  for (const row of table.querySelectorAll('tbody > tr[data-weekly-solution-row]')) {
    const visible = filter === 'all' || String(row.dataset.weeklyChangeTypes || '').split(' ').includes(filter);
    row.hidden = !visible;
    if (!visible) {
      const detail = document.getElementById(row.dataset.weeklyDetailId || '');
      if (detail) detail.hidden = true;
      row.querySelector('[data-weekly-detail]')?.setAttribute('aria-expanded', 'false');
    }
  }
}

function sortWeeklySolutionTable(button) {
  const table = button.closest('table');
  const tbody = table?.tBodies?.[0];
  if (!table || !tbody) return;
  const key = button.dataset.weeklySort || 'solution';
  const direction = table.dataset.weeklySortKey === key && table.dataset.weeklySortDirection === 'ascending'
    ? 'descending'
    : 'ascending';
  const multiplier = direction === 'ascending' ? 1 : -1;
  const numeric = button.dataset.weeklySortType === 'number';
  const records = [...tbody.querySelectorAll('tr[data-weekly-solution-row]')].map((row) => ({
    row,
    detail: document.getElementById(row.dataset.weeklyDetailId || ''),
  }));
  records.sort((left, right) => {
    const leftValue = left.row.getAttribute(`data-sort-${key}`) || '';
    const rightValue = right.row.getAttribute(`data-sort-${key}`) || '';
    const comparison = numeric
      ? Number(leftValue) - Number(rightValue)
      : leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
    return comparison * multiplier;
  });
  for (const record of records) {
    tbody.append(record.row);
    if (record.detail) tbody.append(record.detail);
  }
  table.dataset.weeklySortKey = key;
  table.dataset.weeklySortDirection = direction;
  for (const heading of table.querySelectorAll('[data-weekly-sort-heading]')) {
    heading.setAttribute('aria-sort', heading.dataset.weeklySortHeading === key ? direction : 'none');
  }
}

function createWeeklyReportCharts(model) {
  const ChartConstructor = globalThis.Chart;
  if (!ChartConstructor) return;
  const charts = [
    createWeeklyPrimaryChart(ChartConstructor, 'weekly-current-deployed-primary', model.selectedWeek.deployedPrimaryMix),
    createWeeklyPrimaryChart(ChartConstructor, 'weekly-current-updated-primary', model.selectedWeek.updatedPrimaryMix),
    createWeeklyPrimaryChart(ChartConstructor, 'weekly-history-deployed-primary', model.history.deployedPrimaryMix),
    createWeeklyPrimaryChart(ChartConstructor, 'weekly-history-updated-primary', model.history.updatedPrimaryMix),
    createWeeklyComparisonChart(ChartConstructor, 'weekly-current-comparison', model.selectedWeek.comparison),
    createWeeklyHistoryChart(ChartConstructor, 'weekly-history-comparison', model.history.weeklyCounts),
  ].filter(Boolean);
  state.weeklyReport.charts = charts;
}

function createWeeklyPrimaryChart(ChartConstructor, canvasId, rows = []) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  return new ChartConstructor(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: rows.map((row) => row.label),
      datasets: [{
        data: rows.map((row) => Number(row.count || 0)),
        backgroundColor: rows.map((row) => row.color),
        borderWidth: 0,
      }],
    },
    options: weeklyChartOptions({ circular: true }),
  });
}

function createWeeklyComparisonChart(ChartConstructor, canvasId, comparison = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  return new ChartConstructor(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: comparison.labels || [],
      datasets: [
        { label: 'Deployed', data: comparison.deployed || [], backgroundColor: '#2563eb' },
        { label: 'Updated', data: comparison.updated || [], backgroundColor: '#f59e0b' },
      ],
    },
    options: weeklyChartOptions(),
  });
}

function createWeeklyHistoryChart(ChartConstructor, canvasId, rows = []) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  return new ChartConstructor(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: rows.map((row) => row.label),
      datasets: [
        { label: 'Deployed', data: rows.map((row) => row.deployed), backgroundColor: '#2563eb' },
        { label: 'Updated', data: rows.map((row) => row.updated), backgroundColor: '#f59e0b' },
      ],
    },
    options: weeklyChartOptions(),
  });
}

function weeklyChartOptions(options = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom' },
      tooltip: { enabled: true, intersect: true, mode: 'nearest' },
    },
    scales: options.circular ? undefined : {
      x: { beginAtZero: true },
      y: { beginAtZero: true, ticks: { precision: 0 } },
    },
    interaction: { intersect: true, mode: 'nearest' },
  };
}

function destroyWeeklyReportCharts() {
  for (const chart of state.weeklyReport.charts) {
    chart?.destroy?.();
  }
  state.weeklyReport.charts = [];
}

function downloadWeeklyReportHtml() {
  if (!state.weeklyReport.model) {
    throw new Error('Load the weekly report before downloading it.');
  }
  const html = buildStandaloneWeeklyReportHtml(state.weeklyReport.model);
  downloadBlob(
    `weekly-report-${safeFilename(state.weeklyReport.model.selectedWeek.start || formatLocalDateKey())}.html`,
    new Blob([html], { type: 'text/html;charset=utf-8' }),
  );
}

function formatWeeklyDateLabel(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime())
    ? String(value || '')
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatWeeklyDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleString();
}

async function loadStatus() {
  const status = await api('/api/status');
  const authState = await restoreLastAccount(status);
  applyAuthState(authState);
  if (!hasSelectedAccount()) {
    clearEnvironmentOptions();
    el.status.textContent = authState.accounts?.length ? 'Select an account.' : `Region: ${authState.region}`;
    return;
  }
  watchForTodaysAutomatedReports();
  await Promise.all([
    loadCachedReportDashboards(),
    loadCachedAutomatedReportDownloads().catch((error) => {
      console.warn('Unable to restore cached report downloads.', error);
    }),
    loadEnvironments({ silentAutoSelect: true }),
  ]);
  if (state.selectedEnvironment.orgUrl) {
    el.status.textContent = `Using ${state.selectedEnvironment.orgUrl}`;
    await loadBusinessUnits().catch((error) => {
      console.error(error);
    });
  } else {
    el.status.textContent = 'Select an environment.';
  }
}

async function signIn() {
  const result = await api('/api/login', {
    method: 'POST',
    body: {},
  });
  applyAuthState(result);
  el.status.textContent = state.selectedEnvironment.orgUrl
    ? `Signed in to ${state.selectedEnvironment.orgUrl}`
    : `Signed in. Load environments to choose a Dataverse org URL.`;
  toast('Signed in.');
  clearEnvironmentOptions();
  await loadEnvironments();
  await loadWeeklyReportSettings();
  if (state.weeklyReport.open) await refreshWeeklyReportData();
}

async function signInDifferent() {
  const result = await api('/api/login-different', {
    method: 'POST',
    body: {},
  });
  applyAuthState(result);
  el.status.textContent = state.selectedEnvironment.orgUrl
    ? `Signed in to ${state.selectedEnvironment.orgUrl}${result.account ? ` as ${result.account}` : ''}`
    : `Signed in${result.account ? ` as ${result.account}` : ''}. Load environments to choose a Dataverse org URL.`;
  toast('Signed in with account picker.');
  clearEnvironmentOptions();
  await loadEnvironments();
  await loadWeeklyReportSettings();
  if (state.weeklyReport.open) await refreshWeeklyReportData();
}

async function logout() {
  const result = await api('/api/logout', { method: 'POST' });
  state.environments = [];
  state.environmentsLoaded = false;
  clearEnvironmentData();
  forgetLastAccount();
  applyAuthState({ accounts: [], selectedAccountHomeId: '', selectedEnvironment: {} });
  state.weeklyReport.events = [];
  applyWeeklyReportSettings(state.weeklyReport.settings || {});
  renderWeeklyReport();
  renderEnvironmentList();
  el.status.textContent = `Logged out. Removed ${result.removed} cached account${result.removed === 1 ? '' : 's'}.`;
  toast('Logged out.');
}

async function switchAccount() {
  const homeAccountId = el.accountSelect.value;
  if (!homeAccountId) {
    forgetLastAccount();
    setSelectedEnvironmentFromPayload({});
    clearEnvironmentData();
    clearEnvironmentOptions();
    renderEnvironmentList();
    state.weeklyReport.events = [];
    applyWeeklyReportSettings(state.weeklyReport.settings || {});
    renderWeeklyReport();
    el.status.textContent = 'Select an account.';
    return;
  }
  const result = await api('/api/account', {
    method: 'POST',
    body: { homeAccountId },
  });
  applyAuthState(result);
  clearEnvironmentData();
  el.status.textContent = state.selectedEnvironment.orgUrl
    ? `Using ${state.selectedEnvironment.orgUrl}`
    : 'Account switched. Select an environment.';
  toast('Account switched.');
  clearEnvironmentOptions();
  watchForTodaysAutomatedReports();
  await Promise.all([
    loadEnvironments(),
    loadCachedReportDashboards(),
    loadCachedAutomatedReportDownloads().catch((error) => {
      console.warn('Unable to restore cached report downloads.', error);
    }),
  ]);
  await loadWeeklyReportSettings();
  if (state.weeklyReport.open) await refreshWeeklyReportData();
}

function renderAccounts(accounts, selectedAccountHomeId) {
  state.accounts = accounts;
  const selectedId = selectedAccountHomeId || (accounts.length === 1 ? accounts[0].homeAccountId : '');
  state.selectedAccountHomeId = selectedId;
  const options = [
    `<option value=""${selectedId ? '' : ' selected'}>${accounts.length ? 'Select account' : 'No account'}</option>`,
    ...accounts.map((account) => `
      <option value="${escapeAttr(account.homeAccountId)}"${account.homeAccountId === selectedId ? ' selected' : ''}>
        ${escapeHtml(account.name || account.username)}
      </option>
    `),
  ].join('');
  el.accountSelect.innerHTML = options;
  el.accountSelect.disabled = !accounts.length;
  if (selectedId) {
    rememberLastAccount(selectedId);
  } else if (!accounts.length) {
    forgetLastAccount();
  }
}

function applyAuthState(data) {
  renderAccounts(data.accounts || [], data.selectedAccountHomeId || '');
  loadEnvironmentVisibility();
  setSelectedEnvironmentFromPayload(data);
  renderEnvironmentPicker();
  renderSelectedEnvironmentSummary();
}

function setSelectedEnvironmentFromPayload(data) {
  const environment = data?.selectedEnvironment || data || {};
  state.selectedEnvironment = {
    environmentName: environment.environmentName || environment.name || '',
    orgUrl: environment.orgUrl || '',
  };
  if (state.selectedEnvironment.environmentName) {
    rememberLastEnvironment(state.selectedEnvironment);
  }
  renderSelectedEnvironmentSummary();
  renderSolutionLink(getSelectedSolution());
}

function renderSelectedEnvironmentSummary() {
  el.selectedEnvironmentId.textContent = state.selectedEnvironment.environmentName || 'None';
  el.selectedEnvironmentUrl.textContent = state.selectedEnvironment.orgUrl || 'None';
  el.copyEnvironmentButton.disabled = !state.selectedEnvironment.environmentName && !state.selectedEnvironment.orgUrl;
}

function renderEnvironmentPicker() {
  if (!hasSelectedAccount()) {
    el.environmentDropdownButton.textContent = '';
    el.environmentDropdownButton.disabled = true;
    el.environmentPickerList.innerHTML = '';
    renderSolutionLink(null);
    renderImportEnvironments();
    return;
  }

  const selectedId = state.selectedEnvironment.environmentName;
  const visibleEnvironments = getVisibleEnvironments();
  const selectedEnvironment = getEnvironmentByName(selectedId);
  el.environmentDropdownButton.textContent = selectedEnvironment?.displayName || state.selectedEnvironment.orgUrl || selectedId || (visibleEnvironments.length ? 'Select environment' : 'No visible environments');
  el.environmentDropdownButton.disabled = !visibleEnvironments.length;
  renderSolutionLink(getSelectedSolution());
  renderImportEnvironments();

  const filtered = filterEnvironments(visibleEnvironments, el.environmentPickerSearch.value);
  if (!filtered.length) {
    el.environmentPickerList.innerHTML = empty(el.environmentPickerSearch.value ? 'No visible environments match.' : 'No visible environments.');
    return;
  }

  el.environmentPickerList.innerHTML = filtered.map((environment) => `
    <button class="environment-picker-option${environment.name === selectedId ? ' selected' : ''}" type="button" data-name="${escapeAttr(environment.name)}">
      <span class="role-name">${escapeHtml(environment.displayName || environment.name)}</span>
      <span class="role-id">${escapeHtml(environment.name)}</span>
      <span class="role-id">${escapeHtml(environment.orgUrl || 'No Dataverse org URL in response')}</span>
    </button>
  `).join('');
}

function renderEnvironmentList() {
  if (!state.environments.length) {
    el.environmentList.innerHTML = empty(state.environmentsLoaded ? 'No environments returned for this account.' : 'Sign in, then load environments.');
    renderAutomatedReportControls();
    return;
  }

  const filteredEnvironments = filterEnvironments(state.environments, el.environmentSearch.value);
  if (!filteredEnvironments.length) {
    el.environmentList.innerHTML = empty('No environments match the filter.');
    return;
  }

  const selectedId = state.selectedEnvironment.environmentName;
  const selectedUrl = state.selectedEnvironment.orgUrl;
  el.environmentList.innerHTML = filteredEnvironments.map((environment) => {
    const isCurrent = environment.name === selectedId || (environment.orgUrl && environment.orgUrl === selectedUrl);
    const isVisible = isEnvironmentVisible(environment);
    return `
      <label class="list-item env-option${isVisible ? ' selected' : ''}" data-name="${escapeAttr(environment.name)}">
        <input class="env-checkbox" type="checkbox" value="${escapeAttr(environment.name)}"${isVisible ? ' checked' : ''} />
        <span class="env-details">
          <span class="role-name">${escapeHtml(environment.displayName || environment.name)}</span>
          <span class="role-id">${escapeHtml(environment.name)}</span>
          <span class="role-id">${escapeHtml(environment.orgUrl || 'No Dataverse org URL in response')}</span>
          <span class="role-id">${isVisible ? 'Shown in header picker' : 'Hidden from header picker'}${isCurrent ? ' | current environment' : ''}</span>
        </span>
      </label>
    `;
  }).join('');

  document.querySelectorAll('.env-checkbox').forEach((input) => {
    input.addEventListener('change', () => toggleEnvironmentVisibility(input).catch((error) => {
      toast(error.message);
      console.error(error);
    }));
  });
  renderAutomatedReportControls();
}

function clearEnvironmentOptions() {
  state.environments = [];
  state.environmentsLoaded = false;
  state.automatedReports.selectedEnvironmentIds.aiEvents = null;
  state.automatedReports.selectedEnvironmentIds.agentSessions = null;
  state.automatedReports.selectedEnvironmentIds.solutions = null;
  state.automatedReports.selectedEnvironmentIds.flowRuns = null;
  state.automatedReports.selectedEnvironmentIds.reports = null;
  renderEnvironmentPicker();
  renderAutomatedReportControls();
}

async function selectHeaderEnvironment(environmentName) {
  const environment = getVisibleEnvironments().find((item) => item.name === environmentName) || null;
  if (!environment) {
    renderEnvironmentPicker();
    return;
  }
  await selectEnvironment(environment);
  el.environmentDropdown.hidden = true;
  el.environmentPickerSearch.value = '';
  renderEnvironmentPicker();
}

async function selectEnvironment(environment, options = {}) {
  const next = {
    environmentName: environment.name || environment.environmentName || '',
    orgUrl: environment.orgUrl || '',
  };
  if (!next.orgUrl) {
    renderEnvironmentPicker();
    toast('Environment has no Dataverse org URL and cannot be selected.');
    return;
  }

  setSelectedEnvironmentFromPayload(next);
  renderEnvironmentPicker();
  renderEnvironmentList();

  const result = await api('/api/org', {
    method: 'POST',
    body: next,
  });
  applyAuthState(result);
  rememberLastEnvironment(next);
  clearEnvironmentData();
  if (options.loadBusinessUnits !== false) {
    await loadBusinessUnits().catch((error) => {
      console.error(error);
    });
  }
  renderEnvironmentList();
  if (!options.silent) {
    el.status.textContent = `Using ${state.selectedEnvironment.orgUrl}`;
    toast('Environment selected.');
  }
}

function getEnvironmentByName(name) {
  return state.environments.find((environment) => environment.name === name) || null;
}

function getVisibleEnvironments() {
  return state.environments.filter((environment) => isEnvironmentVisible(environment));
}

function filterEnvironments(environments, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  return environments
    .filter((environment) => !normalizedQuery || environmentText(environment).includes(normalizedQuery))
    .sort(compareEnvironments);
}

function compareEnvironments(left, right) {
  const leftName = String(left.displayName || left.name || '');
  const rightName = String(right.displayName || right.name || '');
  return leftName.localeCompare(rightName, undefined, { numeric: true, sensitivity: 'base' }) ||
    String(left.name || '').localeCompare(String(right.name || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function environmentText(environment) {
  return [
    environment.displayName,
    environment.name,
    environment.orgUrl,
    environment.region,
    environment.type,
  ].filter(Boolean).join(' ').toLowerCase();
}

function isEnvironmentVisible(environment) {
  return !state.hiddenEnvironmentIds.has(environment.name);
}

async function toggleEnvironmentVisibility(input) {
  const environmentName = input.value;
  if (input.checked) {
    state.hiddenEnvironmentIds.delete(environmentName);
  } else {
    state.hiddenEnvironmentIds.add(environmentName);
  }
  saveEnvironmentVisibility();
  pruneAutomatedReportEnvironmentSelections();

  const hiddenCurrentEnvironment = !input.checked && environmentName === state.selectedEnvironment.environmentName;
  if (hiddenCurrentEnvironment) {
    await clearSelectedEnvironment();
  } else {
    renderEnvironmentPicker();
    renderEnvironmentList();
  }

  toast(input.checked ? 'Environment shown in header picker.' : 'Environment hidden from header picker.');
}

async function clearSelectedEnvironment() {
  setSelectedEnvironmentFromPayload({});
  clearEnvironmentData();
  forgetLastEnvironment();
  renderEnvironmentPicker();
  renderEnvironmentList();
  const result = await api('/api/org', {
    method: 'POST',
    body: { clear: true },
  });
  applyAuthState(result);
  renderEnvironmentList();
  el.status.textContent = 'Select an environment.';
}

function loadEnvironmentVisibility() {
  state.hiddenEnvironmentIds = new Set(readJsonStorage(environmentVisibilityKey(), []));
}

function saveEnvironmentVisibility() {
  localStorage.setItem(environmentVisibilityKey(), JSON.stringify([...state.hiddenEnvironmentIds]));
}

function environmentVisibilityKey() {
  return `pdacHiddenEnvironments:${el.accountSelect.value || 'default'}`;
}

function toggleEnvironmentDropdown() {
  if (el.environmentDropdownButton.disabled) {
    return;
  }

  el.publisherDropdown.hidden = true;
  el.environmentDropdown.hidden = !el.environmentDropdown.hidden;
  if (!el.environmentDropdown.hidden) {
    renderEnvironmentPicker();
    el.environmentPickerSearch.focus();
    el.environmentPickerSearch.select();
  }
}

function handleEnvironmentPickerKeydown(event) {
  if (event.key === 'Escape') {
    el.environmentDropdown.hidden = true;
    el.environmentDropdownButton.focus();
    return;
  }

  if (event.key !== 'Enter') {
    return;
  }

  const firstMatch = filterEnvironments(getVisibleEnvironments(), el.environmentPickerSearch.value)[0];
  if (!firstMatch) {
    return;
  }

  event.preventDefault();
  selectHeaderEnvironment(firstMatch.name).catch((error) => {
    toast(error.message);
    console.error(error);
  });
}

async function copySelectedEnvironment() {
  const lines = [
    state.selectedEnvironment.environmentName ? `Environment ID: ${state.selectedEnvironment.environmentName}` : '',
    state.selectedEnvironment.orgUrl ? `Org URL: ${state.selectedEnvironment.orgUrl}` : '',
  ].filter(Boolean);
  if (!lines.length) {
    toast('No environment selected.');
    return;
  }

  await writeClipboard(lines.join('\n'));
  toast('Selected environment copied.');
}

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

async function readClipboard() {
  if (!navigator.clipboard?.readText) {
    throw new Error('Clipboard paste is not available in this browser.');
  }
  return navigator.clipboard.readText();
}

function activateTab(name) {
  if (name === 'reports') {
    resetWeeklyReportView();
  }
  el.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  el.tabPanels.forEach((panel) => panel.classList.toggle('active', panel.id === `${name}Tab`));
  if (name === 'roles' && state.selectedEnvironment.orgUrl && !state.businessUnitsLoaded) {
    loadBusinessUnits().catch((error) => {
      toast(error.message);
      console.error(error);
    });
  }
  if (name === 'import' && state.selectedEnvironment.orgUrl && !state.environmentsLoaded) {
    loadImportEnvironments().catch((error) => {
      toast(error.message);
      console.error(error);
    });
  } else if (name === 'import') {
    renderImportEnvironments();
  }
  if (name === 'reports' && hasSelectedAccount()) {
    loadCachedAutomatedReportDownloads().catch((error) => {
      console.warn('Unable to refresh cached report downloads.', error);
    });
  }
  if (name === 'charts' && hasSelectedAccount() && !state.automatedReports.chartDashboardData?.rows?.length) {
    loadCachedChartsDashboard();
  }
  if (name === 'trends' && hasSelectedAccount() && !state.automatedReports.dashboardData?.rows?.length) {
    loadCachedReportsDashboard();
  }
}

async function loadEnvironments(options = {}) {
  if (!hasSelectedAccount()) {
    clearEnvironmentOptions();
    renderEnvironmentList();
    el.status.textContent = 'Select an account first.';
    return;
  }

  el.environmentList.innerHTML = empty('Loading environments...');
  const data = await api('/api/environments');
  state.environments = data.value || [];
  state.environmentsLoaded = true;
  loadEnvironmentVisibility();
  pruneAutomatedReportEnvironmentSelections();
  setSelectedEnvironmentFromPayload(data);
  if (await reconcileSelectedEnvironment(options)) {
    return;
  }
  if (state.selectedEnvironment.environmentName && !isEnvironmentVisible({ name: state.selectedEnvironment.environmentName })) {
    await clearSelectedEnvironment();
    return;
  }
  if (!state.selectedEnvironment.environmentName && options.autoSelectLast !== false) {
    const remembered = findRememberedEnvironment();
    if (remembered) {
      await selectEnvironment(remembered, {
        loadBusinessUnits: false,
        silent: options.silentAutoSelect,
      });
    }
  }
  renderEnvironmentPicker();
  renderEnvironmentList();
  saveAutomatedReportSettings();
}

async function reconcileSelectedEnvironment(options = {}) {
  if (!state.selectedEnvironment.environmentName && !state.selectedEnvironment.orgUrl) {
    return false;
  }
  const exact = state.environments.find((environment) => environment.name === state.selectedEnvironment.environmentName);
  if (exact) {
    return false;
  }
  const byUrl = state.selectedEnvironment.orgUrl
    ? state.environments.find((environment) => environment.orgUrl === state.selectedEnvironment.orgUrl)
    : null;
  if (!byUrl || byUrl.name === state.selectedEnvironment.environmentName) {
    return false;
  }
  await selectEnvironment(byUrl, {
    loadBusinessUnits: false,
    silent: options.silentAutoSelect,
  });
  renderEnvironmentPicker();
  renderEnvironmentList();
  return true;
}

async function loadRoles() {
  el.roles.innerHTML = empty('Loading roles...');
  const [roles] = await Promise.all([
    api('/api/roles'),
    loadBusinessUnits().catch((error) => {
      console.error(error);
    }),
  ]);
  setRoles(roles || []);
  renderRoleList();
}

function setRoles(roles) {
  state.roles = uniqueById(roles || []);
  renderRoleAssignmentList();
}

function renderRoleList() {
  if (!state.roles.length) {
    el.roles.innerHTML = empty('No roles found.');
    return;
  }

  el.roles.innerHTML = state.roles.map((role) => {
    const businessUnitName = role.businessunitid?.name || role['_businessunitid_value@OData.Community.Display.V1.FormattedValue'] || role._businessunitid_value || '';
    const inheritedText = role.inheritedCount ? `${role.inheritedCount} inherited business-unit cop${role.inheritedCount === 1 ? 'y' : 'ies'}` : 'root role';
    return `
    <button class="list-item role-row" type="button" data-id="${escapeAttr(role.roleid)}" data-name="${escapeAttr(role.name)}" data-business-unit="${escapeAttr(businessUnitName)}">
      <span class="role-name">${escapeHtml(role.name)}</span>
      <span class="role-id">${escapeHtml(role.roleid)}${role.ismanaged ? ' | managed' : ''}</span>
      <span class="role-id">Editable root role | ${escapeHtml(inheritedText)}</span>
      ${businessUnitName ? `<span class="role-id">Root business unit: ${escapeHtml(businessUnitName)}</span>` : ''}
    </button>
  `;
  }).join('');

  document.querySelectorAll('.role-row').forEach((button) => {
    button.addEventListener('click', () => selectRole(button));
  });
  filterRoles();
}

async function ensureRolesLoaded() {
  if (state.roles.length) {
    renderRoleAssignmentList();
    return;
  }
  el.roleAssignmentRoles.innerHTML = empty('Loading roles...');
  const roles = await api('/api/roles');
  setRoles(roles || []);
  renderRoleList();
}

async function createRole(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  await withBusy(button, async () => {
    const formData = new FormData(form);
    const role = await api('/api/roles', {
      method: 'POST',
      body: {
        name: formData.get('name'),
        businessUnitId: formData.get('businessUnitId'),
        description: formData.get('description'),
        summaryOfCoreTablePrivileges: formData.get('summaryOfCoreTablePrivileges'),
        memberPrivilegeInheritance: formData.get('memberPrivilegeInheritance'),
        includeAppOpeningPrivileges: formData.get('includeAppOpeningPrivileges') === 'on',
      },
    });
    form.reset();
    el.createRoleForm.hidden = true;
    el.toggleCreateRoleButton.textContent = 'Create role';
    renderBusinessUnits();
    toast(`Created ${role.name}`);
    await loadRoles();
    const newButton = findRoleRow(role.roleid);
    if (newButton) {
      selectRole(newButton);
    }
  });
}

async function loadBusinessUnits() {
  state.businessUnits = await api('/api/business-units');
  state.businessUnitsLoaded = true;
  renderBusinessUnits();
}

function renderBusinessUnits() {
  renderBusinessUnitSelect(el.createRoleBusinessUnit, 'Current user\'s business unit');
  renderBusinessUnitSelect(el.teamBusinessUnit, 'Current user\'s business unit');
}

function renderBusinessUnitSelect(select, placeholder) {
  if (!select) {
    return;
  }
  const selected = select.value;
  select.innerHTML = [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...state.businessUnits.map((unit) => `
      <option value="${escapeAttr(unit.businessunitid)}"${unit.businessunitid === selected ? ' selected' : ''}>
        ${escapeHtml(unit.name)}
      </option>
    `),
  ].join('');
}

function clearBusinessUnits() {
  state.businessUnits = [];
  state.businessUnitsLoaded = false;
  renderBusinessUnits();
}

function clearEnvironmentData() {
  clearBusinessUnits();
  clearTimeout(userSearchTimer);
  clearTimeout(teamSearchTimer);
  state.users = [];
  state.usersLoaded = false;
  state.usersLoading = false;
  state.usersError = '';
  state.usersNextPageToken = '';
  state.usersRequestId += 1;
  state.teams = [];
  state.teamsLoaded = false;
  state.teamsLoading = false;
  state.teamsError = '';
  state.teamsNextPageToken = '';
  state.teamsRequestId += 1;
  state.connections = [];
  state.connectionsLoaded = false;
  state.connectionUser = null;
  state.connectionWarnings = [];
  state.pendingConnectionDeleteId = '';
  state.roles = [];
  state.selectedTeamId = '';
  state.roleAssignmentPrincipal = null;
  state.solutionComponents = [];
  state.solutionTableCount = 0;
  state.tables = [];
  state.tablesLoaded = false;
  state.aiEvents = [];
  state.aiEventsLoaded = false;
  state.aiEventFieldMappings = {};
  state.aiEventUnresolvedFields = [];
  state.aiEventDetailCache = new Map();
  state.selectedAiEventId = '';
  state.agentSessions = [];
  state.agentSessionsLoaded = false;
  state.agentSessionsLoading = false;
  state.agentSessionsNextPageToken = '';
  state.agentSessionDateRange = {
    range: 'month',
    startDate: '',
    endDate: '',
  };
  state.agentSessionDetailCache = new Map();
  state.selectedAgentSessionId = '';
  state.flowRuns = [];
  state.flowRunsLoaded = false;
  state.automatedReports.chartDashboardData = null;
  state.automatedReports.dashboardData = null;
  destroyReportCharts();
  destroyTrendCharts();
  state.selectedTableLogicalName = '';
  state.selectedTableDetails = null;
  state.selectedTableDiagram = null;
  state.activeDiagram = null;
  state.diagramZoom = 1;
  state.activeTableDocument = null;
  resetAiEventFilters();
  resetAgentSessionFilters();
  resetFlowRunFilters();
  resetAutomatedReportFilters();
  renderUsers();
  renderTeams();
  renderConnections();
  renderAiEvents();
  renderAgentSessions();
  renderFlowRuns();
  renderAutomatedReportControls();
  updateReportsTabAvailability();
  renderTables();
  clearTableSelection();
  closeAiEventDetailModal();
  closeAgentSessionDetailModal();
  closeConnectionDeleteModal();
  closeRoleAssignmentModal();
  closeDiagramModal();
  closeTableDocumentModal();
  clearRoleSelection();
}

function resetAiEventFilters() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  state.aiEventDateRange = {
    range: 'month',
    startDate: formatDateInputValue(start),
    endDate: formatDateInputValue(end),
  };
  state.aiEventTotalsGroupBy = 'flow';
  el.aiEventsRange.value = 'month';
  el.aiEventsStart.value = state.aiEventDateRange.startDate;
  el.aiEventsEnd.value = state.aiEventDateRange.endDate;
  el.aiEventsCreditType.value = '';
  el.aiEventsCreatedBy.value = '';
  el.aiEventsToolName.value = '';
  el.aiEventsModel.value = '';
  el.aiEventsSource.value = '';
  state.aiEventSort = {
    column: 'created',
    direction: 'desc',
  };
  state.aiEventTotalsSort = {
    column: 'eventCount',
    direction: 'desc',
  };
  syncAiEventCustomRangeVisibility();
}

function resetAgentSessionFilters() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  state.agentSessionDateRange = {
    range: 'month',
    startDate: formatDateInputValue(start),
    endDate: formatDateInputValue(end),
  };
  el.agentSessionsRange.value = 'month';
  el.agentSessionsStart.value = state.agentSessionDateRange.startDate;
  el.agentSessionsEnd.value = state.agentSessionDateRange.endDate;
  el.agentSessionsSearch.value = '';
  syncAgentSessionCustomRangeVisibility();
}

function resetFlowRunFilters() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  state.flowRunDateRange = {
    range: '7d',
    startDate: formatDateInputValue(start),
    endDate: formatDateInputValue(end),
  };
  state.flowRunSort = {
    column: 'startTime',
    direction: 'desc',
  };
  state.flowRunTotalsSort = {
    column: 'totalRuns',
    direction: 'desc',
  };
  el.flowRunsRange.value = '7d';
  el.flowRunsStart.value = state.flowRunDateRange.startDate;
  el.flowRunsEnd.value = state.flowRunDateRange.endDate;
  el.flowRunsStatus.value = '';
  el.flowRunsTrigger.value = '';
  el.flowRunsSearch.value = '';
  el.flowRunsMinDuration.value = '';
  el.flowRunsErrorsOnly.checked = false;
  syncFlowRunCustomRangeVisibility();
}

function resetAutomatedReportFilters() {
  if (el.automatedAiEventsRange) {
    el.automatedAiEventsRange.value = state.aiEventDateRange.range;
    el.automatedAiEventsStart.value = state.aiEventDateRange.startDate;
    el.automatedAiEventsEnd.value = state.aiEventDateRange.endDate;
  }
  if (el.automatedAgentSessionsRange) {
    el.automatedAgentSessionsRange.value = state.agentSessionDateRange.range;
    el.automatedAgentSessionsStart.value = state.agentSessionDateRange.startDate;
    el.automatedAgentSessionsEnd.value = state.agentSessionDateRange.endDate;
  }
  restoreAutomatedReportSettings();
  syncAutomatedReportDateRanges();
}

function initAutomatedReportSettings() {
  el.automatedReportsRunOnLoad.checked = localStorage.getItem(AUTOMATED_REPORTS_RUN_ON_LOAD_KEY) === 'true';
  restoreAutomatedReportSettings();
  syncTrendRangeVisibility();
}

function readAutomatedReportSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(AUTOMATED_REPORT_SETTINGS_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function restoreAutomatedReportSettings() {
  const settings = readAutomatedReportSettings();
  const aiEvents = settings.aiEvents || {};
  const agentSessions = settings.agentSessions || {};
  const solutions = settings.solutions || {};
  const reportOptions = settings.reportOptions || {};
  const environments = settings.environments || {};
  const legacySaveTrendData = Object.values(reportOptions).some((options) => Boolean(options?.saveToDatabase));
  state.automatedReports.saveTrendData = Boolean(settings.saveTrendData ?? legacySaveTrendData);
  el.automatedReportsSaveTrends.checked = state.automatedReports.saveTrendData;
  el.automatedAiEventsRange.value = selectValueOrDefault(el.automatedAiEventsRange, aiEvents.range, el.automatedAiEventsRange.value);
  el.automatedAiEventsStart.value = aiEvents.start || el.automatedAiEventsStart.value;
  el.automatedAiEventsEnd.value = aiEvents.end || el.automatedAiEventsEnd.value;
  el.automatedAgentSessionsRange.value = selectValueOrDefault(el.automatedAgentSessionsRange, agentSessions.range, el.automatedAgentSessionsRange.value);
  el.automatedAgentSessionsStart.value = agentSessions.start || el.automatedAgentSessionsStart.value;
  el.automatedAgentSessionsEnd.value = agentSessions.end || el.automatedAgentSessionsEnd.value;
  el.automatedSolutionsPublisherExclusions.value = solutions.excludedPublishers ?? localStorage.getItem(AUTOMATED_SOLUTIONS_PUBLISHER_EXCLUSIONS_KEY) ?? '';
  el.automatedSolutionsIncludeManaged.checked = Boolean(solutions.includeManaged);
  el.automatedSolutionsIncludeMicrosoft.checked = Boolean(solutions.includeMicrosoftOwned);
  for (const groupKey of automatedReportGroupKeys()) {
    const options = reportOptions[groupKey] || {};
    const autoDownloadInput = automatedReportOptionInput(groupKey, 'autoDownload');
    const migratedGlobalAutoDownload = localStorage.getItem('pdacAutomatedReportsAutoDownload') === 'true';
    state.automatedReports.reportOptions[groupKey] = {
      autoDownload: options.autoDownload ?? migratedGlobalAutoDownload,
    };
    if (autoDownloadInput) {
      autoDownloadInput.checked = Boolean(state.automatedReports.reportOptions[groupKey].autoDownload);
    }
  }
  for (const groupKey of ['aiEvents', 'agentSessions', 'solutions', 'flowRuns', 'reports']) {
    if (Array.isArray(environments[groupKey])) {
      state.automatedReports.selectedEnvironmentIds[groupKey] = new Set(environments[groupKey]);
    }
  }
}

function selectValueOrDefault(select, value, fallback) {
  return [...select.options].some((option) => option.value === value) ? value : fallback;
}

function saveAutomatedReportSettings() {
  const groups = ['aiEvents', 'agentSessions', 'solutions', 'flowRuns', 'reports'];
  const environments = Object.fromEntries(groups.map((groupKey) => [
    groupKey,
    state.automatedReports.selectedEnvironmentIds[groupKey] instanceof Set
      ? [...state.automatedReports.selectedEnvironmentIds[groupKey]]
      : [],
  ]));
  const settings = {
    aiEvents: {
      range: el.automatedAiEventsRange.value,
      start: el.automatedAiEventsStart.value,
      end: el.automatedAiEventsEnd.value,
    },
    agentSessions: {
      range: el.automatedAgentSessionsRange.value,
      start: el.automatedAgentSessionsStart.value,
      end: el.automatedAgentSessionsEnd.value,
    },
    solutions: {
      excludedPublishers: el.automatedSolutionsPublisherExclusions.value || '',
      includeManaged: el.automatedSolutionsIncludeManaged.checked,
      includeMicrosoftOwned: el.automatedSolutionsIncludeMicrosoft.checked,
    },
    saveTrendData: Boolean(el.automatedReportsSaveTrends.checked),
    reportOptions: Object.fromEntries(automatedReportGroupKeys().map((groupKey) => {
      const options = {
        autoDownload: Boolean(automatedReportOptionInput(groupKey, 'autoDownload')?.checked),
      };
      state.automatedReports.reportOptions[groupKey] = options;
      return [groupKey, options];
    })),
    environments,
  };
  localStorage.setItem(AUTOMATED_REPORT_SETTINGS_KEY, JSON.stringify(settings));
  syncAutomatedReportSchedule(settings).catch((error) => console.warn('Unable to save background report schedule.', error));
  syncWeeklyReportEnvironmentSettings().catch((error) => console.warn('Unable to update weekly report environments.', error));
  if (state.weeklyReport.open) {
    renderWeeklyReport();
  }
}

async function syncAutomatedReportSchedule(settings) {
  const groupMap = {
    'ai-events': 'aiEvents',
    'agent-sessions': 'agentSessions',
    solutions: 'solutions',
    'flow-runs': 'flowRuns',
  };
  const groups = {};
  for (const [apiGroup, groupKey] of Object.entries(groupMap)) {
    const selectedIds = new Set(settings.environments?.[groupKey] || []);
    const existingEnvironments = state.automatedReportSchedule?.groups?.[apiGroup]?.environments || [];
    const environmentSource = state.environmentsLoaded ? state.environments : existingEnvironments;
    groups[apiGroup] = {
      environments: environmentSource
        .filter((environment) => selectedIds.has(environment.name || environment.environmentName || environment.environmentId) && environment.orgUrl)
        .map((environment) => ({
          name: environment.name || environment.environmentName || environment.environmentId,
          environmentName: environment.name || environment.environmentName || environment.environmentId,
          displayName: environment.displayName || environment.name || environment.environmentName || environment.environmentId,
          orgUrl: environment.orgUrl,
        })),
      dateRange: scheduledReportDateRange(groupKey === 'aiEvents' ? settings.aiEvents : groupKey === 'agentSessions' ? settings.agentSessions : {}),
      solutionOptions: groupKey === 'solutions' ? settings.solutions : {},
      saveToDatabase: Boolean(settings.saveTrendData),
    };
  }
  const savedSchedule = await api('/api/automated-reports/schedule', {
    method: 'PUT',
    body: {
      enabled: el.automatedReportsRunOnLoad.checked,
      saveTrendData: Boolean(settings.saveTrendData),
      accountHomeId: resolveRequestAccountId() || state.automatedReportSchedule?.accountHomeId || '',
      groups,
    },
    quiet: true,
  });
  state.automatedReportSchedule = savedSchedule;
  state.automatedReports.scheduleCompletionKey = automatedReportScheduleCompletionKey(savedSchedule);
  watchForTodaysAutomatedReports();
}

function scheduledReportDateRange(value = {}) {
  const range = String(value.range || '').trim();
  if (!range) {
    return {};
  }
  return range === 'custom'
    ? { range, start: value.start || '', end: value.end || '' }
    : { range };
}

function automatedReportOptionInput(groupKey, option) {
  const lookup = {
    aiEvents: {
      autoDownload: el.automatedAiEventsAutoDownload,
    },
    agentSessions: {
      autoDownload: el.automatedAgentSessionsAutoDownload,
    },
    solutions: {
      autoDownload: el.automatedSolutionsAutoDownload,
    },
    flowRuns: {
      autoDownload: el.automatedFlowRunsAutoDownload,
    },
  };
  return lookup[groupKey]?.[option] || null;
}

function handleAutomatedReportSettingsChange() {
  syncAutomatedReportDateRanges();
  saveAutomatedReportSettings();
}

function syncAutomatedReportDateRanges() {
  const aiCustom = el.automatedAiEventsRange.value === 'custom';
  el.automatedAiEventsStart.disabled = !aiCustom;
  el.automatedAiEventsEnd.disabled = !aiCustom;
  const sessionsCustom = el.automatedAgentSessionsRange.value === 'custom';
  el.automatedAgentSessionsStart.disabled = !sessionsCustom;
  el.automatedAgentSessionsEnd.disabled = !sessionsCustom;
}

function renderAutomatedReportControls() {
  renderAutomatedEnvironmentSelector('aiEvents', el.automatedAiEventsEnvironments);
  renderAutomatedEnvironmentSelector('agentSessions', el.automatedAgentSessionsEnvironments);
  renderAutomatedEnvironmentSelector('solutions', el.automatedSolutionsEnvironments);
  renderAutomatedEnvironmentSelector('flowRuns', el.automatedFlowRunsEnvironments);
}

function renderAutomatedEnvironmentSelector(groupKey, container) {
  if (!container) {
    return;
  }
  const previousSearch = container.querySelector('[data-automated-environment-search]')?.value || '';
  const availableEnvironments = state.environments.filter((environment) => environment.orgUrl && isEnvironmentVisible(environment));
  if (!availableEnvironments.length) {
    container.innerHTML = empty(state.environmentsLoaded ? 'No Dataverse environments available.' : 'Load environments first.');
    return;
  }
  const environments = filterEnvironments(availableEnvironments, previousSearch);
  const selected = getAutomatedSelectedEnvironmentIds(groupKey);
  container.innerHTML = `
    <div class="automated-environment-tools">
      <label class="search">
        Search environments
        <input data-automated-environment-search="${escapeAttr(groupKey)}" placeholder="Type to filter environments" value="${escapeAttr(previousSearch)}" />
      </label>
      <div class="automated-environment-clipboard">
        <button class="secondary" type="button" data-copy-automated-environments="${escapeAttr(groupKey)}">Copy</button>
        <button class="secondary" type="button" data-paste-automated-environments="${escapeAttr(groupKey)}">Paste</button>
      </div>
    </div>
    <div class="automated-environment-options">
      ${environments.length ? environments.map((environment) => `
    <label class="checkbox-label">
      <input type="checkbox" value="${escapeAttr(environment.name)}"${selected.has(environment.name) ? ' checked' : ''} />
      <span class="env-details">
        <span class="role-name">${escapeHtml(environment.displayName || environment.name)}</span>
        <span class="role-id">${escapeHtml(environment.name)}</span>
      </span>
    </label>
      `).join('') : empty('No environments match the filter.')}
    </div>
  `;
}

function automatedReportGroupKeys() {
  return ['aiEvents', 'agentSessions', 'solutions', 'flowRuns'];
}

async function copyAutomatedReportEnvironments(groupKey) {
  if (!automatedReportGroupKeys().includes(groupKey)) {
    throw new Error('Choose a valid report section.');
  }
  const environmentIds = [...getAutomatedSelectedEnvironmentIds(groupKey)];
  if (!environmentIds.length) {
    throw new Error('Select at least one environment to copy.');
  }
  const environments = environmentIds
    .map((environmentName) => state.environments.find((environment) => environment.name === environmentName))
    .filter(Boolean)
    .map((environment) => ({
      name: environment.name,
      displayName: environment.displayName || environment.name,
      orgUrl: environment.orgUrl || '',
    }));
  await writeClipboard(JSON.stringify({
    type: 'pdac-report-environments',
    version: 1,
    environments,
  }, null, 2));
  toast(`${environments.length} environment${environments.length === 1 ? '' : 's'} copied.`);
}

async function pasteAutomatedReportEnvironments(groupKey) {
  if (!automatedReportGroupKeys().includes(groupKey)) {
    throw new Error('Choose a valid report section.');
  }
  const text = await readClipboard();
  const environmentIds = parseAutomatedEnvironmentClipboard(text);
  state.automatedReports.selectedEnvironmentIds[groupKey] = new Set(environmentIds);
  pruneAutomatedReportEnvironmentSelections();
  saveAutomatedReportSettings();
  const container = automatedEnvironmentContainer(groupKey);
  renderAutomatedEnvironmentSelector(groupKey, container);
  toast(`${environmentIds.length} environment${environmentIds.length === 1 ? '' : 's'} pasted to ${automatedGroupLabel(groupKey)}.`);
}

function parseAutomatedEnvironmentClipboard(text) {
  let data;
  try {
    data = JSON.parse(String(text || ''));
  } catch {
    throw new Error('Clipboard does not contain valid report environments.');
  }
  if (data?.type !== 'pdac-report-environments' || !Array.isArray(data.environments)) {
    throw new Error('Clipboard does not contain valid report environments.');
  }
  const available = new Set(state.environments
    .filter((environment) => environment.orgUrl && isEnvironmentVisible(environment))
    .map((environment) => environment.name));
  const environmentIds = data.environments
    .map((environment) => String(environment?.name || environment?.environmentName || '').trim())
    .filter((environmentName) => available.has(environmentName));
  if (!environmentIds.length) {
    throw new Error('Clipboard environments are not valid for the loaded environment list.');
  }
  return [...new Set(environmentIds)];
}

function getAutomatedSelectedEnvironmentIds(groupKey) {
  const stored = state.automatedReports.selectedEnvironmentIds[groupKey];
  if (stored instanceof Set) {
    return stored;
  }
  const saved = readAutomatedReportSettings().environments?.[groupKey];
  const available = new Set(state.environments
    .filter((environment) => environment.orgUrl && isEnvironmentVisible(environment))
    .map((environment) => environment.name));
  const defaults = new Set((Array.isArray(saved)
    ? saved
    : [...available])
    .filter((environmentName) => available.has(environmentName)));
  state.automatedReports.selectedEnvironmentIds[groupKey] = defaults;
  saveAutomatedReportSettings();
  return defaults;
}

function handleAutomatedEnvironmentSelection(groupKey) {
  const container = automatedEnvironmentContainer(groupKey);
  const selected = new Set(getAutomatedSelectedEnvironmentIds(groupKey));
  for (const input of container.querySelectorAll('.automated-environment-options input[type="checkbox"]')) {
    if (input.checked) {
      selected.add(input.value);
    } else {
      selected.delete(input.value);
    }
  }
  state.automatedReports.selectedEnvironmentIds[groupKey] = selected;
  saveAutomatedReportSettings();
}

function pruneAutomatedReportEnvironmentSelections() {
  const available = new Set(state.environments
    .filter((environment) => environment.orgUrl && isEnvironmentVisible(environment))
    .map((environment) => environment.name));
  let changed = false;
  for (const groupKey of automatedReportGroupKeys()) {
    const selected = state.automatedReports.selectedEnvironmentIds[groupKey];
    if (!(selected instanceof Set)) {
      continue;
    }
    const next = new Set([...selected].filter((environmentName) => available.has(environmentName)));
    if (next.size !== selected.size) {
      state.automatedReports.selectedEnvironmentIds[groupKey] = next;
      changed = true;
    }
  }
  if (changed) {
    saveAutomatedReportSettings();
  }
}

function automatedEnvironmentContainer(groupKey) {
  return {
    aiEvents: el.automatedAiEventsEnvironments,
    agentSessions: el.automatedAgentSessionsEnvironments,
    solutions: el.automatedSolutionsEnvironments,
    flowRuns: el.automatedFlowRunsEnvironments,
  }[groupKey];
}

function getAutomatedReportEnvironments(groupKey) {
  const selectedIds = getAutomatedSelectedEnvironmentIds(groupKey);
  const environments = state.environments
    .filter((environment) => selectedIds.has(environment.name) && environment.orgUrl && isEnvironmentVisible(environment))
    .sort(compareEnvironments)
    .map((environment) => ({
      name: environment.name,
      environmentName: environment.name,
      displayName: environment.displayName || environment.name,
      orgUrl: environment.orgUrl,
    }));
  if (!environments.length) {
    throw new Error('Select at least one environment for this automated report.');
  }
  return environments;
}

async function queueAutomatedReports(value) {
  const [apiGroup, reportType] = String(value || '').split(':');
  const groupKey = automatedGroupStateKey(apiGroup);
  if (!groupKey || !reportType) {
    return;
  }
  const types = [reportType === 'both' ? 'both' : reportType];
  const environments = getAutomatedReportEnvironments(groupKey);
  const reportOptions = getAutomatedReportOptions(groupKey);
  removeAutomatedReportDownloads(apiGroup);
  for (const type of types) {
    state.automatedReports.queue.push({
      apiGroup,
      groupKey,
      type,
      label: automatedReportJobLabel(groupKey, type),
      environments,
      reportRunId: createAutomatedReportRunId(),
      autoDownload: reportOptions.autoDownload,
      body: { ...buildAutomatedReportBody(groupKey, environments), forceRefresh: true, saveToDatabase: reportOptions.saveToDatabase },
    });
  }
  renderAutomatedReportStatus();
  if (!state.automatedReports.running) {
    runAutomatedReportQueue().catch((error) => {
      state.automatedReports.running = false;
      state.automatedReports.currentLabel = '';
      renderAutomatedReportStatus();
      toast(error.message, 'error');
      console.error(error);
    });
  } else {
    toast('Automated report queued.');
  }
}

function getAutomatedReportOptions(groupKey) {
  const options = {
    autoDownload: Boolean(automatedReportOptionInput(groupKey, 'autoDownload')?.checked),
    saveToDatabase: Boolean(el.automatedReportsSaveTrends.checked),
  };
  state.automatedReports.reportOptions[groupKey] = options;
  return options;
}

async function runAutomatedReportQueue() {
  state.automatedReports.running = true;
  try {
    while (state.automatedReports.queue.length) {
      const job = state.automatedReports.queue.shift();
      state.automatedReports.currentLabel = `Running ${job.label}`;
      renderAutomatedReportStatus();
      await runAutomatedReportJob(job);
      if (state.automatedReports.queue.length) {
        state.automatedReports.currentLabel = 'Waiting before the next report';
        renderAutomatedReportStatus();
        await delay(900);
      }
    }
  } finally {
    state.automatedReports.currentLabel = 'Refreshing trends';
    renderAutomatedReportStatus();
    try {
      await Promise.all([
        loadCachedChartsDashboard(),
        loadCachedReportsDashboard(),
      ]);
    } catch (error) {
      console.warn('Unable to refresh cached dashboard.', error);
    } finally {
      state.automatedReports.running = false;
      state.automatedReports.currentLabel = '';
      renderAutomatedReportStatus();
    }
  }
}

async function runAutomatedReportJob(job) {
  const reportRunId = job.reportRunId || createAutomatedReportRunId();
  state.automatedReports.activeRunId = reportRunId;
  const refreshProgress = () => refreshAutomatedReportProgress(job, reportRunId).catch(() => {});
  const progressTimer = setInterval(refreshProgress, 500);
  try {
    refreshProgress();
    const response = await apiFetch(`/api/automated-reports/${encodeURIComponent(job.apiGroup)}/${encodeURIComponent(job.type)}`, {
      method: 'POST',
      body: { ...job.body, reportRunId },
    });
    const contentType = response.headers.get('content-type') || '';
    removeAutomatedReportDownloads(job.apiGroup);
    if (contentType.includes('application/json')) {
      const data = await response.json();
      for (const file of data.files || []) {
        addAutomatedReportDownload({
          label: file.filename || job.label,
          filename: file.filename || `${safeFilename(job.label)}.xlsx`,
          blob: base64ToBlob(file.base64 || '', file.contentType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
          groupKey: job.groupKey,
          autoDownload: Boolean(job.autoDownload),
        });
      }
    } else {
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || `${safeFilename(job.label)}.xlsx`;
      addAutomatedReportDownload({ label: job.label, filename, blob, groupKey: job.groupKey, autoDownload: Boolean(job.autoDownload) });
    }
    toast(`${job.label} ready.`);
    renderAutomatedReportStatus();
  } finally {
    clearInterval(progressTimer);
    if (state.automatedReports.activeRunId === reportRunId) {
      state.automatedReports.activeRunId = '';
    }
  }
}

async function refreshAutomatedReportProgress(job, reportRunId) {
  const progress = await api(`/api/automated-reports/progress/${encodeURIComponent(reportRunId)}`, { quiet: true });
  if (state.automatedReports.activeRunId !== reportRunId) {
    return;
  }
  const activeEnvironments = Array.isArray(progress?.activeEnvironments)
    ? progress.activeEnvironments
    : progress?.currentEnvironment ? [progress.currentEnvironment] : [];
  if (!activeEnvironments.length) {
    return;
  }
  const names = activeEnvironments
    .map((environment) => environment.displayName || environment.environmentId || 'environment')
    .join(' + ');
  const position = progress.totalEnvironments > 1
    ? ` (${Number(progress.completedEnvironments || 0)} complete of ${progress.totalEnvironments})`
    : '';
  state.automatedReports.currentLabel = `Running ${job.label} — ${names}${position}`;
  renderAutomatedReportStatus();
}

function createAutomatedReportRunId() {
  return globalThis.crypto?.randomUUID?.() || `report-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function loadCachedAutomatedReportDownloads() {
  if (!hasSelectedAccount()) {
    return;
  }
  const data = await api('/api/report-cache', { quiet: true });
  const today = formatDateInputValue(new Date());
  const downloadedGroups = new Set();
  clearAutomatedReportDownloads();
  for (const file of data.files || []) {
    const groupKey = automatedGroupStateKey(file.reportGroup || automatedReportFamily(file.filename || ''));
    const autoDownload = Boolean(getAutomatedReportOptions(groupKey).autoDownload)
      && localStorage.getItem(automatedReportAutoDownloadDateKey(groupKey)) !== today;
    addAutomatedReportDownload({
      label: `Cached ${file.filename || 'report'}`,
      filename: file.filename || 'report.xlsx',
      blob: base64ToBlob(file.base64 || '', file.contentType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      completedAt: file.completedAt ? new Date(file.completedAt) : new Date(),
      groupKey,
      autoDownload,
    });
    if (autoDownload) downloadedGroups.add(groupKey);
  }
  for (const groupKey of downloadedGroups) {
    localStorage.setItem(automatedReportAutoDownloadDateKey(groupKey), today);
  }
  renderAutomatedReportStatus();
}

async function loadCachedReportDashboards() {
  await Promise.all([
    loadCachedChartsDashboard(),
    loadCachedReportsDashboard(),
  ]);
}

function watchForTodaysAutomatedReports() {
  clearTimeout(state.automatedReports.scheduleWatchTimer);
  const accountHomeId = resolveRequestAccountId();
  if (!accountHomeId) return;

  const poll = async () => {
    if (resolveRequestAccountId() !== accountHomeId) return;
    try {
      const schedule = await api('/api/automated-reports/schedule', { quiet: true });
      if (schedule.accountHomeId && schedule.accountHomeId !== accountHomeId) return;
      state.automatedReportSchedule = schedule;
      const today = formatDateInputValue(new Date());
      const groups = Object.values(schedule.groups || {}).filter((group) => Array.isArray(group?.environments) && group.environments.length);
      const pending = Boolean(schedule.enabled) && groups.some((group) => group.lastRunDate !== today);
      const completionKey = automatedReportScheduleCompletionKey(schedule);
      if (completionKey !== state.automatedReports.scheduleCompletionKey) {
        const hadPreviousState = Boolean(state.automatedReports.scheduleCompletionKey);
        state.automatedReports.scheduleCompletionKey = completionKey;
        if (hadPreviousState) {
          await Promise.all([
            loadCachedReportDashboards(),
            loadCachedAutomatedReportDownloads().catch((error) => {
              console.warn('Unable to refresh cached report downloads.', error);
            }),
          ]);
        }
      }
      if (pending) {
        state.automatedReports.scheduleWatchTimer = setTimeout(poll, 2000);
      }
    } catch (error) {
      console.warn('Unable to watch scheduled report completion.', error);
      state.automatedReports.scheduleWatchTimer = setTimeout(poll, 5000);
    }
  };
  poll();
}

function automatedReportScheduleCompletionKey(schedule = {}) {
  const groups = Object.entries(schedule.groups || {})
    .filter(([, group]) => Array.isArray(group?.environments) && group.environments.length)
    .sort(([left], [right]) => left.localeCompare(right));
  return `${schedule.accountHomeId || ''}|${groups.map(([name, group]) => `${name}:${group.lastRunDate || ''}:${group.lastCompletedAt || ''}`).join('|')}`;
}

function automatedReportAutoDownloadDateKey(groupKey) {
  return `${AUTOMATED_REPORT_AUTO_DOWNLOAD_DATE_PREFIX}:${resolveRequestAccountId()}:${groupKey}`;
}

async function loadCachedReportsDashboard() {
  const accountHomeId = resolveRequestAccountId();
  if (!accountHomeId) return;
  try {
    el.reportsStatus.textContent = 'Loading stored trends...';
    const params = new URLSearchParams({
      accountHomeId,
      range: el.trendRange?.value || 'month',
    });
    if (params.get('range') === 'custom') {
      params.set('start', el.trendStart?.value || '');
      params.set('end', el.trendEnd?.value || '');
    }
    const data = await api(`/api/report-trends?${params.toString()}`, { quiet: true });
    if (resolveRequestAccountId() !== accountHomeId) return;
    if (!Array.isArray(data.rows) || !data.rows.length) {
      state.automatedReports.dashboardData = data;
      updateReportsTabAvailability();
      renderReportsPlaceholder();
      return;
    }
    state.automatedReports.dashboardData = data;
    updateReportsTabAvailability();
    renderReportsDashboard(data);
    const range = data.range?.startDate && data.range?.endDate ? `${data.range.startDate} to ${data.range.endDate}` : 'selected range';
    el.reportsStatus.textContent = `Loaded stored trends for ${range}.`;
  } catch (error) {
    console.warn('Unable to load stored trends.', error);
    updateReportsTabAvailability();
  }
}

async function loadCachedChartsDashboard() {
  const accountHomeId = resolveRequestAccountId();
  if (!accountHomeId) return;
  try {
    el.chartsStatus.textContent = 'Preparing charts from local trend data...';
    const params = new URLSearchParams({ accountHomeId, range: '730d', latestOnly: 'true' });
    const stored = await api(`/api/report-trends?${params.toString()}`, { quiet: true });
    if (resolveRequestAccountId() !== accountHomeId) return;
    const data = buildLatestSqlChartsDashboard(stored);
    if (!Array.isArray(data.rows) || !data.rows.length) {
      updateChartsTabAvailability();
      return;
    }
    state.automatedReports.chartDashboardData = data;
    updateChartsTabAvailability();
    renderChartsDashboard(data);
    const generated = data.generatedAt ? new Date(data.generatedAt).toLocaleString() : 'the latest snapshot';
    el.chartsStatus.textContent = `Loaded the latest stored trend snapshot (${generated}).`;
  } catch (error) {
    console.warn('Unable to load the local trend chart dashboard.', error);
    updateChartsTabAvailability();
  }
}

function buildLatestSqlChartsDashboard(data = {}) {
  const tables = new Map((data.tables || []).map((table) => [table.tableName, table]));
  const latest = new Map();
  for (const table of tables.values()) {
    for (const row of table.rows || []) {
      const values = row.values || {};
      const environmentId = values.environment_id || '';
      const key = `${table.tableName}:${environmentId}`;
      if (!latest.has(key) || String(row.collectedAt) > String(latest.get(key).collectedAt)) latest.set(key, row);
    }
  }
  const rows = new Map();
  const ensureRow = (values) => {
    const id = values.environment_id || values.environment_display_name || '';
    if (!rows.has(id)) rows.set(id, { environmentId: id, environmentDisplayName: values.environment_display_name || id });
    return rows.get(id);
  };
  for (const [key, row] of latest) {
    const values = row.values || {};
    const target = ensureRow(values);
    if (key.startsWith('report_flow_run_totals:')) target.flowRuns = { successful: values.successful_flow_runs, failed: values.failed_flow_runs };
    if (key.startsWith('report_ai_flow_event_totals:')) target.aiFlow = { aiBuilderCredits: values.sum_ai_builder_credits_used, copilotStudioCredits: values.sum_copilot_studio_credits_used };
    if (key.startsWith('report_agent_session_totals:')) target.copilotSessions = values.total_sessions;
    if (key.startsWith('report_solution_totals:')) Object.assign(target, {
      solutionCount: values.included_solutions,
      flowCount: values.number_of_flows,
      codeAppCount: values.number_of_code_apps,
      canvasAppCount: values.number_of_canvas_apps,
      modelDrivenAppCount: values.number_of_model_driven_apps,
      aiModelCount: values.number_of_ai_models,
      copilotStudioAgentCount: values.number_of_copilot_studio_agents,
    });
  }
  const collected = [...latest.values()].map((row) => row.collectedAt).filter(Boolean).sort();
  return { rows: [...rows.values()], modelMix: [], generatedAt: collected.at(-1) || '' };
}

function removeAutomatedReportDownloads(apiGroup) {
  const family = automatedReportFamily(apiGroup);
  if (!family) {
    return;
  }
  const retained = [];
  for (const item of state.automatedReports.history) {
    if (automatedReportFamily(item.filename) === family) {
      URL.revokeObjectURL(item.url);
    } else {
      retained.push(item);
    }
  }
  state.automatedReports.history = retained;
}

function clearAutomatedReportDownloads() {
  for (const item of state.automatedReports.history) {
    if (item.url) {
      URL.revokeObjectURL(item.url);
    }
  }
  state.automatedReports.history = [];
}

function automatedReportFamily(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'ai-events' || text.startsWith('ai-flow-events-')) {
    return 'ai-events';
  }
  if (text === 'agent-sessions' || text.startsWith('agent-sessions-')) {
    return 'agent-sessions';
  }
  if (text === 'solutions' || text.startsWith('solutions-')) {
    return 'solutions';
  }
  if (text === 'flow-runs' || text.startsWith('flow-runs-')) {
    return 'flow-runs';
  }
  return '';
}

function addAutomatedReportDownload({ label, filename, blob, completedAt = new Date(), groupKey = '', autoDownload = false }) {
  if (state.automatedReports.history.some((item) =>
    item.filename === filename && item.completedAt?.getTime?.() === completedAt?.getTime?.()
  )) {
    return;
  }
  const url = URL.createObjectURL(blob);
  state.automatedReports.history.unshift({
    label,
    filename,
    url,
    completedAt,
    groupKey: groupKey || automatedGroupStateKey(automatedReportFamily(filename)),
  });
  if (autoDownload) {
    autoDownloadAutomatedReport(url, filename);
  }
  while (state.automatedReports.history.length > 8) {
    const old = state.automatedReports.history.pop();
    if (old?.url) {
      URL.revokeObjectURL(old.url);
    }
  }
}

function autoDownloadAutomatedReport(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
}

function base64ToBlob(base64, contentType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: contentType });
}

function buildAutomatedReportBody(groupKey, environments) {
  const body = {
    environments,
    accountHomeId: resolveRequestAccountId(),
  };
  if (groupKey === 'aiEvents') {
    body.dateRange = {
      range: el.automatedAiEventsRange.value || 'month',
      start: el.automatedAiEventsStart.value || '',
      end: el.automatedAiEventsEnd.value || '',
    };
  }
  if (groupKey === 'agentSessions') {
    body.dateRange = {
      range: el.automatedAgentSessionsRange.value || 'month',
      start: el.automatedAgentSessionsStart.value || '',
      end: el.automatedAgentSessionsEnd.value || '',
    };
  }
  if (groupKey === 'solutions') {
    body.solutionOptions = {
      excludedPublishers: el.automatedSolutionsPublisherExclusions.value || '',
      includeManaged: el.automatedSolutionsIncludeManaged.checked,
      includeMicrosoftOwned: el.automatedSolutionsIncludeMicrosoft.checked,
    };
  }
  return body;
}

function renderAutomatedReportStatus() {
  const running = state.automatedReports.running;
  const queued = state.automatedReports.queue.length;
  if (running) {
    el.automatedReportStatusTitle.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${escapeHtml(state.automatedReports.currentLabel || 'Running')}</span>`;
  } else if (state.automatedReports.history.length) {
    el.automatedReportStatusTitle.textContent = 'Ready';
  } else {
    el.automatedReportStatusTitle.textContent = 'Idle';
  }
  const lines = [];
  if (queued) {
    lines.push(`${queued} report${queued === 1 ? '' : 's'} queued`);
  }
  if (!lines.length && !running) {
    lines.push(state.automatedReports.history.length ? 'Downloads are ready.' : 'No report is running.');
  }
  el.automatedReportStatusList.innerHTML = lines.map((line) => `<span>${escapeHtml(line)}</span>`).join('');
  if (el.automatedReportDownloads) {
    el.automatedReportDownloads.innerHTML = '';
  }
  renderAutomatedReportCardDownloads();
}

function renderAutomatedReportCardDownloads() {
  for (const groupKey of automatedReportGroupKeys()) {
    const container = automatedReportDownloadsContainer(groupKey);
    if (!container) {
      continue;
    }
    const items = state.automatedReports.history
      .filter((item) => item.groupKey === groupKey)
      .slice(0, 4);
    container.innerHTML = items.length ? `
      <div class="automated-report-download-row">
        ${items.map((item) => `
          <a href="${escapeAttr(item.url)}" download="${escapeAttr(item.filename)}" title="${escapeAttr(item.completedAt.toLocaleString())}">
            ${escapeHtml(item.filename)}
          </a>
        `).join('')}
      </div>
    ` : '';
  }
}

function automatedReportDownloadsContainer(groupKey) {
  return {
    aiEvents: el.automatedAiEventsDownloads,
    agentSessions: el.automatedAgentSessionsDownloads,
    solutions: el.automatedSolutionsDownloads,
    flowRuns: el.automatedFlowRunsDownloads,
  }[groupKey] || null;
}

function groupAutomatedReportDownloads(items) {
  const groups = new Map();
  for (const item of items) {
    const key = automatedReportDownloadGroupKey(item.filename);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  }
  return [...groups.values()].map((group) => group
    .sort((left, right) => automatedReportDownloadSort(left.filename) - automatedReportDownloadSort(right.filename))
    .slice(0, 2));
}

function automatedReportDownloadGroupKey(filename) {
  return String(filename || '')
    .replace(/-(failed-raw-stacked|raw-stacked|totals-by-environment)-/i, '-')
    .replace(/\.xlsx$/i, '')
    .toLowerCase();
}

function automatedReportDownloadSort(filename) {
  return /raw-stacked/i.test(String(filename || '')) ? 0 : 1;
}

function automatedGroupStateKey(apiGroup) {
  return {
    'ai-events': 'aiEvents',
    'agent-sessions': 'agentSessions',
    solutions: 'solutions',
    'flow-runs': 'flowRuns',
  }[apiGroup] || '';
}

function automatedGroupLabel(groupKey) {
  return {
    aiEvents: 'AI Flow events',
    agentSessions: 'Agent Sessions',
    solutions: 'Solutions',
    flowRuns: 'Flow Runs',
  }[groupKey] || 'Report';
}

function automatedReportJobLabel(groupKey, type) {
  if (type === 'both') {
    return `${automatedGroupLabel(groupKey)} reports`;
  }
  if (groupKey === 'flowRuns' && type === 'raw') {
    return 'Flow Runs failed-run details';
  }
  return `${automatedGroupLabel(groupKey)} ${type === 'totals' ? 'totals by environment' : 'raw stacked'}`;
}

function updateReportsTabAvailability() {
  const tab = [...el.tabs].find((item) => item.dataset.tab === 'trends');
  const hasData = Array.isArray(state.automatedReports.dashboardData?.rows) && state.automatedReports.dashboardData.rows.length > 0;
  if (tab) {
    tab.disabled = false;
    tab.setAttribute('aria-disabled', 'false');
    tab.title = hasData ? 'Open trends' : 'Enable trend data to be saved, then run reports to populate trends';
  }
  if (!hasData && el.reportsStatus) {
    el.reportsStatus.textContent = 'Enable trend data to be saved, then run reports to populate trends.';
    renderReportsPlaceholder();
  }
}

function updateChartsTabAvailability() {
  const tab = [...el.tabs].find((item) => item.dataset.tab === 'charts');
  const hasData = Array.isArray(state.automatedReports.chartDashboardData?.rows) && state.automatedReports.chartDashboardData.rows.length > 0;
  if (tab) {
    tab.disabled = false;
    tab.setAttribute('aria-disabled', 'false');
    tab.title = hasData ? 'Open charts' : 'Run a background report to populate the charts';
  }
  if (!hasData && el.chartsStatus) {
    el.chartsStatus.textContent = 'Run a background report to populate these charts.';
    renderChartsPlaceholder();
  }
}

function destroyReportCharts() {
  for (const chart of state.automatedReports.charts) {
    chart?.destroy?.();
  }
  state.automatedReports.charts = [];
}

function destroyTrendCharts() {
  for (const chart of state.automatedReports.trendCharts) {
    chart?.destroy?.();
  }
  state.automatedReports.trendCharts = [];
}

function renderChartsDashboard(data = {}) {
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const modelMix = Array.isArray(data.modelMix) ? data.modelMix : [];
  if (!rows.length) {
    renderChartsPlaceholder();
    return;
  }
  destroyReportCharts();
  const charts = [
    {
      id: 'flow-runs',
      title: 'Flow runs by environment',
      subtitle: 'Last 7 days - logarithmic run scale',
      type: 'bar',
      labels: rows.map(reportEnvironmentLabel),
      datasets: [
        reportDataset('Successful runs', rows.map((row) => number(row.flowRuns?.successful)), '#16a34a'),
        reportDataset('Failed runs', rows.map((row) => number(row.flowRuns?.failed)), '#dc2626'),
      ],
      logarithmic: true,
    },
    {
      id: 'ai-flow-credit-spend',
      title: 'AI Flow credit spend by environment',
      subtitle: 'Current calendar month',
      type: 'bar',
      labels: rows.map(reportEnvironmentLabel),
      datasets: [
        reportDataset('AI Builder', rows.map((row) => number(row.aiFlow?.aiBuilderCredits)), '#2563eb', { yAxisID: 'aiBuilder' }),
        reportDataset('Copilot Studio', rows.map((row) => number(row.aiFlow?.copilotStudioCredits)), '#9333ea', { yAxisID: 'copilotStudio' }),
      ],
      dualAxis: true,
    },
    ...(modelMix.length ? [{
      id: 'model-mix',
      title: 'AI Flow model mix',
      subtitle: 'All selected environments - event count',
      type: 'pie',
      labels: modelMix.map((row) => row.model),
      datasets: [reportDataset('Events', modelMix.map((row) => number(row.eventCount)), reportPalette(modelMix.length))],
    }] : []),
    reportMetricChart('copilot-sessions', 'Copilot sessions by environment', 'Current calendar month', rows, 'copilotSessions', '#7c3aed'),
    reportMetricChart('solution-count', 'Solution count by environment', 'Includes managed and Microsoft-owned solutions', rows, 'solutionCount', '#0f766e'),
    reportMetricChart('flow-count', 'Flow count by environment', 'Solution components', rows, 'flowCount', '#0284c7'),
    reportMetricChart('code-app-count', 'Code app count by environment', 'Solution components', rows, 'codeAppCount', '#be123c'),
    reportMetricChart('canvas-app-count', 'Canvas app count by environment', 'Solution components', rows, 'canvasAppCount', '#db2777'),
    reportMetricChart('model-driven-app-count', 'Model-driven app count by environment', 'Solution components', rows, 'modelDrivenAppCount', '#d97706'),
    reportMetricChart('ai-model-count', 'AI model count by environment', 'Solution components', rows, 'aiModelCount', '#4f46e5'),
    reportMetricChart('copilot-agent-count', 'Copilot Studio agent count by environment', 'Solution components', rows, 'copilotStudioAgentCount', '#8b5cf6'),
  ];
  el.chartsGrid.innerHTML = charts.map((chart) => `
    <section class="report-chart-card">
      <div class="report-chart-header">
        <div>
          <h3>${escapeHtml(chart.title)}</h3>
          <p class="muted">${escapeHtml(chart.subtitle || '')}</p>
        </div>
        <div class="report-chart-actions">
          <button class="secondary report-chart-toggle" type="button" data-report-chart-fullscreen="${escapeAttr(chart.id)}" title="Open chart in full screen">Full screen</button>
        </div>
      </div>
      <div class="report-chart-canvas"><canvas id="summaryChart-${escapeAttr(chart.id)}"></canvas></div>
    </section>
  `).join('');

  const ChartConstructor = globalThis.Chart;
  if (!ChartConstructor) {
    el.chartsStatus.textContent = 'Chart.js could not be loaded. Check your internet connection, then reload the page.';
    return;
  }
  state.automatedReports.charts = charts.map((chart) => new ChartConstructor(
    document.querySelector(`#summaryChart-${chart.id}`),
    reportChartConfig(chart),
  ));
}

function renderChartsPlaceholder() {
  destroyReportCharts();
  if (el.chartsGrid) {
    el.chartsGrid.innerHTML = empty('Run a background report to populate these charts.');
  }
}

function reportMetricChart(id, title, subtitle, rows, field, color) {
  return {
    id,
    title,
    subtitle,
    type: 'bar',
    labels: rows.map(reportEnvironmentLabel),
    datasets: [reportDataset(title, rows.map((row) => number(row[field])), color)],
  };
}

function reportEnvironmentLabel(row) {
  return String(row.environmentDisplayName || row.environmentId || 'Unknown environment');
}

function renderReportsDashboard(data = {}) {
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (!rows.length) {
    renderReportsPlaceholder();
    return;
  }
  destroyTrendCharts();
  const charts = buildTrendCharts(Array.isArray(data.tables) ? data.tables : [], data.range || {});
  if (!charts.length) {
    renderReportsPlaceholder();
    return;
  }
  el.reportsCharts.innerHTML = charts.map((chart) => `
    <section class="report-chart-card${chart.hidden ? ' report-chart-card-hidden' : ''}" data-report-chart-card="${escapeAttr(chart.id)}">
      <div class="report-chart-header">
        <div>
          <h3>${escapeHtml(chart.title)}</h3>
          <p class="muted">${escapeHtml(chart.subtitle || '')}</p>
        </div>
        <div class="report-chart-actions">
          ${renderReportChartEnvironmentPicker(chart)}
          ${chart.hidden ? '' : `<button class="secondary report-chart-toggle" type="button" data-report-chart-fullscreen="${escapeAttr(chart.id)}" title="Open chart in full screen">Full screen</button>`}
          <button class="secondary report-chart-toggle" type="button" data-report-chart-toggle="${escapeAttr(chart.id)}">
            ${chart.hidden ? 'Show' : 'Hide'}
          </button>
        </div>
      </div>
      ${chart.hidden ? '' : `<div class="report-chart-canvas"><canvas data-report-chart-canvas="${escapeAttr(chart.id)}"></canvas></div>`}
    </section>
  `).join('');

  const ChartConstructor = globalThis.Chart;
  const visibleCharts = charts.filter((chart) => !chart.hidden);
  if (visibleCharts.length && !ChartConstructor) {
    el.reportsStatus.textContent = 'Chart.js could not be loaded. Check your internet connection, then reload the page.';
    return;
  }
  state.automatedReports.trendCharts = visibleCharts.map((chart) => new ChartConstructor(
    findReportChartCanvas(chart.id),
    reportChartConfig(chart),
  ));
}

function renderReportsPlaceholder() {
  destroyTrendCharts();
  el.reportsCharts.innerHTML = empty('Enable trend data to be saved, then run reports to populate trends.');
}

function buildTrendCharts(tables, range = {}) {
  const tableMap = new Map((Array.isArray(tables) ? tables : []).map((table) => [table.tableName, table]));
  const charts = [
    buildAiRollingCreditChart(tableMap.get('report_ai_flow_event_totals'), range, {
      id: 'ai-builder-credits-rolling',
      title: 'AI Builder credits',
      valueKey: 'sum_ai_builder_credits_used',
      color: '#2563eb',
    }),
    buildAiRollingCreditChart(tableMap.get('report_ai_flow_event_totals'), range, {
      id: 'copilot-studio-credits-rolling',
      title: 'Copilot Studio credits',
      valueKey: 'sum_copilot_studio_credits_used',
      color: '#9333ea',
    }),
    buildStackedEnvironmentBarChart(tableMap.get('report_agent_session_totals'), range, {
      id: 'agent-sessions-by-environment',
      title: 'Agent sessions',
      valueKey: 'total_sessions',
      yTitle: 'Sessions',
      perDay: true,
    }),
    buildFlowRunStatusChart(tableMap.get('report_flow_run_totals'), range),
    ...solutionTrendDefinitions().map((definition) => buildStackedEnvironmentBarChart(
      tableMap.get('report_solution_totals'),
      range,
      definition,
    )),
  ];
  return charts.filter(Boolean);
}

function buildAiRollingCreditChart(table, range, options) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  if (!rows.length) {
    return null;
  }
  const isMonthRange = String(range?.range || '').toLowerCase() === 'month';
  const environments = chartEnvironmentOptions(rows);
  const selectedEnvironmentIds = selectedReportChartEnvironmentIds(options.id, environments);
  const filteredRows = filterTrendRowsByEnvironment(rows, selectedEnvironmentIds);
  const dateLabels = trendDateLabelsWithMonthForecast(range, rows);
  if (!dateLabels.length) {
    return null;
  }
  const daily = sumRowsByDate(filteredRows, options.valueKey);
  const actualIndexes = dateLabels
    .map((date, index) => daily.has(date) ? index : -1)
    .filter((index) => index >= 0);
  const firstActualIndex = actualIndexes[0] ?? -1;
  const lastActualIndex = actualIndexes.at(-1) ?? -1;
  const actualData = dateLabels.map(() => null);
  let latestTotal = null;
  for (let index = firstActualIndex; index >= 0 && index <= lastActualIndex; index += 1) {
    if (daily.has(dateLabels[index])) {
      latestTotal = daily.get(dateLabels[index]);
    }
    actualData[index] = latestTotal;
  }
  const forecastEndDate = isMonthRange
    ? monthEndDateKey(dateLabels[lastActualIndex]) || dateLabels[dateLabels.length - 1]
    : '';
  return withReportChartSettings({
    id: options.id,
    title: options.title,
    subtitle: isMonthRange
      ? `Rolling total with weekday-aware forecast to ${formatDateLabel(forecastEndDate)}`
      : 'Rolling total over selected range',
    type: 'line',
    labels: dateLabels.map(formatDateLabel),
    unit: 'Credits',
    xTitle: 'Date',
    yTitle: 'Credits',
    environments,
    selectedEnvironmentIds,
    datasets: [
      reportDataset('Actual rolling total', actualData, options.color, {
        tension: 0.25,
        spanGaps: true,
        pointRadius: 4,
        pointHoverRadius: 5,
        borderWidth: 3,
      }),
      ...(isMonthRange ? [reportDataset('Forecast usage', predictedUsageData(dateLabels, actualData, lastActualIndex), options.color, {
        borderDash: [6, 5],
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.2,
      })] : []),
    ],
  });
}

function predictedUsageData(dateLabels, actualData, lastActualIndex) {
  const prediction = dateLabels.map(() => null);
  if (lastActualIndex < 0) {
    return prediction;
  }
  const currentTotal = number(actualData[lastActualIndex]);
  prediction[lastActualIndex] = currentTotal;

  const lastActualDate = parseDateOnlyValue(dateLabels[lastActualIndex]);
  if (!lastActualDate) {
    return prediction;
  }
  const forecastMonth = `${lastActualDate.getFullYear()}-${String(lastActualDate.getMonth() + 1).padStart(2, '0')}`;
  const todayDate = new Date();
  if (lastActualDate.getFullYear() !== todayDate.getFullYear() || lastActualDate.getMonth() !== todayDate.getMonth()) {
    return prediction;
  }
  const today = formatDateInputValue(todayDate);
  const historyEndIndex = dateLabels[lastActualIndex] === today ? lastActualIndex - 1 : lastActualIndex;
  const weekdaySamples = Array.from({ length: 7 }, () => []);
  const allSamples = [];
  let previousTotal = null;

  for (let index = 0; index <= historyEndIndex; index += 1) {
    if (actualData[index] === null || actualData[index] === undefined) {
      continue;
    }
    const date = parseDateOnlyValue(dateLabels[index]);
    if (!date) {
      continue;
    }
    const total = number(actualData[index]);
    let usage = null;
    if (previousTotal === null) {
      if (date.getDate() === 1) {
        usage = total;
      }
    } else if (total >= previousTotal) {
      usage = total - previousTotal;
    } else if (date.getDate() === 1) {
      usage = total;
    }
    if (usage !== null) {
      weekdaySamples[date.getDay()].push(usage);
      allSamples.push(usage);
    }
    previousTotal = total;
  }

  const fallbackRate = allSamples.length
    ? average(allSamples)
    : currentTotal / Math.max(1, lastActualDate.getDate());
  let forecastTotal = currentTotal;
  for (let index = lastActualIndex + 1; index < dateLabels.length; index += 1) {
    const date = parseDateOnlyValue(dateLabels[index]);
    if (!date || !dateLabels[index].startsWith(forecastMonth)) {
      continue;
    }
    const samples = weekdaySamples[date.getDay()];
    forecastTotal += samples.length ? average(samples) : fallbackRate;
    prediction[index] = forecastTotal;
  }
  return prediction;
}

function average(values) {
  return values.reduce((total, value) => total + number(value), 0) / Math.max(1, values.length);
}

function buildStackedEnvironmentBarChart(table, range, options) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  if (!rows.length) {
    return null;
  }
  const environments = chartEnvironmentOptions(rows);
  const selectedEnvironmentIds = selectedReportChartEnvironmentIds(options.id, environments);
  const selectedEnvironments = environments.filter((environment) => selectedEnvironmentIds.has(environment.id));
  const filteredRows = filterTrendRowsByEnvironment(rows, selectedEnvironmentIds);
  const dateLabels = trendDateLabels(range, rows);
  if (!dateLabels.length) {
    return null;
  }
  const totals = sumRowsByDateAndEnvironment(filteredRows, options.valueKey);
  const values = options.perDay ? perDayEnvironmentValues(totals, dateLabels, selectedEnvironments) : totals;
  const palette = reportPalette(Math.max(selectedEnvironments.length, 1));
  return withReportChartSettings({
    id: options.id,
    title: options.title,
    subtitle: `${options.perDay ? 'Per day | ' : ''}${selectedEnvironments.length} of ${environments.length} environment${environments.length === 1 ? '' : 's'} selected`,
    type: 'bar',
    stacked: true,
    labels: dateLabels.map(formatDateLabel),
    unit: options.yTitle || 'Count',
    xTitle: 'Date',
    yTitle: options.yTitle || 'Count',
    environments,
    selectedEnvironmentIds,
    datasets: selectedEnvironments.map((environment, index) => reportDataset(
      environment.label,
      dateLabels.map((date) => values.get(`${environment.id}:${date}`) || 0),
      palette[index],
      { stack: 'environment' },
    )),
  });
}

function perDayEnvironmentValues(totals, dateLabels, environments) {
  const daily = new Map();
  for (const environment of environments) {
    let previous = null;
    for (const date of dateLabels) {
      const key = `${environment.id}:${date}`;
      if (!totals.has(key)) {
        continue;
      }
      const total = number(totals.get(key));
      daily.set(key, previous === null || total < previous ? total : total - previous);
      previous = total;
    }
  }
  return daily;
}

function buildFlowRunStatusChart(table, range) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  if (!rows.length) {
    return null;
  }
  const id = 'flow-runs-success-failed';
  const environments = chartEnvironmentOptions(rows);
  const selectedEnvironmentIds = selectedReportChartEnvironmentIds(id, environments);
  const filteredRows = filterTrendRowsByEnvironment(rows, selectedEnvironmentIds);
  const dateLabels = trendDateLabels(range, rows);
  if (!dateLabels.length) {
    return null;
  }
  const successful = sumRowsByDate(filteredRows, 'successful_flow_runs');
  const failed = sumRowsByDate(filteredRows, 'failed_flow_runs');
  return withReportChartSettings({
    id,
    title: 'Flow run totals',
    subtitle: `${selectedEnvironmentIds.size} of ${environments.length} environment${environments.length === 1 ? '' : 's'} selected`,
    type: 'bar',
    stacked: true,
    labels: dateLabels.map(formatDateLabel),
    unit: 'Runs',
    xTitle: 'Date',
    yTitle: 'Runs',
    environments,
    selectedEnvironmentIds,
    datasets: [
      reportDataset('Successful', dateLabels.map((date) => successful.get(date) || 0), '#16a34a', { stack: 'status' }),
      reportDataset('Failed', dateLabels.map((date) => failed.get(date) || 0), '#dc2626', { stack: 'status' }),
    ],
  });
}

function solutionTrendDefinitions() {
  return [
    { id: 'solutions-count-by-environment', title: 'Solution count', valueKey: 'included_solutions', yTitle: 'Solutions' },
    { id: 'solutions-flow-count-by-environment', title: 'Flow count', valueKey: 'number_of_flows', yTitle: 'Flows' },
    { id: 'solutions-canvas-app-count-by-environment', title: 'Canvas app count', valueKey: 'number_of_canvas_apps', yTitle: 'Canvas apps' },
    { id: 'solutions-model-driven-app-count-by-environment', title: 'Model driven app count', valueKey: 'number_of_model_driven_apps', yTitle: 'Model driven apps' },
    { id: 'solutions-code-app-count-by-environment', title: 'Code app count', valueKey: 'number_of_code_apps', yTitle: 'Code Apps' },
    { id: 'solutions-agent-count-by-environment', title: 'Agent count', valueKey: 'number_of_copilot_studio_agents', yTitle: 'Agents' },
    { id: 'solutions-ai-model-count-by-environment', title: 'AI model count', valueKey: 'number_of_ai_models', yTitle: 'AI models' },
    { id: 'solutions-dataflow-count-by-environment', title: 'Dataflow count', valueKey: 'number_of_dataflows', yTitle: 'Dataflows' },
    { id: 'solutions-dataverse-table-count-by-environment', title: 'Custom Dataverse table count', valueKey: 'number_of_dataverse_tables', yTitle: 'Custom Dataverse tables' },
  ];
}

function withReportChartSettings(chart) {
  const settings = readReportChartSettings();
  return {
    ...chart,
    hidden: Boolean(settings.hidden?.[chart.id]),
  };
}

function readReportChartSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(REPORT_CHART_SETTINGS_KEY) || '{}');
    return {
      hidden: settings.hidden && typeof settings.hidden === 'object' ? settings.hidden : {},
      environments: settings.environments && typeof settings.environments === 'object' ? settings.environments : {},
    };
  } catch {
    return { hidden: {}, environments: {} };
  }
}

function writeReportChartSettings(settings) {
  localStorage.setItem(REPORT_CHART_SETTINGS_KEY, JSON.stringify({
    hidden: settings.hidden || {},
    environments: settings.environments || {},
  }));
}

function selectedReportChartEnvironmentIds(chartId, environments) {
  const ids = environments.map((environment) => environment.id);
  const saved = readReportChartSettings().environments?.[chartId];
  if (!Array.isArray(saved)) {
    return new Set(ids);
  }
  const validIds = new Set(ids);
  return new Set(saved.filter((id) => validIds.has(id)));
}

function setReportChartEnvironmentIds(chartId, environmentIds) {
  const settings = readReportChartSettings();
  settings.environments[chartId] = environmentIds;
  writeReportChartSettings(settings);
}

function toggleReportChartVisibility(chartId) {
  const settings = readReportChartSettings();
  settings.hidden[chartId] = !settings.hidden?.[chartId];
  writeReportChartSettings(settings);
  rerenderReportsDashboard();
}

function renderReportChartEnvironmentPicker(chart) {
  const selected = chart.selectedEnvironmentIds || new Set();
  const total = chart.environments?.length || 0;
  return `
    <details class="report-environment-picker">
      <summary>${selected.size}/${total} environments</summary>
      <div class="report-environment-menu">
        <div class="report-environment-actions">
          <button class="secondary" type="button" data-report-chart-env-action="all" data-report-chart-id="${escapeAttr(chart.id)}">All</button>
          <button class="secondary" type="button" data-report-chart-env-action="none" data-report-chart-id="${escapeAttr(chart.id)}">None</button>
        </div>
        <div class="report-environment-options">
          ${(chart.environments || []).map((environment) => `
            <label class="checkbox-label">
              <input type="checkbox" data-report-chart-environment="${escapeAttr(chart.id)}" value="${escapeAttr(environment.id)}"${selected.has(environment.id) ? ' checked' : ''} />
              ${escapeHtml(environment.label)}
            </label>
          `).join('')}
        </div>
      </div>
    </details>
  `;
}

function handleReportChartClick(event) {
  const fullscreenButton = event.target.closest('[data-report-chart-fullscreen]');
  if (fullscreenButton) {
    toggleReportChartFullscreen(fullscreenButton);
    return;
  }
  const toggleButton = event.target.closest('[data-report-chart-toggle]');
  if (toggleButton) {
    toggleReportChartVisibility(toggleButton.dataset.reportChartToggle || '');
    return;
  }
  const environmentAction = event.target.closest('[data-report-chart-env-action]');
  if (!environmentAction) {
    return;
  }
  const chartId = environmentAction.dataset.reportChartId || '';
  const card = environmentAction.closest('[data-report-chart-card]');
  const checkboxes = findReportChartEnvironmentInputs(card, chartId);
  const nextIds = environmentAction.dataset.reportChartEnvAction === 'all'
    ? checkboxes.map((checkbox) => checkbox.value)
    : [];
  setReportChartEnvironmentIds(chartId, nextIds);
  rerenderReportsDashboard();
}

function handleReportChartChange(event) {
  const checkbox = event.target.closest('[data-report-chart-environment]');
  if (!checkbox) {
    return;
  }
  const chartId = checkbox.dataset.reportChartEnvironment || '';
  const card = checkbox.closest('[data-report-chart-card]');
  const selectedIds = findReportChartEnvironmentInputs(card, chartId)
    .filter((input) => input.checked)
    .map((input) => input.value);
  setReportChartEnvironmentIds(chartId, selectedIds);
  rerenderReportsDashboard();
}

function toggleReportChartFullscreen(button) {
  const card = button.closest('.report-chart-card');
  if (!card) {
    return;
  }
  if (document.fullscreenElement === card) {
    document.exitFullscreen?.().catch(() => {});
    return;
  }
  card.requestFullscreen?.()?.catch(() => toast('Full screen is not available in this browser.', 'error'));
}

function findReportChartCanvas(chartId) {
  return [...el.reportsCharts.querySelectorAll('[data-report-chart-canvas]')]
    .find((canvas) => canvas.dataset.reportChartCanvas === chartId) || null;
}

function findReportChartEnvironmentInputs(card, chartId) {
  return [...(card?.querySelectorAll('[data-report-chart-environment]') || [])]
    .filter((input) => input.dataset.reportChartEnvironment === chartId);
}

function rerenderReportsDashboard() {
  const data = state.automatedReports.dashboardData;
  if (data && Array.isArray(data.rows) && data.rows.length) {
    renderReportsDashboard(data);
  } else {
    renderReportsPlaceholder();
  }
}

function chartEnvironmentOptions(rows) {
  return [...new Map(rows.map((row) => {
    const id = String(row.values?.environment_id || '').trim() ||
      String(row.values?.environment_display_name || '').trim() ||
      'unknown';
    const label = String(row.values?.environment_display_name || '').trim() || id;
    return [id, { id, label }];
  })).values()].sort((left, right) => left.label.localeCompare(right.label));
}

function filterTrendRowsByEnvironment(rows, selectedEnvironmentIds) {
  return rows.filter((row) => selectedEnvironmentIds.has(String(row.values?.environment_id || '').trim() || String(row.values?.environment_display_name || '').trim() || 'unknown'));
}

function sumRowsByDate(rows, valueKey) {
  const totals = new Map();
  for (const row of rows) {
    const date = trendRowDate(row);
    if (!date) {
      continue;
    }
    totals.set(date, (totals.get(date) || 0) + number(row.values?.[valueKey]));
  }
  return totals;
}

function sumRowsByDateAndEnvironment(rows, valueKey) {
  const totals = new Map();
  for (const row of rows) {
    const date = trendRowDate(row);
    const environmentId = String(row.values?.environment_id || '').trim() || String(row.values?.environment_display_name || '').trim() || 'unknown';
    if (!date) {
      continue;
    }
    const key = `${environmentId}:${date}`;
    totals.set(key, (totals.get(key) || 0) + number(row.values?.[valueKey]));
  }
  return totals;
}

function trendRowDate(row) {
  return String(row.dateRan || row.collectedAt || '').slice(0, 10);
}

function trendDateLabels(range, rows) {
  const start = parseDateOnlyValue(range?.startDate);
  const end = parseDateOnlyValue(range?.endDate);
  if (start && end && start <= end) {
    const dates = [];
    for (let cursor = start; cursor <= end; cursor = addTrendDays(cursor, 1)) {
      dates.push(formatDateInputValue(cursor));
    }
    return dates;
  }
  return [...new Set(rows.map(trendRowDate).filter(Boolean))].sort();
}

function trendDateLabelsWithMonthForecast(range, rows) {
  const dates = trendDateLabels(range, rows);
  if (String(range?.range || '').toLowerCase() !== 'month') {
    return dates;
  }
  const lastActualDateKey = [...new Set(rows.map(trendRowDate).filter(Boolean))].sort().at(-1) || '';
  const lastActualDate = parseDateOnlyValue(lastActualDateKey);
  const today = new Date();
  if (!lastActualDate || lastActualDate.getFullYear() !== today.getFullYear() || lastActualDate.getMonth() !== today.getMonth()) {
    return dates;
  }
  const monthEnd = new Date(lastActualDate.getFullYear(), lastActualDate.getMonth() + 1, 0);
  let cursor = parseDateOnlyValue(dates.at(-1));
  if (!cursor || cursor >= monthEnd) {
    return dates;
  }
  while (cursor < monthEnd) {
    cursor = addTrendDays(cursor, 1);
    dates.push(formatDateInputValue(cursor));
  }
  return dates;
}

function monthEndDateKey(value) {
  const date = parseDateOnlyValue(value);
  return date
    ? formatDateInputValue(new Date(date.getFullYear(), date.getMonth() + 1, 0))
    : '';
}

function parseDateOnlyValue(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  const [year, month, day] = text.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addTrendDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateLabel(value) {
  const date = parseDateOnlyValue(value);
  if (!date) {
    return String(value || '');
  }
  return date.toLocaleDateString([], {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function formatTrendTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || '');
  }
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function reportDataset(label, data, backgroundColor, options = {}) {
  return {
    label,
    data,
    backgroundColor,
    borderColor: backgroundColor,
    borderWidth: 1,
    borderRadius: 4,
    fill: false,
    ...options,
  };
}

function reportChartConfig(chart) {
  const isCircular = chart.type === 'doughnut' || chart.type === 'pie';
  return {
    type: chart.type,
    data: { labels: chart.labels.length ? chart.labels : ['No data'], datasets: chart.datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: chart.datasets.length > 1 || isCircular, position: 'bottom' },
        tooltip: {
          enabled: true,
          intersect: true,
          mode: 'nearest',
        },
      },
      scales: isCircular ? undefined : chart.dualAxis ? {
        x: { stacked: false },
        aiBuilder: {
          type: 'linear',
          display: true,
          position: 'left',
          beginAtZero: true,
          title: { display: true, text: 'AI Builder credits' },
        },
        copilotStudio: {
          type: 'linear',
          display: true,
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'Copilot Studio credits' },
        },
      } : {
        x: {
          stacked: Boolean(chart.stacked),
          title: { display: Boolean(chart.xTitle), text: chart.xTitle || '' },
        },
        y: {
          type: chart.logarithmic ? 'logarithmic' : 'linear',
          beginAtZero: true,
          min: chart.logarithmic ? 1 : undefined,
          stacked: chart.logarithmic ? false : Boolean(chart.stacked),
          title: { display: Boolean(chart.yTitle || chart.unit), text: chart.yTitle || chart.unit || 'Units' },
        },
      },
      interaction: {
        intersect: true,
        mode: 'nearest',
      },
    },
  };
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function reportPalette(count) {
  const colors = ['#2563eb', '#16a34a', '#9333ea', '#d97706', '#db2777', '#0f766e', '#dc2626', '#4f46e5', '#0891b2', '#65a30d'];
  return Array.from({ length: count }, (_, index) => colors[index % colors.length]);
}

function syncTrendRangeVisibility() {
  const isCustom = el.trendRange?.value === 'custom';
  if (el.trendStart) {
    el.trendStart.disabled = !isCustom;
  }
  if (el.trendEnd) {
    el.trendEnd.disabled = !isCustom;
  }
}

function syncAgentSessionCustomRangeVisibility() {
  const isCustom = el.agentSessionsRange.value === 'custom';
  el.agentSessionsStart.disabled = !isCustom;
  el.agentSessionsEnd.disabled = !isCustom;
}

function handleAgentSessionRangeChange() {
  syncAgentSessionCustomRangeVisibility();
}

function handleAgentSessionCustomRangeChange() {
  return;
}

function syncAiEventCustomRangeVisibility() {
  const isCustom = el.aiEventsRange.value === 'custom';
  el.aiEventsStart.disabled = !isCustom;
  el.aiEventsEnd.disabled = !isCustom;
}

function handleAiEventRangeChange() {
  syncAiEventCustomRangeVisibility();
}

function handleAiEventCustomRangeChange() {
  return;
}

async function loadAiEvents(options = {}) {
  if (!state.selectedEnvironment.orgUrl) {
    throw new Error('Select an environment first.');
  }
  el.aiEventsTable.innerHTML = empty('Loading AI Flow events...');
  const params = new URLSearchParams();
  params.set('range', el.aiEventsRange.value || 'month');
  if (params.get('range') === 'custom') {
    params.set('start', el.aiEventsStart.value || '');
    params.set('end', el.aiEventsEnd.value || '');
  }
  const data = await api(`/api/ai-events?${params.toString()}`);
  state.aiEvents = data.rows || [];
  state.aiEventsLoaded = true;
  state.aiEventFieldMappings = data.fieldMappings || {};
  state.aiEventUnresolvedFields = data.unresolvedFields || [];
  state.aiEventDetailCache = new Map();
  applyAiEventDateRange(data.dateRange || {});
  renderAiEventCreditTypes();
  renderAiEvents();
  if (options.toastMessage === undefined) {
    toast('AI Flow events loaded.');
  } else if (options.toastMessage) {
    toast(options.toastMessage);
  }
}

function applyAiEventDateRange(dateRange) {
  if (!dateRange || !dateRange.startDate || !dateRange.endDate) {
    return;
  }
  state.aiEventDateRange = {
    range: dateRange.range || 'month',
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  };
  el.aiEventsRange.value = state.aiEventDateRange.range;
  el.aiEventsStart.value = state.aiEventDateRange.startDate;
  el.aiEventsEnd.value = state.aiEventDateRange.endDate;
  syncAiEventCustomRangeVisibility();
}

function renderAiEventCreditTypes() {
  const selected = el.aiEventsCreditType.value;
  const values = [...new Set(state.aiEvents.map((row) => String(row.creditType || '').trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  el.aiEventsCreditType.innerHTML = ['<option value="">All credits</option>', ...values.map((value) => `
    <option value="${escapeAttr(value)}">${escapeHtml(value)}</option>
  `)].join('');
  el.aiEventsCreditType.value = values.includes(selected) ? selected : '';
}

function renderAiEvents() {
  if (!state.aiEventsLoaded) {
    el.aiEventsSummary.textContent = 'Load AI Flow events for the current calendar month.';
    el.aiEventsWarnings.hidden = true;
    if (el.aiEventsTotalsToggle) {
      el.aiEventsTotalsToggle.hidden = true;
    }
    el.aiEventsTotals.innerHTML = '';
    el.aiEventsTable.innerHTML = empty('Load AI Flow events.');
    el.downloadAiEventsButton.disabled = true;
    return;
  }

  const filtered = getFilteredAiEvents();
  const sorted = getSortedAiEvents(filtered);
  const rangeText = state.aiEventDateRange.startDate && state.aiEventDateRange.endDate
    ? `${state.aiEventDateRange.startDate} to ${state.aiEventDateRange.endDate}`
    : '';
  const aiBuilderCredits = sumAiEventCredits(filtered, 'ai builder');
  const copilotStudioCredits = sumAiEventCredits(filtered, 'copilot studio');
  el.aiEventsSummary.textContent = [
    `${sorted.length} / ${state.aiEvents.length} AI Flow events`,
    `AI Builder credits: ${formatCredits(aiBuilderCredits)}`,
    `Copilot Studio credits: ${formatCredits(copilotStudioCredits)}`,
    rangeText,
  ].filter(Boolean).join(' | ');
  if (state.aiEventUnresolvedFields.length) {
    el.aiEventsWarnings.hidden = false;
    el.aiEventsWarnings.textContent = `Some AI Flow fields were not exposed by metadata in this environment: ${state.aiEventUnresolvedFields.join(', ')}`;
  } else {
    el.aiEventsWarnings.hidden = true;
  }
  renderAiEventTotalsToggle();
  renderAiEventTotals(filtered);
  el.downloadAiEventsButton.disabled = !sorted.length;

  if (!sorted.length) {
    el.aiEventsTable.innerHTML = empty(state.aiEvents.length ? 'No AI Flow events match the current filters.' : 'No AI Flow events found for this range.');
    return;
  }

  el.aiEventsTable.innerHTML = `
    <table class="metadata-table ai-events-table">
      <thead>
        <tr>
          ${renderAiEventSortHeader('owner', 'Owner')}
          ${renderAiEventSortHeader('creditType', 'Copilot Or AI Builder Credits')}
          ${renderAiEventSortHeader('creditsConsumed', 'Credits Consumed')}
          ${renderAiEventSortHeader('dataType', 'Data Type')}
          ${renderAiEventSortHeader('source', 'Source')}
          ${renderAiEventSortHeader('toolName', 'Tool name')}
          ${renderAiEventSortHeader('model', 'Model')}
          ${renderAiEventSortHeader('created', 'Created')}
        </tr>
      </thead>
      <tbody>
        ${sorted.map((row) => `
          <tr class="ai-event-row" data-ai-event-id="${escapeAttr(row.id)}">
            <td>${escapeHtml(row.ownerName || '')}</td>
            <td>${escapeHtml(row.creditType || '')}</td>
            <td>${escapeHtml(formatCredits(row.creditsConsumed))}</td>
            <td>${escapeHtml(row.dataType || '')}</td>
            <td>${escapeHtml(row.source || '')}</td>
            <td>${escapeHtml(row.toolName || '')}</td>
            <td>${escapeHtml(row.model || '')}</td>
            <td>${escapeHtml(row.createdOn || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function sumAiEventCredits(rows, creditType) {
  return rows
    .filter((row) => String(row.creditType || '').trim().toLowerCase() === creditType)
    .reduce((total, row) => total + Number(row.creditsConsumed || 0), 0);
}

function getVisibleAiEventRows() {
  return getSortedAiEvents(getFilteredAiEvents());
}

function setAiEventTotalsGroupBy(groupBy) {
  const nextGroupBy = groupBy === 'model' ? 'model' : 'flow';
  if (state.aiEventTotalsGroupBy === nextGroupBy) {
    return;
  }
  state.aiEventTotalsGroupBy = nextGroupBy;
  renderAiEvents();
}

function renderAiEventTotalsToggle() {
  if (!el.aiEventsTotalsToggle) {
    return;
  }
  el.aiEventsTotalsToggle.hidden = !state.aiEventsLoaded || !state.aiEvents.length;
  if (el.aiEventsTotalsToggle.hidden) {
    return;
  }
  const options = [
    ['flow', 'By flow'],
    ['model', 'By model'],
  ];
  el.aiEventsTotalsToggle.innerHTML = options.map(([groupBy, label]) => `
    <button
      class="totals-toggle-button"
      type="button"
      data-ai-event-total-group="${escapeAttr(groupBy)}"
      aria-pressed="${state.aiEventTotalsGroupBy === groupBy ? 'true' : 'false'}"
    >
      ${escapeHtml(label)}
    </button>
  `).join('');
}

async function downloadAiEventsExcel() {
  const rows = getVisibleAiEventRows();
  if (!rows.length) {
    throw new Error('No AI Flow rows to export.');
  }
  const response = await apiFetch('/api/ai-events/export', {
    method: 'POST',
    body: {
      rows,
      dateRange: state.aiEventDateRange,
    },
  });
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  downloadBlob(match?.[1] || `ai-flow-${safeDownloadFilename(state.aiEventDateRange.startDate || 'export')}.xlsx`, blob);
  toast('AI Flow Excel file downloaded.');
}

function getFilteredAiEvents() {
  const creditType = el.aiEventsCreditType.value.trim().toLowerCase();
  const createdBy = el.aiEventsCreatedBy.value.trim().toLowerCase();
  const toolName = el.aiEventsToolName.value.trim().toLowerCase();
  const model = el.aiEventsModel.value.trim().toLowerCase();
  const source = el.aiEventsSource.value.trim().toLowerCase();
  return state.aiEvents.filter((row) => {
    const rowCreditType = String(row.creditType || '').trim().toLowerCase();
    const rowCreatedBy = String(row.createdByName || '').trim().toLowerCase();
    const rowToolName = String(row.toolName || '').trim().toLowerCase();
    const rowModel = String(row.model || '').trim().toLowerCase();
    const rowSource = String(row.source || '').trim().toLowerCase();
    return (!creditType || rowCreditType === creditType) &&
      (!createdBy || rowCreatedBy.includes(createdBy)) &&
      (!toolName || rowToolName.includes(toolName)) &&
      (!model || rowModel.includes(model)) &&
      (!source || rowSource.includes(source));
  });
}

function renderAiEventSortHeader(column, label) {
  const isActive = state.aiEventSort.column === column;
  const direction = isActive ? state.aiEventSort.direction : 'none';
  const indicator = direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '↕';
  const ariaSort = direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none';
  return `
    <th scope="col" aria-sort="${ariaSort}">
      <button class="table-sort-button" type="button" data-ai-event-sort="${escapeAttr(column)}" aria-label="Sort by ${escapeAttr(label)}">
        <span>${escapeHtml(label)}</span>
        <span class="table-sort-indicator" aria-hidden="true">${indicator}</span>
      </button>
    </th>
  `;
}

function toggleAiEventSort(column) {
  if (!column) {
    return;
  }
  if (state.aiEventSort.column === column) {
    state.aiEventSort.direction = state.aiEventSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.aiEventSort = {
      column,
      direction: column === 'created' ? 'desc' : 'asc',
    };
  }
  renderAiEvents();
}

function getSortedAiEvents(rows) {
  const { column, direction } = state.aiEventSort;
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => compareAiEventValues(left, right, column) * multiplier);
}

function compareAiEventValues(left, right, column) {
  if (column === 'creditsConsumed') {
    return Number(left.creditsConsumed || 0) - Number(right.creditsConsumed || 0);
  }
  if (column === 'created') {
    return String(left.createdOnRaw || '').localeCompare(String(right.createdOnRaw || ''));
  }
  const leftValue = getAiEventSortValue(left, column);
  const rightValue = getAiEventSortValue(right, column);
  return leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
}

function getAiEventSortValue(row, column) {
  if (column === 'owner') {
    return String(row.ownerName || '');
  }
  return String(row[column] || '');
}

function renderAiEventTotalsSortHeader(column, label) {
  const isActive = state.aiEventTotalsSort.column === column;
  const direction = isActive ? state.aiEventTotalsSort.direction : 'none';
  const indicator = direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '↕';
  const ariaSort = direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none';
  return `
    <th scope="col" aria-sort="${ariaSort}">
      <button class="table-sort-button" type="button" data-ai-event-total-sort="${escapeAttr(column)}" aria-label="Sort AI Flow totals by ${escapeAttr(label)}">
        <span>${escapeHtml(label)}</span>
        <span class="table-sort-indicator" aria-hidden="true">${indicator}</span>
      </button>
    </th>
  `;
}

function toggleAiEventTotalsSort(column) {
  if (!column) {
    return;
  }
  if (state.aiEventTotalsSort.column === column) {
    state.aiEventTotalsSort.direction = state.aiEventTotalsSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.aiEventTotalsSort = {
      column,
      direction: ['eventCount', 'aiBuilderCreditsUsed', 'copilotStudioCreditsUsed'].includes(column) ? 'desc' : 'asc',
    };
  }
  renderAiEvents();
}

function renderAiEventTotals(rows) {
  if (!rows.length) {
    el.aiEventsTotals.innerHTML = empty('No AI Flow totals match the current filters.');
    return;
  }
  const groupBy = state.aiEventTotalsGroupBy === 'model' ? 'model' : 'flow';
  const totals = new Map();
  for (const row of rows) {
    const groupLabel = groupBy === 'model'
      ? String(row.model || '').trim() || 'Unknown model'
      : String(row.toolName || row.source || '').trim() || 'Unknown flow';
    const creditType = String(row.creditType || '').trim().toLowerCase();
    const creditsConsumed = Number(row.creditsConsumed || 0);
    const current = totals.get(groupLabel) || {
      groupLabel,
      eventCount: 0,
      aiBuilderCreditsUsed: 0,
      copilotStudioCreditsUsed: 0,
    };
    current.eventCount += 1;
    if (creditType === 'ai builder') {
      current.aiBuilderCreditsUsed += creditsConsumed;
    }
    if (creditType === 'copilot studio') {
      current.copilotStudioCreditsUsed += creditsConsumed;
    }
    totals.set(groupLabel, current);
  }
  const rowsToRender = getSortedAiEventTotalsRows([...totals.values()]);
  const label = groupBy === 'model' ? 'Model' : 'Flow';
  el.aiEventsTotals.innerHTML = `
    <table class="metadata-table ai-flow-totals-table">
      <thead>
        <tr>
          ${renderAiEventTotalsSortHeader('groupLabel', label)}
          ${renderAiEventTotalsSortHeader('aiBuilderCreditsUsed', 'Sum AI Builder Credits used')}
          ${renderAiEventTotalsSortHeader('copilotStudioCreditsUsed', 'Sum Copilot Studio credits used')}
          ${renderAiEventTotalsSortHeader('eventCount', 'Count of Events')}
        </tr>
      </thead>
      <tbody>
        ${rowsToRender.map((row) => `
          <tr>
            <td>${escapeHtml(row.groupLabel)}</td>
            <td>${escapeHtml(formatCredits(row.aiBuilderCreditsUsed))}</td>
            <td>${escapeHtml(formatCredits(row.copilotStudioCreditsUsed))}</td>
            <td>${escapeHtml(String(row.eventCount))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function getSortedAiEventTotalsRows(rows) {
  const { column, direction } = state.aiEventTotalsSort;
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => compareAiEventTotalsValues(left, right, column) * multiplier);
}

function compareAiEventTotalsValues(left, right, column) {
  if (column === 'eventCount' || column === 'aiBuilderCreditsUsed' || column === 'copilotStudioCreditsUsed') {
    return Number(left[column] || 0) - Number(right[column] || 0);
  }
  return String(left.groupLabel || '').localeCompare(String(right.groupLabel || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function formatCredits(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(number);
}

function syncFlowRunCustomRangeVisibility() {
  const isCustom = el.flowRunsRange.value === 'custom';
  el.flowRunsStart.disabled = !isCustom;
  el.flowRunsEnd.disabled = !isCustom;
}

function handleFlowRunRangeChange() {
  syncFlowRunCustomRangeVisibility();
}

function handleFlowRunCustomRangeChange() {
  return;
}

async function loadFlowRuns(options = {}) {
  if (!state.selectedEnvironment.orgUrl) {
    throw new Error('Select an environment first.');
  }
  el.flowRunsTable.innerHTML = empty('Loading flow runs...');
  const params = new URLSearchParams();
  params.set('range', el.flowRunsRange.value || '7d');
  if (params.get('range') === 'custom') {
    params.set('start', el.flowRunsStart.value || '');
    params.set('end', el.flowRunsEnd.value || '');
  }
  const data = await api(`/api/flow-runs?${params.toString()}`);
  state.flowRuns = data.rows || [];
  state.flowRunsLoaded = true;
  applyFlowRunDateRange(data.dateRange || {});
  renderFlowRunStatusOptions();
  renderFlowRunTriggerOptions();
  renderFlowRuns();
  if (options.toastMessage === undefined) {
    toast('Flow runs loaded.');
  } else if (options.toastMessage) {
    toast(options.toastMessage);
  }
}

function applyFlowRunDateRange(dateRange) {
  if (!dateRange || !dateRange.startDate || !dateRange.endDate) {
    return;
  }
  state.flowRunDateRange = {
    range: dateRange.range || '7d',
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  };
  el.flowRunsRange.value = state.flowRunDateRange.range;
  el.flowRunsStart.value = state.flowRunDateRange.startDate;
  el.flowRunsEnd.value = state.flowRunDateRange.endDate;
  syncFlowRunCustomRangeVisibility();
}

function renderFlowRunStatusOptions() {
  renderFlowRunSelectOptions(el.flowRunsStatus, 'All statuses', state.flowRuns.map((row) => row.status));
}

function renderFlowRunTriggerOptions() {
  renderFlowRunSelectOptions(el.flowRunsTrigger, 'All triggers', state.flowRuns.map((row) => row.triggerType));
}

function renderFlowRunSelectOptions(select, placeholder, values) {
  const selected = select.value;
  const distinct = [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  select.innerHTML = [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...distinct.map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`),
  ].join('');
  select.value = distinct.includes(selected) ? selected : '';
}

function renderFlowRuns() {
  if (!state.flowRunsLoaded) {
    el.flowRunsSummary.textContent = 'Load flow runs for the last 7 days.';
    el.flowRunsTotals.innerHTML = '';
    el.flowRunsTable.innerHTML = empty('Load flow runs.');
    el.downloadFlowRunsButton.disabled = true;
    return;
  }

  const filtered = getFilteredFlowRuns();
  const sorted = getVisibleFlowRunRows();
  const rangeText = state.flowRunDateRange.startDate && state.flowRunDateRange.endDate
    ? `${state.flowRunDateRange.startDate} to ${state.flowRunDateRange.endDate}`
    : '';
  const errorCount = state.flowRuns.filter(hasFlowRunError).length;
  el.flowRunsSummary.textContent = `${sorted.length} / ${state.flowRuns.length} flow runs${rangeText ? ` | ${rangeText}` : ''} | ${errorCount} with errors`;
  renderFlowRunTotals(filtered);
  el.downloadFlowRunsButton.disabled = !sorted.length;

  if (!sorted.length) {
    el.flowRunsTable.innerHTML = empty(state.flowRuns.length ? 'No flow runs match the current filters.' : 'No flow runs found for this range.');
    return;
  }

  el.flowRunsTable.innerHTML = `
    <table class="metadata-table flow-runs-table">
      <thead>
        <tr>
          ${renderFlowRunSortHeader('flowName', 'Flow Name')}
          ${renderFlowRunSortHeader('triggerType', 'Trigger')}
          ${renderFlowRunSortHeader('status', 'Status')}
          ${renderFlowRunSortHeader('errorCode', 'Error Code')}
          ${renderFlowRunSortHeader('startTime', 'Start Time')}
          ${renderFlowRunSortHeader('endTime', 'End Time')}
          <th scope="col" class="open-run-header">Open</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map((row) => {
          const title = flowRunHoverText(row);
          return `
            <tr title="${escapeAttr(title)}">
              <td>${escapeHtml(row.flowName || '')}</td>
              <td>${escapeHtml(row.triggerType || '')}</td>
              <td>${renderFlowRunStatus(row.status)}</td>
              <td>${escapeHtml(row.errorCode || '')}</td>
              <td>${escapeHtml(row.startTimeDisplay || '')}</td>
              <td>${escapeHtml(row.endTimeDisplay || '')}</td>
              <td class="open-run-cell">
                ${row.openUrl ? `
                  <a class="icon-button secondary open-run-button" href="${escapeAttr(row.openUrl)}" target="_blank" rel="noopener noreferrer" title="Open flow run" aria-label="Open flow run">
                    <svg class="open-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M15 3h6v6"></path>
                      <path d="M10 14 21 3"></path>
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    </svg>
                  </a>
                ` : ''}
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function getVisibleFlowRunRows() {
  return getSortedFlowRuns(getFilteredFlowRuns());
}

async function downloadFlowRunsExcel() {
  const rows = getVisibleFlowRunRows();
  if (!rows.length) {
    throw new Error('No flow run rows to export.');
  }
  const response = await apiFetch('/api/flow-runs/export', {
    method: 'POST',
    body: {
      rows,
      dateRange: state.flowRunDateRange,
    },
  });
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  downloadBlob(match?.[1] || `flow-runs-${safeDownloadFilename(state.flowRunDateRange.startDate || 'export')}.xlsx`, blob);
  toast('Flow runs Excel file downloaded.');
}

function getFilteredFlowRuns() {
  const status = el.flowRunsStatus.value.trim().toLowerCase();
  const trigger = el.flowRunsTrigger.value.trim().toLowerCase();
  const query = el.flowRunsSearch.value.trim().toLowerCase();
  const minDurationSeconds = Number(el.flowRunsMinDuration.value || 0);
  const errorsOnly = el.flowRunsErrorsOnly.checked;

  return state.flowRuns.filter((row) => {
    const rowStatus = String(row.status || '').trim().toLowerCase();
    const rowTrigger = String(row.triggerType || '').trim().toLowerCase();
    const durationSeconds = Number(row.durationMs || 0) / 1000;
    return (!status || rowStatus === status) &&
      (!trigger || rowTrigger === trigger) &&
      (!errorsOnly || hasFlowRunError(row)) &&
      (!Number.isFinite(minDurationSeconds) || minDurationSeconds <= 0 || durationSeconds >= minDurationSeconds) &&
      (!query || flowRunSearchText(row).includes(query));
  });
}

function hasFlowRunError(row) {
  const statusClass = flowRunStatusClass(String(row.status || '').trim().toLowerCase());
  return statusClass === 'broken' || Boolean(String(row.errorCode || '').trim() || String(row.errorMessage || '').trim());
}

function flowRunSearchText(row) {
  return [
    row.flowName,
    row.triggerType,
    row.status,
    row.errorCode,
    row.errorMessage,
    row.workflowId,
    row.resourceId,
    row.name,
    row.clientTrackingId,
  ].filter(Boolean).join(' ').toLowerCase();
}

function flowRunHoverText(row) {
  const lines = [
    `Workflow ID: ${row.workflowId || 'Unknown'}`,
    `Error message: ${row.errorMessage || 'None'}`,
  ];
  if (row.durationMs !== undefined && row.durationMs !== null) {
    lines.push(`Duration: ${formatDuration(row.durationMs)}`);
  }
  return lines.join('\n');
}

function renderFlowRunStatus(status) {
  const normalized = String(status || 'unknown').trim().toLowerCase() || 'unknown';
  return `<span class="status-pill ${escapeAttr(flowRunStatusClass(normalized))}">${escapeHtml(status || 'Unknown')}</span>`;
}

function flowRunStatusClass(status) {
  if (['succeeded', 'success', 'completed'].includes(status)) {
    return 'succeeded';
  }
  if (['failed', 'failure', 'cancelled', 'canceled', 'timedout', 'timeout'].includes(status)) {
    return 'broken';
  }
  if (['running', 'waiting', 'inprogress', 'in progress'].includes(status)) {
    return 'running';
  }
  return 'unknown';
}

function renderFlowRunSortHeader(column, label) {
  const isActive = state.flowRunSort.column === column;
  const direction = isActive ? state.flowRunSort.direction : 'none';
  const indicator = direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '↕';
  const ariaSort = direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none';
  return `
    <th scope="col" aria-sort="${ariaSort}">
      <button class="table-sort-button" type="button" data-flow-run-sort="${escapeAttr(column)}" aria-label="Sort by ${escapeAttr(label)}">
        <span>${escapeHtml(label)}</span>
        <span class="table-sort-indicator" aria-hidden="true">${indicator}</span>
      </button>
    </th>
  `;
}

function toggleFlowRunSort(column) {
  if (!column) {
    return;
  }
  if (state.flowRunSort.column === column) {
    state.flowRunSort.direction = state.flowRunSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.flowRunSort = {
      column,
      direction: ['startTime', 'endTime'].includes(column) ? 'desc' : 'asc',
    };
  }
  renderFlowRuns();
}

function getSortedFlowRuns(rows) {
  const { column, direction } = state.flowRunSort;
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => compareFlowRunValues(left, right, column) * multiplier);
}

function compareFlowRunValues(left, right, column) {
  if (column === 'startTime') {
    return String(left.startTimeRaw || '').localeCompare(String(right.startTimeRaw || ''));
  }
  if (column === 'endTime') {
    return String(left.endTimeRaw || '').localeCompare(String(right.endTimeRaw || ''));
  }
  return String(left[column] || '').localeCompare(String(right[column] || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function renderFlowRunTotalsSortHeader(column, label) {
  const isActive = state.flowRunTotalsSort.column === column;
  const direction = isActive ? state.flowRunTotalsSort.direction : 'none';
  const indicator = direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '↕';
  const ariaSort = direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none';
  return `
    <th scope="col" aria-sort="${ariaSort}">
      <button class="table-sort-button" type="button" data-flow-run-total-sort="${escapeAttr(column)}" aria-label="Sort flow run totals by ${escapeAttr(label)}">
        <span>${escapeHtml(label)}</span>
        <span class="table-sort-indicator" aria-hidden="true">${indicator}</span>
      </button>
    </th>
  `;
}

function toggleFlowRunTotalsSort(column) {
  if (!column) {
    return;
  }
  if (state.flowRunTotalsSort.column === column) {
    state.flowRunTotalsSort.direction = state.flowRunTotalsSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.flowRunTotalsSort = {
      column,
      direction: ['totalRuns', 'successCount', 'failCount', 'totalRunTime'].includes(column) ? 'desc' : 'asc',
    };
  }
  renderFlowRuns();
}

function renderFlowRunTotals(rows) {
  if (!rows.length) {
    el.flowRunsTotals.innerHTML = empty('No flow run totals match the current filters.');
    return;
  }
  const totals = new Map();
  for (const row of rows) {
    const groupLabel = String(row.flowName || '').trim() || 'Unknown flow';
    const current = totals.get(groupLabel) || {
      groupLabel,
      totalRuns: 0,
      successCount: 0,
      failCount: 0,
      totalRunTime: 0,
    };
    current.totalRuns += 1;
    const statusClass = flowRunStatusClass(String(row.status || '').toLowerCase());
    if (statusClass === 'succeeded') {
      current.successCount += 1;
    }
    if (statusClass === 'broken') {
      current.failCount += 1;
    }
    current.totalRunTime += Number(row.durationMs || 0);
    totals.set(groupLabel, current);
  }
  const rowsToRender = getSortedFlowRunTotalsRows([...totals.values()]);
  el.flowRunsTotals.innerHTML = `
    <table class="metadata-table flow-run-totals-table">
      <thead>
        <tr>
          ${renderFlowRunTotalsSortHeader('groupLabel', 'Flow')}
          ${renderFlowRunTotalsSortHeader('totalRuns', 'Flow run count')}
          ${renderFlowRunTotalsSortHeader('successCount', 'Success count')}
          ${renderFlowRunTotalsSortHeader('failCount', 'Fail count')}
          ${renderFlowRunTotalsSortHeader('totalRunTime', 'Total run time')}
        </tr>
      </thead>
      <tbody>
        ${rowsToRender.map((row) => `
          <tr>
            <td>${escapeHtml(row.groupLabel)}</td>
            <td>${escapeHtml(String(row.totalRuns))}</td>
            <td>${escapeHtml(String(row.successCount))}</td>
            <td>${escapeHtml(String(row.failCount))}</td>
            <td>${escapeHtml(formatDuration(row.totalRunTime))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function getSortedFlowRunTotalsRows(rows) {
  const { column, direction } = state.flowRunTotalsSort;
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => compareFlowRunTotalsValues(left, right, column) * multiplier);
}

function compareFlowRunTotalsValues(left, right, column) {
  if (column === 'totalRuns' || column === 'successCount' || column === 'failCount' || column === 'totalRunTime') {
    return Number(left[column] || 0) - Number(right[column] || 0);
  }
  return String(left.groupLabel || '').localeCompare(String(right.groupLabel || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function formatDuration(value) {
  const milliseconds = Number(value || 0);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return '0s';
  }
  const totalSeconds = Math.round(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

async function loadAgentSessions(options = {}) {
  if (!state.selectedEnvironment.orgUrl) {
    throw new Error('Select an environment first.');
  }
  if (options.append && !state.agentSessionsNextPageToken) {
    return;
  }
  state.agentSessionsLoading = true;
  if (!options.append) {
    el.agentSessionsTotals.innerHTML = empty('Loading totals...');
    el.agentSessionsTable.innerHTML = empty('Loading sessions...');
    state.agentSessions = [];
    state.agentSessionsNextPageToken = '';
    state.agentSessionsLoaded = false;
  }

  const params = getAgentSessionLoadParams(options.append ? state.agentSessionDateRange : null);
  if (options.append && state.agentSessionsNextPageToken) {
    params.set('pageToken', state.agentSessionsNextPageToken);
  }

  try {
    const data = await api(`/api/agent-sessions${params.toString() ? `?${params.toString()}` : ''}`);
    const rows = data.rows || [];
    state.agentSessions = options.append ? [...state.agentSessions, ...rows] : rows;
    state.agentSessionsLoaded = true;
    state.agentSessionsNextPageToken = data.nextPageToken || '';
    applyAgentSessionDateRange(data.dateRange || {});
    renderAgentSessions();
    if (options.toastMessage === undefined) {
      toast(options.append ? 'More sessions loaded.' : 'Agent sessions loaded.');
    } else if (options.toastMessage) {
      toast(options.toastMessage);
    }
  } catch (error) {
    if (!options.append) {
      el.agentSessionsTotals.innerHTML = empty(`Totals could not be loaded. ${cleanApiErrorMessage(error.message)}`);
      el.agentSessionsTable.innerHTML = empty(`Sessions could not be loaded. ${cleanApiErrorMessage(error.message)}`);
      el.downloadAgentSessionsButton.disabled = true;
      el.loadMoreAgentSessionsButton.hidden = true;
    }
    throw error;
  } finally {
    state.agentSessionsLoading = false;
  }
}

function renderAgentSessions() {
  if (!el.agentSessionsTable) {
    return;
  }
  if (!state.agentSessionsLoaded) {
    el.agentSessionsSummary.textContent = 'Choose a date range, then click Load sessions to fetch transcripts.';
    el.agentSessionsTotals.innerHTML = empty('Load sessions to see totals by agent.');
    el.agentSessionsTable.innerHTML = empty('Load sessions.');
    el.loadMoreAgentSessionsButton.hidden = true;
    el.downloadAgentSessionsButton.disabled = true;
    return;
  }

  const filtered = getFilteredAgentSessions();
  const totals = getAgentSessionTotals(filtered);
  const rangeText = state.agentSessionDateRange.startDate && state.agentSessionDateRange.endDate
    ? `${state.agentSessionDateRange.startDate} to ${state.agentSessionDateRange.endDate}`
    : '';
  const moreLabel = state.agentSessionsNextPageToken ? ' | more available' : '';
  el.agentSessionsSummary.textContent = `${filtered.length} / ${state.agentSessions.length} session${state.agentSessions.length === 1 ? '' : 's'} | ${totals.length} agent${totals.length === 1 ? '' : 's'}${rangeText ? ` | ${rangeText}` : ''}${moreLabel}`;
  el.loadMoreAgentSessionsButton.hidden = !state.agentSessionsNextPageToken;
  renderAgentSessionTotals(totals);
  el.downloadAgentSessionsButton.disabled = !totals.length;

  if (!filtered.length) {
    el.agentSessionsTable.innerHTML = empty(state.agentSessions.length ? 'No agent sessions match the current filters.' : 'No agent sessions found for this range.');
    return;
  }

  el.agentSessionsTable.innerHTML = `
    <table class="metadata-table agent-sessions-table">
      <thead>
        <tr>
          <th scope="col">Agent Name</th>
          <th scope="col">Conversation Start Time</th>
          <th scope="col">Conversation Id</th>
        </tr>
      </thead>
      <tbody>
        ${state.agentSessions.map((row) => `
          <tr class="agent-session-row${row.conversationId === state.selectedAgentSessionId ? ' selected' : ''}" tabindex="0" role="button" data-agent-session-id="${escapeAttr(row.conversationId)}" title="Open transcript">
            <td>${escapeHtml(row.agentName || 'Unknown agent')}</td>
            <td>${escapeHtml(formatTranscriptDateTime(row.conversationStartTime))}</td>
            <td class="agent-session-id">${escapeHtml(row.conversationId || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderAgentSessionTotals(rows) {
  if (!el.agentSessionsTotals) {
    return;
  }
  if (!rows.length) {
    el.agentSessionsTotals.innerHTML = empty('No sessions match the current filters.');
    return;
  }
  el.agentSessionsTotals.innerHTML = `
    <table class="metadata-table agent-session-totals-table">
      <thead>
        <tr>
          <th scope="col">Agent Name</th>
          <th scope="col">Total Sessions</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(row.agentName || 'Unknown agent')}</td>
            <td>${escapeHtml(String(row.totalSessions || 0))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function applyAgentSessionDateRange(dateRange) {
  if (!dateRange || !dateRange.startDate || !dateRange.endDate) {
    return;
  }
  state.agentSessionDateRange = {
    range: dateRange.range || 'month',
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  };
  el.agentSessionsRange.value = state.agentSessionDateRange.range;
  el.agentSessionsStart.value = state.agentSessionDateRange.startDate;
  el.agentSessionsEnd.value = state.agentSessionDateRange.endDate;
  syncAgentSessionCustomRangeVisibility();
}

function getAgentSessionLoadParams(dateRange = null) {
  const params = new URLSearchParams();
  const range = dateRange?.range || el.agentSessionsRange.value || 'month';
  params.set('range', range);
  if (params.get('range') === 'custom') {
    params.set('start', dateRange?.startDate || el.agentSessionsStart.value || '');
    params.set('end', dateRange?.endDate || el.agentSessionsEnd.value || '');
  }
  return params;
}

function getFilteredAgentSessions() {
  const query = el.agentSessionsSearch.value.trim().toLowerCase();
  return state.agentSessions.filter((row) => {
    const agentName = String(row.agentName || '').trim().toLowerCase();
    return !query || agentName.includes(query);
  });
}

function getAgentSessionTotals(rows) {
  const totals = new Map();
  for (const row of rows) {
    const key = String(row.agentName || 'Unknown agent').trim() || 'Unknown agent';
    totals.set(key, (totals.get(key) || 0) + 1);
  }
  return [...totals.entries()]
    .map(([agentName, totalSessions]) => ({ agentName, totalSessions }))
    .sort((left, right) => right.totalSessions - left.totalSessions || left.agentName.localeCompare(right.agentName, undefined, { sensitivity: 'base' }));
}

async function downloadAgentSessionTotalsExcel() {
  const rows = getAgentSessionTotals(getFilteredAgentSessions());
  if (!rows.length) {
    throw new Error('No agent session totals to export.');
  }
  const response = await apiFetch('/api/agent-sessions/export', {
    method: 'POST',
    body: {
      rows,
      dateRange: state.agentSessionDateRange,
    },
  });
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  downloadBlob(match?.[1] || `agent-sessions-${safeDownloadFilename(state.agentSessionDateRange.startDate || 'export')}.xlsx`, blob);
  toast('Agent session totals Excel file downloaded.');
}

async function openAgentSessionDetail(conversationId) {
  if (!conversationId) {
    return;
  }
  state.selectedAgentSessionId = conversationId;
  renderAgentSessions();
  el.agentSessionDetailModal.hidden = false;
  el.agentSessionDetailTitle.textContent = 'Agent Session';
  el.agentSessionDetailMeta.textContent = 'Loading transcript...';
  el.agentSessionDetailBody.innerHTML = empty('Loading transcript...');

  const cached = state.agentSessionDetailCache.get(conversationId);
  if (cached) {
    renderAgentSessionDetailModal(cached);
    return;
  }

  let data;
  try {
    data = await api(`/api/agent-sessions/${encodeURIComponent(conversationId)}`);
  } catch (error) {
    closeAgentSessionDetailModal();
    throw error;
  }
  const detail = data.session || null;
  if (!detail) {
    throw new Error('Agent session details are unavailable.');
  }
  state.agentSessionDetailCache.set(conversationId, detail);
  if (state.selectedAgentSessionId === conversationId) {
    renderAgentSessionDetailModal(detail);
  }
}

function renderAgentSessionDetailModal(detail) {
  const title = detail.agentName || detail.conversationName || 'Agent Session';
  el.agentSessionDetailTitle.textContent = title;
  el.agentSessionDetailMeta.textContent = [
    detail.conversationStartTime ? formatTranscriptDateTime(detail.conversationStartTime) : '',
    detail.conversationId || '',
  ].filter(Boolean).join(' | ');

  const redactionTypes = detail.redactions?.types || [];
  const redactionText = detail.redactions?.count
    ? `${detail.redactions.count} redaction${detail.redactions.count === 1 ? '' : 's'} applied`
    : 'No sensitive patterns detected by the sanitizer';
  const sanitizedNote = `
    <div class="agent-session-banner">
      <strong>Sanitized transcript</strong>
      <p>${escapeHtml(redactionText)}${redactionTypes.length ? ` (${escapeHtml(redactionTypes.join(', '))})` : ''}.</p>
    </div>
  `;

  const summaryCards = [
    ['Agent', detail.agentName || 'Unknown agent'],
    ['Start time', detail.conversationStartTime ? formatTranscriptDateTime(detail.conversationStartTime) : 'Unknown'],
    ['Conversation id', detail.conversationId || 'Unknown'],
    ['Activities', Number.isFinite(Number(detail.activityCount)) ? String(detail.activityCount) : '0'],
  ].map(([label, value]) => `
    <div class="agent-session-summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join('');

  el.agentSessionDetailBody.innerHTML = `
    ${sanitizedNote}
    <div class="agent-session-summary-grid">
      ${summaryCards}
    </div>
    ${renderTranscriptPayload(detail.transcript)}
    ${detail.metadata ? `
      <details class="agent-session-metadata">
        <summary>Session metadata</summary>
        <pre>${escapeHtml(JSON.stringify(detail.metadata, null, 2))}</pre>
      </details>
    ` : ''}
  `;
}

function renderTranscriptPayload(transcript) {
  if (!transcript) {
    return empty('No transcript content found.');
  }
  if (Array.isArray(transcript.activities)) {
    if (!transcript.activities.length) {
      return empty('No transcript activities found.');
    }
    return `
      <div class="agent-session-transcript">
        ${transcript.activities.map((activity, index) => renderTranscriptActivity(activity, index)).join('')}
      </div>
    `;
  }
  if (typeof transcript.text === 'string' && transcript.text.trim()) {
    return `
      <section class="agent-session-transcript-panel">
        <h3>Transcript</h3>
        <pre>${escapeHtml(transcript.text)}</pre>
      </section>
    `;
  }
  return `
    <details class="agent-session-metadata" open>
      <summary>Transcript JSON</summary>
      <pre>${escapeHtml(JSON.stringify(transcript, null, 2))}</pre>
    </details>
  `;
}

function renderTranscriptActivity(activity, index) {
  const type = String(activity?.type || activity?.valueType || 'activity').trim();
  const speaker = formatTranscriptSpeaker(activity);
  const timestamp = formatTranscriptTimestamp(activity);
  const headline = activity?.name || activity?.valueType || type;
  const classes = ['transcript-activity', `transcript-${sanitizeTranscriptCssToken(type)}`].join(' ');
  const body = [];

  if (activity?.text) {
    body.push(`<div class="transcript-activity-text">${escapeHtmlWithLineBreaks(activity.text)}</div>`);
  }

  const valueBlock = renderTranscriptValueBlock(activity?.value, 'Activity payload');
  if (valueBlock) {
    body.push(valueBlock);
  }

  if (Array.isArray(activity?.attachments) && activity.attachments.length) {
    body.push(`
      <div class="transcript-attachment-list">
        ${activity.attachments.map((attachment, attachmentIndex) => renderTranscriptAttachment(attachment, attachmentIndex)).join('')}
      </div>
    `);
  }

  const extras = renderTranscriptExtras(activity);
  if (extras) {
    body.push(extras);
  }

  return `
    <article class="${classes}" data-transcript-index="${index}">
      <div class="transcript-activity-header">
        <div>
          <strong>${escapeHtml(headline)}</strong>
          <span>${escapeHtml(speaker)}</span>
        </div>
        <span>${escapeHtml(timestamp || '')}</span>
      </div>
      ${body.length ? `<div class="transcript-activity-body">${body.join('')}</div>` : ''}
    </article>
  `;
}

function renderTranscriptAttachment(attachment, index) {
  const summary = summarizeTranscriptAttachment(attachment);
  const attachmentPayload = renderTranscriptValueBlock(attachment, `Attachment ${index + 1}`);
  return `
    <details class="transcript-attachment-card">
      <summary>${escapeHtml(summary)}</summary>
      ${attachmentPayload || ''}
    </details>
  `;
}

function summarizeTranscriptAttachment(attachment) {
  if (!attachment || typeof attachment !== 'object') {
    return 'Attachment';
  }
  const contentType = String(attachment.contentType || attachment.contenttype || '').trim();
  const title = String(attachment.title || attachment.name || '').trim();
  const text = String(attachment.text || attachment.subtitle || '').trim();
  const fragments = [contentType, title || text].filter(Boolean);
  return fragments.length ? fragments.join(' | ') : 'Attachment';
}

function renderTranscriptValueBlock(value, label) {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  if (typeof value === 'string') {
    return `
      <details class="transcript-value-block">
        <summary>${escapeHtml(label)}</summary>
        <pre>${escapeHtml(value)}</pre>
      </details>
    `;
  }
  return `
    <details class="transcript-value-block">
      <summary>${escapeHtml(label)}</summary>
      <pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>
    </details>
  `;
}

function renderTranscriptExtras(activity) {
  const extras = { ...activity };
  for (const key of ['text', 'attachments', 'from', 'timestamp', 'timestampMs', 'type', 'name', 'valueType', 'value']) {
    delete extras[key];
  }
  if (!Object.keys(extras).length) {
    return '';
  }
  return `
    <details class="transcript-value-block">
      <summary>Activity details</summary>
      <pre>${escapeHtml(JSON.stringify(extras, null, 2))}</pre>
    </details>
  `;
}

function formatTranscriptSpeaker(activity) {
  const from = activity?.from || {};
  const displayName = String(from.displayName || from.name || '').trim();
  if (displayName) {
    return displayName;
  }
  const role = Number(from.role);
  if (Number.isFinite(role)) {
    return `Role ${role}`;
  }
  return activity?.channelId ? String(activity.channelId) : 'Conversation';
}

function formatTranscriptTimestamp(activity) {
  const value = activity?.timestampMs || activity?.timestamp || '';
  if (!value) {
    return '';
  }
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 1e12 ? numeric : numeric * 1000)
    : new Date(String(value));
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function formatTranscriptDateTime(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function escapeHtmlWithLineBreaks(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br />');
}

function sanitizeTranscriptCssToken(value) {
  return String(value || 'activity')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'activity';
}

function closeAgentSessionDetailModal() {
  el.agentSessionDetailModal.hidden = true;
  el.agentSessionDetailBody.innerHTML = '';
  state.selectedAgentSessionId = '';
  renderAgentSessions();
}

async function openAiEventDetail(aiEventId) {
  if (!aiEventId) {
    return;
  }
  state.selectedAiEventId = aiEventId;
  el.aiEventDetailModal.hidden = false;
  el.aiEventDetailTitle.textContent = 'AI Flow Event';
  el.aiEventDetailMeta.textContent = 'Loading event details...';
  el.aiEventDetailBody.innerHTML = empty('Loading event details...');

  const cached = state.aiEventDetailCache.get(aiEventId);
  if (cached) {
    renderAiEventDetailModal(cached);
    return;
  }

  const data = await api(`/api/ai-events/${encodeURIComponent(aiEventId)}`);
  const detail = data.event || null;
  if (!detail) {
    throw new Error('AI Flow event details are unavailable.');
  }
  state.aiEventDetailCache.set(aiEventId, detail);
  if (state.selectedAiEventId === aiEventId) {
    renderAiEventDetailModal(detail);
  }
}

function renderAiEventDetailModal(detail) {
  el.aiEventDetailTitle.textContent = detail.toolName || detail.source || 'AI Flow Event';
  el.aiEventDetailMeta.textContent = [
    detail.creditType || '',
    detail.ownerName ? `Owner: ${detail.ownerName}` : '',
    detail.createdByName ? `Created by: ${detail.createdByName}` : '',
    detail.createdOn || '',
  ].filter(Boolean).join(' | ');
  el.aiEventDetailBody.innerHTML = `
    <div class="ai-event-detail-panel">
      <h3>Input</h3>
      <pre>${escapeHtml(formatAiEventPayload(detail.input))}</pre>
    </div>
    <div class="ai-event-detail-panel">
      <h3>Output</h3>
      <pre>${escapeHtml(formatAiEventPayload(detail.output))}</pre>
    </div>
  `;
}

function formatAiEventPayload(payload) {
  if (!payload) {
    return '(empty)';
  }
  const value = payload.parsed !== undefined ? payload.parsed : payload.raw;
  if (value === null || value === '') {
    return '(empty)';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function closeAiEventDetailModal() {
  el.aiEventDetailModal.hidden = true;
  el.aiEventDetailBody.innerHTML = '';
  state.selectedAiEventId = '';
}

function formatDateInputValue(value) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function toggleCreateRoleForm() {
  el.createRoleForm.hidden = !el.createRoleForm.hidden;
  el.toggleCreateRoleButton.textContent = el.createRoleForm.hidden ? 'Create role' : 'Hide create role';
}

function toggleUsersTeamsCreatePanel(panel) {
  const showUser = panel === 'user' && el.createUserPanel.hidden;
  const showTeam = panel === 'team' && el.createTeamPanel.hidden;
  el.createUserPanel.hidden = !showUser;
  el.createTeamPanel.hidden = !showTeam;
  el.toggleCreateUserButton.textContent = showUser ? 'Hide add user' : 'Add user';
  el.toggleCreateTeamButton.textContent = showTeam ? 'Hide create team' : 'Create team';
}

async function loadUsersAndTeams() {
  if (!state.selectedEnvironment.orgUrl) {
    throw new Error('Select an environment first.');
  }
  clearTimeout(userSearchTimer);
  clearTimeout(teamSearchTimer);
  await Promise.all([
    loadUsersPage(),
    loadTeamsPage(),
  ]);
  renderTeamMembersPanel();
  await ensureRolesLoaded().catch((error) => {
    console.error(error);
  });
  if (!state.businessUnitsLoaded) {
    await loadBusinessUnits().catch((error) => {
      console.error(error);
    });
  }
  toast('Users and teams loaded.');
}

function scheduleUserSearch() {
  clearTimeout(userSearchTimer);
  if (!state.selectedEnvironment.orgUrl || (!state.usersLoaded && !state.users.length && !state.usersLoading)) {
    return;
  }
  userSearchTimer = setTimeout(() => {
    loadUsersPage().catch((error) => {
      toast(error.message, 'error');
      console.error(error);
    });
  }, USERS_TEAMS_SEARCH_DELAY_MS);
}

function scheduleTeamSearch() {
  clearTimeout(teamSearchTimer);
  if (!state.selectedEnvironment.orgUrl || (!state.teamsLoaded && !state.teams.length && !state.teamsLoading)) {
    return;
  }
  teamSearchTimer = setTimeout(() => {
    loadTeamsPage().catch((error) => {
      toast(error.message, 'error');
      console.error(error);
    });
  }, USERS_TEAMS_SEARCH_DELAY_MS);
}

async function loadUsersPage(options = {}) {
  if (!state.selectedEnvironment.orgUrl) {
    throw new Error('Select an environment first.');
  }
  const append = options.append === true;
  const requestId = state.usersRequestId + 1;
  state.usersRequestId = requestId;
  state.usersLoading = true;
  if (!append) {
    state.users = [];
    state.usersLoaded = false;
    state.usersError = '';
    state.usersNextPageToken = '';
  }
  renderUsers();
  try {
    const data = await api(buildPagedUsersTeamsPath('/api/users', el.userSearch.value, append ? state.usersNextPageToken : ''));
    if (requestId !== state.usersRequestId) {
      return;
    }
    const items = Array.isArray(data?.items) ? data.items : [];
    state.users = append ? [...state.users, ...items] : items;
    state.usersLoaded = true;
    state.usersError = '';
    state.usersNextPageToken = data?.nextPageToken || '';
  } catch (error) {
    if (requestId === state.usersRequestId && !append) {
      state.users = [];
      state.usersLoaded = false;
      state.usersError = `Users could not be loaded. ${error.message}`;
      state.usersNextPageToken = '';
    }
    throw error;
  } finally {
    if (requestId === state.usersRequestId) {
      state.usersLoading = false;
      renderUsers();
    }
  }
}

async function loadTeamsPage(options = {}) {
  if (!state.selectedEnvironment.orgUrl) {
    throw new Error('Select an environment first.');
  }
  const append = options.append === true;
  const requestId = state.teamsRequestId + 1;
  state.teamsRequestId = requestId;
  state.teamsLoading = true;
  if (!append) {
    state.teams = [];
    state.teamsLoaded = false;
    state.teamsError = '';
    state.teamsNextPageToken = '';
  }
  renderTeams();
  try {
    const data = await api(buildPagedUsersTeamsPath('/api/teams', el.teamSearch.value, append ? state.teamsNextPageToken : ''));
    if (requestId !== state.teamsRequestId) {
      return;
    }
    const items = Array.isArray(data?.items) ? data.items : [];
    state.teams = append ? [...state.teams, ...items] : items;
    state.teamsLoaded = true;
    state.teamsError = '';
    state.teamsNextPageToken = data?.nextPageToken || '';
  } catch (error) {
    if (requestId === state.teamsRequestId && !append) {
      state.teams = [];
      state.teamsLoaded = false;
      state.teamsError = `Teams could not be loaded. ${error.message}`;
      state.teamsNextPageToken = '';
    }
    throw error;
  } finally {
    if (requestId === state.teamsRequestId) {
      state.teamsLoading = false;
      renderTeams();
    }
  }
}

function renderUsers() {
  if (!state.users.length) {
    el.usersList.innerHTML = empty(usersEmptyStateMessage());
    renderTeamMembersPanel();
    return;
  }
  const nextPage = state.usersNextPageToken
    ? `
    <button class="list-item pager-row" type="button" data-users-next-page${state.usersLoading ? ' disabled' : ''}>
      <span class="role-name">${state.usersLoading ? 'Loading more users...' : 'Next 50 users'}</span>
      <span class="role-id">Load the next page for the current filter.</span>
    </button>
  `
    : '';
  el.usersList.innerHTML = `${state.users.map((user) => `
    <button class="list-item principal-row user-row" type="button" data-principal-action="assign-role" data-principal-type="systemuser" data-principal-id="${escapeAttr(user.systemuserid)}"${user.isdisabled ? ' disabled' : ''}>
      <span class="role-name">${escapeHtml(user.fullname || user.internalemailaddress || user.domainname || user.systemuserid)}</span>
      <span class="role-id">${escapeHtml(user.internalemailaddress || user.domainname || '')}</span>
      <span class="role-id">${user.isdisabled ? 'Disabled' : 'Enabled'} | ${escapeHtml(user.businessUnitName || 'No business unit')}</span>
      <span class="role-id">${escapeHtml(user.azureactivedirectoryobjectid || '')}</span>
      <span class="role-id row-action-text">${user.isdisabled ? 'Disabled users cannot receive roles' : 'Assign role'}</span>
    </button>
  `).join('')}${nextPage}`;
  renderTeamMembersPanel();
}

function renderTeams() {
  if (!state.teams.length) {
    el.teamsList.innerHTML = empty(teamsEmptyStateMessage());
    return;
  }
  const nextPage = state.teamsNextPageToken
    ? `
    <button class="list-item pager-row" type="button" data-teams-next-page${state.teamsLoading ? ' disabled' : ''}>
      <span class="role-name">${state.teamsLoading ? 'Loading more teams...' : 'Next 50 teams'}</span>
      <span class="role-id">Load the next page for the current filter.</span>
    </button>
  `
    : '';
  el.teamsList.innerHTML = `${state.teams.map((team) => {
    const canAssignRoles = Number(team.teamtype) !== 1;
    return `
    <div class="list-item team-row${team.teamid === state.selectedTeamId ? ' selected' : ''}">
      <button class="principal-row-main" type="button" data-team-select data-id="${escapeAttr(team.teamid)}">
        <span class="role-name">${escapeHtml(team.name || team.teamid)}</span>
        <span class="role-id">${escapeHtml(team.teamTypeLabel || '')}${team.emailaddress ? ` | ${escapeHtml(team.emailaddress)}` : ''}</span>
        <span class="role-id">${escapeHtml(team.businessUnitName || 'No business unit')}</span>
        <span class="role-id">${escapeHtml(team.azureactivedirectoryobjectid || '')}</span>
      </button>
      <button class="role-id row-action-text row-action-link" type="button" data-principal-action="assign-role" data-principal-type="team" data-principal-id="${escapeAttr(team.teamid)}"${canAssignRoles ? '' : ' disabled'}>${canAssignRoles ? 'Assign role' : 'Access team'}</button>
    </div>
  `;
  }).join('')}${nextPage}`;
}

async function syncEnvironmentUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  await withBusy(button, async () => {
    const formData = new FormData(form);
    const result = await api('/api/users/sync', {
      method: 'POST',
      body: {
        principalObjectId: formData.get('principalObjectId'),
      },
    });
    form.reset();
    toggleUsersTeamsCreatePanel('');
    toast(result.message || 'User sync requested.');
    await refreshUsers();
  }, 'Adding user');
}

async function createEnvironmentTeam(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  await withBusy(button, async () => {
    const formData = new FormData(form);
    const team = await api('/api/teams', {
      method: 'POST',
      body: {
        name: formData.get('name'),
        teamType: formData.get('teamType'),
        businessUnitId: formData.get('businessUnitId'),
        azureActiveDirectoryObjectId: formData.get('azureActiveDirectoryObjectId'),
        emailaddress: formData.get('emailaddress'),
        description: formData.get('description'),
      },
    });
    form.reset();
    renderBusinessUnits();
    toggleUsersTeamsCreatePanel('');
    toast(`Created ${team.name || 'team'}.`);
    await refreshTeams();
    state.selectedTeamId = team.teamid || state.selectedTeamId;
    renderTeams();
    renderTeamMembersPanel();
  }, 'Creating team');
}

async function refreshUsers() {
  await loadUsersPage();
}

async function refreshTeams() {
  await loadTeamsPage();
}

function buildPagedUsersTeamsPath(path, query, pageToken) {
  const searchParams = new URLSearchParams();
  const normalizedQuery = String(query || '').trim();
  const normalizedPageToken = String(pageToken || '').trim();
  if (normalizedQuery) {
    searchParams.set('q', normalizedQuery);
  }
  if (normalizedPageToken) {
    searchParams.set('pageToken', normalizedPageToken);
  }
  const suffix = searchParams.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function usersEmptyStateMessage() {
  if (state.usersLoading) {
    return 'Loading users...';
  }
  if (state.usersError) {
    return state.usersError;
  }
  if (state.usersLoaded) {
    return 'No users found for the current filter.';
  }
  return 'Load users and teams.';
}

function teamsEmptyStateMessage() {
  if (state.teamsLoading) {
    return 'Loading teams...';
  }
  if (state.teamsError) {
    return state.teamsError;
  }
  if (state.teamsLoaded) {
    return 'No teams found for the current filter.';
  }
  return 'Load users and teams.';
}

async function loadConnections() {
  if (!state.selectedEnvironment.environmentName) {
    throw new Error('Select an environment first.');
  }
  state.connectionsLoaded = false;
  state.connections = [];
  state.connectionUser = null;
  state.connectionWarnings = [];
  el.connectionSummary.textContent = '';
  el.connectionsList.innerHTML = empty('Loading connections...');
  let data;
  try {
    data = await api('/api/connections');
  } catch (error) {
    state.connectionsLoaded = false;
    el.connectionSummary.textContent = '';
    el.connectionsList.innerHTML = empty(`Connections could not be loaded. ${error.message}`);
    throw error;
  }
  state.connections = data.connections || [];
  state.connectionUser = data.currentUser || null;
  state.connectionWarnings = data.warnings || [];
  state.connectionsLoaded = true;
  renderConnections();
  if (data.warnings?.length) {
    toast(`Connections loaded with warnings: ${data.warnings.join(' | ')}`);
  } else {
    toast('Connections loaded.');
  }
}

function renderConnections() {
  if (!el.connectionsList) {
    return;
  }

  const query = el.connectionSearch.value.trim().toLowerCase();
  const mineOnly = el.myConnectionsOnly.checked;
  const brokenOnly = el.brokenConnectionsOnly.checked;
  const filtered = state.connections.filter((connection) => {
    if (mineOnly && !connection.isCurrentUserConnection) {
      return false;
    }
    if (brokenOnly && connection.health !== 'broken') {
      return false;
    }
    return !query || connectionSearchText(connection).includes(query);
  });

  const total = state.connections.length;
  const broken = state.connections.filter((connection) => connection.health === 'broken').length;
  const mine = state.connections.filter((connection) => connection.isCurrentUserConnection).length;
  const warningText = state.connectionWarnings.length
    ? ` | ${state.connectionWarnings.length} source warning${state.connectionWarnings.length === 1 ? '' : 's'}`
    : '';
  el.connectionSummary.textContent = total || state.connectionsLoaded
    ? `${total} connection${total === 1 ? '' : 's'} loaded | ${broken} broken | ${mine} owned by ${state.connectionUser?.displayName || state.connectionUser?.email || 'the selected account'}${warningText}`
    : '';

  if (!filtered.length) {
    el.connectionsList.innerHTML = empty(state.connectionsLoaded ? 'No connections match the filter.' : 'Load connections.');
    return;
  }

  el.connectionsList.innerHTML = filtered.map((connection) => {
    const health = connection.health || 'unknown';
    const canFix = health === 'broken' && connection.isCurrentUserConnection && connection.fixUrl;
    const owner = connection.owner?.displayName || connection.owner?.email || connection.owner?.id || 'Unknown owner';
    const ownerEmail = connection.owner?.email && connection.owner.email !== owner ? ` | ${connection.owner.email}` : '';
    const healthMarkup = canFix
      ? `<a class="status-pill broken fix-pill" href="${escapeAttr(connection.fixUrl)}" target="_blank" rel="noopener noreferrer">Broken - Click to Fix</a>`
      : `<span class="status-pill ${escapeAttr(health)}">${escapeHtml(connection.healthLabel || health)}</span>`;
    return `
      <div class="list-item connection-row">
        <div class="connection-row-main">
          <span class="role-name">${escapeHtml(connection.displayName || connection.connectionId || 'Connection')}</span>
          <span class="role-id">Connector: ${escapeHtml(connection.connectorDisplayName || connection.connectorName || connection.connectorId || 'Unknown connector')}</span>
          <span class="role-id">Owner: ${escapeHtml(owner)}${escapeHtml(ownerEmail)}</span>
          <span class="role-id">${escapeHtml(connection.connectionId || '')}</span>
          ${connection.statusDetail ? `<span class="role-id">${escapeHtml(connection.statusDetail)}</span>` : ''}
        </div>
        <div class="connection-row-actions">
          ${healthMarkup}
          <button class="icon-button secondary danger-action trash-button" type="button" data-connection-action="delete" data-connection-id="${escapeAttr(connection.connectionId || '')}" title="Delete connection" aria-label="Delete connection"${connection.connectionId ? '' : ' disabled'}>
            <span class="trash-icon" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function connectionSearchText(connection) {
  return [
    connection.displayName,
    connection.connectionId,
    connection.name,
    connection.connectorDisplayName,
    connection.connectorName,
    connection.connectorId,
    connection.owner?.displayName,
    connection.owner?.email,
    connection.owner?.id,
    connection.health,
    connection.healthLabel,
    connection.statusDetail,
    connection.source,
  ].filter(Boolean).join(' ').toLowerCase();
}

function openConnectionDeleteModal(connectionId) {
  if (!connectionId) {
    toast('Connection ID is missing.', 'error');
    return;
  }
  const connection = state.connections.find((item) => item.connectionId === connectionId);
  if (!connection) {
    toast('Connection was not found. Refresh connections and try again.', 'error');
    return;
  }

  state.pendingConnectionDeleteId = connectionId;
  el.connectionDeleteTitle.textContent = 'Delete Connection';
  el.connectionDeleteMeta.textContent = [
    connection.displayName || connection.connectionId,
    connection.connectorDisplayName || connection.connectorName || connection.connectorId,
    connection.owner?.displayName || connection.owner?.email || '',
  ].filter(Boolean).join(' | ');
  el.connectionDeleteModal.hidden = false;
  el.connectionDeleteConfirm.focus();
}

function closeConnectionDeleteModal() {
  state.pendingConnectionDeleteId = '';
  el.connectionDeleteModal.hidden = true;
  el.connectionDeleteMeta.textContent = '';
}

async function confirmDeleteConnection() {
  const connectionId = state.pendingConnectionDeleteId;
  if (!connectionId) {
    closeConnectionDeleteModal();
    return;
  }

  await withBusy(el.connectionDeleteConfirm, async () => {
    await api(`/api/connections/${encodeURIComponent(connectionId)}`, { method: 'DELETE' });
    state.connections = state.connections.filter((item) => item.connectionId !== connectionId);
    closeConnectionDeleteModal();
    renderConnections();
    toast('Connection deleted.');
  }, 'Deleting');
}

async function loadSqlTables() {
  if (!el.sqlTablesList) {
    return;
  }
  el.sqlTablesSummary.textContent = 'Loading local trend data...';
  const data = await api('/api/sql-tables', { quiet: true });
  state.sqlTables = Array.isArray(data.tables) ? data.tables : [];
  renderSqlTables(data);
}

function renderSqlTables(data = {}) {
  if (!el.sqlTablesList) {
    return;
  }
  const tables = state.sqlTables || [];
  const totalRows = Number(data.totalRows ?? tables.reduce((sum, table) => sum + Number(table.rowCount || 0), 0));
  const totalStorageBytes = Number(data.totalStorageBytes ?? tables.reduce((sum, table) => sum + Number(table.storageBytes || 0), 0));
  el.sqlTablesSummary.textContent = tables.length
    ? `${tables.length} table${tables.length === 1 ? '' : 's'} | ${totalRows.toLocaleString()} row${totalRows === 1 ? '' : 's'} | ${formatBytes(totalStorageBytes)}`
    : 'No local trend tables found.';
  if (el.exportSqlTablesButton) {
    el.exportSqlTablesButton.disabled = !tables.length;
  }
  if (el.deleteSqlRecordsButton) {
    el.deleteSqlRecordsButton.disabled = !tables.length || totalRows < 1;
  }
  el.sqlTablesList.innerHTML = tables.length ? tables.map((table) => `
    <div class="sql-table-row">
      <div>
        <span class="role-name">${escapeHtml(table.label || table.name || 'Table')}</span>
        <span class="role-id">Local trend data</span>
      </div>
      <span class="sql-table-metric">${Number(table.rowCount || 0).toLocaleString()} row${Number(table.rowCount || 0) === 1 ? '' : 's'}</span>
      <span class="sql-table-metric">${formatBytes(table.storageBytes || 0)}</span>
      <button class="secondary sql-table-download" type="button" data-sql-table-export="${escapeAttr(table.name || '')}">Download</button>
    </div>
  `).join('') : empty('No local trend data found.');
}

async function exportSqlTables() {
  await downloadFile('/api/sql-tables/export', 'pdac-sql-tables.xlsx');
}

async function exportSqlTable(tableName) {
  if (!tableName) {
    throw new Error('Select a trend table to download.');
  }
  await downloadFile(`/api/sql-tables/${encodeURIComponent(tableName)}/export`, `${tableName}.xlsx`);
}

async function downloadTrendDataTemplate() {
  await downloadFile('/api/sql-tables/import-template', 'pdac-trend-data-import-template.xlsx');
}

async function importTrendData() {
  const file = el.trendDataImportFile?.files?.[0];
  if (!file) {
    return;
  }
  try {
    await withBusy(el.importTrendDataButton, async () => {
      const result = await api('/api/sql-tables/import', {
        method: 'POST',
        body: { xlsx: await fileToBase64(file) },
      });
      await Promise.all([
        loadSqlTables(),
        loadCachedReportsDashboard(),
        loadCachedChartsDashboard(),
      ]);
      const importedRows = Number(result.importedRows || 0);
      const replacedRows = Number(result.replacedRows || 0);
      toast(`${importedRows.toLocaleString()} trend row${importedRows === 1 ? '' : 's'} imported${replacedRows ? `; ${replacedRows.toLocaleString()} existing row${replacedRows === 1 ? '' : 's'} replaced` : ''}.`);
    }, 'Importing');
  } finally {
    el.trendDataImportFile.value = '';
  }
}

function openSqlDeleteModal() {
  const totalRows = state.sqlTables.reduce((sum, table) => sum + Number(table.rowCount || 0), 0);
  if (!totalRows) {
    toast('There are no trend records to delete.');
    return;
  }
  state.pendingSqlDelete = true;
  el.sqlDeleteTitle.textContent = 'Delete Trend Data';
  el.sqlDeleteMeta.textContent = `${totalRows.toLocaleString()} row${totalRows === 1 ? '' : 's'} across ${state.sqlTables.length} table${state.sqlTables.length === 1 ? '' : 's'}`;
  el.sqlDeleteModal.hidden = false;
  el.sqlDeleteConfirm.focus();
}

function closeSqlDeleteModal() {
  state.pendingSqlDelete = false;
  if (el.sqlDeleteModal) {
    el.sqlDeleteModal.hidden = true;
  }
  if (el.sqlDeleteMeta) {
    el.sqlDeleteMeta.textContent = '';
  }
}

async function confirmDeleteSqlRecords() {
  if (!state.pendingSqlDelete) {
    closeSqlDeleteModal();
    return;
  }
  await withBusy(el.sqlDeleteConfirm, async () => {
    const result = await api('/api/sql-tables/records', { method: 'DELETE' });
    closeSqlDeleteModal();
    await loadSqlTables();
    await loadCachedReportsDashboard();
    toast(`${Number(result.deletedRows || 0).toLocaleString()} trend record${Number(result.deletedRows || 0) === 1 ? '' : 's'} deleted.`);
  }, 'Deleting');
}

async function openRoleAssignmentModal(principalType, principalId) {
  const principal = getAssignmentPrincipal(principalType, principalId);
  if (!principal) {
    toast('Select a loaded user or team first.', 'error');
    return;
  }
  state.roleAssignmentPrincipal = principal;
  el.roleAssignmentTitle.textContent = `Assign Role to ${principal.type === 'team' ? 'Team' : 'User'}`;
  el.roleAssignmentMeta.textContent = principal.detail
    ? `${principal.label} | ${principal.detail}`
    : principal.label;
  el.roleAssignmentSearch.value = '';
  el.roleAssignmentModal.hidden = false;
  el.roleAssignmentRoles.innerHTML = empty('Loading roles...');
  await ensureRolesLoaded();
  renderRoleAssignmentList();
  el.roleAssignmentSearch.focus();
}

function closeRoleAssignmentModal() {
  state.roleAssignmentPrincipal = null;
  el.roleAssignmentModal.hidden = true;
  el.roleAssignmentRoles.innerHTML = '';
  el.roleAssignmentSearch.value = '';
}

function getAssignmentPrincipal(type, id) {
  if (type === 'team') {
    const team = state.teams.find((item) => item.teamid === id);
    if (!team || Number(team.teamtype) === 1) {
      return null;
    }
    return team ? {
      id: team.teamid,
      type: 'team',
      label: team.name || team.emailaddress || team.teamid,
      detail: [team.teamTypeLabel, team.businessUnitName].filter(Boolean).join(' | '),
    } : null;
  }

  const user = state.users.find((item) => item.systemuserid === id);
  if (!user || user.isdisabled) {
    return null;
  }
  return {
    id: user.systemuserid,
    type: 'systemuser',
    label: user.fullname || user.internalemailaddress || user.domainname || user.systemuserid,
    detail: [user.internalemailaddress || user.domainname, user.businessUnitName].filter(Boolean).join(' | '),
  };
}

function renderRoleAssignmentList() {
  const query = el.roleAssignmentSearch.value.trim().toLowerCase();
  const roles = state.roles.filter((role) => {
    const businessUnitName = role.businessunitid?.name || role['_businessunitid_value@OData.Community.Display.V1.FormattedValue'] || role._businessunitid_value || '';
    const text = `${role.name || ''} ${businessUnitName}`.toLowerCase();
    return !query || text.includes(query);
  });
  if (!roles.length) {
    el.roleAssignmentRoles.innerHTML = empty(state.roles.length ? 'No roles match the filter.' : 'Load roles first.');
    return;
  }
  el.roleAssignmentRoles.innerHTML = roles.map((role) => {
    const businessUnitName = role.businessunitid?.name || role['_businessunitid_value@OData.Community.Display.V1.FormattedValue'] || role._businessunitid_value || '';
    return `
      <button class="list-item role-assignment-row" type="button" data-role-assignment-id="${escapeAttr(role.roleid)}">
        <span class="role-name">${escapeHtml(role.name)}</span>
        ${businessUnitName ? `<span class="role-id">Root business unit: ${escapeHtml(businessUnitName)}</span>` : ''}
        <span class="role-id">Assign this role</span>
      </button>
    `;
  }).join('');
}

async function assignSecurityRole(roleId, button) {
  const principal = state.roleAssignmentPrincipal;
  if (!principal) {
    throw new Error('Select a user or team first.');
  }
  await withBusy(button, async () => {
    const result = await api('/api/role-assignments', {
      method: 'POST',
      body: {
        principalType: principal.type,
        principalId: principal.id,
        roleId,
      },
    });
    toast(`Assigned ${result.roleName || 'role'} to ${result.principalName || 'principal'}.`);
    closeRoleAssignmentModal();
  }, 'Assigning');
}

function selectTeam(teamId) {
  state.selectedTeamId = teamId;
  renderTeams();
  renderTeamMembersPanel();
}

function renderTeamMembersPanel() {
  const team = state.teams.find((item) => item.teamid === state.selectedTeamId);
  if (!team) {
    el.teamMembersPanel.innerHTML = '<p class="muted">Select a team to add users from the currently loaded results.</p>';
    return;
  }
  const availableUsers = state.users.filter((user) => !user.isdisabled);
  el.teamMembersPanel.innerHTML = `
    <h4>Add users to ${escapeHtml(team.name || 'team')}</h4>
    <label>
      Loaded users in current results
      <select id="teamMemberUserSelect" multiple size="6">
        ${availableUsers.map((user) => `
          <option value="${escapeAttr(user.systemuserid)}">
            ${escapeHtml(user.fullname || user.internalemailaddress || user.domainname || user.systemuserid)}
          </option>
        `).join('')}
      </select>
    </label>
    <div class="actions">
      <button type="button" data-team-action="add-members">Add selected users</button>
    </div>
  `;
}

async function handleTeamAction(action, button) {
  if (action !== 'add-members') {
    return;
  }
  if (!state.selectedTeamId) {
    throw new Error('Select a team first.');
  }
  await withBusy(button, async () => {
    const select = document.querySelector('#teamMemberUserSelect');
    const userIds = [...(select?.selectedOptions || [])].map((option) => option.value);
    const result = await api(`/api/teams/${encodeURIComponent(state.selectedTeamId)}/members`, {
      method: 'POST',
      body: { userIds },
    });
    toast(`Added ${result.added} user${result.added === 1 ? '' : 's'} to team.`);
  }, 'Adding');
}

function selectRole(button) {
  document.querySelectorAll('.role-row').forEach((item) => item.classList.remove('selected'));
  button.classList.add('selected');

  el.selectedRoleId.value = button.dataset.id || '';
  el.roleNameInput.value = button.dataset.name || '';
  el.selectedRoleName.textContent = button.dataset.name || 'Selected role';
  el.roleNameInput.disabled = false;
  el.renameButton.disabled = false;
  el.downloadButton.disabled = false;
  el.downloadMiscButton.disabled = false;
  el.csvFile.disabled = false;
  el.uploadButton.disabled = false;
}

function clearRoleSelection() {
  document.querySelectorAll('.role-row').forEach((item) => item.classList.remove('selected'));
  el.selectedRoleId.value = '';
  el.selectedRoleName.textContent = 'No role selected';
  el.roleNameInput.value = '';
  el.roleNameInput.disabled = true;
  el.renameButton.disabled = true;
  el.downloadButton.disabled = true;
  el.downloadMiscButton.disabled = true;
  el.csvFile.disabled = true;
  el.csvFile.value = '';
  el.uploadButton.disabled = true;
  updateRoleFileFormatUi();
}

async function renameRole() {
  const roleId = requireSelectedRole();
  const result = await api(`/api/roles/${roleId}`, {
    method: 'PATCH',
    body: { name: el.roleNameInput.value },
  });
  toast('Role name saved.');
  await loadRoles();
  const button = findRoleRow(result.roleid);
  if (button) {
    selectRole(button);
  }
}

async function downloadRoleFile(kind) {
  const roleId = requireSelectedRole();
  const format = getRoleFileFormat();
  const path = roleDownloadPath(roleId, kind, format);
  await withBusy(kind === 'misc' ? el.downloadMiscButton : el.downloadButton, async () => {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Download failed: ${response.status}`);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ? safeFilename(match[1]) : `${safeFilename(el.roleNameInput.value)}-security-role.${format}`;
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (error) {
      toast(error.message);
      throw error;
    }
  }, `Creating ${format.toUpperCase()}`);
}

function roleDownloadPath(roleId, kind, format) {
  const suffix = format === 'xlsx' ? 'xlsx' : 'csv';
  return kind === 'misc'
    ? `/api/roles/${encodeURIComponent(roleId)}/misc-${suffix}`
    : `/api/roles/${encodeURIComponent(roleId)}/${suffix}`;
}

function filterRoles() {
  const query = el.roleSearch.value.trim().toLowerCase();
  document.querySelectorAll('.role-row').forEach((button) => {
    const text = `${button.dataset.name || ''} ${button.dataset.id || ''} ${button.dataset.businessUnit || ''}`.toLowerCase();
    button.hidden = Boolean(query && !text.includes(query));
  });
}

function findRoleRow(roleId) {
  return [...document.querySelectorAll('.role-row')]
    .find((button) => button.dataset.id === roleId) || null;
}

async function uploadRoleFile() {
  const roleId = requireSelectedRole();
  const file = el.csvFile.files?.[0];
  if (!file) {
    toast(`Choose a ${getRoleFileFormat().toUpperCase()} file first.`);
    return;
  }

  const format = getRoleFileFormat();
  const body = format === 'xlsx'
    ? { format, xlsx: await fileToBase64(file), fallbackRoleId: roleId }
    : { format, csv: await file.text(), fallbackRoleId: roleId };
  const result = await api('/api/import', {
    method: 'POST',
    body,
  });
  toast(`Applied ${result.appliedPrivileges} privilege rows to ${result.name}.`);
  await loadRoles();
}

function getRoleFileFormat() {
  return [...el.roleFileFormats].find((input) => input.checked)?.value || 'xlsx';
}

function updateRoleFileFormatUi() {
  const format = getRoleFileFormat();
  const label = format.toUpperCase();
  el.downloadButton.textContent = `Download table ${label}`;
  el.downloadMiscButton.textContent = `Download misc ${label}`;
  el.uploadLabel.textContent = `Upload edited ${label}`;
  el.filePickerText.textContent = el.csvFile.files?.[0]?.name || `Choose ${label} file`;
  el.uploadButton.textContent = `Apply ${label}`;
  el.csvFile.accept = format === 'xlsx'
    ? '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : '.csv,text/csv';
}

function handleRoleFileFormatChange() {
  el.csvFile.value = '';
  updateRoleFileFormatUi();
}

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function loadSolutions() {
  el.solutions.innerHTML = empty('Loading solutions...');
  setSolutionCount(0, 0);
  state.solutions = await api('/api/solutions');
  el.unmanagedOnly.checked = false;
  const publishers = new Map();
  for (const solution of state.solutions) {
    const id = publisherFilterKey(solution.publisher);
    const name = solution.publisher?.friendlyname || solution.publisher?.uniquename || '(No publisher)';
    if (id) {
      publishers.set(id, name);
    }
  }
  const entries = [...publishers.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  state.publisherFilterActive = true;
  state.selectedPublisherIds = defaultSelectedPublisherIds(entries);
  renderPublisherFilter();
  renderSolutions();
}

async function downloadSolutionsReport() {
  const visibleSolutions = getVisibleSolutionRows();
  if (!visibleSolutions.length) {
    throw new Error('No solutions match the current filters.');
  }

  const selectedEnvironment = getEnvironmentByName(state.selectedEnvironment.environmentName);
  const environmentReportContext = {
    displayName: selectedEnvironment?.displayName || state.selectedEnvironment.environmentName || '',
    environmentId: state.selectedEnvironment.environmentName || '',
    orgUrl: state.selectedEnvironment.orgUrl || '',
  };

  let accountHomeId = resolveRequestAccountId();
  await ensureSelectedAccountForRequest(accountHomeId);
  accountHomeId = resolveRequestAccountId(accountHomeId);
  if (!accountHomeId) {
    throw new Error('Select an account in the header, then retry.');
  }

  const response = await apiFetch('/api/solutions/report', {
    method: 'POST',
    preferAccountId: accountHomeId,
    body: {
      accountHomeId,
      environment: environmentReportContext,
      solutionIds: visibleSolutions.map((solution) => solution.solutionid),
      solutions: visibleSolutions.map((solution) => ({
        solutionid: solution.solutionid,
        friendlyname: solution.friendlyname || '',
        uniquename: solution.uniquename || '',
        publisher: {
          friendlyname: solution.publisher?.friendlyname || '',
          uniquename: solution.publisher?.uniquename || '',
        },
      })),
    },
  });

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  downloadBlob(match?.[1] || `solutions-report-${safeDownloadFilename(environmentReportContext.displayName || 'environment')}.xlsx`, blob);
  toast('Excel file downloaded.');
}

function renderPublisherFilter() {
  const publishers = new Map();
  for (const solution of state.solutions) {
    const id = publisherFilterKey(solution.publisher);
    const name = solution.publisher?.friendlyname || solution.publisher?.uniquename || '(No publisher)';
    if (id) {
      publishers.set(id, name);
    }
  }
  const entries = [...publishers.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  const availableIds = new Set(entries.map(([id]) => id));
  let selected = defaultSelectedPublisherIds(entries);
  if (state.publisherFilterActive && state.selectedPublisherIds instanceof Set) {
    selected = new Set([...state.selectedPublisherIds].filter((id) => availableIds.has(id)));
  } else {
    state.selectedPublisherIds = null;
  }
  if (state.publisherFilterActive) {
    state.selectedPublisherIds = selected;
  }
  el.publisherFilter.innerHTML = entries
    .map(([id, name]) => `
      <label class="publisher-option">
        <input type="checkbox" value="${escapeAttr(id)}"${selected.has(id) ? ' checked' : ''} />
        <span>${escapeHtml(name)}</span>
      </label>
    `)
    .join('');
  updatePublisherSummary();
}

function defaultSelectedPublisherIds(entries) {
  return new Set(entries.filter(([, name]) => !isDefaultExcludedPublisher(name)).map(([id]) => id));
}

function isDefaultExcludedPublisher(name) {
  return /microsoft|dynamics/i.test(String(name || ''));
}

function publisherFilterKey(publisher) {
  return String(
    publisher?.publisherid ||
    publisher?.uniquename ||
    publisher?.friendlyname ||
    '(No publisher)',
  ).trim();
}

function handlePublisherFilterChange() {
  state.publisherFilterActive = true;
  state.selectedPublisherIds = new Set(
    [...el.publisherFilter.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value),
  );
  renderSolutions();
}

function setPublisherSelection(selected) {
  const checkboxes = [...el.publisherFilter.querySelectorAll('input[type="checkbox"]')];
  checkboxes.forEach((input) => {
    input.checked = selected;
  });
  state.publisherFilterActive = true;
  state.selectedPublisherIds = new Set(selected ? checkboxes.map((input) => input.value) : []);
  renderSolutions();
}

function renderSolutions() {
  const filtered = getFilteredSolutions();
  setSolutionCount(filtered.length, state.solutions.length);

  el.downloadSolutionsReportButton.disabled = !filtered.length;

  if (!filtered.length) {
    el.solutions.innerHTML = empty(state.solutions.length ? 'No solutions match the filters.' : 'No solutions loaded.');
    updatePublisherSummary();
    return;
  }

  el.solutions.innerHTML = filtered.map((solution) => `
    <button class="list-item solution-row" type="button" data-id="${escapeAttr(solution.solutionid)}">
      <span class="role-name">${escapeHtml(solution.friendlyname || solution.uniquename)}</span>
      <span class="role-id">${escapeHtml(solution.uniquename || '')} | ${solution.ismanaged ? 'managed' : 'unmanaged'} | ${escapeHtml(solution.version || '')}</span>
      <span class="role-id">Publisher: ${escapeHtml(solution.publisher?.friendlyname || solution.publisher?.uniquename || '(none)')}</span>
    </button>
  `).join('');

  document.querySelectorAll('.solution-row').forEach((button) => {
    button.addEventListener('click', () => selectSolution(button.dataset.id));
  });
  updatePublisherSummary();
}

function setSolutionCount(filteredCount, totalCount) {
  if (!el.solutionCount) {
    return;
  }
  el.solutionCount.textContent = `${filteredCount} / ${totalCount}`;
}

function getVisibleSolutionRows() {
  const visibleIds = new Set([...el.solutions.querySelectorAll('.solution-row')]
    .map((button) => normalizeSolutionId(button.dataset.id))
    .filter(Boolean));
  return state.solutions.filter((solution) => visibleIds.has(normalizeSolutionId(solution.solutionid)));
}

function normalizeSolutionId(value) {
  return String(value || '').trim().replace(/[{}]/g, '').toLowerCase();
}

function getFilteredSolutions() {
  const query = el.solutionSearch.value.trim().toLowerCase();
  const publisherIds = getSelectedPublishers();
  const publisherFilterActive = state.publisherFilterActive && publisherIds instanceof Set;
  return state.solutions.filter((solution) => {
    const text = `${solution.friendlyname || ''} ${solution.uniquename || ''}`.toLowerCase();
    const uniqueName = String(solution.uniquename || '').trim().toLowerCase();
    const publisherId = publisherFilterKey(solution.publisher);
    return (!query || text.includes(query)) &&
      (!el.unmanagedOnly.checked || !solution.ismanaged) &&
      (el.includeActiveSolution.checked || uniqueName !== 'active') &&
      (el.includeDefaultSolution.checked || uniqueName !== 'default') &&
      (!publisherFilterActive || publisherIds.has(publisherId));
  });
}

function getSelectedPublishers() {
  if (state.publisherFilterActive && state.selectedPublisherIds instanceof Set) {
    return new Set(state.selectedPublisherIds);
  }
  return null;
}

function updatePublisherSummary() {
  const selected = [...el.publisherFilter.querySelectorAll('input[type="checkbox"]:checked')];
  const total = el.publisherFilter.querySelectorAll('input[type="checkbox"]').length;
  el.publisherSelectAllButton.disabled = !total || selected.length === total;
  el.publisherSelectNoneButton.disabled = !selected.length;
  if (!total || selected.length === total) {
    el.publisherDropdownButton.textContent = 'All publishers';
  } else if (!selected.length) {
    el.publisherDropdownButton.textContent = 'No publishers';
  } else if (selected.length === 1) {
    el.publisherDropdownButton.textContent = selected[0].closest('label')?.innerText.trim() || '1 publisher';
  } else {
    el.publisherDropdownButton.textContent = `${selected.length} publishers`;
  }
}

function safeDownloadFilename(value) {
  return String(value || 'environment').replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'environment';
}

function selectSolution(solutionId) {
  state.selectedSolutionId = solutionId || '';
  document.querySelectorAll('.solution-row').forEach((item) => item.classList.toggle('selected', item.dataset.id === state.selectedSolutionId));
  const solution = state.solutions.find((item) => item.solutionid === state.selectedSolutionId);
  el.selectedSolutionName.textContent = solution?.friendlyname || solution?.uniquename || 'Selected solution';
  el.selectedSolutionMeta.textContent = solution
    ? `${solution.uniquename} | ${solution.ismanaged ? 'managed' : 'unmanaged'} | ${solution.version || 'no version'}`
    : '';
  renderSolutionLink(solution);
  el.loadComponentsButton.disabled = !solution;
  el.exportSolutionButton.disabled = !solution;
  el.deploySolutionButton.disabled = !solution;
  el.solutionVersionInput.disabled = !solution;
  el.solutionVersionInput.value = solution?.version || '';
  el.exportManaged.checked = Boolean(solution?.ismanaged);
  el.solutionComponents.innerHTML = '';
  el.solutionComponentSearch.value = '';
  el.solutionComponentSearchLabel.hidden = true;
  state.solutionComponents = [];
  state.solutionTableCount = 0;
  renderSolutionTableActions();
}

async function loadSolutionComponents() {
  const solutionId = requireSelectedSolution();
  el.solutionComponents.innerHTML = empty('Loading components...');
  el.solutionComponentSearchLabel.hidden = true;
  const components = await api(`/api/solutions/${encodeURIComponent(solutionId)}/components`);
  state.solutionComponents = components || [];
  state.solutionTableCount = state.solutionComponents.filter((component) => Number(component.componenttype) === 1).length;
  renderSolutionTableActions();
  el.solutionComponentSearch.value = '';
  renderSolutionComponents();
}

function renderSolutionComponents() {
  const components = getFilteredSolutionComponents();
  el.solutionComponentSearchLabel.hidden = !state.solutionComponents.length;
  if (!state.solutionComponents.length) {
    el.solutionComponents.innerHTML = empty('No components found.');
    return;
  }

  el.solutionComponents.innerHTML = components.map((component) => `
    <div class="component-row${component.manageable ? ' manageable' : ''}">
      <span class="component-type">${escapeHtml(component.typeLabel)}</span>
      <span class="component-name">${escapeHtml(component.displayName || component.objectid)}</span>
      <span class="role-id">${escapeHtml(component.recordLogicalName || component.logicalName || component.objectid || '')}</span>
      <span class="component-actions">
        ${component.manageable ? `<button class="secondary" type="button" data-component-action="manage" data-type="${escapeAttr(component.componenttype)}" data-id="${escapeAttr(component.objectid)}">Manage</button>` : ''}
      </span>
    </div>
  `).join('') || empty('No components match the filter.');
}

function getFilteredSolutionComponents() {
  const query = el.solutionComponentSearch.value.trim().toLowerCase();
  if (!query) {
    return state.solutionComponents;
  }

  return state.solutionComponents.filter((component) => {
    const type = String(component.typeLabel || '').toLowerCase();
    const name = [
      component.displayName,
      component.objectid,
      component.logicalName,
      component.recordLogicalName,
    ].filter(Boolean).join(' ').toLowerCase();
    return type.includes(query) || name.includes(query);
  });
}

function renderSolutionTableActions() {
  if (!el.solutionTableActions) {
    return;
  }
  const hasTables = Boolean(state.selectedSolutionId && state.solutionTableCount);
  el.solutionTableActions.hidden = !hasTables;
  el.createSolutionDiagramButton.disabled = !hasTables;
  el.createSolutionTableButton.disabled = !hasTables;
  if (hasTables) {
    el.createSolutionDiagramButton.title = `${state.solutionTableCount} table${state.solutionTableCount === 1 ? '' : 's'} in this solution`;
    el.createSolutionTableButton.title = el.createSolutionDiagramButton.title;
  }
}

async function loadTables() {
  if (!state.selectedEnvironment.orgUrl) {
    throw new Error('Select an environment first.');
  }
  el.tablesList.innerHTML = empty('Loading tables...');
  clearTableSelection();
  const data = await api(`/api/tables?scope=${encodeURIComponent(getTableScope())}&includeCounts=false`);
  state.tables = data.tables || [];
  state.tablesLoaded = true;
  state.selectedTableLogicalName = '';
  state.selectedTableDetails = null;
  state.selectedTableDiagram = null;
  el.tableSummary.dataset.countMessage = '';
  renderTables();
  toast('Tables loaded.');
}

function renderTables() {
  if (!el.tablesList) {
    return;
  }
  const query = el.tableSearch.value.trim().toLowerCase();
  const filtered = state.tables.filter((table) => !query || tableSearchText(table).includes(query));
  const countMessage = el.tableSummary.dataset.countMessage || '';
  el.tableSummary.textContent = state.tables.length
    ? `${state.tables.length} ${getTableScope() === 'all' ? 'table' : 'custom table'}${state.tables.length === 1 ? '' : 's'} loaded${countMessage ? ` | ${countMessage}` : ''}`
    : '';

  if (!filtered.length) {
    el.tablesList.innerHTML = empty(state.tablesLoaded ? 'No tables match the filter.' : 'Load tables.');
    return;
  }

  el.tablesList.innerHTML = filtered.map((table) => `
      <button class="list-item table-row${table.logicalName === state.selectedTableLogicalName ? ' selected' : ''}" type="button" data-table-logical-name="${escapeAttr(table.logicalName)}">
        <span class="role-name">${escapeHtml(table.displayName || table.schemaName || table.logicalName)}</span>
        <span class="role-id">${escapeHtml(table.schemaName || '')} | ${escapeHtml(table.logicalName || '')}</span>
        <span class="role-id">${table.isCustom ? 'custom' : 'standard'} | ${escapeHtml(table.ownership || 'no ownership')}</span>
      </button>
    `).join('');
}

function tableSearchText(table) {
  return [
    table.displayName,
    table.displayCollectionName,
    table.schemaName,
    table.logicalName,
    table.entitySetName,
    table.description,
  ].filter(Boolean).join(' ').toLowerCase();
}

async function selectTable(logicalName) {
  state.selectedTableLogicalName = logicalName;
  state.selectedTableDiagram = null;
  renderTables();
  await loadSelectedTableDetails();
}

async function loadSelectedTableDetails() {
  if (!state.selectedTableLogicalName) {
    clearTableSelection();
    return;
  }
  el.columnsList.innerHTML = empty('Loading columns...');
  el.tableDiagramPanel.hidden = true;
  const details = await api(`/api/tables/${encodeURIComponent(state.selectedTableLogicalName)}?columns=${encodeURIComponent(getColumnScope())}`);
  state.selectedTableDetails = details;
  renderTableDetails();
}

function renderTableDetails() {
  const details = state.selectedTableDetails;
  const table = details?.table;
  if (!table) {
    clearTableSelection();
    return;
  }

  el.selectedTableName.textContent = table.displayName || table.schemaName || table.logicalName;
  el.selectedTableMeta.textContent = `${table.schemaName || ''} | ${table.logicalName || ''} | ${table.isCustom ? 'custom' : 'standard'}`;
  renderTableLink(table);
  el.selectedTableDescription.textContent = table.description || '';
  el.createTableDiagramButton.disabled = false;
  el.createTableDocumentButton.disabled = false;
  renderColumns(details.columns || []);
}

function renderColumns(columns) {
  if (!columns.length) {
    el.columnsList.innerHTML = empty(getColumnScope() === 'all' ? 'No columns found.' : 'No custom columns found.');
    return;
  }

  el.columnsList.innerHTML = columns.map((column) => {
    const tags = [
      column.type || 'Unknown',
      column.isCustom ? 'custom' : 'standard',
      column.requiredLevel ? `required: ${column.requiredLevel}` : '',
      column.isPrimaryName ? 'primary name' : '',
      column.isPrimaryId ? 'primary id' : '',
      column.targets?.length ? `targets: ${column.targets.join(', ')}` : '',
    ].filter(Boolean).join(' | ');
    return `
      <div class="column-row">
        <div>
          <span class="role-name">${escapeHtml(column.displayName || column.schemaName || column.logicalName)}</span>
          <span class="role-id">${escapeHtml(column.schemaName || '')} | ${escapeHtml(column.logicalName || '')}</span>
          <span class="role-id">${escapeHtml(tags)}</span>
          ${column.description ? `<span class="role-id">${escapeHtml(column.description)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function clearTableSelection() {
  if (!el.selectedTableName) {
    return;
  }
  el.selectedTableName.textContent = 'No table selected';
  el.selectedTableMeta.textContent = '';
  renderTableLink(null);
  el.selectedTableDescription.textContent = '';
  el.columnsList.innerHTML = empty('Select a table.');
  el.createTableDiagramButton.disabled = true;
  el.createTableDocumentButton.disabled = true;
  el.tableDiagramPanel.hidden = true;
  el.tableDiagramMeta.textContent = '';
  el.tableDiagramCanvas.innerHTML = '';
  el.tableDiagramSource.textContent = '';
}

async function loadTableDiagram() {
  if (!state.selectedTableLogicalName) {
    throw new Error('Select a table first.');
  }
  const diagram = await api(`/api/tables/${encodeURIComponent(state.selectedTableLogicalName)}/diagram?columns=${encodeURIComponent(getColumnScope())}`);
  state.selectedTableDiagram = diagram;
  const table = state.selectedTableDetails?.table || diagram.table || {};
  await openDiagramModal(diagram, {
    title: `${table.displayName || table.logicalName || 'Table'} Diagram`,
    filename: safeFilename(`${table.displayName || table.logicalName || 'table'}-diagram`),
  });
}

async function loadSolutionTableDiagram() {
  const solution = requireSelectedSolution();
  const diagram = await api(`/api/solutions/${encodeURIComponent(solution)}/tables/diagram`);
  const selected = getSelectedSolution();
  await openDiagramModal(diagram, {
    title: `${selected?.friendlyname || selected?.uniquename || 'Solution'} Diagram`,
    filename: safeFilename(`${selected?.uniquename || selected?.friendlyname || 'solution'}-diagram`),
  });
}

async function loadTableDocument() {
  if (!state.selectedTableLogicalName) {
    throw new Error('Select a table first.');
  }
  const document = await api(`/api/tables/${encodeURIComponent(state.selectedTableLogicalName)}/document?columns=${encodeURIComponent(getColumnScope())}`);
  openTableDocumentModal(document, {
    title: `${document.table?.displayName || document.table?.logicalName || 'Table'} Design Table`,
    meta: `${document.columns?.length || 0} column${document.columns?.length === 1 ? '' : 's'}`,
    filename: safeFilename(`${document.table?.displayName || document.table?.logicalName || 'table'}-table-design`),
  });
}

async function loadSolutionTableDocument() {
  const solution = requireSelectedSolution();
  const document = await api(`/api/solutions/${encodeURIComponent(solution)}/tables/document`);
  const selected = getSelectedSolution();
  openTableDocumentModal(document, {
    title: `${selected?.friendlyname || selected?.uniquename || 'Solution'} Design Table`,
    meta: `${document.tableCount || 0} table${document.tableCount === 1 ? '' : 's'} | ${document.columns?.length || 0} column${document.columns?.length === 1 ? '' : 's'}`,
    filename: safeFilename(`${selected?.uniquename || selected?.friendlyname || 'solution'}-table-design`),
  });
}

async function renderTableDiagram(diagram) {
  el.tableDiagramPanel.hidden = false;
  el.tableDiagramMeta.textContent = `${diagram.relationshipCount || 0} relationship${diagram.relationshipCount === 1 ? '' : 's'} | ${diagram.relatedTableCount || 0} related table${diagram.relatedTableCount === 1 ? '' : 's'}`;
  el.tableDiagramSource.textContent = diagram.mermaid || '';
  el.tableDiagramCanvas.innerHTML = '';
  if (!window.mermaid || !diagram.mermaid) {
    el.tableDiagramCanvas.innerHTML = empty('Mermaid renderer unavailable. Source is shown below.');
    return;
  }

  try {
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default',
    });
    const id = `tableDiagram${Date.now()}`;
    const { svg } = await window.mermaid.render(id, diagram.mermaid);
    el.tableDiagramCanvas.innerHTML = svg;
  } catch (error) {
    console.error(error);
    el.tableDiagramCanvas.innerHTML = empty('Diagram could not be rendered. Mermaid source is shown below.');
  }
}

async function openDiagramModal(diagram, options = {}) {
  state.activeDiagram = {
    ...diagram,
    filename: options.filename || 'dataverse-diagram',
  };
  state.diagramZoom = 1;
  el.diagramModalTitle.textContent = options.title || 'Design Diagram';
  el.diagramModalMeta.textContent = [
    `${diagram.relationshipCount || 0} relationship${diagram.relationshipCount === 1 ? '' : 's'}`,
    `${diagram.tables?.length || 0} table${diagram.tables?.length === 1 ? '' : 's'}`,
    diagram.externalDependencyCount ? `${diagram.externalDependencyCount} external dependenc${diagram.externalDependencyCount === 1 ? 'y' : 'ies'}` : '',
  ].filter(Boolean).join(' | ');
  el.diagramExternalLegend.hidden = !diagram.externalDependencyCount;
  el.diagramModalCanvas.innerHTML = empty('Rendering diagram...');
  el.diagramModal.hidden = false;
  await renderMermaidInto(el.diagramModalCanvas, diagram.mermaid || '', 'diagramModalRender');
  highlightExternalDiagramTables(el.diagramModalCanvas, diagram.externalDependencies || []);
  setDiagramZoom(1);
}

function closeDiagramModal() {
  if (!el.diagramModal) {
    return;
  }
  el.diagramModal.hidden = true;
  el.diagramModalCanvas.innerHTML = '';
}

async function renderMermaidInto(container, mermaidSource, idPrefix) {
  container.innerHTML = '';
  if (!window.mermaid || !mermaidSource) {
    container.innerHTML = empty('Mermaid renderer unavailable.');
    return;
  }
  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default',
  });
  const id = `${idPrefix}${Date.now()}`;
  const { svg } = await window.mermaid.render(id, mermaidSource);
  container.innerHTML = svg;
}

function setDiagramZoom(value) {
  state.diagramZoom = Math.max(0.35, Math.min(2.5, value));
  const svg = el.diagramModalCanvas.querySelector('svg');
  if (svg) {
    const width = Number(svg.dataset.baseWidth || 0) || svg.viewBox?.baseVal?.width || svg.getBoundingClientRect().width || 960;
    const height = Number(svg.dataset.baseHeight || 0) || svg.viewBox?.baseVal?.height || svg.getBoundingClientRect().height || 640;
    svg.dataset.baseWidth = String(width);
    svg.dataset.baseHeight = String(height);
    svg.style.width = `${Math.ceil(width * state.diagramZoom)}px`;
    svg.style.height = `${Math.ceil(height * state.diagramZoom)}px`;
    svg.style.maxWidth = 'none';
  }
  el.diagramModalCanvas.style.setProperty('--diagram-zoom', state.diagramZoom);
}

async function copyActiveMermaid() {
  const source = state.activeDiagram?.mermaid || '';
  if (!source) {
    throw new Error('Create a diagram first.');
  }
  await writeClipboard(source);
  toast('Mermaid source copied.');
}

function downloadActiveDiagramSvg() {
  const svg = getActiveDiagramSvg();
  if (!svg) {
    toast('Create a diagram first.', 'error');
    return;
  }
  const source = new XMLSerializer().serializeToString(svg);
  downloadBlob(`${state.activeDiagram?.filename || 'dataverse-diagram'}.svg`, new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
}

async function downloadActiveDiagramPng() {
  const svg = getActiveDiagramSvg();
  if (!svg) {
    throw new Error('Create a diagram first.');
  }
  const source = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    const bounds = svg.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = Math.max(1, Math.ceil(bounds.width * scale));
    canvas.height = Math.max(1, Math.ceil(bounds.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = document.documentElement.dataset.theme === 'dark' ? '#0f1720' : '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      throw new Error('PNG export failed.');
    }
    downloadBlob(`${state.activeDiagram?.filename || 'dataverse-diagram'}.png`, blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getActiveDiagramSvg() {
  return el.diagramModalCanvas.querySelector('svg');
}

function highlightExternalDiagramTables(container, externalDependencies) {
  const names = new Set((externalDependencies || []).flatMap((table) => [
    table.logicalName,
    table.schemaName,
    table.displayName,
  ].filter(Boolean).map((value) => String(value).toLowerCase())));
  if (!names.size) {
    return;
  }
  for (const group of container.querySelectorAll('g')) {
    const text = (group.textContent || '').trim().toLowerCase();
    if (!text || ![...names].some((name) => text.includes(name))) {
      continue;
    }
    group.classList.add('external-dependency-node');
  }
}

function openTableDocumentModal(document, options = {}) {
  state.activeTableDocument = {
    ...document,
    filename: options.filename || 'table-design',
  };
  el.tableDocumentTitle.textContent = options.title || 'Table Design';
  el.tableDocumentMeta.textContent = options.meta || `${document.columns?.length || 0} column${document.columns?.length === 1 ? '' : 's'}`;
  renderTableDocumentRows(document.columns || []);
  el.tableDocumentModal.hidden = false;
}

function closeTableDocumentModal() {
  if (!el.tableDocumentModal) {
    return;
  }
  el.tableDocumentModal.hidden = true;
  el.tableDocumentBody.innerHTML = '';
}

function renderTableDocumentRows(rows) {
  if (!rows.length) {
    el.tableDocumentBody.innerHTML = empty('No columns found.');
    return;
  }
  const columns = Object.hasOwn(rows[0], 'Table Display Name')
    ? ['Table Display Name', 'Display Name', 'Unique Name', 'Data Type', 'Description', 'Type']
    : ['Display Name', 'Unique Name', 'Data Type', 'Description', 'Type'];
  el.tableDocumentBody.innerHTML = `
    <table class="metadata-table">
      <thead>
        <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            ${columns.map((column) => `<td>${escapeHtml(row[column] || '')}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function exportActiveTableDocument() {
  const document = state.activeTableDocument;
  if (!document?.xlsxUrl) {
    throw new Error('Create a table first.');
  }
  await downloadFile(document.xlsxUrl, `${document.filename || 'table-design'}.xlsx`);
}

function getTableScope() {
  return [...el.tableScopes].find((input) => input.checked)?.value || 'custom';
}

function getColumnScope() {
  return [...el.columnScopes].find((input) => input.checked)?.value || 'custom';
}

async function openComponentManager(componentType, objectId) {
  if (!componentType || !objectId) {
    throw new Error('Component details are missing.');
  }
  el.componentModal.hidden = false;
  el.componentModalTitle.textContent = 'Loading component';
  el.componentModalMeta.textContent = '';
  el.componentModalBody.innerHTML = empty('Loading component actions...');
  let details;
  try {
    details = await api(`/api/components/${encodeURIComponent(componentType)}/${encodeURIComponent(objectId)}/manage`);
  } catch (error) {
    closeComponentManager();
    throw error;
  }
  state.selectedComponent = { componentType, objectId, details };
  state.componentPrincipals = [];
  renderComponentManager(details);
}

function closeComponentManager() {
  el.componentModal.hidden = true;
  state.selectedComponent = null;
  state.componentPrincipals = [];
  el.componentModalBody.innerHTML = '';
}

function renderComponentManager(details) {
  el.componentModalTitle.textContent = details.displayName || 'Component';
  el.componentModalMeta.textContent = componentKindLabel(details);
  if (details.kind === 'environmentVariable') {
    renderEnvironmentVariableManager(details);
  } else if (details.kind === 'connectionReference') {
    renderConnectionReferenceManager(details);
  } else if (details.kind === 'workflow') {
    renderWorkflowManager(details);
  } else if (['canvasApp', 'codeApp', 'bot', 'botComponent'].includes(details.kind)) {
    renderShareableComponentManager(details);
  } else {
    el.componentModalBody.innerHTML = `<div class="guide"><p>${escapeHtml(details.message || 'No supported action is available.')}</p></div>`;
  }
}

function renderEnvironmentVariableManager(details) {
  el.componentModalBody.innerHTML = `
    <div class="component-form">
      <label>
        Schema name
        <input value="${escapeAttr(details.schemaName || '')}" disabled />
      </label>
      <label>
        Current value
        <textarea id="componentEnvValue">${escapeHtml(details.valueId ? details.value : details.defaultValue || '')}</textarea>
      </label>
      <div class="component-summary">
        <span>Type: ${escapeHtml(details.type || 'string')}</span>
        <span>Source: ${escapeHtml(details.source || '')}</span>
      </div>
      ${details.defaultValue ? `<div class="guide"><p>Default: ${escapeHtml(details.defaultValue)}</p></div>` : ''}
      ${renderNotes(details.notes)}
      <div class="actions">
        <button type="button" data-modal-action="save-env-var">Save value</button>
      </div>
    </div>
  `;
}

function renderConnectionReferenceManager(details) {
  const selectedId = details.connectionId || '';
  const connections = details.connections || [];
  const options = connections.length
    ? connections.map((connection) => `
        <option value="${escapeAttr(connection.connectionId)}"${connection.connectionId === selectedId ? ' selected' : ''}>
          ${escapeHtml(connection.displayName || connection.connectionId)}
        </option>
      `).join('')
    : '<option value="">No matching connections found</option>';
  const createName = `${details.displayName || details.logicalName || 'Connection'} connection`;
  el.componentModalBody.innerHTML = `
    <div class="component-form">
      <label>
        Logical name
        <input value="${escapeAttr(details.logicalName || '')}" disabled />
      </label>
      <label>
        Connection
        <select id="componentConnectionSelect">${options}</select>
      </label>
      <div class="component-summary">
        <span>Connector: ${escapeHtml(details.connectorId || '')}</span>
        <span>Current: ${escapeHtml(details.connectionId || 'Not set')}</span>
        <span>Matching connections: ${escapeHtml(details.matchingConnectionCount ?? connections.length)} of ${escapeHtml(details.totalConnectionCount ?? connections.length)}</span>
      </div>
      <div class="role-id">Match keys: ${escapeHtml((details.connectorKeys || []).join(' | ') || 'none')}</div>
      <div class="role-id">Current connection found: ${details.currentConnectionFound ? 'yes' : 'no'}</div>
      ${connections.length ? '' : '<div class="guide"><p>No existing connections match this connection reference connector. Create a connection, then refresh or switch to the new matching connection.</p></div>'}
      <label>
        New connection name
        <input id="componentConnectionNameInput" value="${escapeAttr(createName)}" />
      </label>
      <div id="componentConnectionStatus" class="guide" hidden></div>
      ${renderNotes(details.notes)}
      <div class="actions">
        <button type="button" data-modal-action="save-connection-ref"${connections.length ? '' : ' disabled'}>Switch connection</button>
        <button class="secondary" type="button" data-modal-action="create-connection-ref">Create connection</button>
        <button class="secondary" type="button" data-modal-action="refresh-component">Refresh</button>
      </div>
    </div>
  `;
}

function renderWorkflowManager(details) {
  el.componentModalBody.innerHTML = `
    <div class="component-form">
      <div class="component-summary">
        <span>State: ${escapeHtml(details.stateLabel || '')}</span>
        <span>${details.isManual ? 'Manual trigger detected' : 'No manual trigger detected'}</span>
      </div>
      <div class="actions">
        <button type="button" data-modal-action="${details.stateCode === 1 ? 'turn-flow-off' : 'turn-flow-on'}">
          Turn ${details.stateCode === 1 ? 'off' : 'on'}
        </button>
      </div>
      ${renderSharePanel(details)}
      ${details.isManual ? renderFlowConnectionModePanel(details) : ''}
      ${renderNotes([...(details.notes || []), ...(details.unsupported || [])])}
    </div>
  `;
}

function renderShareableComponentManager(details) {
  el.componentModalBody.innerHTML = `
    <div class="component-form">
      ${renderSharePanel(details)}
      ${renderNotes(details.notes)}
    </div>
  `;
}

function renderSharePanel(details) {
  if (!details.share?.supported) {
    return '<div class="guide"><p>Sharing is not available for this component.</p></div>';
  }
  const roles = details.share.roles?.length
    ? details.share.roles
    : [
        { value: 'user', label: 'User' },
        { value: 'coowner', label: 'Co-owner' },
      ];
  return `
    <div class="share-panel">
      <h3>Share</h3>
      <div class="share-grid">
        <label>
          Role
          <select id="componentShareRole">
            ${roles.map((role) => `<option value="${escapeAttr(role.value)}">${escapeHtml(role.label)}</option>`).join('')}
          </select>
        </label>
        <label>
          Find users or teams
          <input id="componentPrincipalSearch" placeholder="Search environment users and teams" autocomplete="off" />
        </label>
      </div>
      <div id="componentPrincipalResults" class="principal-results"></div>
      <div id="componentPrincipalChips" class="principal-chips">${renderPrincipalChips()}</div>
      <div class="actions">
        <button type="button" data-modal-action="share-component">Share</button>
      </div>
    </div>
  `;
}

function renderFlowConnectionModePanel(details) {
  if (!details.connectionReferences?.length) {
    return '<div class="guide"><p>No connection references were found in the flow definition.</p></div>';
  }
  return `
    <div class="share-panel">
      <h3>Manual trigger connections</h3>
      <div class="readonly-list">
        ${details.connectionReferences.map((connection) => `
          <div class="readonly-row">
            <span class="role-name">${escapeHtml(connection.displayName || connection.logicalName)}</span>
            <span class="role-id">${escapeHtml(connection.logicalName || connection.key)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderNotes(notes = []) {
  if (!notes.length) {
    return '';
  }
  return `
    <div class="guide">
      ${notes.map((note) => `<p>${escapeHtml(note)}</p>`).join('')}
    </div>
  `;
}

function componentKindLabel(details) {
  return {
    environmentVariable: 'Environment variable',
    connectionReference: 'Connection reference',
    workflow: 'Flow',
    canvasApp: 'Canvas app',
    codeApp: 'Code app',
    bot: 'Agent',
    botComponent: 'Agent component',
  }[details.kind] || details.typeLabel || 'Component';
}

let principalSearchTimer = 0;

function handleComponentModalInput(event) {
  if (event.target.id !== 'componentPrincipalSearch') {
    return;
  }
  clearTimeout(principalSearchTimer);
  principalSearchTimer = setTimeout(() => {
    searchPrincipals(event.target.value).catch((error) => {
      toast(error.message, 'error');
      console.error(error);
    });
  }, 220);
}

async function handleComponentModalAction(action, target) {
  if (!state.selectedComponent) {
    return;
  }
  if (action === 'refresh-component') {
    await refreshComponentManager();
  } else if (action === 'save-env-var') {
    await saveComponentEnvironmentVariable(target);
  } else if (action === 'save-connection-ref') {
    await saveComponentConnectionReference(target);
  } else if (action === 'create-connection-ref') {
    await createComponentConnection(target);
  } else if (action === 'turn-flow-on' || action === 'turn-flow-off') {
    await saveComponentWorkflowState(action === 'turn-flow-on' ? 'on' : 'off', target);
  } else if (action === 'select-principal') {
    addSelectedPrincipal(target);
  } else if (action === 'remove-principal') {
    removeSelectedPrincipal(target.dataset.id || '', target.dataset.type || '');
  } else if (action === 'share-component') {
    await shareSelectedComponent(target);
  }
}

async function refreshComponentManager() {
  const { componentType, objectId } = state.selectedComponent;
  const details = await api(`/api/components/${encodeURIComponent(componentType)}/${encodeURIComponent(objectId)}/manage`);
  state.selectedComponent.details = details;
  renderComponentManager(details);
  toast('Component refreshed.');
}

async function saveComponentEnvironmentVariable(target) {
  const button = target.closest('button') || target;
  await withBusy(button, async () => {
    const value = document.querySelector('#componentEnvValue')?.value || '';
    const details = await api(`/api/environment-variables/${encodeURIComponent(state.selectedComponent.details.objectId)}/value`, {
      method: 'POST',
      body: { value },
    });
    state.selectedComponent.details = details;
    renderComponentManager(details);
    toast('Environment variable saved.');
  }, 'Saving');
}

async function saveComponentConnectionReference(target) {
  const button = target.closest('button') || target;
  await withBusy(button, async () => {
    const connectionId = document.querySelector('#componentConnectionSelect')?.value || '';
    if (!connectionId) {
      throw new Error('Choose a connection first.');
    }
    const details = await api(`/api/connection-references/${encodeURIComponent(state.selectedComponent.details.objectId)}/connection`, {
      method: 'POST',
      body: { connectionId },
    });
    state.selectedComponent.details = details;
    renderComponentManager(details);
    toast('Connection reference updated.');
  }, 'Saving');
}

async function createComponentConnection(target) {
  const button = target.closest('button') || target;
  await withBusy(button, async () => {
    setConnectionCreationStatus('Creating connection...');
    const displayName = document.querySelector('#componentConnectionNameInput')?.value || '';
    const result = await api(`/api/connection-references/${encodeURIComponent(state.selectedComponent.details.objectId)}/connections`, {
      method: 'POST',
      body: {
        displayName,
      },
    });
    const details = result.details || await api(`/api/components/${encodeURIComponent(state.selectedComponent.componentType)}/${encodeURIComponent(state.selectedComponent.objectId)}/manage`);
    state.selectedComponent.details = details;
    renderComponentManager(details);
    const createdName = result.connection?.displayName || result.connection?.name || result.connection?.id || result.requestedDisplayName || displayName || 'connection';
    const message = result.connection?.status === 'created'
      ? `Connection created: ${createdName}. Matching connections found: ${details.matchingConnectionCount ?? details.connections?.length ?? 0}.`
      : `Connection flow started for ${createdName}. Complete the browser flow, then refresh this panel.`;
    setConnectionCreationStatus(message);
    toast(result.connection?.status === 'created' ? 'Connection created.' : 'Connection flow started.');
  }, 'Creating connection');
}

function setConnectionCreationStatus(message) {
  const status = document.querySelector('#componentConnectionStatus');
  if (!status) {
    return;
  }
  status.hidden = !message;
  status.innerHTML = message ? `<p>${escapeHtml(message)}</p>` : '';
}

async function saveComponentWorkflowState(stateValue, target) {
  const button = target.closest('button') || target;
  await withBusy(button, async () => {
    const details = await api(`/api/workflows/${encodeURIComponent(state.selectedComponent.details.objectId)}/state`, {
      method: 'POST',
      body: { state: stateValue },
    });
    state.selectedComponent.details = details;
    renderComponentManager(details);
    toast(`Flow turned ${stateValue}.`);
  }, stateValue === 'on' ? 'Turning on' : 'Turning off');
}

async function searchPrincipals(query) {
  const resultsEl = document.querySelector('#componentPrincipalResults');
  if (!resultsEl) {
    return;
  }
  const value = String(query || '').trim();
  if (value.length < 2) {
    resultsEl.innerHTML = '<div class="role-id">Type at least 2 characters.</div>';
    return;
  }
  resultsEl.innerHTML = '<div class="role-id">Searching...</div>';
  const principals = await api(`/api/principals?q=${encodeURIComponent(value)}`, { quiet: true });
  if (!principals.length) {
    resultsEl.innerHTML = '<div class="role-id">No users or teams found.</div>';
    return;
  }
  resultsEl.innerHTML = principals.map((principal) => `
    <button class="principal-result" type="button" data-modal-action="select-principal" data-id="${escapeAttr(principal.id)}" data-type="${escapeAttr(principal.type)}" data-label="${escapeAttr(principal.label)}" data-detail="${escapeAttr(principal.detail || '')}">
      <span class="role-name">${escapeHtml(principal.label)}</span>
      <span class="role-id">${escapeHtml(principal.type === 'team' ? 'Team' : 'User')}${principal.detail ? ` | ${escapeHtml(principal.detail)}` : ''}</span>
    </button>
  `).join('');
}

function addSelectedPrincipal(target) {
  const id = target.dataset.id || '';
  const type = target.dataset.type || '';
  if (!id || !type || state.componentPrincipals.some((principal) => principal.id === id && principal.type === type)) {
    return;
  }
  state.componentPrincipals.push({
    id,
    type,
    label: target.dataset.label || id,
    detail: target.dataset.detail || '',
  });
  renderSelectedPrincipals();
}

function removeSelectedPrincipal(id, type) {
  state.componentPrincipals = state.componentPrincipals.filter((principal) => principal.id !== id || principal.type !== type);
  renderSelectedPrincipals();
}

function renderSelectedPrincipals() {
  const chips = document.querySelector('#componentPrincipalChips');
  if (chips) {
    chips.innerHTML = renderPrincipalChips();
  }
}

function renderPrincipalChips() {
  if (!state.componentPrincipals.length) {
    return '<span class="role-id">No users or teams selected.</span>';
  }
  return state.componentPrincipals.map((principal) => `
    <span class="principal-chip">
      ${escapeHtml(principal.label)}
      <button type="button" data-modal-action="remove-principal" data-id="${escapeAttr(principal.id)}" data-type="${escapeAttr(principal.type)}" aria-label="Remove ${escapeAttr(principal.label)}">x</button>
    </span>
  `).join('');
}

async function shareSelectedComponent(target) {
  const button = target.closest('button') || target;
  await withBusy(button, async () => {
    if (!state.componentPrincipals.length) {
      throw new Error('Choose at least one user or team.');
    }
    const role = document.querySelector('#componentShareRole')?.value || 'user';
    const { componentType, objectId } = state.selectedComponent;
    const result = await api(`/api/components/${encodeURIComponent(componentType)}/${encodeURIComponent(objectId)}/share`, {
      method: 'POST',
      body: {
        role,
        principals: state.componentPrincipals.map(({ id, type }) => ({ id, type })),
      },
    });
    toast(`Shared with ${result.shared} principal${result.shared === 1 ? '' : 's'}.`);
    state.componentPrincipals = [];
    renderSelectedPrincipals();
  }, 'Sharing');
}

async function exportSolutionZip() {
  const solutionId = requireSelectedSolution();
  const environmentDisplayName = getEnvironmentByName(state.selectedEnvironment.environmentName)?.displayName || '';
  const response = await fetch(`/api/solutions/${encodeURIComponent(solutionId)}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      environmentDisplayName,
      managed: el.exportManaged.checked,
      version: el.solutionVersionInput.value.trim(),
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = data?.error || `Export failed: ${response.status}`;
    toast(message);
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ? safeFilename(match[1]) : 'solution.zip';
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
  toast('Solution export downloaded.');
}

async function deploySolution() {
  const solutionId = requireSelectedSolution();
  const result = await api(`/api/solutions/${encodeURIComponent(solutionId)}/deploy-cache`, {
    method: 'POST',
    body: {
      managed: el.exportManaged.checked,
      version: el.solutionVersionInput.value.trim(),
    },
  });
  setImportPackage(result);
  activateTab('import');

  // The package is ready to import even when optional target preparation (for
  // example, listing Power Platform connections) is not authorized.  Switch
  // immediately so a failed mapping lookup cannot hide the cached ZIP.
  try {
    await loadImportEnvironments();
  } catch (error) {
    console.warn('Import target preparation was unavailable.', error);
    renderImportEnvironments();
    toast('Solution is ready to import. Target connection mappings could not be loaded yet.', 'warning');
  }
  toast('Solution cached for deployment.');
}

async function analyzeUploadedSolutionZip() {
  const file = el.solutionZipFile.files?.[0];
  if (!file) {
    setImportPackage(null);
    return;
  }

  const result = await api('/api/import-packages', {
    method: 'POST',
    body: {
      filename: file.name,
      zipBase64: await fileToBase64(file),
    },
  });
  setImportPackage(result);
  await maybeAutoPrepareImportTarget();
  toast('Solution ZIP analyzed.');
}

function setImportPackage(result) {
  state.importPackage = result;
  state.importTargetPrepared = null;
  renderImportPackage();
  renderImportTarget();
}

function renderImportPackage() {
  if (!state.importPackage) {
    el.importPackageSummary.innerHTML = '<p class="muted">Upload a ZIP or use Deploy from the Solutions tab.</p>';
    el.prepareImportButton.disabled = true;
    el.importSolutionButton.disabled = true;
    return;
  }

  const analysis = state.importPackage.analysis || {};
  const sourceSolutionUrl = makePowerAutomateSolutionUrl(state.importPackage.sourceEnvironmentName, state.importPackage.sourceSolutionId);
  const components = analysis.components || [];
  const componentSummary = components.length
    ? `<details class="import-components"><summary>${components.length} solution component${components.length === 1 ? '' : 's'} to update</summary><ul>${components.map((component) => `<li>${escapeHtml(component.typeName)}${component.schemaName ? `: ${escapeHtml(component.schemaName)}` : ''}</li>`).join('')}</ul></details>`
    : '<p class="muted">No root components were declared in this package manifest.</p>';
  el.importPackageSummary.innerHTML = `
    <h4>${escapeHtml(state.importPackage.filename)}</h4>
    <p>${escapeHtml(analysis.solution?.uniqueName || 'Solution package')}</p>
    ${sourceSolutionUrl ? `<p><a href="${escapeAttr(sourceSolutionUrl)}" target="_blank" rel="noopener noreferrer">Open source solution</a></p>` : ''}
    <p class="muted">${analysis.connectionReferences?.length || 0} connection reference${(analysis.connectionReferences?.length || 0) === 1 ? '' : 's'} | ${analysis.environmentVariables?.length || 0} environment variable${(analysis.environmentVariables?.length || 0) === 1 ? '' : 's'}</p>
    ${componentSummary}
  `;
  updateImportButtons();
}

async function loadImportEnvironments() {
  if (!state.environmentsLoaded) {
    await loadEnvironments();
  }
  renderImportEnvironments();
  await maybeAutoPrepareImportTarget();
}

function renderImportEnvironments() {
  const selected = el.importEnvironmentSelect.value;
  const environments = getVisibleEnvironments();
  const nextSelected = selected || (environments.length === 1 ? environments[0].name : '');
  el.importEnvironmentSelect.innerHTML = [
    `<option value="">${environments.length ? 'Select target environment' : 'No visible environments loaded'}</option>`,
    ...environments.map((environment) => `
      <option value="${escapeAttr(environment.name)}"${environment.name === nextSelected ? ' selected' : ''}>
        ${escapeHtml(environment.displayName || environment.name)}
      </option>
    `),
  ].join('');
  updateImportButtons();
}

async function prepareImportTarget(showToast = true) {
  const target = getImportTargetEnvironment();
  if (!state.importPackage || !target) {
    toast('Choose a package and target environment.', 'error');
    return;
  }

  state.importTargetPrepared = await api(`/api/import-packages/${encodeURIComponent(state.importPackage.id)}/target`, {
    method: 'POST',
    body: target,
  });
  renderImportTarget();
  if (showToast) {
    toast('Target environment prepared.');
  }
  return state.importTargetPrepared;
}

async function maybeAutoPrepareImportTarget() {
  if (!state.importPackage || state.importTargetPrepared || !getImportTargetEnvironment()) {
    return;
  }
  await prepareImportTarget();
}

function renderImportTarget() {
  const prepared = state.importTargetPrepared;
  if (!prepared) {
    el.importConnections.innerHTML = empty(state.importPackage ? 'Prepare mappings to read target connections.' : 'No solution package.');
    el.importEnvironmentVariables.innerHTML = empty(state.importPackage ? 'Prepare mappings to load target values.' : 'No solution package.');
    el.importStatus.textContent = state.importPackage && getImportTargetEnvironment()
      ? 'Prepare mappings before importing.'
      : '';
    updateImportButtons();
    return;
  }

  el.importStatus.textContent = `Target: ${prepared.target.orgUrl}`;
  renderImportConnections(prepared.connectionReferences || []);
  renderImportEnvironmentVariables(prepared.environmentVariables || []);
  updateImportButtons();
}

function renderImportConnections(connectionReferences) {
  if (!connectionReferences.length) {
    el.importConnections.innerHTML = empty('No connection references found.');
    return;
  }

  el.importConnections.innerHTML = connectionReferences.map((reference) => {
    const options = reference.matches?.length
      ? reference.matches.map((connection) => `
          <option value="${escapeAttr(connection.connectionId)}"${connection.connectionId === reference.selectedConnectionId ? ' selected' : ''}>
            ${escapeHtml(connection.displayName || connection.connectionId)}
          </option>
        `).join('')
      : '<option value="">No matching connection found</option>';
    const displayName = reference.displayName || reference.logicalName || connectorNameFromId(reference.connectorId) || 'Connection';
    return `
      <div class="import-row" data-logical-name="${escapeAttr(reference.logicalName)}" data-connector-id="${escapeAttr(reference.connectorId)}" data-display-name="${escapeAttr(displayName)}">
        <div>
          <strong>${escapeHtml(reference.displayName || reference.logicalName)}</strong>
          <span class="role-id">${escapeHtml(reference.connectorId)}</span>
        </div>
        <div class="import-connection-controls">
          <select class="import-connection-select">${options}</select>
          <button class="icon-button secondary" type="button" data-import-action="refresh-connections" title="Refresh connections" aria-label="Refresh connections">
            <svg class="refresh-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M21 12a9 9 0 0 0-15.74-6.26L3 8"></path>
              <path d="M3 3v5h5"></path>
              <path d="M3 12a9 9 0 0 0 15.74 6.26L21 16"></path>
              <path d="M16 16h5v5"></path>
            </svg>
          </button>
          <button class="secondary" type="button" data-import-action="create-connection"${reference.connectorId ? '' : ' disabled'}>Create connection</button>
        </div>
      </div>
    `;
  }).join('');
}

async function createImportConnection(button) {
  const target = getImportTargetEnvironment();
  const row = button.closest('.import-row');
  if (!state.importPackage || !state.importTargetPrepared || !target || !row) {
    toast('Prepare the import first.', 'error');
    return;
  }

  const settings = {
    connectionReferences: collectImportSettingsConnectionReferences(),
    environmentVariables: collectImportSettingsEnvironmentVariables(),
  };
  const displayName = `${row.dataset.displayName || row.dataset.logicalName || 'Connection'} connection`;
  const result = await api(`/api/import-packages/${encodeURIComponent(state.importPackage.id)}/connections`, {
    method: 'POST',
    body: {
      target,
      logicalName: row.dataset.logicalName || '',
      connectorId: row.dataset.connectorId || '',
      displayName,
    },
  });

  const createdName = result.connection?.displayName || result.connection?.name || result.connection?.id || result.requestedDisplayName || displayName;
  const createdConnectionId = result.connection?.id || result.connection?.name || result.connection?.connectionId || result.connection?.connectionName || '';
  const found = result.connection?.status === 'created'
    ? await refreshImportMappingsUntilConnection(row.dataset.logicalName || '', createdConnectionId, settings)
    : false;
  toast(result.connection?.status === 'created'
    ? found
      ? `Connection created and selected: ${createdName}.`
      : `Connection created: ${createdName}. Refresh connections if it does not appear yet.`
    : `Connection flow started for ${createdName}. Complete it, then refresh connections.`);
}

async function refreshImportConnectionRow(button) {
  const row = button.closest('.import-row');
  if (!row) {
    return;
  }
  if (!state.importPackage || !state.importTargetPrepared || !getImportTargetEnvironment()) {
    toast('Prepare the import first.', 'error');
    return;
  }
  const settings = {
    connectionReferences: collectImportSettingsConnectionReferences(),
    environmentVariables: collectImportSettingsEnvironmentVariables(),
  };
  await prepareImportTarget(false);
  applyImportSettings(settings);
  toast('Connections refreshed.');
}

async function refreshImportMappingsUntilConnection(logicalName, connectionId, settings) {
  const attempts = connectionId ? 6 : 1;
  for (let index = 0; index < attempts; index += 1) {
    await prepareImportTarget(false);
    applyImportSettings(settings);
    if (selectImportConnection(logicalName, connectionId)) {
      return true;
    }
    if (index < attempts - 1) {
      await delay(1500);
    }
  }
  return false;
}

function selectImportConnection(logicalName, connectionId) {
  const row = [...el.importConnections.querySelectorAll('.import-row')]
    .find((item) => (item.dataset.logicalName || '') === logicalName);
  const select = row?.querySelector('.import-connection-select');
  const wanted = normalizeConnectionValue(connectionId);
  if (!select || !wanted) {
    return false;
  }
  const option = [...select.options].find((item) => {
    const candidate = normalizeConnectionValue(item.value);
    return candidate && (candidate.includes(wanted) || wanted.includes(candidate));
  });
  if (!option) {
    return false;
  }
  select.value = option.value;
  return true;
}

function normalizeConnectionValue(value) {
  return String(value || '').trim().toLowerCase();
}

function renderImportEnvironmentVariables(environmentVariables) {
  if (!environmentVariables.length) {
    el.importEnvironmentVariables.innerHTML = empty('No environment variables found.');
    return;
  }

  el.importEnvironmentVariables.innerHTML = environmentVariables.map((variable) => {
    const input = variable.type === 'boolean'
      ? `<select class="import-env-value"><option value="true"${String(variable.value).toLowerCase() === 'true' ? ' selected' : ''}>true</option><option value="false"${String(variable.value).toLowerCase() === 'false' ? ' selected' : ''}>false</option></select>`
      : variable.type === 'json'
        ? `<textarea class="import-env-value">${escapeHtml(variable.value || '')}</textarea>`
        : `<input class="import-env-value" type="${variable.type === 'number' ? 'number' : 'text'}" value="${escapeAttr(variable.value || '')}" />`;
    return `
      <label class="import-row" data-schema-name="${escapeAttr(variable.schemaName)}" data-type="${escapeAttr(variable.type)}">
        <span>
          <strong>${escapeHtml(variable.displayName || variable.schemaName)}</strong>
          <span class="role-id">${escapeHtml(variable.schemaName)} | ${escapeHtml(variable.type)}</span>
        </span>
        ${input}
      </label>
    `;
  }).join('');
}

async function importSolutionToTarget() {
  const target = getImportTargetEnvironment();
  if (!state.importPackage || !state.importTargetPrepared || !target) {
    toast('Prepare the import first.');
    return;
  }

  const result = await api(`/api/import-packages/${encodeURIComponent(state.importPackage.id)}/import`, {
    method: 'POST',
    body: {
      target,
      overwriteUnmanagedCustomizations: el.importOverwrite.checked,
      publishWorkflows: el.importPublishWorkflows.checked,
      connectionReferences: collectImportConnectionMappings(),
      environmentVariables: collectImportEnvironmentVariableValues(),
    },
  });
  const targetSolutionUrl = makePowerAutomateSolutionUrl(target.environmentName, result.targetSolutionId);
  el.importStatus.innerHTML = [
    `Import submitted. Job ID: ${escapeHtml(result.importJobId)}`,
    targetSolutionUrl ? `<a href="${escapeAttr(targetSolutionUrl)}" target="_blank" rel="noopener noreferrer">Open target solution</a>` : '',
  ].filter(Boolean).join(' ');
  toast('Solution import submitted.');
}

function collectImportConnectionMappings() {
  return [...el.importConnections.querySelectorAll('.import-row')].map((row) => ({
    logicalName: row.dataset.logicalName || '',
    connectorId: row.dataset.connectorId || '',
    connectionId: row.querySelector('.import-connection-select')?.value || '',
  }));
}

function collectImportEnvironmentVariableValues() {
  return [...el.importEnvironmentVariables.querySelectorAll('.import-row')].map((row) => ({
    schemaName: row.dataset.schemaName || '',
    type: row.dataset.type || 'string',
    value: row.querySelector('.import-env-value')?.value || '',
  }));
}

function downloadImportSettings() {
  if (!state.importTargetPrepared) {
    toast('Prepare mappings first.', 'error');
    return;
  }

  const settings = {
    EnvironmentVariables: collectImportSettingsEnvironmentVariables(),
    ConnectionReferences: collectImportSettingsConnectionReferences(),
  };
  const name = state.importPackage?.analysis?.solution?.uniqueName || state.importPackage?.filename || 'solution';
  downloadJsonFile(`${safeFilename(name)}-deployment-settings.json`, settings);
  toast('Import settings downloaded.');
}

async function importSettingsFile() {
  const file = el.importSettingsFile.files?.[0];
  el.importSettingsFile.value = '';
  if (!file) {
    return;
  }

  const data = JSON.parse(await file.text());
  const settings = normalizeImportSettings(data);
  const applied = applyImportSettings(settings);
  toast(`Applied ${applied} setting${applied === 1 ? '' : 's'}.`);
}

function collectImportSettingsEnvironmentVariables() {
  return collectImportEnvironmentVariableValues()
    .map((item) => ({
      SchemaName: item.schemaName,
      Value: String(item.value ?? ''),
    }));
}

function collectImportSettingsConnectionReferences() {
  return collectImportConnectionMappings()
    .filter((item) => item.connectionId)
    .map((item) => ({
      LogicalName: item.logicalName,
      ConnectionId: item.connectionId,
      ConnectorId: item.connectorId,
    }));
}

function normalizeImportSettings(data) {
  const officialEnvironmentVariables = data?.EnvironmentVariables || data?.environmentVariables;
  const officialConnectionReferences = data?.ConnectionReferences || data?.connectionReferences;
  if (Array.isArray(officialEnvironmentVariables) || Array.isArray(officialConnectionReferences)) {
    return {
      environmentVariables: (officialEnvironmentVariables || []).filter((item) => item && typeof item === 'object'),
      connectionReferences: (officialConnectionReferences || []).filter((item) => item && typeof item === 'object'),
    };
  }

  const componentParameters = Array.isArray(data)
    ? data
    : Array.isArray(data?.ComponentParameters)
      ? data.ComponentParameters
      : Array.isArray(data?.componentParameters)
        ? data.componentParameters
        : [];
  if (!componentParameters.length) {
    throw new Error('No deployment settings found in settings file.');
  }

  return {
    environmentVariables: componentParameters
      .filter((item) => item && typeof item === 'object' && (item.schemaname || item.schemaName))
      .map((item) => ({
        SchemaName: item.schemaname || item.schemaName,
        Value: item.value ?? '',
      })),
    connectionReferences: componentParameters
      .filter((item) => item && typeof item === 'object' && (item.connectionreferencelogicalname || item.logicalName))
      .map((item) => ({
        LogicalName: item.connectionreferencelogicalname || item.logicalName,
        ConnectionId: item.connectionid || item.connectionId || '',
        ConnectorId: item.connectorid || item.connectorId || '',
      })),
  };
}

function applyImportSettings(settings) {
  const connectionRows = new Map([...el.importConnections.querySelectorAll('.import-row')]
    .map((row) => [row.dataset.logicalName || '', row]));
  const variableRows = new Map([...el.importEnvironmentVariables.querySelectorAll('.import-row')]
    .map((row) => [row.dataset.schemaName || '', row]));
  let applied = 0;

  for (const reference of settings.connectionReferences || []) {
    const logicalName = reference.LogicalName || reference.logicalName || '';
    const connectionId = reference.ConnectionId || reference.connectionId || '';
    const select = connectionRows.get(logicalName)?.querySelector('.import-connection-select');
    if (select && [...select.options].some((option) => option.value === connectionId)) {
      select.value = connectionId;
      applied += 1;
    }
  }

  for (const variable of settings.environmentVariables || []) {
    const schemaName = variable.SchemaName || variable.schemaName || '';
    const input = variableRows.get(schemaName)?.querySelector('.import-env-value');
    if (input) {
      input.value = String(variable.Value ?? variable.value ?? '');
      applied += 1;
    }
  }

  return applied;
}

function downloadJsonFile(filename, data) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

async function downloadFile(path, fallbackFilename) {
  const response = await apiFetch(path);
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  downloadBlob(match?.[1] || fallbackFilename, blob);
  toast('Excel file downloaded.');
}

function getImportTargetEnvironment() {
  const name = el.importEnvironmentSelect.value;
  const environment = getVisibleEnvironments().find((item) => item.name === name);
  return environment ? {
    ...environment,
    environmentName: environment.name,
  } : null;
}

function updateImportButtons() {
  const hasPackage = Boolean(state.importPackage);
  const hasTarget = Boolean(getImportTargetEnvironment());
  el.prepareImportButton.disabled = !hasPackage || !hasTarget;
  el.refreshImportTargetButton.disabled = !hasPackage || !hasTarget;
  el.downloadImportSettingsButton.disabled = !state.importTargetPrepared;
  el.importSettingsButton.disabled = !state.importTargetPrepared;
  el.importSolutionButton.disabled = !hasPackage || !hasTarget || !state.importTargetPrepared;
  el.importSolutionButton.title = el.importSolutionButton.disabled && hasPackage && hasTarget
    ? 'Prepare mappings before importing'
    : '';
}

async function restoreLastAccount(status) {
  if (status.selectedAccountHomeId) {
    rememberLastAccount(status.selectedAccountHomeId);
    return status;
  }

  const lastAccountHomeId = localStorage.getItem(LAST_ACCOUNT_KEY) || '';
  if (!lastAccountHomeId || !(status.accounts || []).some((account) => account.homeAccountId === lastAccountHomeId)) {
    return {
      ...status,
      selectedEnvironment: {},
      environmentName: '',
      orgUrl: '',
    };
  }

  try {
    return await api('/api/account', {
      method: 'POST',
      body: { homeAccountId: lastAccountHomeId },
      quiet: true,
    });
  } catch (error) {
    console.error(error);
    forgetLastAccount();
    return {
      ...status,
      selectedEnvironment: {},
      environmentName: '',
      orgUrl: '',
      selectedAccountHomeId: '',
    };
  }
}

function rememberLastAccount(homeAccountId) {
  if (homeAccountId) {
    localStorage.setItem(LAST_ACCOUNT_KEY, homeAccountId);
  }
}

function forgetLastAccount() {
  localStorage.removeItem(LAST_ACCOUNT_KEY);
}

function hasSelectedAccount() {
  return Boolean(state.selectedAccountHomeId);
}

function rememberLastEnvironment(environment) {
  if (!state.selectedAccountHomeId || !environment?.environmentName) {
    return;
  }

  localStorage.setItem(lastEnvironmentKey(), JSON.stringify({
    environmentName: environment.environmentName,
    orgUrl: environment.orgUrl || '',
  }));
}

function forgetLastEnvironment() {
  if (state.selectedAccountHomeId) {
    localStorage.removeItem(lastEnvironmentKey());
  }
}

function findRememberedEnvironment() {
  const remembered = readJsonStorage(lastEnvironmentKey(), null);
  if (!remembered) {
    return null;
  }

  return getVisibleEnvironments().find((environment) =>
    environment.name === remembered.environmentName ||
    (remembered.orgUrl && environment.orgUrl === remembered.orgUrl)
  ) || null;
}

function lastEnvironmentKey() {
  return `${LAST_ENVIRONMENT_PREFIX}:${state.selectedAccountHomeId || 'default'}`;
}

function renderSolutionLink(solution) {
  const powerAutomateHref = solution ? makePowerAutomateSolutionUrl(state.selectedEnvironment.environmentName, solution.solutionid) : '';
  const powerAppsHref = solution ? makePowerAppsSolutionUrl(state.selectedEnvironment.environmentName, solution.solutionid) : '';
  const copilotHref = solution ? makeCopilotStudioSolutionUrl(state.selectedEnvironment.environmentName, solution.solutionid) : '';
  el.selectedSolutionPowerAutomateLink.hidden = !powerAutomateHref;
  el.selectedSolutionPowerAutomateLink.href = powerAutomateHref || '#';
  el.selectedSolutionPowerAppsLink.hidden = !powerAppsHref;
  el.selectedSolutionPowerAppsLink.href = powerAppsHref || '#';
  el.selectedSolutionCopilotLink.hidden = !copilotHref;
  el.selectedSolutionCopilotLink.href = copilotHref || '#';
}

function getSelectedSolution() {
  return state.solutions.find((item) => item.solutionid === state.selectedSolutionId) || null;
}

function makePowerAutomateSolutionUrl(environmentId, solutionId) {
  if (!environmentId || !solutionId) {
    return '';
  }
  return `https://make.powerautomate.com/environments/${encodeURIComponent(environmentId)}/solutions/${encodeURIComponent(solutionId)}`;
}

function makePowerAppsSolutionUrl(environmentId, solutionId) {
  if (!environmentId || !solutionId) {
    return '';
  }
  return `https://make.powerapps.com/environments/${encodeURIComponent(environmentId)}/solutions/${encodeURIComponent(solutionId)}`;
}

function renderTableLink(table) {
  const href = table ? makePowerAppsTableUrl(state.selectedEnvironment.environmentName, table.metadataId) : '';
  el.selectedTablePowerAppsLink.hidden = !href;
  el.selectedTablePowerAppsLink.href = href || '#';
}

function makePowerAppsTableUrl(environmentId, entityId) {
  if (!environmentId || !entityId) {
    return '';
  }
  return `https://make.powerapps.com/environments/${encodeURIComponent(environmentId)}/entities/${encodeURIComponent(entityId)}`;
}

function makeCopilotStudioSolutionUrl(environmentId, solutionId) {
  if (!environmentId || !solutionId) {
    return '';
  }
  return `https://copilotstudio.microsoft.com/environments/${encodeURIComponent(environmentId)}/solutions/${encodeURIComponent(solutionId)}`;
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function connectorNameFromId(connectorId) {
  return String(connectorId || '').split('/').filter(Boolean).pop() || '';
}

function requireSelectedSolution() {
  if (!state.selectedSolutionId) {
    throw new Error('Select a solution first.');
  }
  return state.selectedSolutionId;
}

async function api(path, options = {}) {
  const response = await apiFetch(path, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return data;
}

async function apiFetch(path, options = {}) {
  let requestAccountId = resolveRequestAccountId(options.preferAccountId || '');
  await ensureSelectedAccountForRequest(requestAccountId);
  requestAccountId = resolveRequestAccountId(requestAccountId);

  const headers = {};
  if (requestAccountId) {
    headers['X-PDAC-Account-Home-Id'] = requestAccountId;
  }
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: Object.keys(headers).length ? headers : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.ok) {
    return response;
  }

  const cloned = response.clone();
  const data = await cloned.json().catch(() => null);
  let message = cleanApiErrorMessage(data?.error || data?.message || `Request failed: ${response.status}`);
  const canRetry = options.retryAuth !== false &&
    (response.status === 401 || isAccountSelectionError(message));
  if (canRetry && await refreshAuthStateForRetry()) {
    return apiFetch(path, { ...options, retryAuth: false });
  }

  if (isAccountSelectionError(message)) {
    message = 'Select an account in the header, then retry. PDAC could not determine which signed-in account to use for this request.';
  }

  if (!options.quiet) {
    toast(message, 'error');
  }
  throw new Error(message);
}

function resolveRequestAccountId(preferredAccountId = '') {
  return preferredAccountId ||
    state.selectedAccountHomeId ||
    el.accountSelect?.value ||
    localStorage.getItem(LAST_ACCOUNT_KEY) ||
    '';
}

async function ensureSelectedAccountForRequest(preferredAccountId = '') {
  if (state.selectedAccountHomeId) {
    return true;
  }

  const accountId = resolveRequestAccountId(preferredAccountId);
  if (!accountId) {
    return false;
  }

  try {
    const response = await fetch('/api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeAccountId: accountId }),
    });
    if (!response.ok) {
      return false;
    }
    applyAuthState(await response.json());
    return state.selectedAccountHomeId === accountId;
  } catch (error) {
    console.error(error);
    return false;
  }
}

function isAccountSelectionError(message) {
  return String(message || '').toLowerCase().includes('multiple accounts found') &&
    String(message || '').toLowerCase().includes('select an account in the header first');
}

async function refreshAuthStateForRetry() {
  try {
    const accountId = resolveRequestAccountId();
    if (!accountId) {
      return false;
    }
    return ensureSelectedAccountForRequest(accountId);
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function withBusy(button, task, busyText = '') {
  const isButton = button.tagName === 'BUTTON';
  const text = isButton ? button.textContent : '';
  button.disabled = true;
  if (isButton && busyText) {
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${escapeHtml(busyText)}</span>`;
  }
  try {
    await task();
  } catch (error) {
    console.error(error);
  } finally {
    button.disabled = false;
    if (isButton) {
      button.textContent = text;
    }
  }
}

async function withImportButtonBusy(button, task, busyHtml = '') {
  const html = button.innerHTML;
  button.disabled = true;
  if (busyHtml) {
    button.innerHTML = busyHtml;
  }
  try {
    await task();
  } catch (error) {
    console.error(error);
  } finally {
    button.disabled = false;
    button.innerHTML = html;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireSelectedRole() {
  if (!el.selectedRoleId.value) {
    throw new Error('Select a role first.');
  }
  return el.selectedRoleId.value;
}

function empty(text) {
  return `<div class="list-item"><span class="role-id">${escapeHtml(text)}</span></div>`;
}

function initTheme() {
  const saved = localStorage.getItem('securityRolesTheme') || 'light';
  document.documentElement.dataset.theme = saved;
  el.themeButton.textContent = saved === 'dark' ? 'Light mode' : 'Dark mode';
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('securityRolesTheme', next);
  el.themeButton.textContent = next === 'dark' ? 'Light mode' : 'Dark mode';
}

function uniqueById(roles) {
  const seen = new Set();
  return roles.filter((role) => {
    const id = String(role.roleid || '').toLowerCase();
    if (!id || seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

function toast(message, type = 'info') {
  el.toast.textContent = message;
  el.toast.classList.toggle('error', type === 'error');
  el.toast.classList.add('show');
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => el.toast.classList.remove('show'), type === 'error' ? 5000 : 3600);
}

function cleanApiErrorMessage(message) {
  const text = String(message || '').trim();
  const jsonMatch = text.match(/:\s*(\{.*\})\s*$/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      return data?.error?.message || data?.error || data?.message || text;
    } catch {
      return text;
    }
  }
  return text;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function safeFilename(value) {
  return String(value || 'security-role').replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'security-role';
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function readJsonStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    if (value === null) {
      return fallback;
    }
    return Array.isArray(fallback) && !Array.isArray(value) ? fallback : value;
  } catch {
    return fallback;
  }
}
