#!/usr/bin/env python3
"""
Builds the single portable 'Print_Lab_Assets_Pack' folder for AirDrop or External SSD transfer.
Uses zero-extra-space hardlinks on the local Mac while appearing as normal files for AirDrop / Finder copy.
Collects:
  - .env (OpenAI & OpenRouter API keys)
  - previews/ (all 408 WebP optimized catalog previews)
  - masters/ (all 408 high-res PNG/JPG master designs from across the workspace)
  - output/ (all active AI generations, DTF plates, PNG/PSD layers, SVGs, and mockups referenced in SQLite)
"""

import os
import json
import shutil
import sqlite3
from pathlib import Path
from engine.paths import APP_ROOT, WORKSPACE_ROOT
from engine.catalog_manager import CatalogManager


def link_or_copy(src: Path, dst: Path):
    if not src.exists():
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        dst.unlink()
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)
    return True


def build_pack():
    pack_dir = WORKSPACE_ROOT / "Print_Lab_Assets_Pack"
    if pack_dir.exists():
        shutil.rmtree(pack_dir)

    (pack_dir / "previews").mkdir(parents=True, exist_ok=True)
    (pack_dir / "masters").mkdir(parents=True, exist_ok=True)
    for sub in ["ai_cleaned", "dtf", "layers", "vectors", "mockups"]:
        (pack_dir / "output" / sub).mkdir(parents=True, exist_ok=True)

    # 1. Copy .env
    for env_src in [WORKSPACE_ROOT / ".env", APP_ROOT / ".env"]:
        if env_src.exists():
            shutil.copy2(env_src, pack_dir / ".env")
            print(f"[1/4] Included .env from {env_src}")
            break

    # 2. Collect all 408 previews and 408 high-res masters via CatalogManager
    cat = CatalogManager()
    preview_count = 0
    master_count = 0
    for item in cat.items:
        prev_p = Path(item.get("preview_path", ""))
        if prev_p.exists():
            if link_or_copy(prev_p, pack_dir / "previews" / prev_p.name):
                preview_count += 1
        hires_p = Path(item.get("hires_path", ""))
        if hires_p.exists():
            if link_or_copy(hires_p, pack_dir / "masters" / hires_p.name):
                master_count += 1

    print(f"[2/4] Linked {preview_count} WebP previews into Print_Lab_Assets_Pack/previews/")
    print(f"[3/4] Linked {master_count} high-res master designs into Print_Lab_Assets_Pack/masters/")

    # 3. Collect all active SQLite-referenced output files
    db_path = APP_ROOT / "db" / "print_lab.sqlite"
    ref_files = set()
    if db_path.exists():
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT filepath FROM generations WHERE is_deleted=0")
        for r in c.fetchall():
            if r["filepath"]:
                ref_files.add(Path(r["filepath"]).name)

        c.execute("""
            SELECT dtf_filepath, layer_psd_filepath, layer_preview_url,
                   layer_segments_json, vector_svg_filepath, vector_preview_url, mockup_filepath
            FROM image_states
        """)
        for r in c.fetchall():
            for col in ["dtf_filepath", "layer_psd_filepath", "vector_svg_filepath", "mockup_filepath"]:
                if r[col]:
                    ref_files.add(Path(r[col]).name)
            for col in ["layer_preview_url", "vector_preview_url"]:
                if r[col]:
                    ref_files.add(Path(r[col]).name)
            if r["layer_segments_json"]:
                try:
                    for seg in json.loads(r["layer_segments_json"]):
                        if seg.get("filename"):
                            ref_files.add(seg["filename"])
                except Exception:
                    pass
        conn.close()

    out_src_root = APP_ROOT / "output"
    linked_outputs = 0
    for sub in ["ai_cleaned", "dtf", "layers", "vectors", "mockups"]:
        sub_dir = out_src_root / sub
        if not sub_dir.exists():
            continue
        for f in sub_dir.iterdir():
            if f.is_file() and f.name in ref_files:
                if link_or_copy(f, pack_dir / "output" / sub / f.name):
                    linked_outputs += 1

    print(f"[4/4] Linked {linked_outputs} active output files into Print_Lab_Assets_Pack/output/")

    # Calculate logical size
    total_bytes = sum(f.stat().st_size for f in pack_dir.rglob("*") if f.is_file())
    print(f"\n✅ Built portable folder: {pack_dir}")
    print(f"   Total logical size for AirDrop / SSD: {total_bytes / (1024*1024*1024):.2f} GB ({total_bytes / (1024*1024):.1f} MB)")


if __name__ == "__main__":
    build_pack()
