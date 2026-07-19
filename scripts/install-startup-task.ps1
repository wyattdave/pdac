param(
  [string]$TaskName = 'PDAC Background Server',
  [ValidateSet('true', 'false')][string]$AutoStart = 'true',
  [ValidateSet('true', 'false')][string]$StartTask = 'true'
)

$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$server = Join-Path $projectDir 'server.mjs'
$runtimeDir = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'PowerDevBoxAdmin\background'
$logDir = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'PowerDevBoxAdmin\logs'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$launcher = Join-Path $runtimeDir 'start-background-server.ps1'
$hiddenLauncher = Join-Path $runtimeDir 'start-background-server-hidden.vbs'
$configPath = Join-Path $runtimeDir 'background-config.json'
$stopMarkerPath = Join-Path $runtimeDir 'stop-requested'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'start-background-server.ps1') -Destination $launcher -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'start-background-server-hidden.vbs') -Destination $hiddenLauncher -Force
[pscustomobject]@{
  NodePath = $node
  ServerPath = $server
  LogPath = (Join-Path $logDir 'server.log')
  StopMarkerPath = $stopMarkerPath
  Port = 4280
} | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8
if ($StartTask -eq 'true') {
  Remove-Item -LiteralPath $stopMarkerPath -Force -ErrorAction SilentlyContinue
}

$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
if (-not (Test-Path -LiteralPath $wscript)) {
  throw "The Windows Script Host was not found at '$wscript'."
}
$arguments = "`"$hiddenLauncher`" `"$launcher`" `"$configPath`""
$action = New-ScheduledTaskAction -Execute $wscript -Argument $arguments -WorkingDirectory $projectDir
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$registration = @{
  TaskName = $TaskName
  Action = $action
  Principal = $principal
  Settings = $settings
  Description = 'Runs the PDAC server and daily report scheduler in the background without a terminal window.'
  Force = $true
}
if ($AutoStart -eq 'true') {
  $logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
  $sessionTriggerClass = Get-CimClass -Namespace 'Root/Microsoft/Windows/TaskScheduler' -ClassName 'MSFT_TaskSessionStateChangeTrigger'
  $unlockTrigger = New-CimInstance -CimClass $sessionTriggerClass -ClientOnly -Property @{
    Enabled = $true
    StateChange = [uint32]8
    UserId = $userId
  }
  $registration.Trigger = @($logonTrigger, $unlockTrigger)
}
Register-ScheduledTask @registration | Out-Null
if ($StartTask -eq 'true') {
  Start-ScheduledTask -TaskName $TaskName
}
Write-Host "Configured '$TaskName' (background=$StartTask, sign-in/unlock=$AutoStart)."
