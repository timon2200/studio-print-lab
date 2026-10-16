#!/usr/bin/env bash
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

if [ ! -d ".venv" ]; then
    echo "First-time run detected — running setup_mac.sh..."
    bash ./setup_mac.sh
fi

source .venv/bin/activate

# Open browser after 1.5 seconds in background
(sleep 1.5 && open "http://localhost:8000") &

python run_print_lab.py
