// The extension is the canonical UI. Keep committed Node assets and explicitly
// shared business functions in sync without replacing Node's platform adapters.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8').then((text) => text.replaceAll('\r\n', '\n'));

export const sharedServerFunctions = [
  'getTablePermissionsExport', 'listAssignedSecurityRoles',
  'getAiEventDateRange', 'getReportTrendDateRange',
  'normalizeAutomatedReportScheduleDateRange', 'getAutomatedReportDateRange',
  'buildAutomatedReportTrendBackfillSnapshots', 'reportSourceRowDate', 'reportTrendEnvironmentKey',
  'reportTrendRunDate', 'reportTrendDataDate', 'reportTrendDateModeStatus', 'completedTrendRange',
  'listReportTrendSnapshots', 'listReportChartRecords', 'readSolutionComponentNames',
  'buildSolutionComponentRecordLists', 'collectAutomatedSolutionRows', 'isDefaultEnvironmentSolution',
  'buildAutomatedFlowRunTotalsWorkbook', 'buildAutomatedFailedFlowRunsWorkbook',
  'trendDataImportColumns', 'buildTrendDataImportTemplate', 'parseTrendDataImportWorkbook',
];

export function serverFunction(source, name) {
  const expression = new RegExp(`^(?:export )?(?:async )?function ${name}\\(`, 'm');
  const start = source.search(expression);
  if (start < 0) throw new Error(`Missing shared function: ${name}`);
  // Top-level closing braces are unindented in both server implementations.
  const end = source.indexOf('\n}', start) + 2;
  if (end < start) throw new Error(`Missing end of shared function: ${name}`);
  return source.slice(start, end).replace(/^export /, '');
}

export async function platformOutputs() {
  const app = (await read('chrome-ext/app.js'))
    .replace("from './src/weekly-report.js'", "from './weekly-report.js'")
    .replace('leave Chrome running for the hourly check.', 'leave the server running for the hourly check.');
  const html = (await read('chrome-ext/app.html'))
    .replaceAll('href="favicon.png"', 'href="/favicon.png"')
    .replaceAll('href="styles.css"', 'href="/styles.css"')
    .replaceAll('href="table-data.css"', 'href="/table-data.css"')
    .replaceAll('src="icon.png"', 'src="/icon.png"')
    .replace(/    <script src="lib\/mermaid.min.js">[\s\S]*?(?=  <\/body>)/, `    <script src="/mermaid.min.js"></script>
    <script>
      window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    </script>
    <script src="/chart.umd.min.js"></script>
    <script src="/app.js" type="module"></script>
`);
  const extension = await read('chrome-ext/src/server-core.js');
  let server = await read('server.mjs');
  const anchors = {
    reportTrendRunDate: 'async function setReportTrendDateMode(',
    reportTrendDataDate: 'async function setReportTrendDateMode(',
    reportTrendDateModeStatus: 'async function setReportTrendDateMode(',
    completedTrendRange: 'async function setReportTrendDateMode(',
    listReportChartRecords: 'async function readSolutionComponentNames(',
    buildSolutionComponentRecordLists: 'async function loadWeeklyComponentNames(',
  };
  for (const name of sharedServerFunctions) {
    const shared = serverFunction(extension, name);
    const exists = new RegExp(`^(?:async )?function ${name}\\(`, 'm').test(server);
    if (exists) {
      server = server.replace(serverFunction(server, name), () => shared);
    } else if (anchors[name]) {
      if (!server.includes(anchors[name])) throw new Error(`Missing insertion anchor for ${name}`);
      server = server.replace(anchors[name], () => `${shared}\n\n${anchors[name]}`);
    } else {
      throw new Error(`Missing Node adapter location for ${name}`);
    }
  }
  return new Map([
    ['public/app.js', app],
    ['public/index.html', html],
    ['public/styles.css', await read('chrome-ext/styles.css')],
    ['public/weekly-report.js', (await read('chrome-ext/src/weekly-report.js'))
      .replace('locally collected Chrome extension data', 'locally collected PDAC data')],
    ['server.mjs', `${server.trimEnd()}\n`],
  ]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  const changed = [];
  for (const [path, content] of await platformOutputs()) {
    if (await read(path) === content) continue;
    changed.push(path);
    if (!check) await writeFile(new URL(path, root), content);
  }
  if (check && changed.length) {
    console.error(`Platform drift: ${changed.join(', ')}. Run npm run sync:platforms.`);
    process.exitCode = 1;
  } else {
    console.log(changed.length ? `Synchronized ${changed.join(', ')}` : 'Node and extension shared code is in sync.');
  }
}
