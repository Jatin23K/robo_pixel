@echo off
cd /d "%~dp0"
echo [ROBO] Starting Python OS Tracker...
start /b python tracker.py

echo [ROBO] Launching ROBO Desktop Overlay...
start "" "%~dp0robo.exe"
exit
