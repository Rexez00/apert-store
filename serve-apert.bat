@echo off
REM APERT store launcher — server + worker + public URL. Re-run after any reboot.
cd /d "%~dp0apert-server"
start "APERT server" /min node dist/index.js
start "APERT worker" /min node dist/index-worker.js
echo Waiting for the server to boot...
timeout /t 30 >nul
"C:\Program Files\Tailscale\tailscale.exe" funnel --bg 3002
echo.
echo Shop should be live at your Tailscale funnel URL (shown above).
