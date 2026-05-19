@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "APP_NAME=Codex Image Canvas"
set "APP_EXE=%~dp0release\win-unpacked\Codex Image Canvas.exe"
set "LOG_DIR=%~dp0data\logs"
set "LOG_FILE=%LOG_DIR%\start.log"
set "BANANA_REMIX_PROJECT_DIR=%~dp0"
set "SOURCE_CHECKOUT="
if exist "%~dp0.git" set "SOURCE_CHECKOUT=1"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>nul

echo [%date% %time%] Starting %APP_NAME% from %~dp0>> "%LOG_FILE%"

if defined SOURCE_CHECKOUT if not "%BANANA_REMIX_USE_PACKAGED%"=="1" (
  echo Source checkout detected.
  echo Using Electron development mode so start.bat reflects the current branch.
  echo [%date% %time%] Source checkout detected; using Electron development mode.>> "%LOG_FILE%"
  goto dev_mode
)

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
echo [%date% %time%] Packaged app missing; using Electron development mode.>> "%LOG_FILE%"

:dev_mode
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH. Please install Node.js, then run this launcher again.
  echo [%date% %time%] ERROR: node not found.>> "%LOG_FILE%"
  goto fail
)

set "NPM_CMD="
for /f "delims=" %%I in ('where npm.cmd 2^>nul') do (
  if not defined NPM_CMD set "NPM_CMD=%%I"
)
if not defined NPM_CMD (
  for /f "delims=" %%I in ('where npm 2^>nul') do (
    if not defined NPM_CMD set "NPM_CMD=%%I"
  )
)

if not defined NPM_CMD (
  echo npm was not found in PATH. Please install Node.js, then run this launcher again.
  echo [%date% %time%] ERROR: npm not found.>> "%LOG_FILE%"
  goto fail
)

echo [%date% %time%] Using npm: %NPM_CMD%>> "%LOG_FILE%"

call :ensure_dependencies
if errorlevel 1 goto fail

if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  if not exist "%~dp0node_modules\electron\install.js" (
    echo Electron installer was not found after dependency install.
    echo [%date% %time%] ERROR: node_modules\electron\install.js missing.>> "%LOG_FILE%"
    goto fail
  )

  echo Installing Electron runtime...
  echo [%date% %time%] Electron runtime missing; running electron install.js directly.>> "%LOG_FILE%"
  call node "%~dp0node_modules\electron\install.js"
  if errorlevel 1 goto fail

  if not exist "%~dp0node_modules\electron\dist\electron.exe" (
    echo Electron runtime install finished, but electron.exe is still missing.
    echo [%date% %time%] ERROR: Electron runtime install did not produce dist\electron.exe.>> "%LOG_FILE%"
    goto fail
  )
)

call "%NPM_CMD%" run dev:electron
if errorlevel 1 goto fail
exit /b 0

:ensure_dependencies
call :check_dependencies
if "%DEPS_OK%"=="1" exit /b 0

echo Installing dependencies...
echo [%date% %time%] Installing dependencies with npm install --include=dev.>> "%LOG_FILE%"
call "%NPM_CMD%" install --include=dev
if errorlevel 1 exit /b 1

call :check_dependencies
if "%DEPS_OK%"=="1" exit /b 0

echo Dependencies still look incomplete.
echo Reinstalling dependencies from scratch...
echo [%date% %time%] Dependencies incomplete after install; removing node_modules and reinstalling.>> "%LOG_FILE%"
if exist "%~dp0node_modules" rmdir /s /q "%~dp0node_modules"
if errorlevel 1 exit /b 1

call "%NPM_CMD%" install --include=dev
if errorlevel 1 exit /b 1

call :check_dependencies
if "%DEPS_OK%"=="1" exit /b 0

echo Dependency repair finished, but required files are still missing.
echo [%date% %time%] ERROR: Dependency repair failed required-file check.>> "%LOG_FILE%"
exit /b 1

:check_dependencies
set "DEPS_OK=1"
if not exist "%~dp0node_modules\react\package.json" set "DEPS_OK=0"
if not exist "%~dp0node_modules\react-dom\package.json" set "DEPS_OK=0"
if not exist "%~dp0node_modules\vite\bin\vite.js" set "DEPS_OK=0"
if not exist "%~dp0node_modules\electron\cli.js" set "DEPS_OK=0"
exit /b 0

:fail
echo.
echo Failed to start %APP_NAME%.
echo See log:
echo   "%LOG_FILE%"
pause
exit /b 1
