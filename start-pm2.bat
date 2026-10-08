@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title Leanna [PM2]

:: Activer le support des sequences ANSI (couleurs) dans la console Windows
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1

:: Caractere d'echappement ANSI
for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"

:: Aller dans le repertoire du script
cd /d "%~dp0"

:: Action demandee (start par defaut)
set "action=%~1"
if "!action!"=="" set "action=start"

:: ---------------------------------------------------------------------------
::  Banniere
:: ---------------------------------------------------------------------------
cls
echo.
echo   %ESC%[48;5;35m%ESC%[30m                                        %ESC%[0m
echo   %ESC%[48;5;35m%ESC%[30m        L E A N N A   -   P M 2         %ESC%[0m
echo   %ESC%[48;5;35m%ESC%[30m                                        %ESC%[0m
echo   %ESC%[90m   Process manager  -  ecosystem.config.cjs%ESC%[0m
echo.

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
for /f "delims=" %%v in ('node -v') do set "node_full=%%v"
call :ok "Node.js !node_full! detected"

:: Verifier PM2
where pm2 >nul 2>&1
if errorlevel 1 (
    call :step "PM2 not found - installing globally"
    call npm install -g pm2
    if errorlevel 1 (
        call :error "Failed to install PM2."
        echo   %ESC%[90m   Try manually: npm install -g pm2%ESC%[0m
        echo.
        pause
        exit /b 1
    )
    call :ok "PM2 installed"
) else (
    call :ok "PM2 available"
)

:: ---------------------------------------------------------------------------
::  Dispatch des actions
:: ---------------------------------------------------------------------------
if /i "!action!"=="stop"    goto :do_stop
if /i "!action!"=="restart" goto :do_restart
if /i "!action!"=="reload"  goto :do_reload
if /i "!action!"=="status"  goto :do_status
if /i "!action!"=="logs"    goto :do_logs
if /i "!action!"=="delete"  goto :do_delete
if /i "!action!"=="start"   goto :do_start

call :error "Unknown action '!action!'."
echo   %ESC%[90m   Usage: start-pm2.bat [start^|stop^|restart^|reload^|status^|logs^|delete]%ESC%[0m
echo.
pause
exit /b 1

:: ---------------------------------------------------------------------------
:do_start
:: S'assurer que le build backend existe (leanna-server depend de dist/server.cjs)
if not exist "node_modules\" (
    call :step "Installing dependencies ^(first run^)"
    call npm install
    if errorlevel 1 ( call :error "Dependency installation failed." & echo. & pause & exit /b 1 )
    call :ok "Dependencies installed"
)
if not exist "dist\server.cjs" (
    call :step "Building backend ^(dist/server.cjs missing^)"
    call npm run build
    if errorlevel 1 ( call :error "Build failed." & echo. & pause & exit /b 1 )
    call :ok "Build complete"
) else (
    call :ok "Backend build present"
)

echo.
call :step "Starting PM2 ecosystem"
call pm2 start ecosystem.config.cjs
if errorlevel 1 ( call :error "PM2 failed to start the ecosystem." & echo. & pause & exit /b 1 )
echo.
call pm2 status
echo.
call :ok "Leanna is running under PM2."
echo   %ESC%[90m   Logs   : start-pm2.bat logs%ESC%[0m
echo   %ESC%[90m   Stop   : start-pm2.bat stop%ESC%[0m
echo   %ESC%[90m   Status : start-pm2.bat status%ESC%[0m
echo.
pause
exit /b 0

:: ---------------------------------------------------------------------------
:do_stop
echo.
call :step "Stopping PM2 ecosystem"
call pm2 stop ecosystem.config.cjs
echo.
call :ok "Stopped."
echo.
pause
exit /b 0

:: ---------------------------------------------------------------------------
:do_restart
echo.
call :step "Restarting PM2 ecosystem"
call pm2 restart ecosystem.config.cjs
echo.
call pm2 status
echo.
call :ok "Restarted."
echo.
pause
exit /b 0

:: ---------------------------------------------------------------------------
:do_reload
echo.
call :step "Reloading PM2 ecosystem ^(zero-downtime^)"
call pm2 reload ecosystem.config.cjs
echo.
call pm2 status
echo.
call :ok "Reloaded."
echo.
pause
exit /b 0

:: ---------------------------------------------------------------------------
:do_status
echo.
call pm2 status
echo.
pause
exit /b 0

:: ---------------------------------------------------------------------------
:do_logs
echo.
call :step "Streaming PM2 logs ^(Ctrl+C to exit^)"
echo.
call pm2 logs
exit /b 0

:: ---------------------------------------------------------------------------
:do_delete
echo.
call :step "Removing Leanna processes from PM2"
call pm2 delete ecosystem.config.cjs
echo.
call :ok "Deleted."
echo.
pause
exit /b 0

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
