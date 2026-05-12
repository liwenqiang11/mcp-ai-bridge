#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v npm >/dev/null 2>&1; then
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # Load a user-local Node.js installed through nvm when non-interactive shells do not expose it.
    . "$HOME/.nvm/nvm.sh"
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js 18+ and npm first, or install nvm under $HOME/.nvm." >&2
  exit 1
fi

npm run start-bridge -- "$@"
