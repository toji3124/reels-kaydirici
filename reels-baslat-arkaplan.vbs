Set WshShell = CreateObject("WScript.Shell")
' Mevcut çalışma dizinini betiğin bulunduğu klasör yap
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
' node server.js'i tamamen arka planda, penceresiz (0) olarak başlat
WshShell.Run "node server.js", 0, False
