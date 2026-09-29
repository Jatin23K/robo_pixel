Set WshShell = CreateObject("WScript.Shell")
strCurrentDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strCurrentDir

' Launch Python Tracker silently
WshShell.Run "python """ & strCurrentDir & "\tracker.py""", 0, False

' Launch ROBO Desktop App
WshShell.Run """" & strCurrentDir & "\robo.exe""", 1, False
