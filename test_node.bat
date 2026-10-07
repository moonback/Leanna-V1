@echo off
for /f "tokens=1 delims=." %%i in ('node -v') do set node_version=%%i
set node_version=%node_version:~1%
echo Node version is %node_version%
if %node_version% LSS 20 (
    echo Too old
) else (
    echo OK
)
pause