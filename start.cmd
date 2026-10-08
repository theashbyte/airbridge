@echo off
rem Double-click to run AirBridge. It restarts itself whenever server.js
rem changes (after a git pull, say), so you never run stale code.
cd /d "%~dp0"
if not defined AIRBRIDGE_PASSWORD set /p AIRBRIDGE_PASSWORD=Passcode (leave blank for none):
node --watch server.js
pause
