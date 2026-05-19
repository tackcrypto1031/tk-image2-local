#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

APP_NAME="Codex Image Canvas"
APP_BUNDLE_ARM64="$SCRIPT_DIR/release/mac-arm64/$APP_NAME.app"
APP_BUNDLE_X64="$SCRIPT_DIR/release/mac/$APP_NAME.app"
LOG_DIR="$SCRIPT_DIR/data/logs"
LOG_FILE="$LOG_DIR/start.log"
export BANANA_REMIX_PROJECT_DIR="$SCRIPT_DIR"

mkdir -p "$LOG_DIR"

timestamp() { date "+%Y-%m-%d %H:%M:%S"; }
log() { echo "[$(timestamp)] $*" >> "$LOG_FILE"; }
fail() {
  echo
  echo "Failed to start $APP_NAME."
  echo "See log:"
  echo "  $LOG_FILE"
  echo
  read -r -p "Press Enter to close this window..." _ || true
  exit 1
}

log "Starting $APP_NAME from $SCRIPT_DIR"

SOURCE_CHECKOUT=0
[ -d "$SCRIPT_DIR/.git" ] && SOURCE_CHECKOUT=1

if [ "$SOURCE_CHECKOUT" = "1" ] && [ "${BANANA_REMIX_USE_PACKAGED:-}" != "1" ]; then
  echo "Source checkout detected."
  echo "Using Electron development mode so start.command reflects the current branch."
  log "Source checkout detected; using Electron development mode."
else
  PACKAGED_APP=""
  if [ -d "$APP_BUNDLE_ARM64" ]; then
    PACKAGED_APP="$APP_BUNDLE_ARM64"
  elif [ -d "$APP_BUNDLE_X64" ]; then
    PACKAGED_APP="$APP_BUNDLE_X64"
  fi

  if [ -n "$PACKAGED_APP" ]; then
    echo "Opening packaged app:"
    echo "  $PACKAGED_APP"
    log "Using packaged app: $PACKAGED_APP"
    open "$PACKAGED_APP" || { log "ERROR: open failed for $PACKAGED_APP"; fail; }
    exit 0
  fi

  echo "Packaged app was not found."
  echo "Falling back to Electron development mode."
  log "Packaged app missing; using Electron development mode."
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found in PATH. Please install Node.js, then run this launcher again."
  log "ERROR: node not found."
  fail
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found in PATH. Please install Node.js, then run this launcher again."
  log "ERROR: npm not found."
  fail
fi

log "Using npm: $(command -v npm)"

check_dependencies() {
  [ -f "$SCRIPT_DIR/node_modules/react/package.json" ] || return 1
  [ -f "$SCRIPT_DIR/node_modules/react-dom/package.json" ] || return 1
  [ -f "$SCRIPT_DIR/node_modules/vite/bin/vite.js" ] || return 1
  [ -f "$SCRIPT_DIR/node_modules/electron/cli.js" ] || return 1
  return 0
}

ensure_dependencies() {
  if check_dependencies; then
    return 0
  fi

  echo "Installing dependencies..."
  log "Installing dependencies with npm install --include=dev."
  if ! npm install --include=dev; then
    return 1
  fi

  if check_dependencies; then
    return 0
  fi

  echo "Dependencies still look incomplete."
  echo "Reinstalling dependencies from scratch..."
  log "Dependencies incomplete after install; removing node_modules and reinstalling."
  rm -rf "$SCRIPT_DIR/node_modules"
  if ! npm install --include=dev; then
    return 1
  fi

  check_dependencies
}

if ! ensure_dependencies; then
  echo "Dependency repair finished, but required files are still missing."
  log "ERROR: Dependency repair failed required-file check."
  fail
fi

if [ ! -f "$SCRIPT_DIR/node_modules/electron/cli.js" ]; then
  echo "Electron CLI was not found after dependency install."
  log "ERROR: node_modules/electron/cli.js missing."
  fail
fi

npm run dev:electron
exit $?
