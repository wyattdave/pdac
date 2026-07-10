param(
  [string]$TaskName = 'PDAC Background Server'
)

$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "'$TaskName' is not installed."
  exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Removed '$TaskName'. The current server remains running, but PDAC will not start automatically after the next sign-in."
