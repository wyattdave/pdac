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
  status: document.querySelector('#status'),
  environmentSearch: document.querySelector('#environmentSearch'),
  environmentList: document.querySelector('#environmentList'),
  roles: document.querySelector('#roles'),
  roleSearch: document.querySelector('#roleSearch'),
  selectedRoleName: document.querySelector('#selectedRoleName'),
  selectedRoleId: document.querySelector('#selectedRoleId'),
  roleNameInput: document.querySelector('#roleNameInput'),
  loadSolutionsButton: document.querySelector('#loadSolutionsButton'),
  solutionSearch: document.querySelector('#solutionSearch'),
  unmanagedOnly: document.querySelector('#unmanagedOnly'),
  publisherDropdownButton: document.querySelector('#publisherDropdownButton'),
  publisherDropdown: document.querySelector('#publisherDropdown'),
  publisherFilter: document.querySelector('#publisherFilter'),
  solutions: document.querySelector('#solutions'),
  selectedSolutionName: document.querySelector('#selectedSolutionName'),
  selectedSolutionMeta: document.querySelector('#selectedSolutionMeta'),
  selectedSolutionLink: document.querySelector('#selectedSolutionLink'),
  loadComponentsButton: document.querySelector('#loadComponentsButton'),
  exportSolutionButton: document.querySelector('#exportSolutionButton'),
  deploySolutionButton: document.querySelector('#deploySolutionButton'),
  solutionVersionInput: document.querySelector('#solutionVersionInput'),
  exportManaged: document.querySelector('#exportManaged'),
  solutionComponents: document.querySelector('#solutionComponents'),
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
  businessUnits: [],
  businessUnitsLoaded: false,
  users: [],
  teams: [],
  connections: [],
  connectionsLoaded: false,
  connectionUser: null,
  pendingConnectionDeleteId: '',
  roles: [],
  selectedTeamId: '',
  roleAssignmentPrincipal: null,
  solutions: [],
  selectedSolutionId: '',
  selectedComponent: null,
  componentPrincipals: [],
  importPackage: null,
  importTargetPrepared: null,
};

const LAST_ACCOUNT_KEY = 'pdacLastAccountHomeId';
const LAST_ENVIRONMENT_PREFIX = 'pdacLastEnvironment';

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
el.signInButton.addEventListener('click', () => withBusy(el.signInButton, signIn));
el.signInDifferentButton.addEventListener('click', () => withBusy(el.signInDifferentButton, signInDifferent));
el.logoutButton.addEventListener('click', () => withBusy(el.logoutButton, logout));
el.loadEnvironmentsButton.addEventListener('click', () => withBusy(el.loadEnvironmentsButton, loadEnvironments));
el.loadUsersTeamsButton.addEventListener('click', () => withBusy(el.loadUsersTeamsButton, loadUsersAndTeams));
el.loadConnectionsButton.addEventListener('click', () => withBusy(el.loadConnectionsButton, loadConnections));
el.toggleCreateUserButton.addEventListener('click', () => toggleUsersTeamsCreatePanel('user'));
el.toggleCreateTeamButton.addEventListener('click', () => toggleUsersTeamsCreatePanel('team'));
el.userSearch.addEventListener('input', renderUsers);
el.teamSearch.addEventListener('input', renderTeams);
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
  const button = event.target.closest('[data-principal-action="assign-role"]');
  if (button) {
    openRoleAssignmentModal(button.dataset.principalType || '', button.dataset.principalId || '');
  }
});
el.teamsList.addEventListener('click', (event) => {
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
el.roleSearch.addEventListener('input', filterRoles);
el.csvFile.addEventListener('change', () => {
  updateRoleFileFormatUi();
});
el.loadSolutionsButton.addEventListener('click', () => withBusy(el.loadSolutionsButton, loadSolutions));
el.solutionSearch.addEventListener('input', renderSolutions);
el.unmanagedOnly.addEventListener('change', renderSolutions);
el.publisherFilter.addEventListener('change', renderSolutions);
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
  if (event.key === 'Escape' && !el.connectionDeleteModal.hidden) {
    closeConnectionDeleteModal();
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
el.downloadImportSettingsButton.addEventListener('click', downloadImportSettings);
el.importSettingsButton.addEventListener('click', () => el.importSettingsFile.click());
el.importSettingsFile.addEventListener('change', () => importSettingsFile().catch((error) => {
  toast(error.message, 'error');
  console.error(error);
}));
el.importSolutionButton.addEventListener('click', () => withBusy(el.importSolutionButton, importSolutionToTarget, 'Importing solution'));

initTheme();
updateRoleFileFormatUi();
await loadStatus();

async function loadStatus() {
  const status = await api('/api/status');
  const authState = await restoreLastAccount(status);
  applyAuthState(authState);
  if (!hasSelectedAccount()) {
    clearEnvironmentOptions();
    el.status.textContent = authState.accounts?.length ? 'Select an account.' : `Region: ${authState.region}`;
    return;
  }
  await loadEnvironments({ silentAutoSelect: true });
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
}

async function logout() {
  const result = await api('/api/logout', { method: 'POST' });
  state.environments = [];
  state.environmentsLoaded = false;
  clearEnvironmentData();
  forgetLastAccount();
  applyAuthState({ accounts: [], selectedAccountHomeId: '', selectedEnvironment: {} });
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
  await loadEnvironments();
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
}

function clearEnvironmentOptions() {
  state.environments = [];
  state.environmentsLoaded = false;
  renderEnvironmentPicker();
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
  if (!normalizedQuery) {
    return environments;
  }

  return environments.filter((environment) => environmentText(environment).includes(normalizedQuery));
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

function activateTab(name) {
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
  state.users = [];
  state.teams = [];
  state.connections = [];
  state.connectionsLoaded = false;
  state.connectionUser = null;
  state.pendingConnectionDeleteId = '';
  state.roles = [];
  state.selectedTeamId = '';
  state.roleAssignmentPrincipal = null;
  renderUsers();
  renderTeams();
  renderConnections();
  closeConnectionDeleteModal();
  closeRoleAssignmentModal();
  clearRoleSelection();
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
  const [users, teams] = await Promise.all([
    api('/api/users'),
    api('/api/teams'),
  ]);
  state.users = users || [];
  state.teams = teams || [];
  renderUsers();
  renderTeams();
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

function renderUsers() {
  const query = el.userSearch.value.trim().toLowerCase();
  const users = state.users.filter((user) => {
    const text = `${user.fullname || ''} ${user.internalemailaddress || ''} ${user.domainname || ''} ${user.businessUnitName || ''}`.toLowerCase();
    return !query || text.includes(query);
  });
  if (!users.length) {
    el.usersList.innerHTML = empty(state.users.length ? 'No users match the filter.' : 'Load users and teams.');
    renderTeamMembersPanel();
    return;
  }
  el.usersList.innerHTML = users.map((user) => `
    <button class="list-item principal-row user-row" type="button" data-principal-action="assign-role" data-principal-type="systemuser" data-principal-id="${escapeAttr(user.systemuserid)}"${user.isdisabled ? ' disabled' : ''}>
      <span class="role-name">${escapeHtml(user.fullname || user.internalemailaddress || user.domainname || user.systemuserid)}</span>
      <span class="role-id">${escapeHtml(user.internalemailaddress || user.domainname || '')}</span>
      <span class="role-id">${user.isdisabled ? 'Disabled' : 'Enabled'} | ${escapeHtml(user.businessUnitName || 'No business unit')}</span>
      <span class="role-id">${escapeHtml(user.azureactivedirectoryobjectid || '')}</span>
      <span class="role-id row-action-text">${user.isdisabled ? 'Disabled users cannot receive roles' : 'Assign role'}</span>
    </button>
  `).join('');
  renderTeamMembersPanel();
}

function renderTeams() {
  const query = el.teamSearch.value.trim().toLowerCase();
  const teams = state.teams.filter((team) => {
    const text = `${team.name || ''} ${team.emailaddress || ''} ${team.teamTypeLabel || ''} ${team.businessUnitName || ''}`.toLowerCase();
    return !query || text.includes(query);
  });
  if (!teams.length) {
    el.teamsList.innerHTML = empty(state.teams.length ? 'No teams match the filter.' : 'Load users and teams.');
    return;
  }
  el.teamsList.innerHTML = teams.map((team) => {
    const canAssignRoles = Number(team.teamtype) !== 1;
    return `
    <div class="list-item team-row${team.teamid === state.selectedTeamId ? ' selected' : ''}">
      <button class="principal-row-main" type="button" data-team-select data-id="${escapeAttr(team.teamid)}">
        <span class="role-name">${escapeHtml(team.name || team.teamid)}</span>
        <span class="role-id">${escapeHtml(team.teamTypeLabel || '')}${team.emailaddress ? ` | ${escapeHtml(team.emailaddress)}` : ''}</span>
        <span class="role-id">${escapeHtml(team.businessUnitName || 'No business unit')}</span>
        <span class="role-id">${escapeHtml(team.azureactivedirectoryobjectid || '')}</span>
      </button>
      <button class="secondary row-action-button" type="button" data-principal-action="assign-role" data-principal-type="team" data-principal-id="${escapeAttr(team.teamid)}"${canAssignRoles ? '' : ' disabled'}>${canAssignRoles ? 'Assign role' : 'Access team'}</button>
    </div>
  `;
  }).join('');
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
  state.users = await api('/api/users');
  renderUsers();
}

async function refreshTeams() {
  state.teams = await api('/api/teams');
  renderTeams();
}

async function loadConnections() {
  if (!state.selectedEnvironment.environmentName) {
    throw new Error('Select an environment first.');
  }
  const data = await api('/api/connections');
  state.connections = data.connections || [];
  state.connectionUser = data.currentUser || null;
  state.connectionsLoaded = true;
  renderConnections();
  toast('Connections loaded.');
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
  el.connectionSummary.textContent = total
    ? `${total} connection${total === 1 ? '' : 's'} loaded | ${broken} broken | ${mine} owned by ${state.connectionUser?.displayName || state.connectionUser?.email || 'the selected account'}`
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
    el.teamMembersPanel.innerHTML = '<p class="muted">Select a team to add loaded environment users as members.</p>';
    return;
  }
  const availableUsers = state.users.filter((user) => !user.isdisabled);
  el.teamMembersPanel.innerHTML = `
    <h4>Add users to ${escapeHtml(team.name || 'team')}</h4>
    <label>
      Loaded users
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
      const filename = match?.[1] || `${safeFilename(el.roleNameInput.value)}-security-role.${format}`;
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
  state.solutions = await api('/api/solutions');
  renderPublisherFilter();
  renderSolutions();
}

function renderPublisherFilter() {
  const selected = getSelectedPublishers();
  const publishers = new Map();
  for (const solution of state.solutions) {
    const id = solution.publisher?.publisherid || '';
    const name = solution.publisher?.friendlyname || solution.publisher?.uniquename || '(No publisher)';
    if (id) {
      publishers.set(id, name);
    }
  }
  el.publisherFilter.innerHTML = [...publishers.entries()]
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([id, name]) => `
      <label class="publisher-option">
        <input type="checkbox" value="${escapeAttr(id)}"${selected.has(id) ? ' checked' : ''} />
        <span>${escapeHtml(name)}</span>
      </label>
    `)
    .join('');
  updatePublisherSummary();
}

function renderSolutions() {
  const query = el.solutionSearch.value.trim().toLowerCase();
  const publisherIds = getSelectedPublishers();
  const filtered = state.solutions.filter((solution) => {
    const text = `${solution.friendlyname || ''} ${solution.uniquename || ''}`.toLowerCase();
    const publisherId = solution.publisher?.publisherid || '';
    return (!query || text.includes(query)) &&
      (!el.unmanagedOnly.checked || !solution.ismanaged) &&
      (!publisherIds.size || publisherIds.has(publisherId));
  });

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

function getSelectedPublishers() {
  return new Set([...el.publisherFilter.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value));
}

function updatePublisherSummary() {
  const selected = [...el.publisherFilter.querySelectorAll('input[type="checkbox"]:checked')];
  if (!selected.length) {
    el.publisherDropdownButton.textContent = 'All publishers';
  } else if (selected.length === 1) {
    el.publisherDropdownButton.textContent = selected[0].closest('label')?.innerText.trim() || '1 publisher';
  } else {
    el.publisherDropdownButton.textContent = `${selected.length} publishers`;
  }
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
}

async function loadSolutionComponents() {
  const solutionId = requireSelectedSolution();
  el.solutionComponents.innerHTML = empty('Loading components...');
  const components = await api(`/api/solutions/${encodeURIComponent(solutionId)}/components`);
  if (!components.length) {
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
  `).join('');
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
  const response = await fetch(`/api/solutions/${encodeURIComponent(solutionId)}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
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
  const filename = match?.[1] || 'solution.zip';
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
  await loadImportEnvironments();
  activateTab('import');
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
  el.importPackageSummary.innerHTML = `
    <h4>${escapeHtml(state.importPackage.filename)}</h4>
    <p>${escapeHtml(analysis.solution?.uniqueName || 'Solution package')}</p>
    ${sourceSolutionUrl ? `<p><a href="${escapeAttr(sourceSolutionUrl)}" target="_blank" rel="noopener noreferrer">Open source solution</a></p>` : ''}
    <p class="muted">${analysis.connectionReferences?.length || 0} connection reference${(analysis.connectionReferences?.length || 0) === 1 ? '' : 's'} | ${analysis.environmentVariables?.length || 0} environment variable${(analysis.environmentVariables?.length || 0) === 1 ? '' : 's'}</p>
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

async function prepareImportTarget() {
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
  toast('Target environment prepared.');
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
    const createUrl = safeHttpsUrl(reference.createUrl);
    const link = reference.matches?.length || !createUrl ? '' : `<a href="${escapeAttr(createUrl)}" target="_blank" rel="noopener noreferrer">Create connection</a>`;
    return `
      <div class="import-row" data-logical-name="${escapeAttr(reference.logicalName)}" data-connector-id="${escapeAttr(reference.connectorId)}">
        <div>
          <strong>${escapeHtml(reference.displayName || reference.logicalName)}</strong>
          <span class="role-id">${escapeHtml(reference.connectorId)}</span>
          ${link}
        </div>
        <select class="import-connection-select">${options}</select>
      </div>
    `;
  }).join('');
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
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
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
  const href = solution ? makePowerAutomateSolutionUrl(state.selectedEnvironment.environmentName, solution.solutionid) : '';
  el.selectedSolutionLink.hidden = !href;
  el.selectedSolutionLink.href = href || '#';
}

function getSelectedSolution() {
  return state.solutions.find((item) => item.solutionid === state.selectedSolutionId) || null;
}

function makePowerAutomateSolutionUrl(environmentId, solutionId) {
  if (!environmentId || !solutionId) {
    return '';
  }
  return `https://make.powerautomate.com/environments/${encodeURIComponent(environmentId)}/solutions/${encodeURIComponent(solutionId)}/overview`;
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function requireSelectedSolution() {
  if (!state.selectedSolutionId) {
    throw new Error('Select a solution first.');
  }
  return state.selectedSolutionId;
}

async function api(path, options = {}) {
  const headers = {};
  if (state.selectedAccountHomeId) {
    headers['X-PDAC-Account-Home-Id'] = state.selectedAccountHomeId;
  }
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: Object.keys(headers).length ? headers : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = cleanApiErrorMessage(data?.error || data?.message || `Request failed: ${response.status}`);
    if (!options.quiet) {
      toast(message, 'error');
    }
    throw new Error(message);
  }
  return data;
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
  toast.timeout = setTimeout(() => el.toast.classList.remove('show'), 3600);
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
