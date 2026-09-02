@echo off
title Git Pull - Get Latest Updates from GitHub
set "PATH=C:\Program Files\Git\cmd;%PATH%"
cd /d "%~dp0"

echo ========================================================
echo   Downloading updates from GitHub (git pull)...
echo ========================================================
echo.

git pull origin main

echo.
echo ========================================================
echo   Done!
echo ========================================================
pause
