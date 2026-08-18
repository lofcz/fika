@echo off
cd /d "%~dp0"
where bun >nul 2>nul
if %errorlevel% neq 0 (
    where npm >nul 2>nul
    if %errorlevel% neq 0 (
        echo Neither Bun nor npm found.
        echo.
        echo Install Node.js from: https://nodejs.org/en/download/current
        exit /b 1
    )
    echo Bun not found, installing via npm...
    call npm install -g bun
    if %errorlevel% neq 0 (
        echo Failed to install Bun. Install it manually: https://bun.sh
        exit /b 1
    )
)
bunx 1dxway start %*
