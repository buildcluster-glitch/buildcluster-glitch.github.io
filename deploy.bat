@echo off
REM Launcher: calls deploy.ps1 with PowerShell.
REM Usage:
REM   deploy.bat               -> auto commit message
REM   deploy.bat "my message"  -> custom commit message
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*
echo.
echo (Exit code: %ERRORLEVEL%)
echo Press any key to close...
pause > nul
