import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

test('Node server exposes weekly reporting and creates both durable SQLite tables', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'pdac-node-weekly-report-'));
  await writeFile(path.join(dataDirectory, 'automated-report-schedule.json'), '{"enabled":false,"groups":{}}\n');
  const port = await availablePort();
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PORT: String(port),
      PDAC_DATA_DIR: dataDirectory,
      PDAC_TEST_NO_AUTH: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let serverOutput = '';
  server.stdout.on('data', (chunk) => { serverOutput += chunk; });
  server.stderr.on('data', (chunk) => { serverOutput += chunk; });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl, server, () => serverOutput);

    const initialSettings = await getJson(`${baseUrl}/api/weekly-report/settings`);
    assert.equal(initialSettings.response.status, 200);
    assert.equal(initialSettings.body.enabled, false);

    const savedSettings = await getJson(`${baseUrl}/api/weekly-report/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: false,
        accountHomeId: 'node-account',
        environments: [{
          name: 'environment-1',
          displayName: 'Development',
          orgUrl: 'https://development.crm.dynamics.com',
        }],
      }),
    });
    assert.equal(savedSettings.response.status, 200);
    assert.equal(savedSettings.body.accountHomeId, 'node-account');
    assert.equal(savedSettings.body.environments.length, 1);

    const report = await getJson(`${baseUrl}/api/weekly-report?accountHomeId=node-account`);
    assert.equal(report.response.status, 200);
    assert.deepEqual(report.body.events, []);

    const invalidSettings = await getJson(`${baseUrl}/api/weekly-report/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, accountHomeId: 'node-account', environments: [] }),
    });
    assert.equal(invalidSettings.response.status, 400);

    const moduleResponse = await fetch(`${baseUrl}/weekly-report.js`);
    assert.equal(moduleResponse.status, 200);
    assert.match(await moduleResponse.text(), /export function buildStandaloneWeeklyReportHtml/);

    const db = new DatabaseSync(path.join(dataDirectory, 'report-trends.sqlite'));
    try {
      const tables = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name LIKE 'weekly_solution_%'
        ORDER BY name
      `).all().map((row) => row.name);
      assert.deepEqual(tables, ['weekly_solution_components', 'weekly_solution_events']);
    } finally {
      db.close();
    }
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 2_000);
        timeout.unref();
        server.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
        server.kill();
      });
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

async function availablePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(baseUrl, server, output) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`PDAC test server exited early (${server.exitCode}).\n${output()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/weekly-report.js`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`PDAC test server did not become ready.\n${output()}`);
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  return { response, body: await response.json() };
}
