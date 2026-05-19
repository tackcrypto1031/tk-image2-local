@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "APP_NAME=Codex Image Canvas"
set "APP_EXE=%~dp0release\win-unpacked\Codex Image Canvas.exe"
set "LOG_DIR=%~dp0data\logs"
set "LOG_FILE=%LOG_DIR%\start.log"
set "BANANA_REMIX_PROJECT_DIR=%~dp0"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>nul

echo [%date% %time%] Starting %APP_NAME% from %~dp0>> "%LOG_FILE%"

if exist "%APP_EXE%" (
  echo Opening packaged app:
  echo   "%APP_EXE%"
  echo [%date% %time%] Using packaged app: %APP_EXE%>> "%LOG_FILE%"
  start "" /D "%~dp0" "%APP_EXE%"
  if errorlevel 1 goto fail
  exit /b 0
)

echo Packaged app was not found.
echo Falling back to Electron development mode.
echo [%date% %time%] Packaged app missing; using npm run dev:electron.>> "%LOG_FILE%"

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found in PATH. Please install Node.js, then run this launcher again.
  echo [%date% %time%] ERROR: npm not found.>> "%LOG_FILE%"
  goto fail
)

if not exist "%~dp0node_modules\electron" (
  echo Installing dependencies...
  echo [%date% %time%] Installing dependencies with npm install.>> "%LOG_FILE%"
  call npm install
  if errorlevel 1 goto fail
)

call npm run dev:electron
if errorlevel 1 goto fail
exit /b 0

:fail
echo.
echo Failed to start %APP_NAME%.
echo See log:
echo   "%LOG_FILE%"
pause
exit /b 1
