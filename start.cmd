@echo off
rem Double-click to run AirBridge, or to restart it. It restarts itself
rem whenever server.js changes (after a git pull, say), so you never run
rem stale code.
cd /d "%~dp0"
if not defined PORT set PORT=8765

rem Stop an AirBridge already on this port (and its --watch parent), so a
rem second double-click is a restart rather than a "port in use" crash.
rem Anything else on the port is left alone.
powershell -NoProfile -Command "foreach ($c in Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue) { $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $c.OwningProcess); if ($p.CommandLine -notlike '*server.js*') { continue }; $q = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $p.ParentProcessId); if ($q.CommandLine -like '*--watch*server.js*') { Stop-Process -Id $q.ProcessId -Force }; Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host 'Stopped the AirBridge that was already running.' }"

if not defined AIRBRIDGE_PASSWORD set /p AIRBRIDGE_PASSWORD=Passcode (leave blank for none):
node --watch server.js
pause
