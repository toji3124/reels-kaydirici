@echo off
echo Reels Indirici Arka Plan Sunucusu Durduruluyor...
taskkill /F /IM node.exe /FI "WINDOWTITLE ne *" 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%a 2>nul
echo Sunucu basariyla durduruldu.
pause
