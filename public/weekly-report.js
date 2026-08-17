export const WEEKLY_REPORT_RETENTION_MONTHS = 3;

export const WEEKLY_COMPONENT_TYPES = [
  { key: 'agents', label: 'Agent', plural: 'Agents', color: '#7c3aed' },
  { key: 'canvasApps', label: 'Canvas App', plural: 'Canvas Apps', color: '#db2777' },
  { key: 'codeApps', label: 'Code App', plural: 'Code Apps', color: '#be123c' },
  { key: 'modelDrivenApps', label: 'Model Driven App', plural: 'Model Driven Apps', color: '#d97706' },
  { key: 'flows', label: 'Flow', plural: 'Flows', color: '#0284c7' },
  { key: 'tables', label: 'Table', plural: 'Tables', color: '#0f766e' },
  { key: 'other', label: 'Other', plural: 'Other', color: '#64748b' },
];

export const WEEKLY_HISTORY_RANGES = {
  '2w': { label: 'Last 2 weeks', days: 14 },
  '3w': { label: 'Last 3 weeks', days: 21 },
  '1m': { label: 'Last month', months: 1 },
  '2m': { label: 'Last 2 months', months: 2 },
  '3m': { label: 'Last 3 months', months: 3 },
};

export function formatLocalDateKey(value = new Date()) {
  const date = toDate(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function parseLocalDateKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return toDate(value);
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function addCalendarDays(value, days) {
  const date = parseLocalDateKey(value);
  date.setDate(date.getDate() + Number(days || 0));
  return formatLocalDateKey(date);
}

export function startOfCalendarWeek(value = new Date()) {
  const date = isDateKey(value) ? parseLocalDateKey(value) : toDate(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return formatLocalDateKey(date);
}

export function weeklyRetentionCutoff(value = new Date()) {
  const date = toDate(value);
  date.setHours(0, 0, 0, 0);
  date.setMonth(date.getMonth() - WEEKLY_REPORT_RETENTION_MONTHS);
  return formatLocalDateKey(date);
}

export function historyDateRange(rangeKey = '3m', customStart = '', customEnd = '', today = new Date()) {
  const end = formatLocalDateKey(today);
  if (rangeKey === 'custom' && isDateKey(customStart) && isDateKey(customEnd)) {
    return customStart <= customEnd
      ? { key: rangeKey, label: `${formatDateLabel(customStart)} to ${formatDateLabel(customEnd)}`, start: customStart, end: customEnd }
      : { key: rangeKey, label: `${formatDateLabel(customEnd)} to ${formatDateLabel(customStart)}`, start: customEnd, end: customStart };
  }
  const definition = WEEKLY_HISTORY_RANGES[rangeKey] || WEEKLY_HISTORY_RANGES['3m'];
  const startDate = parseLocalDateKey(end);
  if (definition.days) {
    startDate.setDate(startDate.getDate() - definition.days + 1);
  } else {
    startDate.setMonth(startDate.getMonth() - definition.months);
  }
  return {
    key: WEEKLY_HISTORY_RANGES[rangeKey] ? rangeKey : '3m',
    label: definition.label,
    start: formatLocalDateKey(startDate),
    end,
  };
}

export function emptyWeeklyComponentCounts() {
  return {
    agents: 0,
    canvasApps: 0,
    codeApps: 0,
    modelDrivenApps: 0,
    flows: 0,
    tables: 0,
    other: 0,
  };
}

export function primaryWeeklyComponent(record = {}) {
  const counts = { ...emptyWeeklyComponentCounts(), ...(record.componentCounts || {}) };
  return WEEKLY_COMPONENT_TYPES.find((definition) => Number(counts[definition.key] || 0) > 0)?.label || 'Other';
}

export function filterWeeklyReportEvents(events = [], filters = {}) {
  const excludedPublishers = (Array.isArray(filters.excludedPublishers)
    ? filters.excludedPublishers
    : String(filters.excludedPublishers || '').split(','))
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const environmentIds = new Set((Array.isArray(filters.environmentIds)
    ? filters.environmentIds
    : filters.environmentId ? [filters.environmentId] : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean));
  return (Array.isArray(events) ? events : []).filter((event) => {
    if (!filters.includeManaged && event.isManaged) return false;
    const publisherNames = [event.publisherName, event.publisherUniqueName]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);
    if (!filters.includeMicrosoftOwned && publisherNames.some((name) => /microsoft|dynamics/i.test(name))) {
      return false;
    }
    if (excludedPublishers.some((excluded) => publisherNames.includes(excluded))) {
      return false;
    }
    if (environmentIds.size && !environmentIds.has(String(event.environmentId || '').trim())) {
      return false;
    }
    return true;
  });
}

export function buildWeeklyReportModel(events = [], options = {}) {
  const selectedWeekStart = isDateKey(options.selectedWeekStart)
    ? startOfCalendarWeek(options.selectedWeekStart)
    : startOfCalendarWeek();
  const selectedWeekEnd = addCalendarDays(selectedWeekStart, 6);
  const previousWeekStart = addCalendarDays(selectedWeekStart, -7);
  const previousWeekEnd = addCalendarDays(selectedWeekStart, -1);
  const history = options.historyRange || historyDateRange('3m');
  const normalizedEvents = (Array.isArray(events) ? events : [])
    .filter((event) => event && ['created', 'modified'].includes(event.eventType) && eventDateKey(event))
    .map((event) => ({
      ...event,
      componentCounts: { ...emptyWeeklyComponentCounts(), ...(event.componentCounts || {}) },
      components: Array.isArray(event.components) ? event.components : [],
      primaryComponent: primaryWeeklyComponent(event),
    }));
  const normalized = removeDuplicateDeploymentUpdates(normalizedEvents);

  const selected = buildPeriod(normalized, selectedWeekStart, selectedWeekEnd);
  const previous = buildPeriod(normalized, previousWeekStart, previousWeekEnd);
  const historyPeriod = buildPeriod(normalized, history.start, history.end);

  return {
    generatedAt: new Date().toISOString(),
    selectedWeek: {
      label: `Week of ${formatDateLabel(selectedWeekStart)}`,
      start: selectedWeekStart,
      end: selectedWeekEnd,
      ...selected,
      comparison: {
        labels: [`Previous week (${formatShortDateRange(previousWeekStart, previousWeekEnd)})`, `Selected week (${formatShortDateRange(selectedWeekStart, selectedWeekEnd)})`],
        deployed: [previous.deployed.length, selected.deployed.length],
        updated: [previous.updated.length, selected.updated.length],
      },
    },
    history: {
      ...history,
      ...historyPeriod,
      weeklyCounts: buildWeeklyCounts(normalized, history.start, history.end),
    },
  };
}

function removeDuplicateDeploymentUpdates(events) {
  const createdDays = new Map();
  for (const event of events) {
    if (event.eventType !== 'created') continue;
    const key = weeklySolutionIdentity(event);
    if (!createdDays.has(key)) createdDays.set(key, new Set());
    createdDays.get(key).add(eventDateKey(event));
  }
  return events.filter((event) => event.eventType !== 'modified'
    || !createdDays.get(weeklySolutionIdentity(event))?.has(eventDateKey(event)));
}

function weeklySolutionIdentity(event = {}) {
  return [
    event.accountHomeId || '',
    event.environmentId || event.environmentUrl || '',
    event.solutionId || event.solutionid || event.uniqueName || '',
  ].join(':');
}

export function buildStandaloneWeeklyReportHtml(model = {}) {
  const selectedWeek = model.selectedWeek || {};
  const history = model.history || {};
  const generated = new Date(model.generatedAt || Date.now()).toLocaleString();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PDAC Weekly Report - ${escapeHtml(selectedWeek.label || '')}</title>
<style>
:root{color-scheme:light;font-family:Inter,Segoe UI,Arial,sans-serif;color:#172033;background:#f4f7fb}
*{box-sizing:border-box}
body{margin:0;background:#f4f7fb}
main{max-width:1500px;margin:auto;padding:28px}
h1,h2,h3{margin:0 0 8px}h1{font-size:28px}h2{margin-top:30px;font-size:22px}h3{font-size:17px}
.muted{color:#64748b;margin:4px 0}
.panel{background:#fff;border:1px solid #dbe3ee;border-radius:14px;padding:20px;margin-top:16px;box-shadow:0 5px 18px rgba(15,23,42,.05)}
.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(230px,.34fr);gap:18px;align-items:stretch}
.table-panel{display:grid;gap:8px;min-width:0}.table-toolbar{display:flex;justify-content:flex-end}.change-filter{align-items:center;display:inline-flex;gap:6px;font-size:12px}.change-filter select{border:1px solid #cbd5e1;border-radius:6px;padding:5px 24px 5px 7px}.chart-stack{display:grid;gap:14px;min-width:0}
.table-wrap{border:1px solid #dbe3ee;border-radius:10px;height:0;max-height:100%;min-height:100%;min-width:0;overflow:auto}
table{border-collapse:collapse;font-size:11px;min-width:760px;table-layout:fixed;width:100%}
col.col-solution{width:34%}col.col-count{width:7.5%}col.col-event{width:21%}
th,td{text-align:left;padding:7px 5px;border-bottom:1px solid #e7edf5;vertical-align:top}
th{font-size:10px;text-transform:uppercase;letter-spacing:.02em;background:#f8fafc;color:#475569;position:sticky;top:0;z-index:2}
th.num,td.num{text-align:center;vertical-align:middle}
.sort-button{align-items:center;background:none;border:0;color:inherit;cursor:pointer;display:inline-flex;font:inherit;gap:3px;justify-content:flex-start;padding:0;text-align:left;text-transform:inherit;width:100%}.sort-button:after{content:'↕';font-size:11px;opacity:.65}th.num .sort-button{justify-content:center;text-align:center}th[aria-sort=ascending] .sort-button:after{content:'↑';opacity:1}th[aria-sort=descending] .sort-button:after{content:'↓';opacity:1}
.solution-toggle{border:0;background:none;color:#0f5ea8;font:inherit;font-weight:700;max-width:100%;min-width:0;overflow-wrap:anywhere;padding:0;cursor:pointer;text-align:left;word-break:break-word}
.solution-toggle:before{content:'▸';display:inline-block;margin-right:7px;transition:transform .15s}.solution-toggle[aria-expanded=true]:before{transform:rotate(90deg)}
.change-indicators{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.change-indicator{border:1px solid;border-radius:999px;font-size:9px;font-weight:700;letter-spacing:.04em;line-height:1;padding:3px 6px;text-transform:uppercase}.change-indicator.deployed{background:#dbeafe;border-color:#93c5fd;color:#1d4ed8}.change-indicator.updated{background:#fef3c7;border-color:#fcd34d;color:#92400e}
.solution-meta{color:#64748b;display:grid;font-size:12px;gap:3px;margin-top:7px}.solution-version-type{display:flex;flex-wrap:wrap;gap:4px 12px}
small{display:block;color:#64748b;margin-top:3px}
.component-row td{background:#f8fafc;padding:14px 20px}
.component-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px;margin:0;padding:0;list-style:none}
.component-list li{border:1px solid #dbe3ee;border-radius:8px;padding:9px;background:#fff}.component-kind{display:block;font-size:11px;text-transform:uppercase;color:#64748b}
.chart{border:1px solid #dbe3ee;border-radius:10px;padding:14px}.bar-row{display:grid;grid-template-columns:120px 1fr 36px;gap:9px;align-items:center;margin:11px 0}
.track{height:14px;border-radius:999px;background:#e8eef6;overflow:hidden}.bar{height:100%;min-width:2px;border-radius:999px}
.comparison{display:grid;grid-template-columns:155px 1fr 46px;gap:10px;align-items:center;margin:12px 0}.series{display:grid;gap:5px}.series .track{height:11px}
.legend{display:flex;gap:18px;margin:10px 0 0;font-size:13px}.dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px}
.empty{padding:24px;text-align:center;color:#64748b}.summary{display:flex;gap:20px;flex-wrap:wrap}.metric{background:#eef5ff;border-radius:10px;padding:12px 16px}.metric strong{display:block;font-size:24px}
.actions{display:flex;justify-content:flex-end;margin-bottom:10px}button.print{background:#155eef;color:white;border:0;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer}
body.printing .table-wrap{height:auto;max-height:none;min-height:0;overflow:visible}
@media screen and (max-width:900px){.grid{grid-template-columns:1fr}.table-wrap{height:460px;max-height:460px;min-height:0}main{padding:14px}}
@page{size:A4 portrait;margin:6mm}
@media print{
*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
body{background:#fff;font-size:9px}main{max-width:none;padding:0}h1{font-size:20px}h2{font-size:16px;margin-top:16px}h3{font-size:12px;margin-top:12px!important}h1,h2,h3{break-after:avoid-page;page-break-after:avoid}
.panel{border-radius:6px;box-shadow:none;margin-top:8px;padding:10px;break-inside:auto}.actions,.table-toolbar{display:none}
.grid{align-items:start;gap:8px;grid-template-columns:minmax(0,1fr) 160px;break-inside:avoid-page;page-break-inside:avoid}.chart-stack,.chart,.summary,.metric{break-inside:avoid-page;page-break-inside:avoid}
.table-wrap{height:auto;max-height:none;min-height:0;overflow:visible;break-inside:avoid-page;page-break-inside:avoid}table{font-size:8px;min-width:0}thead{display:table-header-group}tr{break-inside:avoid-page;page-break-inside:avoid}th,td{padding:4px 3px}th{font-size:7px;letter-spacing:0;position:static}.solution-meta{font-size:8px;gap:1px;margin-top:4px}.change-indicators{gap:3px;margin-top:3px}.change-indicator{font-size:6px;padding:2px 4px}
.chart{border-radius:6px;padding:6px}.chart>strong{display:block;font-size:8px}.bar-row{font-size:7px;gap:3px;grid-template-columns:58px minmax(0,1fr) 18px;margin:4px 0}.track{height:8px}.comparison{gap:5px;grid-template-columns:90px 1fr 30px;margin:6px 0}.series{gap:3px}.series .track{height:7px}.legend{font-size:8px;gap:10px;margin-top:6px}.dot{height:7px;width:7px}
}
</style>
</head>
<body><main>
<div class="actions"><button class="print" type="button" onclick="printWeeklyReport()">Print / save PDF</button></div>
<h1>PDAC Weekly Report</h1><p class="muted">Generated ${escapeHtml(generated)} · locally collected PDAC data</p>
${standalonePeriodHtml(selectedWeek.label || 'Selected week', selectedWeek, selectedWeek.comparison)}
${standalonePeriodHtml(`${history.label || 'Selected range'} (${formatShortDateRange(history.start, history.end)})`, history, { weeklyCounts: history.weeklyCounts || [] })}
</main>
<script>
document.addEventListener('click',function(event){var sort=event.target.closest('[data-sort]');if(sort){sortTable(sort);return;}var button=event.target.closest('[data-detail]');if(!button)return;var row=document.getElementById(button.getAttribute('data-detail'));var open=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!open));if(row)row.hidden=open;});
document.addEventListener('change',function(event){var select=event.target.closest('[data-change-filter]');if(!select)return;filterTable(select);});
function filterTable(select){var table=document.getElementById(select.getAttribute('data-table'));if(!table)return;var filter=select.value||'all';table.querySelectorAll('tbody>tr[data-record]').forEach(function(row){var visible=filter==='all'||(row.getAttribute('data-changes')||'').split(' ').includes(filter);row.hidden=!visible;if(!visible){var detail=document.getElementById(row.getAttribute('data-detail-id'));if(detail)detail.hidden=true;var button=row.querySelector('[data-detail]');if(button)button.setAttribute('aria-expanded','false');}});}
function sortTable(button){var table=button.closest('table');var body=table&&table.tBodies[0];if(!body)return;var key=button.getAttribute('data-sort');var direction=table.getAttribute('data-sort-key')===key&&table.getAttribute('data-sort-direction')==='ascending'?'descending':'ascending';var multiplier=direction==='ascending'?1:-1;var numeric=button.getAttribute('data-sort-type')==='number';var records=Array.from(body.querySelectorAll('tr[data-record]')).map(function(row){return{row:row,detail:document.getElementById(row.getAttribute('data-detail-id'))};});records.sort(function(left,right){var a=left.row.getAttribute('data-sort-'+key)||'';var b=right.row.getAttribute('data-sort-'+key)||'';var comparison=numeric?Number(a)-Number(b):a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'});return comparison*multiplier;});records.forEach(function(record){body.append(record.row);if(record.detail)body.append(record.detail);});table.setAttribute('data-sort-key',key);table.setAttribute('data-sort-direction',direction);table.querySelectorAll('[data-sort-heading]').forEach(function(heading){heading.setAttribute('aria-sort',heading.getAttribute('data-sort-heading')===key?direction:'none');});}
function printWeeklyReport(){document.body.classList.add('printing');requestAnimationFrame(function(){requestAnimationFrame(function(){window.print();});});}
window.addEventListener('afterprint',function(){document.body.classList.remove('printing');});
</script>
</body></html>`;
}

function buildPeriod(events, start, end) {
  const periodEvents = events.filter((event) => {
    const key = eventDateKey(event);
    return key >= start && key <= end;
  });
  const deployedRecords = deduplicateSolutions(periodEvents.filter((event) => event.eventType === 'created'));
  const updatedRecords = deduplicateSolutions(periodEvents.filter((event) => event.eventType === 'modified'));
  const deployedKeys = new Set(deployedRecords.map(weeklySolutionIdentity));
  const updatedKeys = new Set(updatedRecords.map(weeklySolutionIdentity));
  const withIndicators = (record) => ({
    ...record,
    changeIndicators: [
      deployedKeys.has(weeklySolutionIdentity(record)) ? 'deployed' : '',
      updatedKeys.has(weeklySolutionIdentity(record)) ? 'updated' : '',
    ].filter(Boolean),
  });
  const deployed = deployedRecords.map(withIndicators);
  const updated = updatedRecords.map(withIndicators);
  const solutions = deduplicateSolutions([...deployed, ...updated]).map(withIndicators);
  return {
    solutions,
    deployed,
    updated,
    deployedPrimaryMix: primaryMix(deployed),
    updatedPrimaryMix: primaryMix(updated),
  };
}

function deduplicateSolutions(events) {
  const records = new Map();
  for (const event of events) {
    const key = `${event.environmentId || event.environmentUrl || ''}:${event.solutionId || event.solutionid || ''}`;
    const existing = records.get(key);
    if (!existing || String(event.eventAt || '') > String(existing.eventAt || '')) {
      records.set(key, event);
    }
  }
  return [...records.values()].sort((left, right) =>
    String(right.eventAt || '').localeCompare(String(left.eventAt || '')) ||
    String(left.solutionName || left.uniqueName || '').localeCompare(String(right.solutionName || right.uniqueName || '')));
}

function primaryMix(events) {
  const values = Object.fromEntries(WEEKLY_COMPONENT_TYPES.map((definition) => [definition.label, 0]));
  for (const event of events) {
    values[primaryWeeklyComponent(event)] += 1;
  }
  return WEEKLY_COMPONENT_TYPES.map((definition) => ({
    ...definition,
    count: values[definition.label],
  }));
}

function buildWeeklyCounts(events, start, end) {
  const firstWeek = startOfCalendarWeek(start);
  const lastWeek = startOfCalendarWeek(end);
  const rows = [];
  for (let weekStart = firstWeek; weekStart <= lastWeek; weekStart = addCalendarDays(weekStart, 7)) {
    const weekEnd = addCalendarDays(weekStart, 6);
    const period = buildPeriod(events, weekStart < start ? start : weekStart, weekEnd > end ? end : weekEnd);
    rows.push({
      weekStart,
      label: formatDateLabel(weekStart, { day: 'numeric', month: 'short' }),
      deployed: period.deployed.length,
      updated: period.updated.length,
    });
  }
  return rows;
}

function standalonePeriodHtml(title, period, comparison) {
  const deployed = period.deployed || [];
  const updated = period.updated || [];
  const solutions = period.solutions || deduplicateSolutions([...deployed, ...updated]);
  const prefix = `period-${safeId(title)}`;
  return `<section class="panel"><h2>${escapeHtml(title)}</h2><div class="summary"><div class="metric"><span>Deployed</span><strong>${deployed.length}</strong></div><div class="metric"><span>Updated</span><strong>${updated.length}</strong></div></div>
${standaloneReportGroup(solutions, period.deployedPrimaryMix || [], period.updatedPrimaryMix || [], prefix)}
${standaloneComparisonChart(comparison)}</section>`;
}

function standaloneReportGroup(records, deployedMix, updatedMix, prefix) {
  const tableId = `${prefix}-table`;
  return `<h3 style="margin-top:24px">Solutions</h3><div class="table-toolbar"><label class="change-filter">Show <select data-change-filter data-table="${escapeHtml(tableId)}"><option value="all">All</option><option value="deployed">Deployed</option><option value="updated">Updated</option></select></label></div><div class="grid"><div class="table-wrap">${standaloneTable(records, tableId)}</div><div class="chart-stack">${standalonePrimaryChart(deployedMix, 'Deployed solutions by primary component')}${standalonePrimaryChart(updatedMix, 'Updated solutions by primary component')}</div></div>`;
}

function standaloneTable(records, tableId) {
  if (!records.length) return '<div class="empty">No solutions in this period.</div>';
  return `<table id="${escapeHtml(tableId)}">${standaloneTableColgroup()}<thead><tr>${standaloneSortableHeader('Solution', 'solution')}${standaloneSortableHeader('Agent', 'agent', true)}${standaloneSortableHeader('Canvas', 'canvas', true)}${standaloneSortableHeader('Code', 'code', true)}${standaloneSortableHeader('Model driven', 'model', true)}${standaloneSortableHeader('Flow', 'flow', true)}${standaloneSortableHeader('Table', 'table', true)}${standaloneSortableHeader('Event', 'event', true)}</tr></thead><tbody>${records.map((record, index) => {
    const counts = { ...emptyWeeklyComponentCounts(), ...(record.componentCounts || {}) };
    const id = `${safeId(tableId)}-detail-${safeId(record.eventType)}-${safeId(record.environmentId)}-${safeId(record.solutionId)}-${index}`;
    const components = record.components || [];
    const environment = record.environmentDisplayName || record.environmentId || '';
    const solutionName = record.solutionName || record.uniqueName || 'Unnamed solution';
    const changes = Array.isArray(record.changeIndicators) ? record.changeIndicators.join(' ') : '';
    const eventSort = Date.parse(record.eventAt || '');
    return `<tr data-record data-detail-id="${id}" data-changes="${escapeHtml(changes)}" data-sort-solution="${escapeHtml(solutionName.toLocaleLowerCase())}" data-sort-agent="${Number(counts.agents || 0)}" data-sort-canvas="${Number(counts.canvasApps || 0)}" data-sort-code="${Number(counts.codeApps || 0)}" data-sort-model="${Number(counts.modelDrivenApps || 0)}" data-sort-flow="${Number(counts.flows || 0)}" data-sort-table="${Number(counts.tables || 0)}" data-sort-event="${Number.isFinite(eventSort) ? eventSort : 0}"><td><button class="solution-toggle" type="button" data-detail="${id}" aria-expanded="false">${escapeHtml(solutionName)}</button>${standaloneChangeIndicators(record)}<div class="solution-meta"><span class="solution-version-type">${record.version ? `<span>Version ${escapeHtml(record.version)}</span>` : ''}<span>Type: ${escapeHtml(record.primaryComponent || 'Other')}</span></span>${record.publisherName ? `<span>Publisher: ${escapeHtml(record.publisherName)}</span>` : ''}${environment ? `<span>Environment: ${escapeHtml(environment)}</span>` : ''}</div></td>${['agents', 'canvasApps', 'codeApps', 'modelDrivenApps', 'flows', 'tables'].map((key) => `<td class="num">${Number(counts[key] || 0)}</td>`).join('')}<td>${escapeHtml(formatDateTime(record.eventAt))}</td></tr><tr id="${id}" class="component-row" hidden><td colspan="8">${standaloneComponents(components)}</td></tr>`;
  }).join('')}</tbody></table>`;
}

function standaloneSortableHeader(label, key, numeric = false) {
  return `<th${numeric ? ' class="num"' : ''} data-sort-heading="${key}" aria-sort="none"><button class="sort-button" type="button" data-sort="${key}" data-sort-type="${numeric ? 'number' : 'text'}">${escapeHtml(label)}</button></th>`;
}

function standaloneChangeIndicators(record) {
  const indicators = Array.isArray(record.changeIndicators) && record.changeIndicators.length
    ? record.changeIndicators
    : [record.eventType === 'modified' ? 'updated' : 'deployed'];
  return `<div class="change-indicators">${indicators.map((indicator) => `<span class="change-indicator ${indicator}">${indicator === 'updated' ? 'Updated' : 'Deployed'}</span>`).join('')}</div>`;
}

function standaloneTableColgroup() {
  return `<colgroup><col class="col-solution">${Array.from({ length: 6 }, () => '<col class="col-count">').join('')}<col class="col-event"></colgroup>`;
}

function standaloneComponents(components) {
  if (!components.length) return '<span class="muted">No tracked components in this solution.</span>';
  return `<ul class="component-list">${components.map((component) => `<li><span class="component-kind">${escapeHtml(component.label || component.kind || 'Component')}</span><strong>${escapeHtml(component.name || component.objectId || 'Unnamed component')}</strong>${component.logicalName ? `<small>${escapeHtml(component.logicalName)}</small>` : ''}</li>`).join('')}</ul>`;
}

function standalonePrimaryChart(mix, title) {
  const rows = Array.isArray(mix) ? mix : [];
  const max = Math.max(1, ...rows.map((row) => Number(row.count || 0)));
  return `<div class="chart"><strong>${escapeHtml(title || 'Solutions by primary component')}</strong>${rows.map((row) => `<div class="bar-row"><span>${escapeHtml(row.label)}</span><div class="track"><div class="bar" style="width:${(Number(row.count || 0) / max) * 100}%;background:${row.color}"></div></div><b>${Number(row.count || 0)}</b></div>`).join('')}</div>`;
}

function standaloneComparisonChart(comparison = {}) {
  if (Array.isArray(comparison.weeklyCounts)) {
    const rows = comparison.weeklyCounts;
    const max = Math.max(1, ...rows.flatMap((row) => [Number(row.deployed || 0), Number(row.updated || 0)]));
    return `<h3 style="margin-top:24px">Deployed and updated by week</h3><div class="chart">${rows.map((row) => comparisonRow(row.label, row.deployed, row.updated, max)).join('')}<div class="legend"><span><i class="dot" style="background:#155eef"></i>Deployed</span><span><i class="dot" style="background:#f59e0b"></i>Updated</span></div></div>`;
  }
  const labels = comparison.labels || [];
  const deployed = comparison.deployed || [];
  const updated = comparison.updated || [];
  const max = Math.max(1, ...deployed, ...updated);
  return `<h3 style="margin-top:24px">Selected week compared with previous week</h3><div class="chart">${labels.map((label, index) => comparisonRow(label, deployed[index], updated[index], max)).join('')}<div class="legend"><span><i class="dot" style="background:#155eef"></i>Deployed</span><span><i class="dot" style="background:#f59e0b"></i>Updated</span></div></div>`;
}

function comparisonRow(label, deployed, updated, max) {
  return `<div class="comparison"><span>${escapeHtml(label)}</span><div class="series"><div class="track"><div class="bar" style="width:${Number(deployed || 0) / max * 100}%;background:#155eef"></div></div><div class="track"><div class="bar" style="width:${Number(updated || 0) / max * 100}%;background:#f59e0b"></div></div></div><b>${Number(deployed || 0)} / ${Number(updated || 0)}</b></div>`;
}

function eventDateKey(event) {
  const value = event.eventAt || event.createdOn || event.modifiedOn || '';
  if (!value) return '';
  try {
    return formatLocalDateKey(value);
  } catch {
    return '';
  }
}

function formatShortDateRange(start, end) {
  if (!start || !end) return '';
  return `${formatDateLabel(start, { day: 'numeric', month: 'short' })}–${formatDateLabel(end, { day: 'numeric', month: 'short' })}`;
}

function formatDateLabel(value, options = {}) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: options.year === undefined ? 'numeric' : options.year,
    ...options,
  }).format(parseLocalDateKey(value));
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function toDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('A valid date is required.');
  }
  return date;
}

function safeId(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '-');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
