// PDAC background server manager.
//
// Installs, inspects and removes the background server supervision without
// requiring PowerShell scripts, Windows Script Host or Task Scheduler to
// work. The pure-Node watchdog (background-watchdog.mjs) is the real
// supervisor; everything else is layered on top as best-effort:
//   - immediate start: the watchdog is spawned directly from this process,
//   - sign-in autostart: an HKCU Run entry written with reg.exe that launches
//     Node in --bootstrap mode (the console flashes briefly, then the
//     watchdog respawns itself hidden),
//   - a scheduled task (schtasks.exe) adds an unlock trigger and Task
//     Scheduler visibility where registration is allowed, but every part of
//     the feature keeps working when it is not.
//
// Every install attempt is recorded in %LOCALAPPDATA%\PowerDevBoxAdmin\logs\install.log.

import { execFile, spawn } from 'node:child_process';
import { appendFile, copyFile, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const STARTUP_TASK_NAME = 'PDAC Background Server';
const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const LOCAL_APP_DATA = process.env.LOCALAPPDATA || SCRIPT_DIR;
const RUNTIME_DIR = join(LOCAL_APP_DATA, 'PowerDevBoxAdmin', 'background');
const LOG_DIR = join(LOCAL_APP_DATA, 'PowerDevBoxAdmin', 'logs');
const CONFIG_PATH = join(RUNTIME_DIR, 'background-config.json');
const STOP_MARKER_PATH = join(RUNTIME_DIR, 'stop-requested');
const LOCK_PATH = join(RUNTIME_DIR, 'watchdog.lock');
const WATCHDOG_RUNTIME_PATH = join(RUNTIME_DIR, 'background-watchdog.mjs');
const INSTALL_LOG_PATH = join(LOG_DIR, 'install.log');
const SERVER_LOG_PATH = join(LOG_DIR, 'server.log');
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const SYSTEM32 = join(process.env.SystemRoot || 'C:\\Windows', 'System32');
const SCHTASKS_EXE = join(SYSTEM32, 'schtasks.exe');
const REG_EXE = join(SYSTEM32, 'reg.exe');

function run(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: 30000 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
      });
    });
  });
}

async function logInstall(message) {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(INSTALL_LOG_PATH, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
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
    return error.code === 'EPERM';
  }
}

async function readLockPid() {
  try {
    return Number(JSON.parse(await readFile(LOCK_PATH, 'utf8')).pid);
  } catch {
    return null;
  }
}

async function isWatchdogRunning() {
  return isPidAlive(await readLockPid());
}

async function readConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

// Sign-in autostart launch: Node in --bootstrap mode respawns the watchdog
// detached and hidden, so the console window that Windows allocates for a
// Run-entry console app only flashes briefly instead of staying open. No
// script hosts (wscript/cscript) are involved, which keeps endpoint
// security tooling happy.
function launchCommandString(nodePath) {
  return `"${nodePath}" "${WATCHDOG_RUNTIME_PATH}" --config "${CONFIG_PATH}" --bootstrap`;
}

async function getRunKeyValue() {
  const result = await run(REG_EXE, ['query', RUN_KEY, '/v', STARTUP_TASK_NAME]);
  if (!result.ok) {
    return null;
  }
  const match = result.stdout.match(new RegExp(`${STARTUP_TASK_NAME}\\s+REG_SZ\\s+(.+)$`, 'im'));
  return match ? match[1].trim() : null;
}

async function getCurrentUserSid() {
  const result = await run(join(SYSTEM32, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh']);
  if (!result.ok) {
    return null;
  }
  const match = result.stdout.match(/"(S-1-[\d-]+)"/);
  return match ? match[1] : null;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildTaskXml({ principalId, withTriggers, command, args, workingDir }) {
  const escapedPrincipal = escapeXml(principalId);
  const triggersBlock = withTriggers
    ? '<Triggers>'
      + `<LogonTrigger><Enabled>true</Enabled><UserId>${escapedPrincipal}</UserId></LogonTrigger>`
      + `<SessionStateChangeTrigger><Enabled>true</Enabled><StateChange>SessionUnlock</StateChange><UserId>${escapedPrincipal}</UserId></SessionStateChangeTrigger>`
      + '</Triggers>'
    : '';
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Runs the PDAC server and daily report scheduler in the background without a terminal window.</Description>
  </RegistrationInfo>
  ${triggersBlock}
  <Principals>
    <Principal id="Author">
      <UserId>${escapedPrincipal}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${escapeXml(command)}</Command>
      <Arguments>${escapeXml(args)}</Arguments>
      <WorkingDirectory>${escapeXml(workingDir)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;
}

async function queryTaskXml() {
  const result = await run(SCHTASKS_EXE, ['/Query', '/TN', STARTUP_TASK_NAME, '/XML']);
  return result.ok ? result.stdout : null;
}

async function queryTaskState() {
  const result = await run(SCHTASKS_EXE, ['/Query', '/TN', STARTUP_TASK_NAME, '/FO', 'CSV', '/NH']);
  if (!result.ok) {
    return null;
  }
  const line = result.stdout.trim().split(/\r?\n/)[0] || '';
  const fields = line.match(/"((?:[^"]|"")*)"/g) || [];
  return fields.length >= 3 ? fields[fields.length - 1].slice(1, -1) : null;
}

async function deleteTask() {
  await run(SCHTASKS_EXE, ['/Delete', '/TN', STARTUP_TASK_NAME, '/F']);
}

async function registerTask({ autoStart, nodePath, workingDir }) {
  const sid = await getCurrentUserSid();
  const accountName = `${process.env.USERDOMAIN || ''}\\${userInfo().username}`.replace(/^\\/, '');
  const principals = [sid, accountName].filter(Boolean);
  const triggerModes = autoStart ? [true, false] : [false];
  const command = nodePath;
  const commandArgs = `"${WATCHDOG_RUNTIME_PATH}" --config "${CONFIG_PATH}" --bootstrap`;
  await deleteTask();
  for (const withTriggers of triggerModes) {
    for (const principalId of principals) {
      const xml = buildTaskXml({ principalId, withTriggers, command, args: commandArgs, workingDir });
      const xmlPath = join(RUNTIME_DIR, `task-${Date.now()}.xml`);
      try {
        await writeFile(xmlPath, `\ufeff${xml}`, 'utf16le');
        const result = await run(SCHTASKS_EXE, ['/Create', '/TN', STARTUP_TASK_NAME, '/XML', xmlPath, '/F']);
        if (result.ok) {
          await logInstall(`Registered scheduled task (principal=${principalId}, triggers=${withTriggers}).`);
          return { registered: true, withTriggers };
        }
        await logInstall(`Task registration failed (principal=${principalId}, triggers=${withTriggers}): exit ${result.code} ${(result.stderr || result.stdout).trim()}`);
      } finally {
        await rm(xmlPath, { force: true }).catch(() => {});
      }
    }
  }
  return { registered: false, withTriggers: false };
}

// Earlier PDAC versions supervised the server with a PowerShell watchdog
// launched through wscript, and 0.6.0 used a VBS launcher for autostart.
// Stop any of those best-effort so they do not fight the Node watchdog over
// the port, and remove the script files that endpoint security tools flag.
// PowerShell is only used here as a cleanup convenience; failure is ignored.
async function stopLegacyWatchdogs() {
  const legacyLauncher = join(RUNTIME_DIR, 'start-background-server.ps1');
  const legacyVbs = join(RUNTIME_DIR, 'background-launch.vbs');
  const escape = (value) => value.replaceAll("'", "''");
  const script = `Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'wscript.exe'" | Where-Object { $_.CommandLine -and ($_.CommandLine.Contains('${escape(legacyLauncher)}') -or $_.CommandLine.Contains('${escape(legacyVbs)}')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
  await rm(legacyLauncher, { force: true }).catch(() => {});
  await rm(legacyVbs, { force: true }).catch(() => {});
  await rm(join(RUNTIME_DIR, 'start-background-server-hidden.vbs'), { force: true }).catch(() => {});
}

function spawnWatchdogDetached(nodePath) {
  const child = spawn(nodePath, [WATCHDOG_RUNTIME_PATH, '--config', CONFIG_PATH], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

async function stopWatchdog() {
  const pid = await readLockPid();
  if (isPidAlive(pid)) {
    try {
      process.kill(pid);
    } catch {}
  }
  await rm(LOCK_PATH, { force: true }).catch(() => {});
}

export async function installBackground({
  autoStart = true,
  startTask = true,
  port = 4280,
  serverPath,
  nodePath = process.execPath,
} = {}) {
  if (!serverPath) {
    throw new Error('serverPath is required.');
  }
  await mkdir(RUNTIME_DIR, { recursive: true });
  await mkdir(LOG_DIR, { recursive: true });
  await logInstall(`Configuring '${STARTUP_TASK_NAME}' (autoStart=${autoStart}, startTask=${startTask}, port=${port}).`);

  // The watchdog runs from a copy so npm updates that replace the package
  // directory cannot pull the supervisor out from under a running session.
  await copyFile(join(SCRIPT_DIR, 'background-watchdog.mjs'), WATCHDOG_RUNTIME_PATH);
  await stopLegacyWatchdogs();

  await writeFile(CONFIG_PATH, JSON.stringify({
    NodePath: nodePath,
    ServerPath: serverPath,
    LogPath: SERVER_LOG_PATH,
    StopMarkerPath: STOP_MARKER_PATH,
    Port: port,
  }, null, 2), 'utf8');
  if (startTask) {
    await unlink(STOP_MARKER_PATH).catch(() => {});
  } else {
    await writeFile(STOP_MARKER_PATH, `${new Date().toISOString()}\n`, 'utf8');
  }

  // Scheduled task registration is best-effort: it adds an unlock trigger
  // and Task Scheduler visibility, but some corporate machines reject every
  // registration codepath, so nothing below depends on it succeeding.
  const task = await registerTask({ autoStart, nodePath, workingDir: dirname(serverPath) });
  if (!task.registered) {
    await logInstall('Task Scheduler refused the registration; continuing without it (watchdog + Run entry cover everything).');
  }

  // The HKCU Run entry is the reliable sign-in autostart. It is kept even
  // when the task registered, because the watchdog lockfile makes duplicate
  // launches exit instantly and the Run entry keeps working when Task
  // Scheduler silently fails to fire.
  if (autoStart) {
    const result = await run(REG_EXE, ['add', RUN_KEY, '/v', STARTUP_TASK_NAME, '/t', 'REG_SZ', '/d', launchCommandString(nodePath), '/f']);
    await logInstall(result.ok ? 'Configured sign-in autostart through the HKCU Run entry.' : `Failed to write the HKCU Run entry: ${(result.stderr || result.stdout).trim()}`);
  } else {
    await run(REG_EXE, ['delete', RUN_KEY, '/v', STARTUP_TASK_NAME, '/f']);
  }

  if (startTask && !(await isWatchdogRunning())) {
    spawnWatchdogDetached(nodePath);
    await logInstall('Started the background watchdog directly.');
  }
  return { taskRegistered: task.registered, unlockTrigger: task.registered && task.withTriggers };
}

export async function uninstallBackground() {
  await mkdir(RUNTIME_DIR, { recursive: true });
  await writeFile(STOP_MARKER_PATH, `${new Date().toISOString()}\n`, 'utf8');
  await stopWatchdog();
  await stopLegacyWatchdogs();
  await run(REG_EXE, ['delete', RUN_KEY, '/v', STARTUP_TASK_NAME, '/f']);
  await deleteTask();
  await logInstall(`Removed '${STARTUP_TASK_NAME}' (watchdog stopped, Run entry and scheduled task deleted).`);
}

export async function getBackgroundStatus({ expectedServerPath, expectedPort } = {}) {
  const config = await readConfig();
  const watchdogRunning = await isWatchdogRunning();
  const runKeyValue = await getRunKeyValue();
  const taskXml = await queryTaskXml();
  const taskState = taskXml === null ? null : await queryTaskState();

  const hasLogonTrigger = taskXml !== null && taskXml.includes('<LogonTrigger>');
  const hasUnlockTrigger = taskXml !== null && taskXml.includes('SessionUnlock');
  const actionHealthy = taskXml === null
    || (taskXml.includes(escapeXml(WATCHDOG_RUNTIME_PATH)) && taskXml.includes(escapeXml(CONFIG_PATH)));
  const pathsHealthy = Boolean(config)
    && existsSync(WATCHDOG_RUNTIME_PATH)
    && existsSync(String(config?.NodePath || ''))
    && existsSync(String(config?.ServerPath || ''))
    && (!expectedServerPath || resolvePath(String(config.ServerPath)) === resolvePath(expectedServerPath))
    && (!expectedPort || Number(config.Port) === Number(expectedPort));

  const installed = taskXml !== null || Boolean(runKeyValue) || watchdogRunning;
  if (!installed) {
    return {
      installed: false,
      backgroundEnabled: false,
      autoStartEnabled: false,
      unlockEnabled: false,
      taskState: 'Not installed',
      definitionHealthy: true,
      lastRunTime: null,
      lastTaskResult: null,
      serverPath: null,
      logPath: SERVER_LOG_PATH,
    };
  }
  return {
    installed: true,
    backgroundEnabled: watchdogRunning || taskState === 'Running',
    autoStartEnabled: Boolean(runKeyValue) || hasLogonTrigger,
    unlockEnabled: hasUnlockTrigger,
    taskState: taskXml !== null ? (taskState || 'Ready') : 'Background watchdog (no scheduled task)',
    definitionHealthy: Boolean(pathsHealthy && actionHealthy && (taskXml === null || !hasLogonTrigger || hasUnlockTrigger)),
    lastRunTime: null,
    lastTaskResult: null,
    serverPath: config ? String(config.ServerPath) : null,
    logPath: config ? String(config.LogPath) : SERVER_LOG_PATH,
  };
}

// Minimal CLI so `npm run install-startup` / `npm run remove-startup` keep
// working without PowerShell:
//   node background-manager.mjs install [--port <n>] [--no-autostart]
//   node background-manager.mjs uninstall
//   node background-manager.mjs status
if (process.argv[1] && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href) {
  const [command, ...cliArgs] = process.argv.slice(2);
  const defaultServerPath = resolvePath(join(SCRIPT_DIR, '..', 'server.mjs'));
  const portFlag = cliArgs.indexOf('--port');
  const port = portFlag >= 0 ? Number(cliArgs[portFlag + 1]) : 4280;
  if (command === 'install') {
    const summary = await installBackground({
      autoStart: !cliArgs.includes('--no-autostart'),
      startTask: true,
      port,
      serverPath: defaultServerPath,
    });
    console.log(`Configured '${STARTUP_TASK_NAME}' (task=${summary.taskRegistered}, unlockTrigger=${summary.unlockTrigger}).`);
  } else if (command === 'uninstall') {
    await uninstallBackground();
    console.log(`Removed '${STARTUP_TASK_NAME}'. PDAC will not run in the background or start automatically at sign-in.`);
  } else if (command === 'status') {
    console.log(JSON.stringify(await getBackgroundStatus({}), null, 2));
  } else {
    console.error('Usage: node background-manager.mjs <install [--port <n>] [--no-autostart] | uninstall | status>');
    process.exit(2);
  }
}
