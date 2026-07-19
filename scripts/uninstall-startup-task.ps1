param(
  [string]$TaskName = 'PDAC Background Server'
)

$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "'$TaskName' is not installed."
  exit 0
}

$runtimeDir = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'PowerDevBoxAdmin\background'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Set-Content -LiteralPath (Join-Path $runtimeDir 'stop-requested') -Value (Get-Date).ToString('o') -Encoding utf8
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Removed '$TaskName'. PDAC will not run in the background or start automatically at sign-in."
