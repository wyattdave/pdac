param([Parameter(Mandatory = $true)][string]$ConfigPath)

$ErrorActionPreference = 'Stop'

$script:watchdogLogPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'PowerDevBoxAdmin\logs\watchdog.log'

function Write-WatchdogLog([string]$Message) {
  try {
    $logDir = Split-Path -Parent $script:watchdogLogPath
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    if ((Test-Path -LiteralPath $script:watchdogLogPath) -and (Get-Item -LiteralPath $script:watchdogLogPath).Length -ge 1MB) {
      Move-Item -LiteralPath $script:watchdogLogPath -Destination "$script:watchdogLogPath.1" -Force
    }
    Add-Content -LiteralPath $script:watchdogLogPath -Value "[$(Get-Date -Format o)] $Message"
  } catch {}
}

# Re-registering the scheduled task while an earlier watchdog instance is
# still alive (or was orphaned by a task stop) would leave two watchdogs
# fighting over the port. A named mutex keeps this a single-instance loop.
$script:watchdogMutex = [System.Threading.Mutex]::new($false, 'Local\PDACBackgroundServerWatchdog')
$script:mutexAcquired = $false
try {
  $script:mutexAcquired = $script:watchdogMutex.WaitOne(0)
} catch [System.Threading.AbandonedMutexException] {
  # A previous watchdog was killed without releasing the mutex. The wait
  # still acquired ownership, so this instance continues as the single owner.
  $script:mutexAcquired = $true
}
if (-not $script:mutexAcquired) {
  Write-WatchdogLog 'Another PDAC watchdog instance is already running; exiting.'
  exit 0
}
Write-WatchdogLog "PDAC watchdog started with configuration '$ConfigPath'."

function Read-BackgroundConfig {
  if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "PDAC background configuration was not found at '$ConfigPath'."
  }
  return Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
}

function Test-StopRequested([string]$StopMarkerPath) {
  if (-not $StopMarkerPath -or -not (Test-Path -LiteralPath $StopMarkerPath)) {
    return $false
  }
  Remove-Item -LiteralPath $StopMarkerPath -Force -ErrorAction SilentlyContinue
  return $true
}

function Rotate-ServerLog([string]$LogPath) {
  if (-not (Test-Path -LiteralPath $LogPath)) {
    return
  }
  $log = Get-Item -LiteralPath $LogPath
  if ($log.Length -lt 5MB) {
    return
  }
  Move-Item -LiteralPath $LogPath -Destination "$LogPath.1" -Force
}

# Keep the scheduled task alive for the whole sign-in session. Starting Node is
# also the most reliable port ownership check: while a terminal instance owns
# the port this process exits, then the task retries and takes over as soon as
# the port is released. If the background server later crashes, it is restarted
# here as well instead of leaving the scheduled task in the Ready state.
# Problems (missing configuration, replaced npm package, moved Node) are logged
# and retried instead of silently ending the task.
while ($true) {
  $config = $null
  try {
    $config = Read-BackgroundConfig
  } catch {
    Write-WatchdogLog "Unable to read the background configuration: $($_.Exception.Message) Retrying in 30 seconds."
    Start-Sleep -Seconds 30
    continue
  }
  if (Test-StopRequested $config.StopMarkerPath) {
    Write-WatchdogLog 'Stop requested; PDAC watchdog exiting.'
    break
  }

  $client = [System.Net.Sockets.TcpClient]::new()
  $portOpen = $false
  try {
    $connection = $client.ConnectAsync('127.0.0.1', [int]$config.Port)
    if ($connection.Wait(1000)) {
      $portOpen = $client.Connected
    }
  } catch {
    $portOpen = $false
  } finally {
    $client.Dispose()
  }
  if ($portOpen) {
    Start-Sleep -Seconds 3
    continue
  }

  $nodePath = [string]$config.NodePath
  if (-not (Test-Path -LiteralPath $nodePath)) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCommand) {
      $nodePath = $nodeCommand.Source
      Write-WatchdogLog "Node was not found at '$($config.NodePath)'; using '$nodePath' instead."
    } else {
      Write-WatchdogLog "Node was not found at '$($config.NodePath)'. Repair the PDAC background task. Retrying in 30 seconds."
      Start-Sleep -Seconds 30
      continue
    }
  }
  if (-not (Test-Path -LiteralPath $config.ServerPath)) {
    Write-WatchdogLog "PDAC was not found at '$($config.ServerPath)'. This can happen after an npm update replaces the package; repair the background task from the PDAC UI. Retrying in 30 seconds."
    Start-Sleep -Seconds 30
    continue
  }

  $logDir = Split-Path -Parent $config.LogPath
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  Rotate-ServerLog $config.LogPath
  $env:PDAC_BACKGROUND_TASK = '1'
  # Run the background server on the same port the enabling server used, so
  # the takeover is transparent to the browser tab that turned it on.
  $env:PORT = [string]$config.Port
  # Windows PowerShell turns a native program's stderr into PowerShell error
  # records. With Stop as the global preference, one console.error from Node
  # would terminate this watchdog as well as the server it is supervising.
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $nodePath $config.ServerPath 2>&1 | Out-File -LiteralPath $config.LogPath -Append -Encoding utf8
    $nodeExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  Add-Content -LiteralPath $config.LogPath -Value "[$(Get-Date -Format o)] PDAC Node process exited with code $nodeExitCode; restarting."
  Start-Sleep -Seconds 3
}
