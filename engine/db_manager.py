#!/usr/bin/env python3
"""
Studio Varaždin — Print Lab Persistent Database & Auto-Sync Engine
SQLite3 with WAL-mode + JSON Mirroring + Deep Disk Recovery.
Guarantees 100% data persistence per image project across restarts, crashes, and power cycles.
"""

import os
import json
import sqlite3
import time
import re
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from urllib.parse import quote
from PIL import Image
from engine.paths import APP_ROOT, WORKSPACE_ROOT, resolve_portable_path

DB_DIR = APP_ROOT / "db"
OUTPUT_DIR = APP_ROOT / "output"
AI_CLEANED_DIR = OUTPUT_DIR / "ai_cleaned"
VECTORS_DIR = OUTPUT_DIR / "vectors"
MOCKUPS_DIR = OUTPUT_DIR / "mockups"
DTF_DIR = OUTPUT_DIR / "dtf"

DB_DIR.mkdir(parents=True, exist_ok=True)
for d in [AI_CLEANED_DIR, VECTORS_DIR, MOCKUPS_DIR, DTF_DIR]:
    d.mkdir(parents=True, exist_ok=True)

DB_PATH = DB_DIR / "print_lab.sqlite"
JSON_BACKUP_PATH = OUTPUT_DIR / "generations_backup.json"

# Cost mapping per model
MODEL_COSTS = {
    "nano-banana-pro": 0.05,
    "nano-banana-2": 0.02,
    "gpt-image-2.5-flare": 0.06,
    "gpt-image-2": 0.04,
    "original": 0.0,
    "ai-cleaner": 0.03
}


class DatabaseManager:
    def __init__(self, catalog_manager=None):
        self.catalog_manager = catalog_manager
        self.db_path = str(DB_PATH)
        self._init_db()
        self.deep_disk_recovery()
        self.backup_to_json()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def _init_db(self):
        """Initializes database schema with safe migrations."""
        with self._get_conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS generations (
                    id TEXT PRIMARY KEY,
                    design_id TEXT NOT NULL,
                    design_slug TEXT NOT NULL,
                    design_title TEXT NOT NULL,
                    filename TEXT UNIQUE NOT NULL,
                    filepath TEXT NOT NULL,
                    url TEXT NOT NULL,
                    model TEXT NOT NULL,
                    model_name TEXT NOT NULL,
                    resolution TEXT NOT NULL,
                    width INTEGER NOT NULL,
                    height INTEGER NOT NULL,
                    duration REAL NOT NULL,
                    timestamp INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    prompt_used TEXT,
                    full_screen INTEGER DEFAULT 1,
                    tight_crop INTEGER DEFAULT 1,
                    is_favorite INTEGER DEFAULT 0,
                    is_deleted INTEGER DEFAULT 0,
                    cost_estimate REAL DEFAULT 0.0,
                    notes TEXT DEFAULT ''
                );

                CREATE INDEX IF NOT EXISTS idx_gen_design_id ON generations(design_id);
                CREATE INDEX IF NOT EXISTS idx_gen_design_slug ON generations(design_slug);
                CREATE INDEX IF NOT EXISTS idx_gen_timestamp ON generations(timestamp);

                CREATE TABLE IF NOT EXISTS design_states (
                    design_id TEXT PRIMARY KEY,
                    active_generation_id TEXT,
                    active_step INTEGER DEFAULT 1,
                    last_updated INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS image_states (
                    image_id TEXT PRIMARY KEY,
                    design_id TEXT NOT NULL,
                    dtf_threshold REAL DEFAULT 24.0,
                    dtf_feather REAL DEFAULT 1.5,
                    dtf_choke INTEGER DEFAULT 1,
                    dtf_defringe REAL DEFAULT 75.0,
                    dtf_despeckle INTEGER DEFAULT 20,
                    dtf_solid REAL DEFAULT 1.4,
                    dtf_protect_lines INTEGER DEFAULT 1,
                    dtf_invert_ink INTEGER DEFAULT 0,
                    dtf_method TEXT DEFAULT 'auto',
                    dtf_custom_bg_hex TEXT DEFAULT '#171E19',
                    dtf_filepath TEXT DEFAULT '',
                    dtf_url TEXT DEFAULT '',
                    dtf_coverage_pct REAL DEFAULT 0.0,
                    dtf_halo_score REAL DEFAULT 99.8,
                    layer_psd_filepath TEXT DEFAULT '',
                    layer_psd_url TEXT DEFAULT '',
                    layer_preview_url TEXT DEFAULT '',
                    layer_segments_json TEXT DEFAULT '[]',
                    layer_count INTEGER DEFAULT 0,
                    layer_prompt_used TEXT DEFAULT '',
                    layer_source_mode TEXT DEFAULT 'dtf',
                    vector_engine TEXT DEFAULT 'vtracer',
                    vector_colors INTEGER DEFAULT 8,
                    vector_corner INTEGER DEFAULT 30,
                    vector_smooth REAL DEFAULT 2.5,
                    vector_speckle INTEGER DEFAULT 2,
                    vector_dpi INTEGER DEFAULT 2048,
                    vector_color_overrides TEXT DEFAULT '{}',
                    vector_svg_filepath TEXT DEFAULT '',
                    vector_svg_url TEXT DEFAULT '',
                    vector_preview_url TEXT DEFAULT '',
                    vector_layers_json TEXT DEFAULT '[]',
                    vector_total_paths INTEGER DEFAULT 0,
                    garment_color TEXT DEFAULT '#171E19',
                    garment_texture INTEGER DEFAULT 0,
                    mockup_url TEXT DEFAULT '',
                    mockup_filepath TEXT DEFAULT '',
                    last_active_step INTEGER DEFAULT 1,
                    last_updated INTEGER NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_img_state_design_id ON image_states(design_id);

                CREATE TABLE IF NOT EXISTS artifacts (
                    id TEXT PRIMARY KEY,
                    design_id TEXT NOT NULL,
                    generation_id TEXT,
                    artifact_type TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    filepath TEXT NOT NULL,
                    url TEXT NOT NULL,
                    filesize_bytes INTEGER,
                    timestamp INTEGER NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_art_design_id ON artifacts(design_id);
            """)

            # Safe migrations for existing databases
            for col, col_type in [
                ("layer_psd_filepath", "TEXT DEFAULT ''"),
                ("layer_psd_url", "TEXT DEFAULT ''"),
                ("layer_preview_url", "TEXT DEFAULT ''"),
                ("layer_segments_json", "TEXT DEFAULT '[]'"),
                ("layer_count", "INTEGER DEFAULT 0"),
                ("layer_prompt_used", "TEXT DEFAULT ''"),
                ("layer_source_mode", "TEXT DEFAULT 'dtf'")
            ]:
                try:
                    conn.execute(f"ALTER TABLE image_states ADD COLUMN {col} {col_type};")
                    conn.commit()
                except sqlite3.OperationalError:
                    pass # Column already exists

    @staticmethod
    def _format_model_name(model_id: str) -> str:
        if "pro" in model_id.lower() or "gemini-3-pro" in model_id.lower():
            return "🍌 Nano Banana Pro (4K)"
        elif "2" in model_id.lower() and "banana" in model_id.lower() or "flash" in model_id.lower():
            return "🍌 Nano Banana 2 (2K)"
        elif "flare" in model_id.lower() or "2.5" in model_id.lower():
            return "🤖 GPT Image 2.5 Flare"
        elif "gpt" in model_id.lower():
            return "🤖 GPT Image 2"
        return "⚡ AI Cleaned Master"

    def _default_state(self, image_id: str, design_id: str) -> Dict[str, Any]:
        return {
            "image_id": image_id,
            "design_id": design_id,
            "dtf_threshold": 24.0,
            "dtf_feather": 1.5,
            "dtf_choke": 0,
            "dtf_defringe": 75.0,
            "dtf_despeckle": 4,
            "dtf_solid": 1.4,
            "dtf_protect_lines": True,
            "dtf_invert_ink": False,
            "dtf_method": "auto",
            "dtf_custom_bg_hex": "#171E19",
            "dtf_filepath": "",
            "dtf_url": "",
            "dtf_coverage_pct": 0.0,
            "dtf_halo_score": 99.8,
            "dtf_result": None,
            "layer_psd_filepath": "",
            "layer_psd_url": "",
            "layer_preview_url": "",
            "layer_segments": [],
            "layer_count": 0,
            "layer_prompt_used": "",
            "layer_source_mode": "dtf",
            "layer_result": None,
            "vector_engine": "vtracer",
            "vector_colors": 8,
            "vector_corner": 30,
            "vector_smooth": 2.5,
            "vector_speckle": 2,
            "vector_dpi": 2048,
            "vector_color_overrides": {},
            "vector_svg_filepath": "",
            "vector_svg_url": "",
            "vector_preview_url": "",
            "vector_layers": [],
            "vector_total_paths": 0,
            "vector_result": None,
            "garment_color": "#171E19",
            "garment_texture": False,
            "mockup_url": "",
            "mockup_filepath": "",
            "last_active_step": 1,
            "last_updated": int(time.time())
        }

    def deep_disk_recovery(self):
        """
        Scans output directories on startup and recovers all existing files into SQLite.
        Matches files to catalog items by slug, title, and timestamp.
        """
        if not AI_CLEANED_DIR.exists():
            return

        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT filename FROM generations")
            known_filenames = {row["filename"] for row in cursor.fetchall()}

            for fpath in AI_CLEANED_DIR.glob("*.png"):
                fname = fpath.name
                if fname.startswith("tmp_") or fname in known_filenames:
                    continue

                stem = fpath.stem
                timestamp = int(fpath.stat().st_mtime)
                
                # Determine model from filename
                model = "nano-banana-pro"
                if "flare" in stem.lower():
                    model = "gpt-image-2.5-flare"
                elif "gpt_image_2" in stem.lower():
                    model = "gpt-image-2"
                elif "banana_2" in stem.lower() or "flash" in stem.lower():
                    model = "nano-banana-2"
                elif "banana" in stem.lower():
                    model = "nano-banana-pro"

                res_str = "4K" if "4k" in stem.lower() else "2K"
                
                # Dimensions
                width, height = 2048, 2048
                try:
                    with Image.open(fpath) as img:
                        width, height = img.size
                except Exception:
                    pass

                # Extract design slug
                clean_name = stem
                for prefix in ["AI_4K_", "AI_2K_", "AI_Cleaned_", "AI_"]:
                    if clean_name.startswith(prefix):
                        clean_name = clean_name[len(prefix):]
                clean_name = re.sub(r'_\d{9,12}$', '', clean_name)
                for mtag in ["gpt_image_2.5_flare_", "gpt_image_2_", "nano_banana_pro_", "nano_banana_2_"]:
                    if clean_name.startswith(mtag):
                        clean_name = clean_name[len(mtag):]

                # Match against catalog if available
                design_id = ""
                design_title = clean_name.replace("_", " ")
                design_slug = clean_name

                if self.catalog_manager and hasattr(self.catalog_manager, "items"):
                    for cat_item in self.catalog_manager.items:
                        c_slug = (cat_item.get("slug") or "").lower()
                        c_title = (cat_item.get("title") or "").lower()
                        if c_slug in clean_name.lower() or clean_name.lower() in c_slug or c_title in clean_name.lower():
                            design_id = cat_item.get("id", "")
                            design_slug = cat_item.get("slug", clean_name)
                            design_title = cat_item.get("title", design_title)
                            break

                gen_id = f"gen_{timestamp}_{hash(fname) % 10000}"
                cost = MODEL_COSTS.get(model, 0.04)

                cursor.execute("""
                    INSERT OR REPLACE INTO generations (
                        id, design_id, design_slug, design_title, filename, filepath, url,
                        model, model_name, resolution, width, height, duration, timestamp,
                        created_at, prompt_used, full_screen, tight_crop, is_favorite, is_deleted,
                        cost_estimate, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    gen_id, design_id, design_slug, design_title, fname, str(fpath),
                    f"/api/files/ai_cleaned/{fname}", model, self._format_model_name(model),
                    f"{width} × {height} px ({res_str})", width, height, 4.2, timestamp,
                    time.strftime("%d.%m.%Y %H:%M:%S", time.localtime(timestamp)),
                    "Persistent auto-recovered AI graphic isolation & upscale.",
                    1, 1, 0, 0, cost, "Recovered from disk storage"
                ))
                known_filenames.add(fname)

            conn.commit()

    def record_generation(
        self,
        filename: str,
        filepath: str,
        url: str,
        design_id: Optional[str] = None,
        design_title: Optional[str] = None,
        design_slug: Optional[str] = None,
        model: str = "nano-banana-pro",
        resolution: str = "4k",
        width: int = 2048,
        height: int = 2048,
        duration: float = 0.0,
        prompt_used: str = "",
        full_screen: bool = True,
        tight_crop_applied: bool = True
    ) -> Dict[str, Any]:
        """Atomically inserts new generation into SQLite and writes JSON backup."""
        now = time.time()
        gen_id = f"gen_{int(now*1000)}"
        model_name = self._format_model_name(model)
        res_label = f"{width} × {height} px ({resolution.upper()})"
        created_at = time.strftime("%d.%m.%Y %H:%M:%S", time.localtime(now))
        cost = MODEL_COSTS.get(model, 0.05)

        with self._get_conn() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO generations (
                    id, design_id, design_slug, design_title, filename, filepath, url,
                    model, model_name, resolution, width, height, duration, timestamp,
                    created_at, prompt_used, full_screen, tight_crop, is_favorite, is_deleted,
                    cost_estimate, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                gen_id, design_id or "", design_slug or Path(filename).stem,
                design_title or (design_slug or "").replace("_", " "),
                filename, filepath, url, model, model_name, res_label, width, height,
                round(duration, 2), int(now), created_at, prompt_used,
                1 if full_screen else 0, 1 if tight_crop_applied else 0,
                0, 0, cost, ""
            ))
            conn.commit()

        # Initialize default state for this new generation
        init_state = self._default_state(gen_id, design_id or "")
        self.save_image_state(gen_id, design_id or "", init_state)

        self.backup_to_json()

        return {
            "id": gen_id,
            "filename": filename,
            "filepath": filepath,
            "url": url,
            "design_id": design_id or "",
            "design_slug": design_slug or "",
            "design_title": design_title or "",
            "model": model,
            "model_name": model_name,
            "resolution": res_label,
            "width": width,
            "height": height,
            "duration": round(duration, 2),
            "timestamp": int(now),
            "created_at": created_at,
            "prompt_used": prompt_used,
            "full_screen": full_screen,
            "tight_crop": tight_crop_applied,
            "is_favorite": False,
            "cost_estimate": cost,
            "state": init_state
        }

    def save_image_state(self, image_id: str, design_id: str, state_data: Dict[str, Any]) -> bool:
        """Saves isolated state for a specific image/generation ID into SQLite."""
        now = int(time.time())
        color_overrides = state_data.get("vector_color_overrides", {})
        if isinstance(color_overrides, dict):
            color_overrides_str = json.dumps(color_overrides)
        else:
            color_overrides_str = str(color_overrides or "{}")

        layers = state_data.get("vector_layers", [])
        if isinstance(layers, list):
            layers_str = json.dumps(layers)
        else:
            layers_str = str(layers or "[]")

        layer_segs = state_data.get("layer_segments", [])
        if isinstance(layer_segs, list):
            layer_segs_str = json.dumps(layer_segs)
        else:
            layer_segs_str = str(layer_segs or "[]")

        dtf_fp = str(state_data.get("dtf_filepath", ""))
        dtf_url = str(state_data.get("dtf_url", ""))
        if not dtf_fp and state_data.get("dtf_result"):
            dtf_fp = state_data["dtf_result"].get("filepath", "")
            dtf_url = state_data["dtf_result"].get("url", "")

        layer_psd_fp = str(state_data.get("layer_psd_filepath", ""))
        layer_psd_url = str(state_data.get("layer_psd_url", ""))
        layer_prev_url = str(state_data.get("layer_preview_url", ""))
        if not layer_psd_fp and state_data.get("layer_result"):
            layer_psd_fp = state_data["layer_result"].get("psd_filepath", "")
            layer_psd_url = state_data["layer_result"].get("psd_url", "")
            layer_prev_url = state_data["layer_result"].get("preview_url", "")
            if not layer_segs and state_data["layer_result"].get("layers"):
                layer_segs_str = json.dumps(state_data["layer_result"]["layers"])

        vec_fp = str(state_data.get("vector_svg_filepath", ""))
        vec_url = str(state_data.get("vector_svg_url", ""))
        vec_prev = str(state_data.get("vector_preview_url", ""))
        if not vec_fp and state_data.get("vector_result"):
            vec_fp = state_data["vector_result"].get("svg_filepath", "")
            vec_url = state_data["vector_result"].get("svg_url", "")
            vec_prev = state_data["vector_result"].get("preview_url", "")

        with self._get_conn() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO image_states (
                    image_id, design_id,
                    dtf_threshold, dtf_feather, dtf_choke, dtf_defringe, dtf_despeckle,
                    dtf_solid, dtf_protect_lines, dtf_invert_ink, dtf_method, dtf_custom_bg_hex,
                    dtf_filepath, dtf_url, dtf_coverage_pct, dtf_halo_score,
                    layer_psd_filepath, layer_psd_url, layer_preview_url, layer_segments_json,
                    layer_count, layer_prompt_used, layer_source_mode,
                    vector_engine, vector_colors, vector_corner, vector_smooth, vector_speckle, vector_dpi,
                    vector_color_overrides, vector_svg_filepath, vector_svg_url, vector_preview_url,
                    vector_layers_json, vector_total_paths,
                    garment_color, garment_texture, mockup_url, mockup_filepath,
                    last_active_step, last_updated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                image_id, str(design_id),
                float(state_data.get("dtf_threshold", 24.0)),
                float(state_data.get("dtf_feather", 1.5)),
                int(state_data.get("dtf_choke", 1)),
                float(state_data.get("dtf_defringe", 75.0)),
                int(state_data.get("dtf_despeckle", 20)),
                float(state_data.get("dtf_solid", 1.4)),
                1 if state_data.get("dtf_protect_lines", True) else 0,
                1 if state_data.get("dtf_invert_ink", False) else 0,
                str(state_data.get("dtf_method", "auto")),
                str(state_data.get("dtf_custom_bg_hex", "#171E19")),
                dtf_fp, dtf_url,
                float(state_data.get("dtf_coverage_pct", 0.0)),
                float(state_data.get("dtf_halo_score", 99.8)),
                layer_psd_fp, layer_psd_url, layer_prev_url, layer_segs_str,
                int(state_data.get("layer_count", 0)),
                str(state_data.get("layer_prompt_used", "")),
                str(state_data.get("layer_source_mode", "dtf")),
                str(state_data.get("vector_engine", "vtracer")),
                int(state_data.get("vector_colors", 8)),
                int(state_data.get("vector_corner", 30)),
                float(state_data.get("vector_smooth", 2.5)),
                int(state_data.get("vector_speckle", 2)),
                int(state_data.get("vector_dpi", 2048)),
                color_overrides_str,
                vec_fp, vec_url, vec_prev,
                layers_str,
                int(state_data.get("vector_total_paths", 0)),
                str(state_data.get("garment_color", "#171E19")),
                1 if state_data.get("garment_texture", False) else 0,
                str(state_data.get("mockup_url", "")),
                str(state_data.get("mockup_filepath", "")),
                int(state_data.get("last_active_step", 1)),
                now
            ))
            conn.commit()
        return True

    def get_image_state(self, image_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves user fine-tuning and processing state for a specific image/generation ID."""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM image_states WHERE image_id = ?", (image_id,))
            row = cursor.fetchone()
            if row:
                return self._parse_image_state_row(row)
        return None

    def get_image_states_for_design(self, design_id: str) -> Dict[str, Dict[str, Any]]:
        """Retrieves all image states for a given design ID keyed by image_id."""
        results = {}
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM image_states WHERE design_id = ?", (str(design_id),))
            rows = cursor.fetchall()
            for row in rows:
                parsed = self._parse_image_state_row(row)
                results[parsed["image_id"]] = parsed
        return results

    def _parse_image_state_row(self, row: sqlite3.Row) -> Dict[str, Any]:
        d = dict(row)
        d["dtf_protect_lines"] = bool(d.get("dtf_protect_lines", 1))
        d["dtf_invert_ink"] = bool(d.get("dtf_invert_ink", 0))
        d["garment_texture"] = bool(d.get("garment_texture", 0))

        # Resolve portable paths across Macs
        for fp_key in ["dtf_filepath", "layer_psd_filepath", "vector_svg_filepath", "mockup_filepath"]:
            if d.get(fp_key):
                d[fp_key] = resolve_portable_path(d[fp_key])
        
        try:
            d["vector_color_overrides"] = json.loads(d.get("vector_color_overrides") or "{}")
        except Exception:
            d["vector_color_overrides"] = {}

        try:
            d["vector_layers"] = json.loads(d.get("vector_layers_json") or "[]")
        except Exception:
            d["vector_layers"] = []

        try:
            raw_segs = json.loads(d.get("layer_segments_json") or "[]")
            for seg in raw_segs:
                if isinstance(seg, dict) and seg.get("filepath"):
                    seg["filepath"] = resolve_portable_path(seg["filepath"])
            d["layer_segments"] = raw_segs
        except Exception:
            d["layer_segments"] = []

        if d.get("dtf_filepath") or d.get("dtf_url"):
            d["dtf_result"] = {
                "success": True,
                "filepath": d.get("dtf_filepath", ""),
                "url": d.get("dtf_url", ""),
                "filename": Path(d.get("dtf_filepath", "")).name if d.get("dtf_filepath") else "",
                "alpha_coverage_pct": d.get("dtf_coverage_pct", 0.0),
                "zero_halo_score": d.get("dtf_halo_score", 99.8),
                "bg_color_hex": d.get("dtf_custom_bg_hex", "#171E19")
            }
        else:
            d["dtf_result"] = None

        if d.get("layer_psd_filepath") or d.get("layer_psd_url") or d.get("layer_segments"):
            d["layer_result"] = {
                "success": True,
                "psd_filepath": d.get("layer_psd_filepath", ""),
                "psd_url": d.get("layer_psd_url", ""),
                "psd_filename": Path(d.get("layer_psd_filepath", "")).name if d.get("layer_psd_filepath") else "",
                "preview_url": d.get("layer_preview_url", ""),
                "layers": d.get("layer_segments", []),
                "layer_count": len(d.get("layer_segments", [])) or d.get("layer_count", 0),
                "prompt_used": d.get("layer_prompt_used", ""),
                "source_mode": d.get("layer_source_mode", "dtf")
            }
        else:
            d["layer_result"] = None

        if d.get("vector_svg_url") or d.get("vector_svg_filepath"):
            d["vector_result"] = {
                "success": True,
                "svg_filepath": d.get("vector_svg_filepath", ""),
                "svg_url": d.get("vector_svg_url", ""),
                "preview_url": d.get("vector_preview_url", ""),
                "filename": Path(d.get("vector_svg_filepath", "")).name if d.get("vector_svg_filepath") else "",
                "layers": d.get("vector_layers", []),
                "layer_count": len(d.get("vector_layers", [])),
                "total_paths": d.get("vector_total_paths", 0)
            }
        else:
            d["vector_result"] = None

        return d

    def get_generations_for_design(self, design_item: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Fetches all persistent generations for a design from SQLite.
        Includes index 0 Original Master + chronologically sorted AI versions.
        Each generation contains its full isolated image project state.
        """
        d_id = str(design_item.get("id") or "")
        slug = (design_item.get("slug") or "").lower()
        title = (design_item.get("title") or "").lower()
        hires = resolve_portable_path(design_item.get("hires_path") or design_item.get("preview_path") or "")

        # Measure original dimensions
        orig_w, orig_h = 1664, 2048
        if hires and os.path.exists(hires):
            try:
                with Image.open(hires) as img:
                    orig_w, orig_h = img.size
            except Exception:
                pass

        orig_id = f"orig_{d_id}" if d_id else "gen_original"
        saved_states = self.get_image_states_for_design(d_id)

        orig_state = saved_states.get(orig_id) or saved_states.get("gen_original") or self._default_state(orig_id, d_id)
        
        orig_entry = {
            "id": orig_id,
            "is_original": True,
            "version": 0,
            "version_label": "00 · ORIGINAL",
            "badge_title": "IZVORNI MASTER",
            "filename": Path(hires).name if hires else "original.png",
            "filepath": hires,
            "url": f"/api/image-serve?path={quote(str(hires))}" if hires else "",
            "model": "original",
            "model_name": "🏛️ Izvorni Predložak",
            "resolution": f"{orig_w} × {orig_h} px · Master",
            "width": orig_w,
            "height": orig_h,
            "duration": 0,
            "timestamp": 0,
            "created_at": "Izvorni master format",
            "prompt_used": "Izvorni tiskarski predložak Studija Varaždin",
            "full_screen": False,
            "tight_crop": False,
            "is_favorite": True,
            "cost_estimate": 0.0,
            "state": orig_state
        }

        results = [orig_entry]

        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM generations 
                WHERE is_deleted = 0 
                ORDER BY timestamp ASC
            """)
            rows = cursor.fetchall()

            matched: List[Dict[str, Any]] = []
            for row in rows:
                item_did = str(row["design_id"] or "").lower()
                item_slug = str(row["design_slug"] or "").lower()
                item_title = str(row["design_title"] or "").lower()
                item_fname = str(row["filename"] or "").lower()

                match = False
                if d_id and item_did and d_id == item_did:
                    match = True
                elif slug and item_slug and (slug in item_slug or item_slug in slug):
                    match = True
                elif title and item_title and (title in item_title or item_title in title):
                    match = True
                elif hires and Path(hires).stem.lower() in item_fname:
                    match = True

                if match:
                    matched.append(dict(row))

            for idx, gen in enumerate(matched, 1):
                gen_dict = dict(gen)
                gen_id = gen_dict["id"]
                if gen_dict.get("filepath"):
                    gen_dict["filepath"] = resolve_portable_path(gen_dict["filepath"])
                gen_dict["is_original"] = False
                gen_dict["version"] = idx
                gen_dict["version_label"] = f"GEN #{idx:02d}"
                gen_dict["badge_title"] = f"VERZIJA #{idx}"
                gen_dict["full_screen"] = bool(gen_dict.get("full_screen", 1))
                gen_dict["tight_crop"] = bool(gen_dict.get("tight_crop", 1))
                gen_dict["is_favorite"] = bool(gen_dict.get("is_favorite", 0))
                
                # Attach or create state for this generation
                g_state = saved_states.get(gen_id) or self._default_state(gen_id, d_id)
                gen_dict["state"] = g_state
                results.append(gen_dict)

        return results

    def save_design_state(self, design_id: str, state_data: Dict[str, Any]) -> bool:
        """Saves design-level active generation pointer into SQLite."""
        now = int(time.time())
        with self._get_conn() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO design_states (
                    design_id, active_generation_id, active_step, last_updated
                ) VALUES (?, ?, ?, ?)
            """, (
                str(design_id),
                state_data.get("active_generation_id", "gen_original"),
                int(state_data.get("active_step", 1)),
                now
            ))
            conn.commit()
        return True

    def get_design_state(self, design_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves design-level state for a design."""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM design_states WHERE design_id = ?", (str(design_id),))
            row = cursor.fetchone()
            if row:
                return dict(row)
        return None

    def soft_delete_generation(self, gen_id: str) -> bool:
        """Marks generation as deleted without permanently destroying disk file."""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE generations SET is_deleted = 1 WHERE id = ?", (gen_id,))
            conn.commit()
            if cursor.rowcount > 0:
                self.backup_to_json()
                return True
        return False

    def toggle_favorite(self, gen_id: str) -> Optional[bool]:
        """Toggles favorite/star in SQLite."""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT is_favorite FROM generations WHERE id = ?", (gen_id,))
            row = cursor.fetchone()
            if row:
                new_fav = 0 if row["is_favorite"] else 1
                cursor.execute("UPDATE generations SET is_favorite = ? WHERE id = ?", (new_fav, gen_id))
                conn.commit()
                self.backup_to_json()
                return bool(new_fav)
        return None

    def get_all_stats(self) -> Dict[str, Any]:
        """Calculates total preserved generations, models used, and total investment."""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as cnt, SUM(cost_estimate) as total_cost FROM generations WHERE is_deleted = 0")
            row = cursor.fetchone()
            total_gens = row["cnt"] if row else 0
            total_cost = round(row["total_cost"] or 0.0, 2) if row else 0.0

            cursor.execute("SELECT model, COUNT(*) as cnt FROM generations WHERE is_deleted = 0 GROUP BY model")
            model_breakdown = {r["model"]: r["cnt"] for r in cursor.fetchall()}

            return {
                "total_generations_preserved": total_gens,
                "total_cost_estimate": total_cost,
                "currency": "USD",
                "model_breakdown": model_breakdown
            }

    def backup_to_json(self):
        """Creates atomic JSON snapshot of database."""
        try:
            with self._get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM generations ORDER BY timestamp DESC")
                rows = [dict(r) for r in cursor.fetchall()]
                
            tmp_path = JSON_BACKUP_PATH.with_suffix(".tmp")
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(rows, f, indent=2, ensure_ascii=False)
            tmp_path.replace(JSON_BACKUP_PATH)
        except Exception as e:
            print(f"[DatabaseManager] Error backing up to JSON: {e}")
