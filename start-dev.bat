@echo off
REM Lance le dev server Crea Process avec redemarrage automatique sur crash.
cd /d "%~dp0"
title Crea Process - Dev Server (auto-restart)
set NODE_OPTIONS=--max-old-space-size=2560
:loop
echo ========================================
echo   Crea Process - http://localhost:3000
echo   (se relance automatiquement si crash)
echo ========================================
call npm run dev
echo.
echo !!! Serveur arrete - redemarrage dans 3 secondes (Ctrl+C pour stopper) !!!
timeout /t 3 /nobreak >/dev/null
goto loop
