@echo off
setlocal
title Ant Simulator
cd /d "%~dp0"

if not exist "node_modules\typescript\package.json" (
  echo Installing dependencies for the first run...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto setup_failed
)

echo Building the simulator...
call npm run build --silent
if errorlevel 1 goto setup_failed

node "tools\launch.mjs"
set "exit_code=%errorlevel%"
if not "%exit_code%"=="0" (
  echo.
  echo Ant Simulator exited with code %exit_code%.
  pause
)
exit /b %exit_code%

:setup_failed
echo.
echo Setup failed. Open a terminal in this folder and run npm install to see the details.
pause
exit /b 1
