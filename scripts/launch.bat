@echo off
chcp 65001 >nul
title Social Browser — Quick Launch
cd /d "%~dp0.."

node scripts/launch.mjs %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo   [ERROR] Launch failed. Check the output above for details.
)

echo.
echo   Press any key to close this window...
pause >nul