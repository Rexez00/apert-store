@echo off
REM APERT store launcher — starts backend + worker, then opens the shop.
cd /d "%~dp0apert-server"
start "APERT server" node dist/index.js
start "APERT worker" node dist/index-worker.js
echo Starting APERT store...
timeout /t 12 >nul
start http://localhost:3002/
echo Shop should now be open at http://localhost:3002/
