param(
  [string]$TaskName = 'PDAC Background Server',
  [Parameter(Mandatory = $true)][string]$ExpectedServerPath
)

$ErrorActionPreference = 'Stop'
$runtimeDir = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'PowerDevBoxAdmin\background'
$launcherPath = Join-Path $runtimeDir 'start-background-server.ps1'
$hiddenLauncherPath = Join-Path $runtimeDir 'start-background-server-hidden.vbs'
$configPath = Join-Path $runtimeDir 'background-config.json'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if (-not $task) {
  [pscustomobject]@{
    installed = $false
    backgroundEnabled = $false
    autoStartEnabled = $false
    unlockEnabled = $false
    taskState = 'Not installed'
    definitionHealthy = $true
    lastRunTime = $null
    lastTaskResult = $null
    serverPath = $null
    logPath = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'PowerDevBoxAdmin\logs\server.log')
  } | ConvertTo-Json -Compress
  exit 0
}

$info = Get-ScheduledTaskInfo -TaskName $TaskName
$config = $null
try {
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
} catch {
  $config = $null
}
$hasLogonTrigger = @($task.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' }).Count -gt 0
$hasUnlockTrigger = @($task.Triggers | Where-Object {
  $_.CimClass.CimClassName -eq 'MSFT_TaskSessionStateChangeTrigger' -and [int]$_.StateChange -eq 8
}).Count -gt 0
$action = @($task.Actions)[0]
$pathsHealthy = $config -and
  (Test-Path -LiteralPath $launcherPath) -and
  (Test-Path -LiteralPath $hiddenLauncherPath) -and
  (Test-Path -LiteralPath $config.NodePath) -and
  (Test-Path -LiteralPath $config.ServerPath) -and
  ([IO.Path]::GetFullPath([string]$config.ServerPath) -eq [IO.Path]::GetFullPath($ExpectedServerPath))
$actionHealthy = $action -and
  ([string]$action.Execute -match '(?i)wscript(?:\.exe)?$') -and
  ([string]$action.Arguments).Contains($hiddenLauncherPath) -and
  ([string]$action.Arguments).Contains($launcherPath) -and
  ([string]$action.Arguments).Contains($configPath)

[pscustomobject]@{
  installed = $true
  backgroundEnabled = ([string]$task.State -eq 'Running')
  autoStartEnabled = $hasLogonTrigger
  unlockEnabled = $hasUnlockTrigger
  taskState = [string]$task.State
  definitionHealthy = [bool]($pathsHealthy -and $actionHealthy -and (-not $hasLogonTrigger -or $hasUnlockTrigger))
  lastRunTime = if ($info.LastRunTime -and $info.LastRunTime.Year -gt 1900) { $info.LastRunTime.ToString('o') } else { $null }
  lastTaskResult = [int64]$info.LastTaskResult
  serverPath = if ($config) { [string]$config.ServerPath } else { $null }
  logPath = if ($config) { [string]$config.LogPath } else { (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'PowerDevBoxAdmin\logs\server.log') }
} | ConvertTo-Json -Compress
