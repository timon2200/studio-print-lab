#!/usr/bin/env python3
"""
Studio Varaždin — Print Studio & Vector Lab Launcher
Launches the FastAPI backend and provides quick access to the Web UI.
Works both standalone (cloned repo) and inside Studio Varaždin workspace.
"""

import sys
import uvicorn
from pathlib import Path

HERE = Path(__file__).resolve().parent
if (HERE / "app.py").exists():
    APP_PATH = HERE
else:
    APP_PATH = HERE / "tools" / "studio_print_lab"

sys.path.insert(0, str(APP_PATH))

if __name__ == "__main__":
    port = 8000
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])

    print("\n" + "=" * 75)
    print("   STUDIO VARAŽDIN · PRINT STUDIO & VECTOR LAB")
    print("   Photoshop-style AI Background Isolation, Sub-Pixel Vector Tracing")
    print(f"   Application running at: http://localhost:{port}")
    print("=" * 75 + "\n")

    uvicorn.run("app:app", app_dir=str(APP_PATH), host="0.0.0.0", port=port, reload=True)
