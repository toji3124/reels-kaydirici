@echo off
title Reels Kaydirici - APK Build
echo ============================================
echo   Reels Kaydirici - GitHub Build Tetikleyici
echo ============================================
echo.

cd /d "%~dp0"

echo [1/3] Degisiklikler ekleniyor...
git add -A

echo [2/3] Commit yapiliyor...
set /p MSG="Commit mesaji (bos birakirsan 'update' yazilir): "
if "%MSG%"=="" set MSG=update
git commit -m "%MSG%"

echo [3/3] GitHub'a push yapiliyor (build otomatik baslar)...
git push origin master

echo.
echo ============================================
echo   Push tamamlandi! Build otomatik basladi.
echo   Durumu buradan takip et:
echo   https://github.com/toji3124/reels-kaydirici/actions
echo ============================================
echo.
pause
