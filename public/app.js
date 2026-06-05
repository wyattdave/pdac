const el = {
  themeButton: document.querySelector('#themeButton'),
  accountSelect: document.querySelector('#accountSelect'),
  tabs: document.querySelectorAll('.tab'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  signInButton: document.querySelector('#signInButton'),
  signInDifferentButton: document.querySelector('#signInDifferentButton'),
  logoutButton: document.querySelector('#logoutButton'),
  loadEnvironmentsButton: document.querySelector('#loadEnvironmentsButton'),
  saveOrgButton: document.querySelector('#saveOrgButton'),
  loadRolesButton: document.querySelector('#loadRolesButton'),
  createRoleForm: document.querySelector('#createRoleForm'),
  renameButton: document.querySelector('#renameButton'),
  downloadButton: document.querySelector('#downloadButton'),
  downloadMiscButton: document.querySelector('#downloadMiscButton'),
  uploadButton: document.querySelector('#uploadButton'),
  csvFile: document.querySelector('#csvFile'),
  filePickerText: document.querySelector('#filePickerText'),
  environmentName: document.querySelector('#environmentName'),
  orgUrl: document.querySelector('#orgUrl'),
  status: document.querySelector('#status'),
  environmentList: document.querySelector('#environmentList'),
  roles: document.querySelector('#roles'),
  roleSearch: document.querySelector('#roleSearch'),
  selectedRoleName: document.querySelector('#selectedRoleName'),
  selectedRoleId: document.querySelector('#selectedRoleId'),
  roleNameInput: document.querySelector('#roleNameInput'),
  loadSolutionsButton: document.querySelector('#loadSolutionsButton'),
  solutionSearch: document.querySelector('#solutionSearch'),
  managedOnly: document.querySelector('#managedOnly'),
  publisherDropdownButton: document.querySelector('#publisherDropdownButton'),
  publisherDropdown: document.querySelector('#publisherDropdown'),
  publisherFilter: document.querySelector('#publisherFilter'),
  solutions: document.querySelector('#solutions'),
  selectedSolutionName: document.querySelector('#selectedSolutionName'),
  selectedSolutionMeta: document.querySelector('#selectedSolutionMeta'),
  loadComponentsButton: document.querySelector('#loadComponentsButton'),
  exportSolutionButton: document.querySelector('#exportSolutionButton'),
  exportManaged: document.querySelector('#exportManaged'),
  solutionComponents: document.querySelector('#solutionComponents'),
  toast: document.querySelector('#toast'),
};

const state = {
  solutions: [],
  selectedSolutionId: '',
};

el.tabs.forEach((tab) => tab.addEventListener('click', () => activateTab(tab.dataset.tab)));
el.themeButton.addEventListener('click', toggleTheme);
el.accountSelect.addEventListener('change', () => withBusy(el.accountSelect, switchAccount));
el.signInButton.addEventListener('click', () => withBusy(el.signInButton, signIn));
el.signInDifferentButton.addEventListener('click', () => withBusy(el.signInDifferentButton, signInDifferent));
el.logoutButton.addEventListener('click', () => withBusy(el.logoutButton, logout));
el.loadEnvironmentsButton.addEventListener('click', () => withBusy(el.loadEnvironmentsButton, loadEnvironments));
el.saveOrgButton.addEventListener('click', () => withBusy(el.saveOrgButton, saveOrg));
el.loadRolesButton.addEventListener('click', () => withBusy(el.loadRolesButton, loadRoles));
el.createRoleForm.addEventListener('submit', createRole);
el.renameButton.addEventListener('click', () => withBusy(el.renameButton, renameRole));
el.downloadButton.addEventListener('click', () => downloadCsv('table'));
el.downloadMiscButton.addEventListener('click', () => downloadCsv('misc'));
el.uploadButton.addEventListener('click', () => withBusy(el.uploadButton, uploadCsv));
el.roleSearch.addEventListener('input', filterRoles);
el.csvFile.addEventListener('change', () => {
  el.filePickerText.textContent = el.csvFile.files?.[0]?.name || 'Choose CSV file';
});
el.loadSolutionsButton.addEventListener('click', () => withBusy(el.loadSolutionsButton, loadSolutions));
el.solutionSearch.addEventListener('input', renderSolutions);
el.managedOnly.addEventListener('change', renderSolutions);
el.publisherFilter.addEventListener('change', renderSolutions);
el.publisherDropdownButton.addEventListener('click', () => {
  el.publisherDropdown.hidden = !el.publisherDropdown.hidden;
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.combo')) {
    el.publisherDropdown.hidden = true;
  }
});
el.loadComponentsButton.addEventListener('click', () => withBusy(el.loadComponentsButton, loadSolutionComponents));
el.exportSolutionButton.addEventListener('click', () => withBusy(el.exportSolutionButton, exportSolutionZip));

initTheme();
await loadStatus();

async function loadStatus() {
  const status = await api('/api/status');
  renderAccounts(status.accounts || [], status.selectedAccountHomeId || '');
  if (status.orgUrl) {
    el.environmentName.value = status.environmentName || '';
    el.orgUrl.value = status.orgUrl;
    el.status.textContent = `Using ${status.orgUrl}`;
  } else {
    el.status.textContent = `Region: ${status.region}`;
  }
}

async function signIn() {
  const result = await api('/api/login', {
    method: 'POST',
    body: { orgUrl: el.orgUrl.value },
  });
  renderAccounts(result.accounts || [], result.selectedAccountHomeId || '');
  el.status.textContent = result.orgUrl
    ? `Signed in to ${result.orgUrl}`
    : `Signed in. Load environments to choose a Dataverse org URL.`;
  toast('Signed in.');
}

async function signInDifferent() {
  const result = await api('/api/login-different', {
    method: 'POST',
    body: { orgUrl: el.orgUrl.value },
  });
  renderAccounts(result.accounts || [], result.selectedAccountHomeId || '');
  el.status.textContent = result.orgUrl
    ? `Signed in to ${result.orgUrl}${result.account ? ` as ${result.account}` : ''}`
    : `Signed in${result.account ? ` as ${result.account}` : ''}. Load environments to choose a Dataverse org URL.`;
  toast('Signed in with account picker.');
}

async function logout() {
  const result = await api('/api/logout', { method: 'POST' });
  renderAccounts([], '');
  el.status.textContent = `Logged out. Removed ${result.removed} cached account${result.removed === 1 ? '' : 's'}.`;
  toast('Logged out.');
}

async function switchAccount() {
  const homeAccountId = el.accountSelect.value;
  if (!homeAccountId) {
    return;
  }
  const result = await api('/api/account', {
    method: 'POST',
    body: { homeAccountId },
  });
  renderAccounts(result.accounts || [], result.selectedAccountHomeId || homeAccountId);
  toast('Account switched.');
}

function renderAccounts(accounts, selectedAccountHomeId) {
  const selectedId = selectedAccountHomeId || (accounts.length === 1 ? accounts[0].homeAccountId : '');
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
}

function activateTab(name) {
  el.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  el.tabPanels.forEach((panel) => panel.classList.toggle('active', panel.id === `${name}Tab`));
}

async function saveOrg() {
  const result = await api('/api/org', {
    method: 'POST',
    body: {
      environmentName: el.environmentName.value,
      orgUrl: el.orgUrl.value,
    },
  });
  el.status.textContent = `Using ${result.orgUrl}`;
  toast('Org URL saved.');
}

async function loadEnvironments() {
  el.environmentList.innerHTML = empty('Loading environments...');
  const data = await api('/api/environments');
  const environments = data.value || [];
  if (!environments.length) {
    el.environmentList.innerHTML = empty('No environments returned. You can enter the org URL manually.');
    return;
  }

  el.environmentList.innerHTML = environments.map((env) => `
    <button class="list-item env-option" type="button" data-name="${escapeAttr(env.name)}" data-url="${escapeAttr(env.orgUrl || '')}">
      <span class="role-name">${escapeHtml(env.displayName || env.name)}</span>
      <span class="role-id">${escapeHtml(env.name)}</span>
      <span class="role-id">${escapeHtml(env.orgUrl || 'No Dataverse org URL in response')}</span>
    </button>
  `).join('');

  document.querySelectorAll('.env-option').forEach((button) => {
    button.addEventListener('click', () => {
      el.environmentName.value = button.dataset.name || '';
      el.orgUrl.value = button.dataset.url || '';
      toast('Environment copied into the fields.');
    });
  });
}

async function loadRoles() {
  el.roles.innerHTML = empty('Loading roles...');
  const roles = await api('/api/roles');
  if (!roles.length) {
    el.roles.innerHTML = empty('No roles found.');
    return;
  }

  const uniqueRoles = uniqueById(roles);
  el.roles.innerHTML = uniqueRoles.map((role) => {
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

async function createRole(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  await withBusy(button, async () => {
    const name = new FormData(form).get('name');
    const role = await api('/api/roles', {
      method: 'POST',
      body: { name },
    });
    form.reset();
    toast(`Created ${role.name}`);
    await loadRoles();
    const newButton = document.querySelector(`.role-row[data-id="${cssEscape(role.roleid)}"]`);
    if (newButton) {
      selectRole(newButton);
    }
  });
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

async function renameRole() {
  const roleId = requireSelectedRole();
  const result = await api(`/api/roles/${roleId}`, {
    method: 'PATCH',
    body: { name: el.roleNameInput.value },
  });
  toast('Role name saved.');
  await loadRoles();
  const button = document.querySelector(`.role-row[data-id="${cssEscape(result.roleid)}"]`);
  if (button) {
    selectRole(button);
  }
}

async function downloadCsv(kind) {
  const roleId = requireSelectedRole();
  const path = kind === 'misc'
    ? `/api/roles/${encodeURIComponent(roleId)}/misc-csv`
    : `/api/roles/${encodeURIComponent(roleId)}/csv`;
  try {
    const response = await fetch(path);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || `Download failed: ${response.status}`);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] || `${safeFilename(el.roleNameInput.value)}-security-role.csv`;
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
    console.error(error);
  }
}

function filterRoles() {
  const query = el.roleSearch.value.trim().toLowerCase();
  document.querySelectorAll('.role-row').forEach((button) => {
    const text = `${button.dataset.name || ''} ${button.dataset.id || ''} ${button.dataset.businessUnit || ''}`.toLowerCase();
    button.hidden = Boolean(query && !text.includes(query));
  });
}

async function uploadCsv() {
  const roleId = requireSelectedRole();
  const file = el.csvFile.files?.[0];
  if (!file) {
    toast('Choose a CSV file first.');
    return;
  }

  const csv = await file.text();
  const result = await api('/api/import', {
    method: 'POST',
    body: {
      csv,
      fallbackRoleId: roleId,
    },
  });
  toast(`Applied ${result.appliedPrivileges} privilege rows to ${result.name}.`);
  await loadRoles();
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
      (!el.managedOnly.checked || solution.ismanaged) &&
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
  el.loadComponentsButton.disabled = !solution;
  el.exportSolutionButton.disabled = !solution;
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
    <div class="component-row">
      <span class="component-type">${escapeHtml(component.typeLabel)}</span>
      <span class="component-name">${escapeHtml(component.displayName || component.objectid)}</span>
      <span class="role-id">${escapeHtml(component.logicalName || component.objectid || '')}</span>
    </div>
  `).join('');
}

async function exportSolutionZip() {
  const solutionId = requireSelectedSolution();
  const response = await fetch(`/api/solutions/${encodeURIComponent(solutionId)}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ managed: el.exportManaged.checked }),
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

function requireSelectedSolution() {
  if (!state.selectedSolutionId) {
    throw new Error('Select a solution first.');
  }
  return state.selectedSolutionId;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.error || `Request failed: ${response.status}`;
    toast(message);
    throw new Error(message);
  }
  return data;
}

async function withBusy(button, task) {
  const text = button.textContent;
  button.disabled = true;
  try {
    await task();
  } catch (error) {
    console.error(error);
  } finally {
    button.disabled = false;
    button.textContent = text;
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

function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('show');
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => el.toast.classList.remove('show'), 3600);
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

function cssEscape(value) {
  if (globalThis.CSS?.escape) {
    return CSS.escape(value);
  }
  return String(value).replace(/"/g, '\\"');
}

function safeFilename(value) {
  return String(value || 'security-role').replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'security-role';
}
