param(
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$ServerPath,
  [Parameter(Mandatory = $true)][string]$LogPath,
  [int]$Port = 4280
)

$ErrorActionPreference = 'Stop'

# Keep the scheduled task alive for the whole sign-in session. Starting Node is
# also the most reliable port ownership check: while a terminal instance owns
# the port this process exits, then the task retries and takes over as soon as
# the port is released. If the background server later crashes, it is restarted
# here as well instead of leaving the scheduled task in the Ready state.
while ($true) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $client.Connect('127.0.0.1', $Port)
    Start-Sleep -Seconds 3
    continue
  } catch [System.Net.Sockets.SocketException] {
    # Nothing is listening, so this task can become the server owner.
  } finally {
    $client.Dispose()
  }

  & $NodePath $ServerPath *>> $LogPath
  Start-Sleep -Seconds 3
}
