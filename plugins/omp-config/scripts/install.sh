#!/usr/bin/env bash
# omp-config external-dependency installer: checks the environment and installs
# what this plugin's skills require (officecli binary for the docx skill).
# Idempotent; run anytime. --check reports without installing.
set -u

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

OFFICECLI_INSTALL_URL="https://d.officecli.ai/install.sh"
OFFICECLI_INSTALL_URL_WIN="https://d.officecli.ai/install.ps1"

log()  { printf '[omp-config-install] %s\n' "$*"; }
fail() { printf '[omp-config-install] ERROR: %s\n' "$*" >&2; }

case "$(uname -s 2>/dev/null || echo unknown)" in
  Linux | Darwin) OS="$(uname -s | tr '[:upper:]' '[:lower:]')" ;;
  MINGW* | MSYS* | CYGWIN*) OS="windows" ;;
  *) OS="unknown" ;;
esac

MISSING=0

# officecli's installer commonly drops the binary in one of these without the
# current shell seeing it; probe them up front so reruns are idempotent.
for d in "$HOME/.local/bin" "$HOME/bin" "/usr/local/bin"; do
  [ -x "$d/officecli" ] && PATH="$d:$PATH"
done
hash -r 2>/dev/null

if command -v officecli >/dev/null 2>&1; then
  log "ok: officecli ($(officecli --version 2>/dev/null | head -1))"
else
  log "missing: officecli"
  MISSING=$((MISSING + 1))
fi

if [ "$MISSING" -eq 0 ]; then
  log "all dependencies present, nothing to do"
  exit 0
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
  log "check-only: $MISSING dependency item(s) missing"
  exit 1
fi

if [ "$OS" = "unknown" ]; then
  fail "unsupported OS; install officecli manually from https://github.com/iOfficeAI/OfficeCLI/releases"
  exit 1
fi

# curl is only needed when something must be downloaded; the Windows path uses PowerShell.
if ! command -v curl >/dev/null 2>&1 && [ "$OS" != "windows" ]; then
  fail "curl is required to download the officecli installer; install curl first"
  exit 1
fi

log "installing officecli..."
if [ "$OS" = "windows" ]; then
  powershell -NoProfile -Command "irm $OFFICECLI_INSTALL_URL_WIN | iex" || { fail "officecli install failed"; exit 1; }
else
  curl -fsSL "$OFFICECLI_INSTALL_URL" | bash || { fail "officecli install failed"; exit 1; }
fi

# installers may put the binary on a fresh PATH entry; probe common locations
for d in "$HOME/.local/bin" "$HOME/bin" "/usr/local/bin"; do
  [ -x "$d/officecli" ] && PATH="$d:$PATH"
done
hash -r 2>/dev/null

if command -v officecli >/dev/null 2>&1; then
  log "installed: officecli $(officecli --version 2>/dev/null || echo '')"
else
  fail "officecli still not found after install; open a new terminal or add ~/.local/bin to PATH"
  exit 1
fi

log "environment ready for omp-config Office workflows (docx skill via officecli)"
