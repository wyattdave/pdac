#!/usr/bin/env node
// PDAC background server watchdog.
//
// A pure-Node supervisor that keeps the PDAC server running in the background.
// It intentionally has no dependency on Task Scheduler, Windows Script Host or
// PowerShell: corporate machines routinely block one or more of those, and any
// machine that can run PDAC can by definition run this script.
//
// Usage:
//   node background-watchdog.mjs --config <background-config.json> [--bootstrap]
//
// --bootstrap immediately respawns this script detached from the current
// console (hidden) and exits. It is used when the watchdog is launched from a
// context that owns a console window (the HKCU Run entry or the scheduled
// task at sign-in) so the console only flashes briefly instead of staying
// open for the whole session.

import { spawn } from 'node:child_process';
import {
  appendFileSync, closeSync, existsSync, mkdirSync, openSync,
  readFileSync, renameSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const configFlagIndex = args.indexOf('--config');
const configPath = configFlagIndex >= 0 ? args[configFlagIndex + 1] : args.find((value) => !value.startsWith('--'));
if (!configPath) {
  console.error('Usage: node background-watchdog.mjs --config <background-config.json> [--bootstrap]');
  process.exit(2);
}

if (args.includes('--bootstrap')) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--config', configPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  process.exit(0);
}

const localAppData = process.env.LOCALAPPDATA || process.env.HOME || dirname(configPath);
const logDir = join(localAppData, 'PowerDevBoxAdmin', 'logs');
const watchdogLogPath = join(logDir, 'watchdog.log');
const lockPath = join(dirname(configPath), 'watchdog.lock');
let ownsLock = false;

function log(message) {
  try {
    mkdirSync(logDir, { recursive: true });
    if (existsSync(watchdogLogPath) && statSync(watchdogLogPath).size >= 1024 * 1024) {
      renameSync(watchdogLogPath, `${watchdogLogPath}.1`);
    }
    appendFileSync(watchdogLogPath, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch {}
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return error.code === 'EPERM';
  }
}

// Re-registering the background server while an earlier watchdog is still
// alive would leave two supervisors fighting over the port. An exclusive
// lockfile with a liveness-checked PID keeps this a single-instance loop.
function acquireLock() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: 'wx' });
      ownsLock = true;
      return true;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        log(`Unable to create the watchdog lockfile: ${error.message}`);
        return false;
      }
      let existingPid = null;
      try {
        existingPid = Number(JSON.parse(readFileSync(lockPath, 'utf8')).pid);
      } catch {}
      if (isPidAlive(existingPid)) {
        return false;
      }
      try {
        unlinkSync(lockPath);
      } catch {}
    }
  }
  return false;
}

function releaseLock() {
  if (!ownsLock) {
    return;
  }
  try {
    unlinkSync(lockPath);
  } catch {}
  ownsLock = false;
}

function readConfig() {
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

// The stop marker is one-shot: consuming it stops this watchdog "for now"
// while leaving sign-in autostart (Run key / scheduled task) able to start a
// fresh watchdog at the next logon.
function stopRequested(stopMarkerPath) {
  if (!stopMarkerPath || !existsSync(stopMarkerPath)) {
    return false;
  }
  try {
    unlinkSync(stopMarkerPath);
  } catch {}
  return true;
}

function probePort(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(1000, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

function rotateServerLog(logPath) {
  try {
    if (existsSync(logPath) && statSync(logPath).size >= 5 * 1024 * 1024) {
      renameSync(logPath, `${logPath}.1`);
    }
  } catch {}
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runServer(nodePath, config) {
  return new Promise((resolve) => {
    let fd = null;
    try {
      mkdirSync(dirname(config.LogPath), { recursive: true });
      rotateServerLog(config.LogPath);
      fd = openSync(config.LogPath, 'a');
    } catch (error) {
      log(`Unable to open the server log '${config.LogPath}': ${error.message}`);
    }
    const child = spawn(nodePath, [config.ServerPath], {
      env: { ...process.env, PDAC_BACKGROUND_TASK: '1', PORT: String(config.Port) },
      stdio: ['ignore', fd ?? 'ignore', fd ?? 'ignore'],
      windowsHide: true,
    });
    child.once('error', (error) => {
      if (fd !== null) {
        try { closeSync(fd); } catch {}
        fd = null;
      }
      log(`Unable to start Node at '${nodePath}': ${error.message}`);
      resolve(null);
    });
    child.once('exit', (code, signal) => {
      if (fd !== null) {
        try {
          appendFileSync(config.LogPath, `[${new Date().toISOString()}] PDAC Node process exited with code ${code ?? signal}; restarting.\n`, 'utf8');
        } catch {}
        try { closeSync(fd); } catch {}
        fd = null;
      }
      resolve(code ?? signal);
    });
  });
}

if (!acquireLock()) {
  log('Another PDAC watchdog instance is already running; exiting.');
  process.exit(0);
}
process.on('exit', releaseLock);
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
log(`PDAC watchdog started (pid ${process.pid}) with configuration '${configPath}'.`);

// Supervision loop. Problems (missing configuration, replaced npm package,
// moved Node) are logged and retried instead of silently ending the watchdog.
// While a terminal-owned instance holds the port, this loop idles; the
// background server takes over as soon as the port is released.
while (true) {
  try {
    let config;
    try {
      config = readConfig();
    } catch (error) {
      log(`Unable to read the background configuration '${configPath}': ${error.message} Retrying in 30 seconds.`);
      await sleep(30000);
      continue;
    }
    if (stopRequested(config.StopMarkerPath)) {
      log('Stop requested; PDAC watchdog exiting.');
      break;
    }
    if (await probePort(Number(config.Port))) {
      await sleep(3000);
      continue;
    }
    let nodePath = String(config.NodePath || '');
    if (!existsSync(nodePath)) {
      log(`Node was not found at '${nodePath}'; using '${process.execPath}' instead.`);
      nodePath = process.execPath;
    }
    if (!existsSync(config.ServerPath)) {
      log(`PDAC was not found at '${config.ServerPath}'. This can happen after an npm update replaces the package; repair the background task from the PDAC UI. Retrying in 30 seconds.`);
      await sleep(30000);
      continue;
    }
    await runServer(nodePath, config);
    await sleep(3000);
  } catch (error) {
    log(`Watchdog loop error: ${error.message} Retrying in 30 seconds.`);
    await sleep(30000);
  }
}
process.exit(0);
