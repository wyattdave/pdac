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
  const normalized = addWeeklyChangeIndicators(removeDuplicateDeploymentUpdates(normalizedEvents));

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
  const createdInstants = new Map();
  for (const event of events) {
    if (event.eventType !== 'created') continue;
    const key = weeklySolutionIdentity(event);
    if (!createdInstants.has(key)) createdInstants.set(key, new Set());
    createdInstants.get(key).add(normalizeEventInstant(event.eventAt));
  }
  return events.filter((event) => event.eventType !== 'modified'
    || !createdInstants.get(weeklySolutionIdentity(event))?.has(normalizeEventInstant(event.eventAt)));
}

function addWeeklyChangeIndicators(events) {
  const states = new Map();
  for (const event of events) {
    const key = weeklySolutionIdentity(event);
    const state = states.get(key) || { deployed: false, updated: false };
    state.deployed ||= event.eventType === 'created';
    state.updated ||= event.eventType === 'modified';
    states.set(key, state);
  }
  return events.map((event) => {
    const state = states.get(weeklySolutionIdentity(event)) || {};
    return {
      ...event,
      changeIndicators: [state.deployed ? 'deployed' : '', state.updated ? 'updated' : ''].filter(Boolean),
    };
  });
}

function weeklySolutionIdentity(event = {}) {
  return [
    event.accountHomeId || '',
    event.environmentId || event.environmentUrl || '',
    event.solutionId || event.solutionid || event.uniqueName || '',
  ].join(':');
}

function normalizeEventInstant(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value || '');
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
.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(230px,.34fr);gap:18px;align-items:start}
.table-wrap{border:1px solid #dbe3ee;border-radius:10px;max-height:460px;min-width:0;overflow:auto}
table{border-collapse:collapse;font-size:11px;min-width:760px;table-layout:fixed;width:100%}
col.col-solution{width:23%}col.col-type{width:11%}col.col-count{width:7.5%}col.col-event{width:21%}
th,td{text-align:left;padding:7px 5px;border-bottom:1px solid #e7edf5;vertical-align:top}
th{font-size:10px;text-transform:uppercase;letter-spacing:.02em;background:#f8fafc;color:#475569;position:sticky;top:0;z-index:2}
th.num,td.num{text-align:center;vertical-align:middle}
.solution-toggle{border:0;background:none;color:#0f5ea8;font:inherit;font-weight:700;padding:0;cursor:pointer;text-align:left}
.solution-toggle:before{content:'▸';display:inline-block;margin-right:7px;transition:transform .15s}.solution-toggle[aria-expanded=true]:before{transform:rotate(90deg)}
.change-indicators{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.change-indicator{border:1px solid;border-radius:999px;font-size:9px;font-weight:700;letter-spacing:.04em;line-height:1;padding:3px 6px;text-transform:uppercase}.change-indicator.deployed{background:#dbeafe;border-color:#93c5fd;color:#1d4ed8}.change-indicator.updated{background:#fef3c7;border-color:#fcd34d;color:#92400e}
.solution-meta{color:#64748b;display:grid;font-size:12px;gap:3px;margin-top:7px}
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
body.printing .table-wrap{max-height:none;overflow:visible}
@media(max-width:900px){.grid{grid-template-columns:1fr}main{padding:14px}}
@media print{body{background:#fff}main{max-width:none;padding:0}.panel{box-shadow:none;break-inside:auto}.actions{display:none}.table-wrap{max-height:none;overflow:visible}th{position:static}}
</style>
</head>
<body><main>
<div class="actions"><button class="print" type="button" onclick="printWeeklyReport()">Print / save PDF</button></div>
<h1>PDAC Weekly Report</h1><p class="muted">Generated ${escapeHtml(generated)} · locally collected PDAC data</p>
${standalonePeriodHtml(selectedWeek.label || 'Selected week', selectedWeek, selectedWeek.comparison)}
${standalonePeriodHtml(`${history.label || 'Selected range'} (${formatShortDateRange(history.start, history.end)})`, history, { weeklyCounts: history.weeklyCounts || [] })}
</main>
<script>
document.addEventListener('click',function(event){var button=event.target.closest('[data-detail]');if(!button)return;var row=document.getElementById(button.getAttribute('data-detail'));var open=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!open));if(row)row.hidden=open;});
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
  const deployed = deduplicateSolutions(periodEvents.filter((event) => event.eventType === 'created'));
  const updated = deduplicateSolutions(periodEvents.filter((event) => event.eventType === 'modified'));
  return {
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
  return `<section class="panel"><h2>${escapeHtml(title)}</h2><div class="summary"><div class="metric"><span>Deployed</span><strong>${deployed.length}</strong></div><div class="metric"><span>Updated</span><strong>${updated.length}</strong></div></div>
${standaloneReportGroup('Solutions deployed', deployed, period.deployedPrimaryMix || [])}
${standaloneReportGroup('Solutions updated', updated, period.updatedPrimaryMix || [])}
${standaloneComparisonChart(comparison)}</section>`;
}

function standaloneReportGroup(title, records, mix) {
  return `<h3 style="margin-top:24px">${escapeHtml(title)}</h3><div class="grid"><div class="table-wrap">${standaloneTable(records)}</div>${standalonePrimaryChart(mix)}</div>`;
}

function standaloneTable(records) {
  if (!records.length) return '<div class="empty">No solutions in this period.</div>';
  return `<table>${standaloneTableColgroup()}<thead><tr><th>Solution</th><th>Type</th><th class="num">Agent</th><th class="num">Canvas</th><th class="num">Code</th><th class="num">Model driven</th><th class="num">Flow</th><th class="num">Table</th><th>Event</th></tr></thead><tbody>${records.map((record, index) => {
    const counts = { ...emptyWeeklyComponentCounts(), ...(record.componentCounts || {}) };
    const id = `detail-${safeId(record.eventType)}-${safeId(record.environmentId)}-${safeId(record.solutionId)}-${index}`;
    const components = record.components || [];
    const environment = record.environmentDisplayName || record.environmentId || '';
    return `<tr><td><button class="solution-toggle" type="button" data-detail="${id}" aria-expanded="false">${escapeHtml(record.solutionName || record.uniqueName || 'Unnamed solution')}</button>${standaloneChangeIndicators(record)}<div class="solution-meta">${record.version ? `<span>Version ${escapeHtml(record.version)}</span>` : ''}${record.publisherName ? `<span>Publisher: ${escapeHtml(record.publisherName)}</span>` : ''}${environment ? `<span>Environment: ${escapeHtml(environment)}</span>` : ''}</div></td><td>${escapeHtml(record.primaryComponent || 'Other')}</td>${['agents', 'canvasApps', 'codeApps', 'modelDrivenApps', 'flows', 'tables'].map((key) => `<td class="num">${Number(counts[key] || 0)}</td>`).join('')}<td>${escapeHtml(formatDateTime(record.eventAt))}</td></tr><tr id="${id}" class="component-row" hidden><td colspan="9">${standaloneComponents(components)}</td></tr>`;
  }).join('')}</tbody></table>`;
}

function standaloneChangeIndicators(record) {
  const indicators = Array.isArray(record.changeIndicators) && record.changeIndicators.length
    ? record.changeIndicators
    : [record.eventType === 'modified' ? 'updated' : 'deployed'];
  return `<div class="change-indicators">${indicators.map((indicator) => `<span class="change-indicator ${indicator}">${indicator === 'updated' ? 'Updated' : 'Deployed'}</span>`).join('')}</div>`;
}

function standaloneTableColgroup() {
  return `<colgroup><col class="col-solution"><col class="col-type">${Array.from({ length: 6 }, () => '<col class="col-count">').join('')}<col class="col-event"></colgroup>`;
}

function standaloneComponents(components) {
  if (!components.length) return '<span class="muted">No tracked components in this solution.</span>';
  return `<ul class="component-list">${components.map((component) => `<li><span class="component-kind">${escapeHtml(component.label || component.kind || 'Component')}</span><strong>${escapeHtml(component.name || component.objectId || 'Unnamed component')}</strong>${component.logicalName ? `<small>${escapeHtml(component.logicalName)}</small>` : ''}</li>`).join('')}</ul>`;
}

function standalonePrimaryChart(mix) {
  const rows = Array.isArray(mix) ? mix : [];
  const max = Math.max(1, ...rows.map((row) => Number(row.count || 0)));
  return `<div class="chart"><strong>Solutions by primary component</strong>${rows.map((row) => `<div class="bar-row"><span>${escapeHtml(row.label)}</span><div class="track"><div class="bar" style="width:${(Number(row.count || 0) / max) * 100}%;background:${row.color}"></div></div><b>${Number(row.count || 0)}</b></div>`).join('')}</div>`;
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
