#!/usr/bin/env python3
"""
Studio Varaždin — Print Lab Portable Path & Environment Resolver
Enables seamless cross-Mac portability via Git + AirDrop / External SSD transfer packs.
"""

import os
from pathlib import Path
from typing import List, Optional
from dotenv import load_dotenv

# APP_ROOT is always the studio_print_lab directory (or cloned repo root)
APP_ROOT = Path(__file__).resolve().parent.parent

# If inside "<Workspace>/tools/studio_print_lab", WORKSPACE_ROOT is "<Workspace>"
# Otherwise (standalone git clone), WORKSPACE_ROOT is APP_ROOT
if APP_ROOT.parent.name == "tools":
    WORKSPACE_ROOT = APP_ROOT.parent.parent
else:
    WORKSPACE_ROOT = APP_ROOT

PACK_FOLDER_NAMES = ["Print_Lab_Assets_Pack", " studio_print_lab_assets", "assets_pack"]


def get_assets_pack_dirs() -> List[Path]:
    """
    Returns all existing Print_Lab_Assets_Pack directories across:
    1. Explicit env var PRINT_LAB_ASSETS_DIR
    2. Inside the cloned repo (APP_ROOT / Print_Lab_Assets_Pack)
    3. Parent workspace (WORKSPACE_ROOT / Print_Lab_Assets_Pack)
    4. macOS AirDrop default folder (~/Downloads/Print_Lab_Assets_Pack)
    5. macOS Desktop (~/Desktop/Print_Lab_Assets_Pack)
    6. Any mounted external SSD / USB drive (/Volumes/*/Print_Lab_Assets_Pack)
    """
    candidates: List[Path] = []

    env_dir = os.getenv("PRINT_LAB_ASSETS_DIR", "").strip()
    if env_dir:
        candidates.append(Path(env_dir).expanduser())

    home = Path.home()
    for pack_name in ["Print_Lab_Assets_Pack", "assets_pack"]:
        candidates.extend([
            APP_ROOT / pack_name,
            WORKSPACE_ROOT / pack_name,
            home / "Downloads" / pack_name,
            home / "Desktop" / pack_name,
        ])

    volumes = Path("/Volumes")
    if volumes.exists():
        try:
            for vol in volumes.iterdir():
                if vol.is_dir() and not vol.name.startswith("."):
                    candidates.append(vol / "Print_Lab_Assets_Pack")
        except Exception:
            pass

    existing: List[Path] = []
    seen = set()
    for c in candidates:
        try:
            if c.exists() and c.is_dir():
                resolved = str(c.resolve())
                if resolved not in seen:
                    seen.add(resolved)
                    existing.append(c)
        except Exception:
            pass
    return existing


def load_print_lab_env() -> None:
    """Loads .env from APP_ROOT, WORKSPACE_ROOT, or any discovered AirDrop/SSD Assets Pack."""
    env_candidates = [
        APP_ROOT / ".env",
        WORKSPACE_ROOT / ".env",
    ]
    for pack_dir in get_assets_pack_dirs():
        env_candidates.append(pack_dir / ".env")

    for env_path in env_candidates:
        if env_path.exists():
            load_dotenv(env_path, override=False)


def resolve_portable_path(path_str: Optional[str]) -> str:
    """
    Translates any hardcoded or foreign Mac filepath (e.g. /Users/timonterzic/...)
    to the valid local path on the current machine.
    """
    if not path_str:
        return ""

    p = Path(path_str)
    if p.exists():
        return str(p)

    norm = path_str.replace("\\", "/")
    pack_dirs = get_assets_pack_dirs()

    # 1. Check if it's an output/ file (ai_cleaned, dtf, layers, vectors, mockups)
    if "/output/" in norm:
        rel_out = norm.split("/output/", 1)[1]
        local_out = APP_ROOT / "output" / rel_out
        if local_out.exists():
            return str(local_out)
        for pack_dir in pack_dirs:
            pack_out = pack_dir / "output" / rel_out
            if pack_out.exists():
                return str(pack_out)

    # 2. Check if it's an uploads/ file
    if "/uploads/" in norm:
        rel_up = norm.split("/uploads/", 1)[1]
        local_up = APP_ROOT / "uploads" / rel_up
        if local_up.exists():
            return str(local_up)

    # 3. Check if it's a swiper optimized preview
    if "swiper/assets/optimized/" in norm:
        fname = Path(norm).name
        for candidate in [
            WORKSPACE_ROOT / "varazdin.studio" / "swiper" / "assets" / "optimized" / fname,
            APP_ROOT / "assets" / "previews" / fname,
        ] + [pd / "previews" / fname for pd in pack_dirs]:
            if candidate.exists():
                return str(candidate)

    # 4. Check relative to WORKSPACE_ROOT if prefixed with an old Studio Varazdin path
    if "/Studio Varazdin/" in norm:
        rel_ws = norm.split("/Studio Varazdin/", 1)[1]
        ws_cand = WORKSPACE_ROOT / rel_ws
        if ws_cand.exists():
            return str(ws_cand)
        app_cand = APP_ROOT / rel_ws
        if app_cand.exists():
            return str(app_cand)

    # 5. Check by filename inside Assets Pack (masters / previews / output subfolders)
    fname = p.name
    if fname:
        for pack_dir in pack_dirs:
            for sub in ["masters", "previews", "output/ai_cleaned", "output/dtf", "output/layers", "output/vectors", "output/mockups"]:
                cand = pack_dir / sub / fname
                if cand.exists():
                    return str(cand)
        for sub in ["output/ai_cleaned", "output/dtf", "output/layers", "output/vectors", "output/mockups", "uploads"]:
            cand = APP_ROOT / sub / fname
            if cand.exists():
                return str(cand)

    return path_str


# Initialize environment immediately on import
load_print_lab_env()
