' Opens Layar desktop without a console window.
Option Explicit
Dim sh, fso, dir, electron
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
electron = dir & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(electron) Then
  MsgBox "Komponen Layar belum terpasang. Jalankan npm.cmd install di folder Layar terlebih dahulu.", 48, "Layar"
  WScript.Quit 1
End If
sh.CurrentDirectory = dir
sh.Environment("PROCESS").Remove "ELECTRON_RUN_AS_NODE"
sh.Run """" & electron & """ """ & dir & """", 1, False
