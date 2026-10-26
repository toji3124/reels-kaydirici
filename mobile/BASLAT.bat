@echo off
chcp 65001 >nul
title Reels, TikTok & YouTube İndirici Studio
color 0B

echo.
echo  ==============================================================
echo     🎬 REELS, TIKTOK & YOUTUBE INDIRICI - PRO STUDIO
echo  ==============================================================
echo.

:: Node.js Kontrolü
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [HATA] Node.js bulunamadi! Lutfen Node.js kurun.
    pause
    exit /b 1
)

:: Python Kontrolü
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [UYARI] Python bulunamadi! TikTok Kesfet toplayici calismayabilir.
) else (
    echo [OK] Python ve Playwright destegi hazir.
)

:: FFmpeg Kontrolü
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo [UYARI] FFmpeg bulunamadi! YouTube uzun videolarda ses birlestirme gecikebilir.
) else (
    echo [OK] FFmpeg hazir.
)

echo [OK] Node.js hazir.
echo.
echo  --------------------------------------------------------------
echo   1. Sunucuyu Baslat ve Web Panelini Ac (Onerilen)
echo   2. Sadece Sunucuyu Baslat (Arka Plan)
echo   3. Mobil Uygulamayi Baslat (Expo Start)
echo  --------------------------------------------------------------
echo.
set /p SECIM="Seciminiz (1-3, varsayilan 1): "

if "%SECIM%"=="3" (
    echo.
    echo [BILGI] Mobil uygulama baslatiliyor (Expo)...
    cd mobile
    npx expo start
    pause
    exit /b
)

echo.
echo [BILGI] Web Paneli baslatiliyor...
start http://localhost:3000

echo.
echo  Sunucu calisiyor: http://localhost:3000
echo  Durdurmak icin bu pencereyi kapatin veya CTRL+C yapin.
echo.

node server.js
pause
