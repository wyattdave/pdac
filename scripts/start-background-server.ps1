param(
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$ServerPath,
  [Parameter(Mandatory = $true)][string]$LogPath,
  [int]$Port = 4280
)

$ErrorActionPreference = 'Stop'

# If PDAC was started in a terminal, wait for it to finish and then take over.
while (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  Start-Sleep -Seconds 3
}

& $NodePath $ServerPath *>> $LogPath
