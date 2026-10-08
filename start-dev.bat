@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title Leanna [DEV]

:: Activer le support des sequences ANSI (couleurs) dans la console Windows
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1

:: Caracteres d'echappement ANSI
for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"

:: ---------------------------------------------------------------------------
::  Banniere
:: ---------------------------------------------------------------------------
cls
echo.
echo   %ESC%[48;5;208m%ESC%[30m                                        %ESC%[0m
echo   %ESC%[48;5;208m%ESC%[30m         L E A N N A   -   D E V        %ESC%[0m
echo   %ESC%[48;5;208m%ESC%[30m                                        %ESC%[0m
echo   %ESC%[90m   Debug mode  -  server + desktop + inspector%ESC%[0m
echo.

:: Aller dans le repertoire du script
cd /d "%~dp0"

:: Dossier de logs
if not exist "logs\" mkdir "logs" >nul 2>&1
for /f "tokens=2 delims==" %%G in ('wmic os get localdatetime /value 2^>nul') do set "dt=%%G"
if defined dt (
    set "stamp=!dt:~0,8!-!dt:~8,6!"
) else (
    set "stamp=session"
)
set "logfile=logs\dev-!stamp!.log"

:: ---------------------------------------------------------------------------
::  Verification de l'environnement
:: ---------------------------------------------------------------------------
call :step "Checking environment"

where node >nul 2>&1
if errorlevel 1 (
    call :error "Node.js is not installed or not in PATH."
    echo   %ESC%[90m   Download: https://nodejs.org/%ESC%[0m
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%i in ('node -v') do set "node_version=%%i"
set "node_version=!node_version:~1!"
for /f "delims=" %%v in ('node -v') do set "node_full=%%v"

if !node_version! LSS 20 (
    call :error "Node.js 20 or higher is required ^(found !node_full!^)."
    echo   %ESC%[90m   Download: https://nodejs.org/%ESC%[0m
    echo.
    pause
    exit /b 1
)
call :ok "Node.js !node_full! detected"

:: ---------------------------------------------------------------------------
::  Dependances
:: ---------------------------------------------------------------------------
if not exist "node_modules\" (
    call :step "Installing dependencies ^(first run^)"
    call npm install
    if errorlevel 1 (
        call :error "Dependency installation failed."
        echo.
        pause
        exit /b 1
    )
    call :ok "Dependencies installed"
) else (
    call :ok "Dependencies already present"
)

:: ---------------------------------------------------------------------------
::  Lancement
:: ---------------------------------------------------------------------------
echo.
call :step "Launching Leanna in DEBUG mode"
echo   %ESC%[90m   Press Ctrl+C to stop.%ESC%[0m

:: Logging optionnel : lancez "start-dev.bat log" pour aussi ecrire un fichier de log
if /i "%~1"=="log" (
    echo   %ESC%[90m   Logging to : !logfile!%ESC%[0m
    echo.
    powershell -NoProfile -Command "npm run desktop:debug 2>&1 | Tee-Object -FilePath '!logfile!'"
    set "logged=1"
) else (
    echo.
    call npm run desktop:debug
    set "logged=0"
)

set "exit_code=!errorlevel!"
echo.
if !exit_code! NEQ 0 (
    call :error "Leanna exited with code !exit_code!."
) else (
    call :ok "Leanna stopped cleanly."
)
if "!logged!"=="1" echo   %ESC%[90m   Full log saved to !logfile!%ESC%[0m
echo.
pause
exit /b !exit_code!

:: ---------------------------------------------------------------------------
::  Fonctions d'affichage
:: ---------------------------------------------------------------------------
:step
echo   %ESC%[93m[*]%ESC%[0m %~1...
goto :eof

:ok
echo   %ESC%[92m[OK]%ESC%[0m %~1
goto :eof

:error
echo   %ESC%[91m[ERROR]%ESC%[0m %~1
goto :eof
