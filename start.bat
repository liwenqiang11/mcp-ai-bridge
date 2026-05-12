@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Install Node.js 18+ and npm first.
  exit /b 1
)

npm run start-bridge
