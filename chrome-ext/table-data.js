const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function columnPreferenceKey(context, table) {
  return `pdacTableDataColumns:${context.orgUrl.replace(/\/$/, '').toLowerCase()}:${table}`;
}

export function restoreTableColumns(schema, stored) {
  if (!Array.isArray(stored)) return [...schema.defaultColumns];
  const names = new Set(schema.columns.map((column) => column.logicalName));
  const selected = [...new Set(stored.filter((name) => names.has(name)))];
  return selected.length ? selected : [...schema.defaultColumns];
}

export function createTableDataBrowser({ api, getContext, toast }) {
  const root = document.createElement('div');
  root.className = 'modal-backdrop table-data-backdrop';
  root.hidden = true;
  root.innerHTML = `
    <section class="modal table-data-modal" role="dialog" aria-modal="true" aria-labelledby="tableDataTitle" tabindex="-1">
      <header class="section-title compact-title">
        <div><h2 id="tableDataTitle">Table data</h2><p class="muted" data-meta></p></div>
        <button type="button" class="icon-button secondary" data-close aria-label="Close table data">×</button>
      </header>
      <div class="table-data-settings">
        <details data-columns-panel><summary>Show / hide columns <span data-column-count></span></summary>
          <p class="muted">Hiding columns is local and makes no API call. Saved per table and environment for the next load. Apply query to fetch newly shown columns that were not loaded. Record IDs and flow-control fields are always fetched.</p>
          <div class="actions"><button type="button" class="secondary" data-defaults>Default columns</button></div>
          <div class="table-data-columns" data-columns></div>
        </details>
        <details data-filters-panel><summary>Filter & sort at the API</summary>
          <p class="muted">All filters are combined with AND. Use raw choice numbers, true/false, GUIDs for lookups, and ISO dates (YYYY-MM-DD) or timestamps with a timezone.</p>
          <div data-filters></div>
          <button type="button" class="secondary" data-add-filter>Add filter</button>
          <div class="table-data-sort">
            <label>Sort by<select data-sort></select></label>
            <label>Direction<select data-direction><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
            <button type="button" class="secondary" data-clear-filters>Clear filters & sort</button>
          </div>
        </details>
        <div class="actions"><button type="button" data-apply>Apply query</button><button type="button" class="secondary" data-refresh>Refresh page</button><span class="muted">100 rows per page · Click a column heading to sort</span></div>
      </div>
      <form class="table-data-editor" data-editor hidden></form>
      <p class="table-data-status muted" data-status role="status" aria-live="polite"></p>
      <div class="table-data-grid" data-grid tabindex="0" aria-label="Table records"></div>
      <footer class="table-data-pagination">
        <span class="muted" data-page></span>
        <div class="actions">
          <button type="button" class="secondary" data-nav="first">First</button>
          <button type="button" class="secondary" data-nav="previous">Previous</button>
          <button type="button" class="secondary" data-nav="next">Next</button>
          <button type="button" class="secondary" data-nav="last" title="Follows 100-row continuation pages until the end; can be cancelled">Last</button>
          <button type="button" class="secondary" data-cancel hidden>Stop at this page</button>
        </div>
      </footer>
    </section>`;
  document.body.append(root);
  const $ = (selector) => root.querySelector(selector);
  let schema;
  let context;
  let rows = [];
  let columns = [];
  let options;
  let tokens = [''];
  let page = 0;
  let nextToken = '';
  let busy = false;
  let stop = false;
  let generation = 0;
  let opener;
  let edit;

  function current() {
    const active = getContext();
    return active.orgUrl === context?.orgUrl && active.accountHomeId === context?.accountHomeId;
  }

  function close() {
    const wasOpen = !root.hidden;
    generation += 1;
    stop = true;
    root.hidden = true;
    rows = [];
    $('[data-grid]').replaceChildren();
    $('[data-editor]').replaceChildren();
    if (wasOpen && opener?.isConnected && !opener.disabled) opener.focus();
  }

  function setBusy(value) {
    busy = value;
    root.querySelectorAll('button, input, select, textarea').forEach((control) => {
      if (!control.matches('[data-close], [data-cancel]')) control.disabled = value;
    });
    root.querySelectorAll('[data-nav]').forEach((button) => {
      button.disabled = value || (['first', 'previous'].includes(button.dataset.nav) ? page === 0 : !nextToken);
    });
    $('[data-refresh]').disabled = value || !options;
    $('[data-grid]').setAttribute('aria-busy', String(value));
  }

  async function run(task) {
    if (busy) return;
    const version = generation;
    setBusy(true);
    try {
      if (!current()) throw new Error('The environment or account changed. Reopen table data.');
      await task(version);
    } catch (error) {
      if (version === generation) $('[data-status]').textContent = error.message;
    } finally {
      if (version === generation) {
        $('[data-cancel]').hidden = true;
        setBusy(false);
      }
    }
  }

  function columnOptions(sortOnly = false) {
    return schema.columns.filter((column) => !sortOnly || column.sortable).map((column) => `<option value="${escape(column.logicalName)}">${escape(column.displayName)} (${escape(column.logicalName)})</option>`).join('');
  }

  function renderColumnSelection(selected) {
    $('[data-columns]').innerHTML = schema.columns.map((column) => `<label class="checkbox-label"><input type="checkbox" value="${escape(column.logicalName)}" ${selected.includes(column.logicalName) ? 'checked' : ''}><span>${escape(column.displayName)}<small>${escape(column.logicalName)} · ${escape(column.type)}</small></span></label>`).join('');
    updateColumnCount();
  }

  function selectedColumns() {
    return [...$('[data-columns]').querySelectorAll('input:checked')].map((input) => input.value);
  }

  function saveColumns() {
    try {
      localStorage.setItem(columnPreferenceKey(context, schema.logicalName), JSON.stringify(selectedColumns()));
      return true;
    } catch { return false; }
  }

  function changeColumns(event) {
    if (!selectedColumns().length) {
      if (event?.target) event.target.checked = true;
      toast('Keep at least one column visible.', 'error');
      return;
    }
    updateColumnCount();
    const saved = saveColumns();
    if (options) {
      renderRows();
      $('[data-status]').textContent = selectedColumns().some((name) => !columns.some((column) => column.logicalName === name))
        ? 'Newly shown columns were not loaded. Apply query to fetch them from Dataverse.'
        : 'Column visibility updated locally. Saved for the next load; no API call made.';
    }
    if (!saved) $('[data-status]').textContent = 'Column visibility updated locally, but preferences could not be saved in this browser.';
  }

  function updateColumnCount() {
    $('[data-column-count]').textContent = `(${$('[data-columns]').querySelectorAll('input:checked').length} / ${schema.columns.length})`;
  }

  function addFilter() {
    const row = document.createElement('div');
    row.className = 'table-data-filter';
    row.innerHTML = `<select data-filter-column aria-label="Filter column">${columnOptions()}</select><select data-filter-operator aria-label="Filter operator"><option value="eq">Equals</option><option value="ne">Does not equal</option><option value="contains">Contains</option><option value="startswith">Starts with</option><option value="endswith">Ends with</option><option value="gt">Greater than</option><option value="ge">Greater than or equal</option><option value="lt">Less than</option><option value="le">Less than or equal</option><option value="null">Is empty (null)</option><option value="notnull">Is not empty</option></select><input data-filter-value aria-label="Filter value" placeholder="Raw API value"><button type="button" class="secondary" data-remove-filter aria-label="Remove filter">Remove</button>`;
    $('[data-filters]').append(row);
  }

  async function fetchPage(index, token, queryOptions, version) {
    $('[data-status]').textContent = `Loading page ${index + 1}…`;
    const result = await api(`/api/tables/${encodeURIComponent(schema.logicalName)}/data/query`, { method: 'POST', body: { ...queryOptions, pageToken: token, ...context }, quiet: true });
    if (version !== generation || !current()) return false;
    options = queryOptions;
    rows = result.rows;
    columns = result.columns;
    page = index;
    tokens[index] = token;
    nextToken = result.nextPageToken || '';
    tokens.length = index + 1;
    if (nextToken) tokens[index + 1] = nextToken;
    $('[data-editor]').hidden = true;
    edit = null;
    renderRows();
    $('[data-status]').textContent = nextToken ? 'More records available. Filters and sorting use Dataverse; hiding columns is local.' : 'End of results.';
    return true;
  }

  async function apply(version) {
    const selected = selectedColumns();
    if (!selected.length) throw new Error('Select at least one column.');
    const queryOptions = {
      columns: selected,
      filters: [...$('[data-filters]').children].map((row) => ({ column: row.querySelector('[data-filter-column]').value, operator: row.querySelector('[data-filter-operator]').value, value: row.querySelector('[data-filter-value]').value })),
      sort: { column: $('[data-sort]').value, direction: $('[data-direction]').value },
    };
    if (await fetchPage(0, '', queryOptions, version)) {
      try { localStorage.setItem(columnPreferenceKey(context, schema.logicalName), JSON.stringify(selected)); } catch {
        $('[data-status]').textContent += ' Column preferences could not be saved in this browser.';
      }
    }
  }

  function renderRows() {
    const selected = selectedColumns();
    const visible = schema.columns.filter((column) => selected.includes(column.logicalName));
    const loaded = new Set(columns.map((column) => column.logicalName));
    const actions = ['environmentvariablevalue', 'workflow'].includes(schema.logicalName);
    $('[data-grid]').innerHTML = `<table class="metadata-table table-data-table"><thead><tr>${visible.map((column) => `<th scope="col">${column.sortable ? `<button type="button" class="secondary" data-sort-column="${escape(column.logicalName)}">${escape(column.displayName)}${options.sort.column === column.logicalName ? options.sort.direction === 'asc' ? ' ↑' : ' ↓' : ''}</button>` : escape(column.displayName)}<small>${escape(column.logicalName)}</small></th>`).join('')}${actions ? '<th scope="col">Actions</th>' : ''}</tr></thead><tbody>${rows.length ? rows.map((row, index) => `<tr>${visible.map((column) => {
      if (!loaded.has(column.logicalName)) return '<td><span class="muted">Not loaded · Apply query</span></td>';
      const raw = row[column.apiName];
      const formatted = row[`${column.apiName}@OData.Community.Display.V1.FormattedValue`];
      const value = formatted ?? raw;
      return `<td>${value == null ? '<span class="muted">null</span>' : `<span class="table-data-cell" title="${escape(raw)}">${escape(typeof value === 'object' ? JSON.stringify(value) : value)}</span>`}</td>`;
    }).join('')}${actions ? `<td>${schema.logicalName === 'environmentvariablevalue' ? `<button type="button" class="secondary" data-edit="${index}">Edit value</button>` : Number(row.category) === 5 && Number(row.type) === 1 ? `<button type="button" class="secondary" data-flow="${index}">${Number(row.statecode) === 1 ? 'Turn off' : 'Turn on'}</button>` : '<span class="muted">Read-only process</span>'}</td>` : ''}</tr>`).join('') : `<tr><td colspan="${visible.length + Number(actions)}">No records match this query.</td></tr>`}</tbody></table>`;
    $('[data-page]').textContent = `Page ${page + 1} · ${rows.length ? `${page * 100 + 1}–${page * 100 + rows.length}` : '0'} records${!nextToken ? ' · Last page' : ''}`;
  }

  async function startEdit(index, flow, version) {
    const row = rows[index];
    const id = row[schema.primaryId];
    const name = row[schema.primaryName] || id;
    const snapshot = flow ? row : await api(`/api/tables/${schema.logicalName}/data/${encodeURIComponent(id)}`, { quiet: true });
    if (version !== generation || !current()) return;
    edit = { id, etag: snapshot['@odata.etag'], action: flow ? 'state' : 'value', state: Number(row.statecode) === 1 ? 'off' : 'on' };
    $('[data-editor]').innerHTML = `<h3>${flow ? `Turn ${edit.state}` : 'Edit value'}: ${escape(name)}</h3>${flow ? '<p>This updates the flow in the selected environment.</p>' : `<label>Value<textarea data-value rows="4">${escape(snapshot.value)}</textarea></label><label class="checkbox-label"><input type="checkbox" data-null ${snapshot.value === null ? 'checked' : ''}>Set to null (not an empty string)</label>`}<div class="actions"><button type="submit">${flow ? `Confirm turn ${edit.state}` : 'Save value'}</button><button type="button" class="secondary" data-edit-cancel>Cancel</button></div>`;
    $('[data-editor]').hidden = false;
    if (!schema.optimisticConcurrency) {
      const warning = document.createElement('p');
      warning.className = 'muted';
      warning.textContent = 'This table does not support atomic version checks. PDAC rechecks the record before saving, but another update during the save cannot be detected.';
      $('[data-editor]').append(warning);
    }
    $('[data-status]').textContent = 'Review the change before saving. Your Dataverse permissions apply.';
    $('[data-editor]').scrollIntoView({ block: 'nearest' });
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-close')) return close();
    if (button.hasAttribute('data-cancel')) { stop = true; button.disabled = true; return; }
    if (busy) return;
    if (button.hasAttribute('data-add-filter')) return addFilter();
    if (button.hasAttribute('data-remove-filter')) return button.parentElement.remove();
    if (button.hasAttribute('data-defaults')) { renderColumnSelection(schema.defaultColumns); changeColumns(); return; }
    if (button.hasAttribute('data-clear-filters')) { $('[data-filters]').replaceChildren(); $('[data-sort]').value = ''; $('[data-direction]').value = 'asc'; return; }
    if (button.hasAttribute('data-edit-cancel')) { $('[data-editor]').hidden = true; edit = null; return; }
    if (button.hasAttribute('data-apply')) return void run(apply);
    if (button.hasAttribute('data-refresh')) return void run((version) => fetchPage(page, tokens[page], options, version));
    if (button.hasAttribute('data-edit') || button.hasAttribute('data-flow')) return void run((version) => startEdit(Number(button.dataset.edit ?? button.dataset.flow), button.hasAttribute('data-flow'), version));
    if (button.hasAttribute('data-sort-column')) {
      $('[data-direction]').value = options.sort.column === button.dataset.sortColumn && options.sort.direction === 'asc' ? 'desc' : 'asc';
      $('[data-sort]').value = button.dataset.sortColumn;
      return void run(apply);
    }
    if (button.dataset.nav) void run(async (version) => {
      const direction = button.dataset.nav;
      if (direction === 'first') return fetchPage(0, '', options, version);
      if (direction === 'previous') return fetchPage(page - 1, tokens[page - 1], options, version);
      if (direction === 'next') return fetchPage(page + 1, nextToken, options, version);
      stop = false;
      $('[data-cancel]').hidden = false;
      $('[data-cancel]').disabled = false;
      while (nextToken && !stop && version === generation) {
        if (!await fetchPage(page + 1, nextToken, options, version)) break;
      }
      if (version === generation && stop) $('[data-status]').textContent = 'Stopped at this page. You can continue with Next or Last.';
    });
  });
  $('[data-columns]').addEventListener('change', changeColumns);
  $('[data-editor]').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!edit) return;
    void run(async (version) => {
      const body = { ...edit, ...context };
      if (edit.action === 'value') body.value = $('[data-null]').checked ? null : $('[data-value]').value;
      await api(`/api/tables/${schema.logicalName}/data/${encodeURIComponent(edit.id)}`, { method: 'PATCH', body, quiet: true });
      if (version !== generation) return;
      toast('Change saved.');
      // Requery from the first page: edits may move or remove the record under the current sort/filter.
      await fetchPage(0, '', options, version);
    });
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      const focusable = [...root.querySelectorAll('button, input, select, textarea, [tabindex="0"], summary')].filter((node) => !node.disabled && node.getClientRects().length);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });

  async function open(table) {
    close();
    opener = document.activeElement;
    context = { ...getContext() };
    schema = null;
    options = null;
    rows = [];
    tokens = [''];
    page = 0;
    nextToken = '';
    busy = false;
    root.hidden = false;
    $('.table-data-settings').hidden = true;
    $('#tableDataTitle').textContent = `${table.displayName || table.logicalName} · Data`;
    $('[data-meta]').textContent = `${table.logicalName} · ${context.orgUrl}`;
    $('[data-filters]').replaceChildren();
    $('[data-columns]').replaceChildren();
    $('[data-editor]').hidden = true;
    $('[data-status]').textContent = 'Loading readable columns…';
    $('[data-close]').focus();
    await run(async (version) => {
      const result = await api(`/api/tables/${encodeURIComponent(table.logicalName)}/data/schema`, { quiet: true });
      if (version !== generation || !current()) return;
      schema = result;
      $('.table-data-settings').hidden = false;
      let stored;
      try { stored = JSON.parse(localStorage.getItem(columnPreferenceKey(context, schema.logicalName))); } catch { /* Storage is optional. */ }
      renderColumnSelection(restoreTableColumns(schema, stored));
      $('[data-sort]').innerHTML = `<option value="">Record ID (default)</option>${columnOptions(true)}`;
      $('[data-direction]').value = 'asc';
      await apply(version);
    });
  }

  return { open, close };
}
