@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title Leanna

:: Activer le support des sequences ANSI (couleurs) dans la console Windows
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1

:: Caracteres d'echappement ANSI
for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"

:: ---------------------------------------------------------------------------
::  Banniere
:: ---------------------------------------------------------------------------
cls
echo.
echo   %ESC%[48;5;27m%ESC%[97m                                        %ESC%[0m
echo   %ESC%[48;5;27m%ESC%[97m              L E A N N A               %ESC%[0m
echo   %ESC%[48;5;27m%ESC%[97m                                        %ESC%[0m
echo   %ESC%[90m   Autonomous AI Workspace  -  v1.6.0%ESC%[0m
echo.

:: Aller dans le repertoire du script
cd /d "%~dp0"

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
call :step "Launching Leanna ^(server + desktop^)"
echo   %ESC%[90m   Press Ctrl+C to stop.%ESC%[0m
echo.

call npm run desktop

set "exit_code=!errorlevel!"
echo.
if !exit_code! NEQ 0 (
    call :error "Leanna exited with code !exit_code!."
) else (
    call :ok "Leanna stopped cleanly."
)
echo.
pause
exit /b !exit_code!

:: ---------------------------------------------------------------------------
::  Fonctions d'affichage
:: ---------------------------------------------------------------------------
:step
echo   %ESC%[96m[*]%ESC%[0m %~1...
goto :eof

:ok
echo   %ESC%[92m[OK]%ESC%[0m %~1
goto :eof

:error
echo   %ESC%[91m[ERROR]%ESC%[0m %~1
goto :eof
