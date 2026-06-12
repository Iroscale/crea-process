@echo off
REM ─────────────────────────────────────────────────────────────────────────
REM   Pousse le code vers github.com/Iroscale/crea-process
REM   À lancer depuis cmd.exe Windows (PAS depuis bash) pour que Git
REM   Credential Manager puisse ouvrir une fenêtre browser pour t'authentifier
REM   avec ton compte agence.iroscale@gmail.com.
REM ─────────────────────────────────────────────────────────────────────────

cd /d "%~dp0"
echo.
echo ===============================================
echo  Push vers Iroscale/crea-process
echo ===============================================
echo.
echo Si une fenetre browser s'ouvre :
echo   - Connecte-toi avec agence.iroscale@gmail.com
echo   - PAS avec Luxhorizon (change en haut a droite si besoin)
echo   - Autorise l'acces
echo.
pause

REM Reset le remote sur l'URL propre (sans username embedded qui casse GCM en non-interactif)
git remote set-url iroscale https://github.com/Iroscale/crea-process.git 2>nul
if errorlevel 1 (
    git remote add iroscale https://github.com/Iroscale/crea-process.git
)

git push iroscale main

if errorlevel 1 (
    echo.
    echo ===============================================
    echo  Push echoue. Causes possibles :
    echo  - Mauvais compte GitHub dans la fenetre auth
    echo  - Fenetre auth bloquee par antivirus / firewall
    echo  - Repo github.com/Iroscale/crea-process inexistant
    echo.
    echo  Alternative : utilise GitHub Desktop ou VSCode pour push.
    echo ===============================================
    echo.
    pause
    exit /b 1
)

echo.
echo ===============================================
echo  Push reussi ! Va sur https://vercel.com/new
echo  pour importer le repo et lancer le deploiement.
echo ===============================================
echo.
pause
