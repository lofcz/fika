#!/usr/bin/env bash
cd "$(dirname "$0")"

if ! command -v bun >/dev/null 2>&1; then
    if ! command -v npm >/dev/null 2>&1; then
        echo "Neither Bun nor npm found."
        echo
        echo "Install Node.js from: https://nodejs.org/en/download/current"
        exit 1
    fi
    echo "Bun not found, installing via npm..."
    npm install -g bun
    if [ $? -ne 0 ]; then
        echo "Failed to install Bun. Install it manually: https://bun.sh"
        exit 1
    fi
fi

bunx 1dxway start "$@"
