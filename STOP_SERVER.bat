@echo off
title Stop QR Event Manager Server

echo ========================================================
echo   Stopping QR Event Manager Server...
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"

echo Server stopped successfully!
echo ========================================================
echo.
powershell -NoProfile -Command "Start-Sleep -Seconds 2"
