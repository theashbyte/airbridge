@echo off
rem AirBridge: double-click to start everything, or to restart it.
rem   1. Stops an AirBridge that is already running on this port.
rem   2. Starts the Cloudflare Tunnel, if you have one set up and it isn't running.
rem   3. Starts AirBridge (it restarts itself whenever server.js changes).
rem   4. Opens it in your browser.
rem The passcode is set and changed on the website: Settings > Passcode.
title AirBridge
cd /d "%~dp0"
if not defined PORT set PORT=8765

where node >nul 2>nul || (
  echo Node.js is not installed. Get it from https://nodejs.org, then run this again.
  pause & exit /b 1
)

rem Stop an AirBridge already on this port (and its --watch parent).
rem Anything else on the port is left alone.
powershell -NoProfile -Command "foreach ($c in Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue) { $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $c.OwningProcess); if ($p.CommandLine -notlike '*server.js*') { continue }; $q = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $p.ParentProcessId); if ($q.CommandLine -like '*--watch*server.js*') { Stop-Process -Id $q.ProcessId -Force }; Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host 'Stopped the AirBridge that was already running.' }"

rem The tunnel (for the Internet address). Skipped if not set up, or already running.
set "CLOUDFLARED="
for %%x in (cloudflared.exe) do if not "%%~$PATH:x"=="" set "CLOUDFLARED=%%~$PATH:x"
if not defined CLOUDFLARED if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "CLOUDFLARED=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not defined CLOUDFLARED if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "CLOUDFLARED=%ProgramFiles%\cloudflared\cloudflared.exe"
if defined CLOUDFLARED if exist "%USERPROFILE%\.cloudflared\config.yml" (
  tasklist /fi "imagename eq cloudflared.exe" | find /i "cloudflared.exe" >nul && (
    echo Tunnel is already running.
  ) || (
    echo Starting the tunnel in its own minimized window...
    start "AirBridge tunnel" /min "%CLOUDFLARED%" tunnel run
  )
) else (
  echo No Cloudflare Tunnel set up - Wi-Fi only. That's fine.
)

rem Open the browser once the server has had a moment to start.
start "" /b cmd /c "ping -n 3 127.0.0.1 >nul & start http://localhost:%PORT%"

node --watch server.js
pause
