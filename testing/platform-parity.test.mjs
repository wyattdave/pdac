import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { platformOutputs } from '../scripts/sync-platforms.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8').then((text) => text.replaceAll('\r\n', '\n'));

test('Node UI and shared backend functions match the canonical extension sources', async () => {
  for (const [path, expected] of await platformOutputs()) {
    assert.equal(await read(path), expected, `${path} drifted; run npm run sync:platforms`);
  }
});

test('npm manifest, lockfile and extension use the same release version', async () => {
  const [pkg, lock, manifest] = await Promise.all(['package.json', 'package-lock.json', 'chrome-ext/manifest.json'].map(async (path) => JSON.parse(await read(path))));
  assert.equal(pkg.version, manifest.version);
  assert.equal(pkg.version, lock.version);
  assert.equal(pkg.version, lock.packages[''].version);
  assert.ok(pkg.files.includes('chrome-ext/src/solution-access.js'));
});

test('both runtimes implement the same static and parameterized API routes', async () => {
  const [node, extension] = await Promise.all(['server.mjs', 'chrome-ext/src/server-core.js'].map(read));
  const routes = (source) => [...source.matchAll(/route === '([^']+)'/g)].map((match) => match[1]).sort();
  const parameterized = (source) => [...source.matchAll(/const (\w+Match) = url.pathname.match\(([^\n]+)\);/g)]
    .map((match) => `${match[1]}: ${match[2]}`).sort();
  assert.deepEqual(routes(node), routes(extension));
  assert.deepEqual(parameterized(node), parameterized(extension));
});
