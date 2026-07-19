Option Explicit

If WScript.Arguments.Count <> 2 Then
  WScript.Quit 2
End If

Dim shell, launcherPath, configPath, command, exitCode
Set shell = CreateObject("WScript.Shell")
launcherPath = WScript.Arguments(0)
configPath = WScript.Arguments(1)

command = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File " _
  & QuoteArgument(launcherPath) & " -ConfigPath " & QuoteArgument(configPath)

' WScript is a GUI-subsystem host. Window style 0 starts the PowerShell
' watchdog and its Node child without allocating or displaying a console.
exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode

Function QuoteArgument(value)
  QuoteArgument = Chr(34) & value & Chr(34)
End Function
