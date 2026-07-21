param([Parameter(Mandatory = $true)][string]$ConfigPath)

$ErrorActionPreference = 'Stop'

# Re-registering the scheduled task while an earlier watchdog instance is
# still alive (or was orphaned by a task stop) would leave two watchdogs
# fighting over the port. A named mutex keeps this a single-instance loop.
$script:watchdogMutex = [System.Threading.Mutex]::new($false, 'Local\PDACBackgroundServerWatchdog')
if (-not $script:watchdogMutex.WaitOne(0)) {
  exit 0
}

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
while ($true) {
  $config = Read-BackgroundConfig
  if (Test-StopRequested $config.StopMarkerPath) {
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

  if (-not (Test-Path -LiteralPath $config.NodePath)) {
    throw "Node was not found at '$($config.NodePath)'. Repair the PDAC background task."
  }
  if (-not (Test-Path -LiteralPath $config.ServerPath)) {
    throw "PDAC was not found at '$($config.ServerPath)'. Repair the PDAC background task."
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
    & $config.NodePath $config.ServerPath 2>&1 | Out-File -LiteralPath $config.LogPath -Append -Encoding utf8
    $nodeExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  Add-Content -LiteralPath $config.LogPath -Value "[$(Get-Date -Format o)] PDAC Node process exited with code $nodeExitCode; restarting."
  Start-Sleep -Seconds 3
}
