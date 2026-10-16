#!/usr/bin/env python3
"""
Studio Varaždin — AI Generation History & Multi-Version Reel Manager
Tracks, indexes, and manages all AI isolation iterations and version comparisons.
"""

import os
import json
import time
import re
from pathlib import Path
from typing import Dict, List, Optional, Any
from PIL import Image

from engine.paths import APP_ROOT

OUTPUT_AI_DIR = APP_ROOT / "output" / "ai_cleaned"
HISTORY_FILE = APP_ROOT / "output" / "generations_history.json"

OUTPUT_AI_DIR.mkdir(parents=True, exist_ok=True)


class GenerationsManager:
    def __init__(self, catalog_manager=None):
        self.catalog_manager = catalog_manager
        self.history: List[Dict[str, Any]] = []
        self.load_history()
        self.sync_disk_files()

    def load_history(self):
        """Loads history from JSON file or initializes empty."""
        if HISTORY_FILE.exists():
            try:
                with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                    self.history = json.load(f)
            except Exception as e:
                print(f"[GenerationsManager] Error loading history: {e}")
                self.history = []
        else:
            self.history = []

    def save_history(self):
        """Persists history array to disk."""
        try:
            with open(HISTORY_FILE, "w", encoding="utf-8") as f:
                json.dump(self.history, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[GenerationsManager] Error saving history: {e}")

    def sync_disk_files(self):
        """Scans output/ai_cleaned and indexes unrecorded generation files."""
        known_files = {item.get("filename") for item in self.history if item.get("filename")}
        modified = False

        if not OUTPUT_AI_DIR.exists():
            return

        for fpath in OUTPUT_AI_DIR.glob("*.png"):
            fname = fpath.name
            if fname.startswith("tmp_") or fname in known_files:
                continue

            # Parse filename patterns e.g. AI_2K_gpt_image_2.5_flare_SV_Single_07_Gothic_Metal_Front_1790418067.png
            # or AI_Cleaned_SV_Single_04_Riso_Rearing_Knight_Front_1790378341.png
            stem = fpath.stem
            timestamp = int(fpath.stat().st_mtime)
            model = "gpt-image-2.5-flare" if "gpt" in stem.lower() else ("nano-banana-pro" if "banana" in stem.lower() else "ai-cleaner")
            res_str = "2K" if "2k" in stem.lower() else ("4K" if "4k" in stem.lower() else "Master")

            # Extract dimensions
            width, height = 2048, 2048
            try:
                with Image.open(fpath) as img:
                    width, height = img.size
            except Exception:
                pass

            # Try to extract design slug or title
            clean_name = stem
            for prefix in ["AI_4K_", "AI_2K_", "AI_Cleaned_", "AI_"]:
                if clean_name.startswith(prefix):
                    clean_name = clean_name[len(prefix):]
            
            # Remove timestamp from end if exists
            clean_name = re.sub(r'_\d{9,12}$', '', clean_name)
            # Remove model tag from beginning if exists
            for mtag in ["gpt_image_2.5_flare_", "gpt_image_2_", "nano_banana_pro_", "nano_banana_2_"]:
                if clean_name.startswith(mtag):
                    clean_name = clean_name[len(mtag):]

            gen_entry = {
                "id": f"gen_{int(time.time()*1000)}_{len(self.history)+1}",
                "filename": fname,
                "filepath": str(fpath),
                "url": f"/api/files/ai_cleaned/{fname}",
                "design_slug": clean_name,
                "design_title": clean_name.replace("_", " "),
                "model": model,
                "model_name": self._format_model_name(model),
                "resolution": f"{width} × {height} px ({res_str})",
                "width": width,
                "height": height,
                "duration": 4.5,
                "timestamp": timestamp,
                "created_at": time.strftime("%d.%m.%Y %H:%M:%S", time.localtime(timestamp)),
                "prompt_used": "Clean vector graphic separation and background isolation for apparel printing.",
                "full_screen": True,
                "tight_crop": True,
                "is_favorite": False
            }
            self.history.append(gen_entry)
            known_files.add(fname)
            modified = True

        if modified:
            self.save_history()

    @staticmethod
    def _format_model_name(model_id: str) -> str:
        if "pro" in model_id.lower():
            return "🍌 Nano Banana Pro"
        elif "2" in model_id.lower() and "banana" in model_id.lower():
            return "🍌 Nano Banana 2"
        elif "flare" in model_id.lower() or "2.5" in model_id.lower():
            return "🤖 GPT Image 2.5"
        elif "gpt" in model_id.lower():
            return "🤖 GPT Image 2"
        return "⚡ AI Cleaned Master"

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
        """Adds a newly created AI generation to history and saves to disk."""
        now = time.time()
        
        # Count existing generations for this design
        search_slug = (design_slug or Path(filename).stem).lower()
        matched_count = 0
        for item in self.history:
            item_slug = (item.get("design_slug") or "").lower()
            if search_slug and item_slug and (search_slug in item_slug or item_slug in search_slug):
                matched_count += 1
        
        version_idx = matched_count + 1
        cost_est = 0.05 if ("pro" in model.lower() or "flare" in model.lower() or "2.5" in model.lower()) else 0.02

        gen_entry = {
            "id": f"gen_{int(now*1000)}",
            "filename": filename,
            "filepath": filepath,
            "url": url,
            "design_id": design_id or "",
            "design_slug": design_slug or Path(filename).stem,
            "design_title": design_title or (design_slug or "").replace("_", " "),
            "model": model,
            "model_name": self._format_model_name(model),
            "version": version_idx,
            "version_label": f"v{version_idx}",
            "badge_title": f"VERZIJA #{version_idx}",
            "cost_estimate": cost_est,
            "resolution": f"{width} × {height} px ({resolution.upper()})",
            "width": width,
            "height": height,
            "duration": round(duration, 2),
            "timestamp": int(now),
            "created_at": time.strftime("%d.%m.%Y %H:%M:%S", time.localtime(now)),
            "prompt_used": prompt_used,
            "full_screen": full_screen,
            "tight_crop": tight_crop_applied,
            "is_favorite": False
        }
        self.history.append(gen_entry)
        self.save_history()
        return gen_entry

    def get_generations_for_design(self, design_item: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Returns full version reel list for a given design:
        - Index 0 is ALWAYS the Original Master predložak.
        - Indexes 1..N are AI generations sorted chronologically.
        """
        slug = (design_item.get("slug") or "").lower()
        title = (design_item.get("title") or "").lower()
        d_id = str(design_item.get("id") or "").lower()
        hires = design_item.get("hires_path") or design_item.get("preview_path") or ""

        # Original dimensions
        orig_w, orig_h = 1664, 2048
        if hires and os.path.exists(hires):
            try:
                with Image.open(hires) as img:
                    orig_w, orig_h = img.size
            except Exception:
                pass

        orig_entry = {
            "id": "gen_original",
            "is_original": True,
            "version": 0,
            "version_label": "BASE",
            "badge_title": "IZVORNI MASTER",
            "filename": Path(hires).name if hires else "original.png",
            "filepath": hires,
            "url": f"/api/image-serve?path={hires}" if hires else "",
            "model": "original",
            "model_name": "🏛️ Izvorni Master",
            "resolution": f"{orig_w} × {orig_h} px · Master",
            "width": orig_w,
            "height": orig_h,
            "duration": 0,
            "timestamp": 0,
            "created_at": "Izvorni master format",
            "prompt_used": "Izvorni tiskarski predložak Studija Varaždin",
            "full_screen": False,
            "tight_crop": False,
            "is_favorite": True
        }

        matched_generations: List[Dict[str, Any]] = []
        for item in self.history:
            # Match by id, slug or title substring
            item_slug = (item.get("design_slug") or "").lower()
            item_title = (item.get("design_title") or "").lower()
            item_did = str(item.get("design_id") or "").lower()

            match = False
            if d_id and item_did and d_id == item_did:
                match = True
            elif slug and item_slug and (slug in item_slug or item_slug in slug):
                match = True
            elif title and item_title and (title in item_title or item_title in title):
                match = True
            elif hires and Path(hires).stem.lower() in item.get("filename", "").lower():
                match = True

            if match:
                matched_generations.append(dict(item))

        # Sort chronologically
        matched_generations.sort(key=lambda x: x.get("timestamp", 0))

        # Annotate with version sequence numbers
        results = [orig_entry]
        for idx, gen in enumerate(matched_generations, 1):
            gen_copy = dict(gen)
            gen_copy["is_original"] = False
            gen_copy["version"] = idx
            gen_copy["version_label"] = f"v{idx}"
            gen_copy["badge_title"] = f"VERZIJA #{idx}"
            if "cost_estimate" not in gen_copy:
                gen_copy["cost_estimate"] = 0.05 if ("pro" in gen_copy.get("model", "").lower() or "flare" in gen_copy.get("model", "").lower() or "2.5" in gen_copy.get("model", "").lower()) else 0.02
            results.append(gen_copy)

        return results

    def delete_generation(self, gen_id: str) -> bool:
        """Deletes a generation entry and its underlying file on disk."""
        target = None
        for item in self.history:
            if item.get("id") == gen_id:
                target = item
                break

        if not target:
            return False

        # Remove from disk if exists
        fpath = target.get("filepath")
        if fpath and os.path.exists(fpath):
            try:
                os.remove(fpath)
            except Exception as e:
                print(f"[GenerationsManager] Warning deleting {fpath}: {e}")

        self.history = [x for x in self.history if x.get("id") != gen_id]
        self.save_history()
        return True

    def toggle_favorite(self, gen_id: str) -> Optional[bool]:
        """Toggles favorite state of a generation."""
        for item in self.history:
            if item.get("id") == gen_id:
                item["is_favorite"] = not item.get("is_favorite", False)
                self.save_history()
                return item["is_favorite"]
        return None
