@echo off
REM Batch wrapper for Nexkit installation
REM This script provides a simple way to run the PowerShell installation script

echo ========================================
echo Nexkit Installation for VS Code
echo ========================================
echo.

REM Check for administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script requires administrator privileges.
    echo Please right-click and select "Run as administrator"
    echo.
    pause
    exit /b 5
)

echo Starting installation...
echo.

REM Run PowerShell installation script
PowerShell.exe -ExecutionPolicy Bypass -File "%~dp0install-vscode-with-nexkit.ps1" -InstallScope Machine

REM Check exit code
if %errorLevel% equ 0 (
    echo.
    echo ========================================
    echo Installation completed successfully!
    echo ========================================
    echo.
    echo You can now launch Visual Studio Code with Nexkit extension.
) else (
    echo.
    echo ========================================
    echo Installation failed with error code: %errorLevel%
    echo ========================================
    echo.
    echo Please check the log file at: %TEMP%\nexkit-install.log
    echo For more information, see: scripts\README.md
)

echo.
pause
exit /b %errorLevel%
