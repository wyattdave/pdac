import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildStandaloneWeeklyReportHtml,
  buildWeeklyReportModel,
  filterWeeklyReportEvents,
  historyDateRange,
  primaryWeeklyComponent,
  startOfCalendarWeek,
} from '../chrome-ext/src/weekly-report.js';
import { buildStandaloneWeeklyReportHtml as buildNodeStandaloneWeeklyReportHtml } from '../public/weekly-report.js';

const appHtml = readFileSync(new URL('../chrome-ext/app.html', import.meta.url), 'utf8');
const appScript = readFileSync(new URL('../chrome-ext/app.js', import.meta.url), 'utf8');
const backgroundScript = readFileSync(new URL('../chrome-ext/background.js', import.meta.url), 'utf8');
const serverCore = readFileSync(new URL('../chrome-ext/src/server-core.js', import.meta.url), 'utf8');
const serverDb = readFileSync(new URL('../chrome-ext/src/server-db.js', import.meta.url), 'utf8');
const extensionStyles = readFileSync(new URL('../chrome-ext/styles.css', import.meta.url), 'utf8');
const nodeAppHtml = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const nodeAppScript = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const nodeStyles = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const nodeServer = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

function event(overrides = {}) {
  return {
    environmentId: 'environment-1',
    environmentDisplayName: 'Development',
    solutionId: 'solution-1',
    solutionName: 'Weekly solution',
    uniqueName: 'weekly_solution',
    version: '1.0.0.0',
    isManaged: false,
    publisherName: 'Contoso',
    publisherUniqueName: 'contoso',
    eventType: 'created',
    eventAt: '2026-08-11T10:00:00.000Z',
    componentCounts: {
      agents: 0,
      canvasApps: 1,
      codeApps: 0,
      modelDrivenApps: 0,
      flows: 2,
      tables: 1,
      other: 0,
    },
    components: [{ kind: 'canvasApps', label: 'Canvas App', name: 'Weekly canvas app', objectId: 'app-1' }],
    ...overrides,
  };
}

test('uses Monday as the calendar-week boundary', () => {
  assert.equal(startOfCalendarWeek('2026-08-15'), '2026-08-10');
  assert.equal(startOfCalendarWeek('2026-08-10'), '2026-08-10');
});

test('applies the requested primary-component decision order', () => {
  assert.equal(primaryWeeklyComponent(event()), 'Canvas App');
  assert.equal(primaryWeeklyComponent(event({
    componentCounts: { agents: 1, canvasApps: 5, codeApps: 2, flows: 8 },
  })), 'Agent');
  assert.equal(primaryWeeklyComponent(event({ componentCounts: {} })), 'Other');
});

test('builds selected-week and historical report data without repeating a solution', () => {
  const events = [
    event(),
    event({ eventType: 'modified', eventAt: '2026-08-12T12:00:00.000Z' }),
    event({ eventType: 'modified', eventAt: '2026-08-13T12:00:00.000Z', version: '1.0.0.1' }),
    event({
      solutionId: 'solution-2',
      solutionName: 'Previous solution',
      eventAt: '2026-08-04T12:00:00.000Z',
    }),
  ];
  const model = buildWeeklyReportModel(events, {
    selectedWeekStart: '2026-08-10',
    historyRange: { key: '2w', label: 'Last 2 weeks', start: '2026-08-03', end: '2026-08-16' },
  });
  assert.equal(model.selectedWeek.deployed.length, 1);
  assert.equal(model.selectedWeek.updated.length, 1);
  assert.equal(model.selectedWeek.updated[0].version, '1.0.0.1');
  assert.deepEqual(model.selectedWeek.deployed[0].changeIndicators, ['deployed', 'updated']);
  assert.deepEqual(model.selectedWeek.updated[0].changeIndicators, ['deployed', 'updated']);
  assert.deepEqual(model.selectedWeek.comparison.deployed, [1, 1]);
  assert.deepEqual(model.selectedWeek.comparison.updated, [0, 1]);
  assert.equal(model.history.deployed.length, 2);
});

test('same-day deployments are not double counted as updates', () => {
  const timestamp = '2026-08-11T10:00:00.000Z';
  const deployedOnly = buildWeeklyReportModel([
    event({ eventType: 'created', eventAt: timestamp }),
    event({ eventType: 'modified', eventAt: '2026-08-11T10:01:00.000Z' }),
  ], {
    selectedWeekStart: '2026-08-10',
    historyRange: { key: '2w', label: 'Last 2 weeks', start: '2026-08-03', end: '2026-08-16' },
  });
  assert.equal(deployedOnly.selectedWeek.deployed.length, 1);
  assert.equal(deployedOnly.selectedWeek.updated.length, 0);
  assert.deepEqual(deployedOnly.selectedWeek.deployed[0].changeIndicators, ['deployed']);
  assert.deepEqual(deployedOnly.selectedWeek.comparison.updated, [0, 0]);

  const deployedAndUpdated = buildWeeklyReportModel([
    event({ eventType: 'created', eventAt: timestamp }),
    event({ eventType: 'modified', eventAt: '2026-08-12T10:01:00.000Z' }),
  ], {
    selectedWeekStart: '2026-08-10',
    historyRange: { key: '2w', label: 'Last 2 weeks', start: '2026-08-03', end: '2026-08-16' },
  });
  assert.equal(deployedAndUpdated.selectedWeek.deployed.length, 1);
  assert.equal(deployedAndUpdated.selectedWeek.updated.length, 1);
  assert.equal(deployedAndUpdated.selectedWeek.solutions.length, 1);
  assert.deepEqual(deployedAndUpdated.selectedWeek.deployed[0].changeIndicators, ['deployed', 'updated']);
});

test('uses the Solutions report managed, Microsoft, publisher, and environment filters', () => {
  const events = [
    event(),
    event({ solutionId: 'managed', isManaged: true }),
    event({ solutionId: 'microsoft', publisherName: 'Microsoft Corporation', publisherUniqueName: 'Microsoft' }),
    event({ solutionId: 'excluded', publisherName: 'PCat', publisherUniqueName: 'pcat' }),
    event({ solutionId: 'other-environment', environmentId: 'environment-2' }),
  ];
  const filtered = filterWeeklyReportEvents(events, {
    includeManaged: false,
    includeMicrosoftOwned: false,
    excludedPublishers: 'PCat',
    environmentId: 'environment-1',
  });
  assert.deepEqual(filtered.map((item) => item.solutionId), ['solution-1']);
});

test('defaults history to three months and exports one self-contained HTML page', () => {
  const range = historyDateRange('3m', '', '', new Date(2026, 7, 15));
  assert.equal(range.start, '2026-05-15');
  assert.equal(range.end, '2026-08-15');
  const model = buildWeeklyReportModel([
    event({ solutionName: 'Weekly <solution>' }),
    event({ solutionName: 'Weekly <solution>', eventType: 'modified', eventAt: '2026-08-12T10:00:00.000Z' }),
  ], {
    selectedWeekStart: '2026-08-10',
    historyRange: range,
  });
  const html = buildStandaloneWeeklyReportHtml(model);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /Weekly &lt;solution&gt;/);
  assert.match(html, /<style>[\s\S]+<\/style>/);
  assert.match(html, /<script>[\s\S]+<\/script>/);
  assert.doesNotMatch(html, /data-sort="type"/);
  assert.doesNotMatch(html, /<th>Version<\/th>/);
  assert.match(html, /Version 1\.0\.0\.0/);
  assert.match(html, /solution-version-type/);
  assert.match(html, /Type: Canvas App/);
  assert.match(html, /change-indicator deployed[^>]*>Deployed</);
  assert.match(html, /change-indicator updated[^>]*>Updated</);
  assert.equal((html.match(/<colgroup>/g) || []).length, 2);
  assert.match(html, /data-change-filter/);
  assert.match(html, /data-sort="solution"/);
  assert.match(html, /Deployed solutions by primary component/);
  assert.match(html, /Updated solutions by primary component/);
  assert.match(html, /max-height:460px/);
  assert.match(html, /table\{[^}]*font-size:11px;[^}]*min-width:760px/);
  assert.match(html, /col\.col-solution\{width:34%\}col\.col-count\{width:7\.5%\}col\.col-event\{width:21%\}/);
  assert.doesNotMatch(html, /col\.col-type/);
  assert.doesNotMatch(html, /min-width:1020px/);
  assert.match(html, /function printWeeklyReport\(\)/);
  assert.match(html, /\.grid\{[^}]*align-items:stretch/);
  assert.match(html, /\.table-wrap\{[^}]*height:0;[^}]*max-height:100%;[^}]*min-height:100%/);
  assert.match(html, /\.solution-toggle\{[^}]*overflow-wrap:anywhere/);
  assert.match(html, /body\.printing \.table-wrap\{height:auto;max-height:none;min-height:0;overflow:visible\}/);
  assert.match(html, /@media screen and \(max-width:900px\)/);
  assert.match(html, /@page\{size:A4 portrait;margin:6mm\}/);
  assert.match(html, /-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important/);
  assert.match(html, /grid-template-columns:minmax\(0,1fr\) 160px;break-inside:avoid-page;page-break-inside:avoid/);
  assert.match(html, /tr\{break-inside:avoid-page;page-break-inside:avoid\}/);
  assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)=/i);
});

test('weekly report is an exclusive Reports view that resets from the Reports tab', () => {
  assert.match(appHtml, /id="standardReportsContent"/);
  assert.match(appHtml, /id="weeklyReportPanel"[^>]+hidden/);
  assert.match(appHtml, /id="weeklyReportLoading"[^>]+role="status"[^>]+hidden/);
  assert.match(appHtml, /id="weeklyReportLoadingText"/);
  assert.match(appHtml, /id="weeklyReportEnvironment"/);
  assert.match(appScript, /async function openWeeklyReport\(\)[\s\S]+standardReportsContent\.hidden = true;[\s\S]+weeklyReportPanel\.hidden = false;/);
  assert.match(appScript, /function resetWeeklyReportView\(\)[\s\S]+standardReportsContent\.hidden = false;[\s\S]+weeklyReportPanel\.hidden = true;/);
  assert.match(appScript, /if \(name === 'reports'\) \{\s+resetWeeklyReportView\(\);/);
  assert.match(appScript, /renderWeeklyReport\(\{ preferPopulatedWeek: true \}\);/);
  assert.match(appScript, /options\.preferPopulatedWeek && populated\.length && !populatedWeeks\.has\(selected\)/);
  assert.match(appScript, /locally saved event/);
});

test('enabling weekly tracking triggers a full three-month load with visible progress', () => {
  for (const source of [appScript, nodeAppScript]) {
    assert.match(source, /await refreshWeeklyReportData\(\{ sync: true, full: true \}\);/);
    assert.match(source, /Loading up to three months of solution history/);
    assert.match(source, /function setWeeklyReportLoading\(loading, message/);
    assert.match(source, /body: \{ accountHomeId, environments, full: Boolean\(options\.full\) \}/);
  }
  for (const source of [serverCore, nodeServer]) {
    assert.match(source, /full: Boolean\(body\.full\)/);
  }
  assert.match(extensionStyles, /\.weekly-report-loading\s*\{[^}]*display:\s*flex;/s);
  assert.match(nodeStyles, /\.weekly-report-loading\s*\{[^}]*display:\s*flex;/s);
});

test('extension weekly tables use the compact shared column proportions', () => {
  assert.match(extensionStyles, /\.weekly-report-table\s*\{[^}]*min-width:\s*760px;/s);
  assert.match(extensionStyles, /\.weekly-col-solution\s*\{\s*width:\s*34%;\s*\}/);
  assert.doesNotMatch(extensionStyles, /\.weekly-col-type\s*\{/);
  assert.match(extensionStyles, /\.weekly-col-count\s*\{\s*width:\s*7\.5%;\s*\}/);
  assert.match(extensionStyles, /\.weekly-col-event\s*\{\s*width:\s*21%;\s*\}/);
  assert.match(extensionStyles, /\.weekly-solution-button\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
});

test('weekly periods use one filterable sortable solution table with both charts alongside', () => {
  for (const source of [appScript, nodeAppScript]) {
    assert.match(source, /const records = period\.solutions \|\| \[\];/);
    assert.match(source, /data-weekly-change-filter/);
    assert.match(source, /<option value="all">All<\/option>/);
    assert.match(source, /function sortWeeklySolutionTable\(button\)/);
    assert.doesNotMatch(source, /weeklySortableHeader\('Type'/);
    assert.match(source, /weekly-solution-version-type/);
    assert.match(source, /weeklySortableHeader\('Event', 'event', true\)/);
    assert.match(source, /Deployed solutions by primary component/);
    assert.match(source, /Updated solutions by primary component/);
  }
  assert.match(extensionStyles, /\.weekly-chart-stack\s*\{[^}]*display:\s*grid;/s);
  assert.match(extensionStyles, /\.weekly-report-layout\s*\{[^}]*align-items:\s*stretch;/s);
  assert.match(extensionStyles, /\.weekly-table-wrap\s*\{[^}]*height:\s*0;[^}]*max-height:\s*100%;[^}]*min-height:\s*100%;/s);
  assert.match(nodeStyles, /\.weekly-sort-button::after\s*\{[^}]*content:\s*"\\2195";/s);
});

test('Node UI and standalone download use the completed compact weekly report', () => {
  assert.match(nodeAppHtml, /id="standardReportsContent"/);
  assert.match(nodeAppHtml, /id="weeklyReportPanel"[^>]+hidden/);
  assert.match(nodeAppScript, /async function openWeeklyReport\(\)[\s\S]+standardReportsContent\.hidden = true;[\s\S]+weeklyReportPanel\.hidden = false;/);
  assert.match(nodeStyles, /\.weekly-report-table\s*\{[^}]*min-width:\s*760px;/s);
  assert.match(nodeStyles, /\.weekly-col-solution\s*\{\s*width:\s*34%;\s*\}/);
  const model = buildWeeklyReportModel([event()], {
    selectedWeekStart: '2026-08-10',
    historyRange: historyDateRange('3m', '', '', new Date(2026, 7, 15)),
  });
  const html = buildNodeStandaloneWeeklyReportHtml(model);
  assert.match(html, /locally collected PDAC data/);
  assert.match(html, /font-size:11px;min-width:760px/);
  assert.match(html, /@page\{size:A4 portrait;margin:6mm\}/);
  assert.match(html, /print-color-adjust:exact!important/);
  assert.match(html, /\.chart-stack,\.chart,\.summary,\.metric\{break-inside:avoid-page;page-break-inside:avoid\}/);
  assert.doesNotMatch(html, /Chrome extension data/);
});

test('Node server stores weekly events and components and reconciles the retention window', () => {
  assert.match(nodeServer, /CREATE TABLE IF NOT EXISTS weekly_solution_events/);
  assert.match(nodeServer, /CREATE TABLE IF NOT EXISTS weekly_solution_components/);
  assert.match(nodeServer, /GET \/api\/weekly-report/);
  assert.match(nodeServer, /POST \/api\/weekly-report\/sync/);
  assert.match(nodeServer, /const cutoff = weeklyRetentionCutoff\(\);/);
  assert.match(nodeServer, /\$filter=\(createdon ge \$\{cutoffInstant\} or modifiedon ge \$\{cutoffInstant\}\)/);
  assert.match(nodeServer, /await weeklyDeleteEventsBefore\(cutoff\);/);
});

test('Chrome stores weekly events and components in dedicated IndexedDB stores', () => {
  assert.match(serverDb, /const DB_VERSION = 2/);
  assert.match(serverDb, /createObjectStore\('weeklySolutions'/);
  assert.match(serverDb, /createObjectStore\('weeklyComponents'/);
  assert.match(serverDb, /export function weeklyReplaceEvents/);
  assert.match(serverDb, /export async function weeklyListEvents/);
});

test('weekly tracking is local-first, hourly, and resumes incrementally from a persisted poll cursor', () => {
  assert.match(appScript, /await refreshWeeklyReportData\(\);\s+if \(weeklyReportRefreshDue\(\)\) \{\s+await refreshWeeklyReportData\(\{ sync: true \}\);/);
  assert.match(appScript, /now - lastChecked >= 60 \* 60 \* 1000/);
  assert.match(serverCore, /WEEKLY_REPORT_CHECK_INTERVAL_MS = 60 \* 60 \* 1000/);
  assert.doesNotMatch(serverCore, /WEEKLY_REPORT_FULL_RECONCILE_INTERVAL_MS/);
  assert.match(serverCore, /const requiresInitialSync = environments\.some/);
  assert.match(serverCore, /!force && !requiresInitialSync && Number\.isFinite\(lastChecked\)/);
  assert.match(serverCore, /const initialBackfill = !Number\.isFinite\(lastPollAt\) \|\| !Number\.isFinite\(backfillCompletedAt\)/);
  assert.match(serverCore, /lastPollAt - WEEKLY_REPORT_QUERY_OVERLAP_MS/);
  assert.match(serverCore, /lastPollAt: startedAt/);
  assert.match(serverCore, /backfillCompletedAt: outcome\.initialBackfill \? startedAt/);
  assert.match(serverCore, /existingEvents: eventsByEnvironment\.get\(environmentId\) \|\| \[\]/);
  assert.match(serverCore, /if \(!pending\.length\) \{\s+return \[\];\s+\}/);
  assert.match(serverCore, /eventType === 'modified' && sameWeeklyEventDay\(solution\.createdon, solution\.modifiedon\)/);
  assert.match(serverCore, /pendingSolutions\.map\(\(solution\) => solution\.solutionid\)/);
  assert.match(serverCore, /await weeklyReplaceEvents\(events\);/);
  assert.match(serverCore, /await saveWeeklyEventsFromSolutionReportGroups\(rowsByEnvironment, accountHomeId\);/);
  assert.match(serverCore, /weeklyComponents: weeklyComponentsFromSolutionReport\(solutionComponents\)/);
  assert.match(nodeServer, /WEEKLY_REPORT_CHECK_INTERVAL_MS = 60 \* 60 \* 1000/);
  assert.doesNotMatch(nodeServer, /WEEKLY_REPORT_FULL_RECONCILE_INTERVAL_MS/);
  assert.match(nodeServer, /const requiresInitialSync = environments\.some/);
  assert.match(nodeServer, /lastPollAt - WEEKLY_REPORT_QUERY_OVERLAP_MS/);
  assert.match(nodeServer, /eventType === 'modified' && sameWeeklyEventDay\(solution\.createdon, solution\.modifiedon\)/);
  assert.match(nodeServer, /await saveWeeklyEventsFromSolutionReportGroups\(rowsByEnvironment, accountHomeId\);/);
  assert.match(backgroundScript, /WEEKLY_REPORT_ALARM_NAME = 'weekly-report-check'/);
  assert.match(backgroundScript, /periodInMinutes: WEEKLY_REPORT_CHECK_INTERVAL_MS \/ \(60 \* 1000\)/);
  assert.match(backgroundScript, /chrome\.runtime\.onInstalled[\s\S]+checkBackgroundReports\(\)\.catch/);
});

test('component metadata requests avoid invalid entity properties and retry throttled calls', () => {
  for (const source of [serverCore, nodeServer]) {
    const select = source.match(/entities\?\$select=([^&`\r\n]+)&\$filter=objecttypecode eq/)?.[1].split(',') || [];
    assert.deepEqual(select, ['logicalname', 'collectionname', 'entitysetname', 'originallocalizedname', 'name']);
    assert.equal(select.includes('localizedname'), false);
    assert.equal(select.includes('displayname'), false);
    assert.match(source, /response\.status === 429/);
    assert.match(source, /response\.headers\.get\('retry-after'\)/);
  }
});
