const state = {
  selectedTable: '',
};

const el = {
  loginButton: document.querySelector('#loginButton'),
  loadEnvironmentsButton: document.querySelector('#loadEnvironmentsButton'),
  selectEnvironmentButton: document.querySelector('#selectEnvironmentButton'),
  refreshTablesButton: document.querySelector('#refreshTablesButton'),
  createTableForm: document.querySelector('#createTableForm'),
  addColumnForm: document.querySelector('#addColumnForm'),
  createConnectionButton: document.querySelector('#createConnectionButton'),
  listConnectionsButton: document.querySelector('#listConnectionsButton'),
  environmentName: document.querySelector('#environmentName'),
  orgUrl: document.querySelector('#orgUrl'),
  environmentStatus: document.querySelector('#environmentStatus'),
  environmentList: document.querySelector('#environmentList'),
  tableList: document.querySelector('#tableList'),
  columnList: document.querySelector('#columnList'),
  columnsTitle: document.querySelector('#columnsTitle'),
  createTableStatus: document.querySelector('#createTableStatus'),
  addColumnStatus: document.querySelector('#addColumnStatus'),
  connectorId: document.querySelector('#connectorId'),
  connectionDisplayName: document.querySelector('#connectionDisplayName'),
  connectionStatus: document.querySelector('#connectionStatus'),
  connectionList: document.querySelector('#connectionList'),
  toast: document.querySelector('#toast'),
};

el.loginButton.addEventListener('click', () => withBusy(el.loginButton, async () => {
  const result = await api('/api/login', { method: 'POST', body: { resource: 'https://service.powerapps.com/' } });
  toast(`Signed in. Tenant: ${result.tenantId || 'unknown'}`);
}));

el.loadEnvironmentsButton.addEventListener('click', () => withBusy(el.loadEnvironmentsButton, loadEnvironments));
el.selectEnvironmentButton.addEventListener('click', () => withBusy(el.selectEnvironmentButton, selectEnvironment));
el.refreshTablesButton.addEventListener('click', () => withBusy(el.refreshTablesButton, loadTables));
el.createTableForm.addEventListener('submit', submitCreateTable);
el.addColumnForm.addEventListener('submit', submitAddColumn);
el.createConnectionButton.addEventListener('click', () => withBusy(el.createConnectionButton, createConnection));
el.listConnectionsButton.addEventListener('click', () => withBusy(el.listConnectionsButton, listConnections));

await loadStatus();

async function loadStatus() {
  const status = await api('/api/status');
  if (status.selectedEnvironment?.environmentName) {
    el.environmentName.value = status.selectedEnvironment.environmentName;
  }
  if (status.selectedEnvironment?.orgUrl) {
    el.orgUrl.value = status.selectedEnvironment.orgUrl;
  }
  el.environmentStatus.textContent = status.selectedEnvironment?.environmentName
    ? `Selected ${status.selectedEnvironment.environmentName}`
    : `Region: ${status.region}`;
}

async function loadEnvironments() {
  el.environmentList.innerHTML = itemSkeleton('Loading environments...');
  const data = await api('/api/environments');
  const environments = data.value || [];
  if (!environments.length) {
    el.environmentList.innerHTML = empty('No environments returned. You can enter one manually.');
    return;
  }

  el.environmentList.innerHTML = environments.map((env) => `
    <button class="item actionable env-option" type="button" data-name="${escapeAttr(env.name)}" data-url="${escapeAttr(env.orgUrl || '')}">
      <span class="item-title">${escapeHtml(env.displayName || env.name)}</span>
      <span class="item-meta">${escapeHtml(env.name)}</span>
      <span class="item-meta">${escapeHtml(env.orgUrl || 'No Dataverse org URL found in response')}</span>
    </button>
  `).join('');

  document.querySelectorAll('.env-option').forEach((button) => {
    button.addEventListener('click', () => {
      el.environmentName.value = button.dataset.name || '';
      el.orgUrl.value = button.dataset.url || '';
    });
  });
}

async function selectEnvironment() {
  const selected = await api('/api/environment', {
    method: 'POST',
    body: {
      environmentName: el.environmentName.value,
      orgUrl: el.orgUrl.value,
    },
  });
  el.environmentStatus.textContent = `Selected ${selected.environmentName}`;
  toast('Environment selected.');
  await loadTables();
}

async function loadTables() {
  el.tableList.innerHTML = itemSkeleton('Loading tables...');
  el.columnList.innerHTML = '';
  const data = await api('/api/tables');
  const tables = sortByLogicalName(data.value || []);
  if (!tables.length) {
    el.tableList.innerHTML = empty('No tables found.');
    return;
  }

  el.tableList.innerHTML = tables.map((table) => {
    const title = table.DisplayName?.UserLocalizedLabel?.Label || table.LogicalName;
    return `
      <button class="item actionable table-option" type="button" data-name="${escapeAttr(table.LogicalName)}">
        <span class="item-title">${escapeHtml(title)}</span>
        <span class="item-meta">${escapeHtml(table.LogicalName)} | ${escapeHtml(table.EntitySetName || '')}</span>
      </button>
    `;
  }).join('');

  document.querySelectorAll('.table-option').forEach((button) => {
    button.addEventListener('click', async () => {
      document.querySelectorAll('.table-option').forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
      state.selectedTable = button.dataset.name || '';
      el.addColumnForm.elements.tableName.value = state.selectedTable;
      await loadColumns(state.selectedTable);
    });
  });
}

async function loadColumns(tableName) {
  el.columnsTitle.textContent = `Columns: ${tableName}`;
  el.columnList.innerHTML = itemSkeleton('Loading columns...');
  const data = await api(`/api/tables/${encodeURIComponent(tableName)}/columns`);
  const columns = sortByLogicalName(data.value || []);
  if (!columns.length) {
    el.columnList.innerHTML = empty('No columns found.');
    return;
  }

  el.columnList.innerHTML = columns.map((column) => {
    const title = column.DisplayName?.UserLocalizedLabel?.Label || column.LogicalName;
    const canDelete = column.IsCustomAttribute?.Value === true;
    return `
      <div class="item">
        <div class="item-row">
          <div>
            <div class="item-title">${escapeHtml(title)}</div>
            <div class="item-meta">${escapeHtml(column.LogicalName)} | ${escapeHtml(column.AttributeType || '')}</div>
          </div>
          ${canDelete ? `<button class="danger delete-column" type="button" data-column="${escapeAttr(column.LogicalName)}">Remove</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.delete-column').forEach((button) => {
    button.addEventListener('click', async () => {
      const column = button.dataset.column;
      if (!column || !confirm(`Remove custom column ${column}?`)) {
        return;
      }
      await api(`/api/tables/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(column)}`, { method: 'DELETE' });
      toast(`Removed ${column}`);
      await loadColumns(tableName);
    });
  });
}

async function submitCreateTable(event) {
  event.preventDefault();
  await withBusy(el.createTableForm.querySelector('button'), async () => {
    el.createTableStatus.textContent = 'Creating...';
    await api('/api/tables', {
      method: 'POST',
      body: formData(event.currentTarget),
    });
    el.createTableStatus.textContent = 'Created and published.';
    event.currentTarget.reset();
    await loadTables();
  });
}

async function submitAddColumn(event) {
  event.preventDefault();
  await withBusy(el.addColumnForm.querySelector('button'), async () => {
    const data = formData(event.currentTarget);
    const tableName = data.tableName;
    delete data.tableName;
    el.addColumnStatus.textContent = 'Adding...';
    await api(`/api/tables/${encodeURIComponent(tableName)}/columns`, {
      method: 'POST',
      body: data,
    });
    el.addColumnStatus.textContent = 'Added and published.';
    if (state.selectedTable === tableName) {
      await loadColumns(tableName);
    }
  });
}

async function createConnection() {
  el.connectionStatus.textContent = 'Creating connection...';
  const result = await api('/api/connections', {
    method: 'POST',
    body: {
      connectorId: el.connectorId.value,
      displayName: el.connectionDisplayName.value || undefined,
    },
  });
  el.connectionStatus.textContent = `Created ${result.name || result.id || 'connection'}`;
  await listConnections();
}

async function listConnections() {
  el.connectionList.innerHTML = itemSkeleton('Loading connections...');
  const data = await api('/api/connections');
  const connections = Array.isArray(data) ? data : data.value || [];
  if (!connections.length) {
    el.connectionList.innerHTML = empty('No connections returned.');
    return;
  }

  el.connectionList.innerHTML = connections.map((connection) => `
    <div class="item">
      <div class="item-title">${escapeHtml(connection.properties?.displayName || connection.name || 'Connection')}</div>
      <div class="item-meta">${escapeHtml(connection.name || '')}</div>
      <div class="item-meta">${escapeHtml(connection.properties?.apiId || connection.properties?.connectionRuntimeUrl || '')}</div>
    </div>
  `).join('');
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
  const previous = button.textContent;
  button.disabled = true;
  try {
    await task();
  } catch (error) {
    console.error(error);
  } finally {
    button.disabled = false;
    button.textContent = previous;
  }
}

function formData(form) {
  return Object.fromEntries([...new FormData(form).entries()].filter(([, value]) => value !== ''));
}

function sortByLogicalName(items) {
  return [...items].sort((left, right) => String(left.LogicalName || '').localeCompare(String(right.LogicalName || '')));
}

function itemSkeleton(text) {
  return `<div class="item"><div class="item-meta">${escapeHtml(text)}</div></div>`;
}

function empty(text) {
  return `<div class="item"><div class="item-meta">${escapeHtml(text)}</div></div>`;
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
