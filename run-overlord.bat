@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\restore-overlord.ps1"
if errorlevel 1 (pause & exit /b 1)
if not exist node_modules\vite\bin\vite.js (
  call npm ci
  if errorlevel 1 (pause & exit /b 1)
)
call npm run dev -- --open /overlord.html
pause
