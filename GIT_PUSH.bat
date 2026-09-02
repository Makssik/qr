@echo off
title Git Push - Upload Updates to GitHub
set "PATH=C:\Program Files\Git\cmd;%PATH%"
cd /d "%~dp0"

echo ========================================================
echo   Uploading updates to GitHub (git push)...
echo ========================================================
echo.

set /p commitMsg="Enter commit message (or press Enter for auto): "
if "%commitMsg%"=="" set commitMsg=Update %date% %time%

git add .
git commit -m "%commitMsg%"
git push origin main

echo.
echo ========================================================
echo   Done!
echo ========================================================
pause
