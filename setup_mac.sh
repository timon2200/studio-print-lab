#!/usr/bin/env bash
set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo "==========================================================================="
echo "   STUDIO VARAŽDIN · PRINT STUDIO & VECTOR LAB — MAC SETUP"
echo "==========================================================================="

# 1. Check Homebrew & install potrace + resvg for vectorization
if command -v brew >/dev/null 2>&1; then
    echo "-> Checking vectorization CLI tools (potrace, resvg)..."
    command -v potrace >/dev/null 2>&1 || brew install potrace
    command -v resvg >/dev/null 2>&1 || brew install resvg
else
    echo "⚠️  Homebrew not found. If you use SVG vectorization, install Homebrew from https://brew.sh and run: brew install potrace resvg"
fi

# 2. Create Python virtual environment & install dependencies
echo "-> Setting up Python virtual environment (.venv)..."
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt

# 3. Auto-detect Print_Lab_Assets_Pack (in repo, ~/Downloads from AirDrop, ~/Desktop, or external SSD)
FOUND_PACK=""
for candidate in \
    "$APP_DIR/Print_Lab_Assets_Pack" \
    "$HOME/Downloads/Print_Lab_Assets_Pack" \
    "$HOME/Desktop/Print_Lab_Assets_Pack" \
    /Volumes/*/Print_Lab_Assets_Pack; do
    if [ -d "$candidate" ]; then
        FOUND_PACK="$candidate"
        break
    fi
done

if [ -n "$FOUND_PACK" ]; then
    echo "✅ Found Assets Pack at: $FOUND_PACK"
    if [ ! -f "$APP_DIR/.env" ] && [ -f "$FOUND_PACK/.env" ]; then
        cp "$FOUND_PACK/.env" "$APP_DIR/.env"
        echo "✅ Copied API keys (.env) from Print_Lab_Assets_Pack"
    fi
else
    echo "ℹ️  Note: Print_Lab_Assets_Pack not detected yet."
    echo "   Drop 'Print_Lab_Assets_Pack' into this folder, keep it in ~/Downloads (AirDrop), or leave it on a plugged-in SSD."
fi

# Also check if .env was AirDropped directly to ~/Downloads/.env or ~/Downloads/env.txt
if [ ! -f "$APP_DIR/.env" ]; then
    if [ -f "$HOME/Downloads/.env" ]; then
        cp "$HOME/Downloads/.env" "$APP_DIR/.env"
        echo "✅ Found and copied .env from ~/Downloads/.env"
    else
        echo "⚠️  No .env file found in $APP_DIR/.env yet."
        echo "   Place the .env file in $APP_DIR/.env (or inside Print_Lab_Assets_Pack)."
    fi
fi

chmod +x "$APP_DIR/Start_Print_Lab.command" "$APP_DIR/run_print_lab.py" 2>/dev/null || true

echo ""
echo "==========================================================================="
echo "   ✅ SETUP COMPLETE!"
echo "   To launch Print Lab, either:"
echo "     1. Double-click 'Start_Print_Lab.command' in Finder, OR"
echo "     2. Run: ./.venv/bin/python run_print_lab.py"
echo "   Then open: http://localhost:8000"
echo "==========================================================================="
