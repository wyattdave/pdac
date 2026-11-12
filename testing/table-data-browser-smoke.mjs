// Isolated browser smoke harness: no authentication or live Dataverse calls.
// Run with node testing/table-data-browser-smoke.mjs, then open the printed URL.
import http from 'node:http';
import { readFile } from 'node:fs/promises';

const assets = new Map([
  ['/', ['testing/table-data-browser-smoke.html', 'text/html']],
  ['/table-data.js', ['chrome-ext/table-data.js', 'text/javascript']],
  ['/table-data-api.js', ['chrome-ext/src/table-data-api.js', 'text/javascript']],
  ['/styles.css', ['public/styles.css', 'text/css']],
  ['/table-data.css', ['chrome-ext/table-data.css', 'text/css']],
]);
const server = http.createServer(async (req, res) => {
  const asset = assets.get(new URL(req.url, 'http://localhost').pathname);
  if (!asset) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(new URL(`../${asset[0]}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': asset[1] }).end(body);
  } catch (error) {
    res.writeHead(500).end(error.message);
  }
});
server.listen(4293, '127.0.0.1', () => console.log(`Mock data-browser smoke tests: http://127.0.0.1:4293 (PID ${process.pid})`));
