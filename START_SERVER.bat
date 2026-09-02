@echo off
title QR Event Manager Server

set "PATH=C:\Program Files\nodejs;%LOCALAPPDATA%\Programs\nodejs;%PATH%"

cd /d "%~dp0"

echo ========================================================
echo   Starting QR Event Manager Server...
echo   Local:   https://localhost:3000/
echo ========================================================
echo.

start https://localhost:3000

call "C:\Program Files\nodejs\npm.cmd" run dev

pause
