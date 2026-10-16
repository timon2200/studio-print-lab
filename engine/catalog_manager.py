#!/usr/bin/env python3
"""
Studio Varaždin — Catalog & Telemetry Manager (Fast Pre-Indexed)
Loads the 408+ designs from the swiper catalog, calculates scores, ranks,
maps high-res images, and supports custom user uploads.
"""

import os
import json
import re
from pathlib import Path
from typing import Dict, List, Optional
from engine.paths import APP_ROOT, WORKSPACE_ROOT, get_assets_pack_dirs

SWIPER_DATA_CANDIDATES = [
    WORKSPACE_ROOT / "varazdin.studio" / "swiper" / "js" / "catalog-data.js",
    APP_ROOT / "catalog_data" / "catalog-data.js",
]
SWIPER_OPT_DIR = WORKSPACE_ROOT / "varazdin.studio" / "swiper" / "assets" / "optimized"
UPLOADS_DIR = APP_ROOT / "uploads"

CHAMPION_SLUGS = {
    "SV_Single_04_Riso_Rearing_Knight_Front": 1,
    "SV_Artwear_Teratomorpha_Sigil_White": 2,
    "CV_Tee_Creative_Block_Rock_Masked": 3,
    "CV_Tee_Not_Overthinking_Storyboard_Collage": 4,
    "SV_Single_07_Gothic_Metal_Litho_Back": 5,
    "SV_Lovers_03_Kneeling_Martyr_Back": 6,
    "SV_Fire_01_Drifting_Apart_Back": 7,
}

class CatalogManager:
    def __init__(self):
        self.items: List[Dict] = []
        self.item_map: Dict[str, Dict] = {}
        self._file_index: Dict[str, Path] = {}
        self._preview_dirs: List[Path] = []
        self._build_file_index()
        self.reload_catalog()

    def _build_file_index(self):
        """Indexes all master files across workspace and AirDrop/SSD Assets Pack once at startup for instant O(1) lookups."""
        pack_dirs = get_assets_pack_dirs()
        self._preview_dirs = [
            SWIPER_OPT_DIR,
            APP_ROOT / "assets" / "previews",
        ] + [pd / "previews" for pd in pack_dirs]

        search_dirs = [
            WORKSPACE_ROOT / "T-Shirt Design",
            WORKSPACE_ROOT / "Brand Book" / "06 T-Shirt Designs",
            WORKSPACE_ROOT / "Reference za majice",
            WORKSPACE_ROOT / "Crtez Varazdina kak Gori",
            APP_ROOT / "assets" / "masters",
        ] + [pd / "masters" for pd in pack_dirs]

        self._file_index = {}
        for sdir in search_dirs:
            if not sdir.exists():
                continue
            for root, _, files in os.walk(sdir):
                if "Priprema za Tisak" in root or "assets/optimized" in root or "__pycache__" in root:
                    continue
                for f in files:
                    if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                        f_path = Path(root) / f
                        self._file_index[f.lower()] = f_path
                        self._file_index[f_path.stem.lower()] = f_path

    def _find_hires_path(self, title: str, slug: str, filename: str) -> Optional[Path]:
        """Instant O(1) lookup for master high-resolution images."""
        keys = [
            f"{title}.png".lower(),
            f"{title}.jpg".lower(),
            filename.lower(),
            Path(filename).stem.lower() + ".png",
            f"{slug}.png".lower(),
            title.lower(),
            slug.lower(),
            Path(filename).stem.lower()
        ]
        for k in keys:
            if k in self._file_index:
                return self._file_index[k]
        return None

    def _find_preview_path(self, rel_img: str, title: str) -> Optional[Path]:
        """Locates preview WebP across swiper assets or AirDrop/SSD Assets Pack."""
        img_name = Path(rel_img).name
        for pdir in self._preview_dirs:
            if not pdir.exists():
                continue
            cand = pdir / img_name
            if cand.exists():
                return cand
            cand_title = pdir / f"{title}.webp"
            if cand_title.exists():
                return cand_title
        rel_cand = WORKSPACE_ROOT / "varazdin.studio" / "swiper" / rel_img
        if rel_cand.exists():
            return rel_cand
        return None

    def reload_catalog(self):
        """Loads and processes all catalog items, overlaying live votes telemetry."""
        items = []
        
        # Load live votes database if available
        votes_map = {}
        for vp in [
            WORKSPACE_ROOT / "varazdin.studio" / "swiper" / "api" / "data" / "votes.json",
            WORKSPACE_ROOT / "varazdin.studio" / "website" / "tajno-glasanje" / "api" / "data" / "votes.json",
            APP_ROOT / "catalog_data" / "votes.json",
        ]:
            if vp.exists():
                try:
                    with open(vp, "r", encoding="utf-8") as vf:
                        v_json = json.load(vf)
                        votes_map = v_json.get("items", {})
                        if votes_map:
                            break
                except Exception as e:
                    print(f"[CatalogManager] Warning loading votes from {vp}: {e}")

        swiper_data_path = next((p for p in SWIPER_DATA_CANDIDATES if p.exists()), None)
        if swiper_data_path:
            with open(swiper_data_path, "r", encoding="utf-8") as f:
                content = f.read()
            start = content.find("[")
            end = content.rfind("]") + 1
            if start != -1 and end != -1:
                raw_items = json.loads(content[start:end])
                for idx, raw in enumerate(raw_items):
                    item_id = raw.get("id", f"sv-{idx+1:03d}")
                    slug = raw.get("slug", "")
                    title = raw.get("title", f"Design #{idx+1}")
                    category = raw.get("category", "General")
                    rel_img = raw.get("image", "")

                    # Overlay live votes telemetry if exists
                    v_info = votes_map.get(item_id, {})
                    if v_info:
                        likes = v_info.get("likes", 0)
                        superlikes = v_info.get("superlikes", 0)
                        passes = v_info.get("passes", 0)
                        score = v_info.get("score", likes + superlikes * 3)
                        total_votes = likes + superlikes + passes
                        approval_rate = v_info.get("approvalRate", round(((likes + superlikes) / total_votes * 100)) if total_votes > 0 else 0)
                        bayesian_mean = v_info.get("bayesianMean", round((likes + superlikes * 2.8 + 2.0) / (likes + superlikes * 2.8 + 2.0 + passes * 1.2 + 2.0), 3))
                    else:
                        likes = raw.get("likes", 0)
                        superlikes = raw.get("superlikes", 0)
                        passes = raw.get("passes", 0)
                        score = raw.get("score", likes + superlikes * 3)
                        total_votes = raw.get("totalVotes", likes + superlikes + passes)
                        approval_rate = round(((likes + superlikes) / total_votes * 100)) if total_votes > 0 else 0
                        bayesian_mean = round((likes + superlikes * 2.8 + 2.0) / (likes + superlikes * 2.8 + 2.0 + passes * 1.2 + 2.0), 3)
                    
                    # Resolve preview & hires paths
                    preview_path = self._find_preview_path(rel_img, title)
                    hires_path = self._find_hires_path(title, slug, Path(rel_img).name)

                    champ_rank = None
                    for c_slug, c_rank in CHAMPION_SLUGS.items():
                        if c_slug.lower() in slug.lower() or c_slug.lower() in title.lower():
                            champ_rank = c_rank
                            break

                    preview_str = str(preview_path) if preview_path and preview_path.exists() else (str(hires_path) if hires_path and hires_path.exists() else "")
                    hires_str = str(hires_path) if hires_path and hires_path.exists() else preview_str

                    item = {
                        "id": item_id,
                        "slug": slug,
                        "title": title,
                        "category": category,
                        "description": raw.get("description", ""),
                        "likes": likes,
                        "superlikes": superlikes,
                        "passes": passes,
                        "score": score,
                        "totalVotes": total_votes,
                        "approvalRate": approval_rate,
                        "bayesianMean": bayesian_mean,
                        "tags": raw.get("tags", []),
                        "preview_path": preview_str,
                        "hires_path": hires_str,
                        "is_champion": champ_rank is not None,
                        "champion_rank": champ_rank,
                        "is_user_upload": False,
                    }
                    items.append(item)

        # Also load any user uploaded files
        if UPLOADS_DIR.exists():
            for fpath in sorted(UPLOADS_DIR.glob("*.*")):
                if fpath.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp"]:
                    uid = f"upload-{fpath.stem}"
                    items.insert(0, {
                        "id": uid,
                        "slug": fpath.stem,
                        "title": fpath.stem.replace("_", " ").title(),
                        "category": "Korisnički uvoz",
                        "description": "Korisnički uploadana grafika za pripremu tiska",
                        "likes": 99,
                        "superlikes": 50,
                        "passes": 0,
                        "score": 249,
                        "totalVotes": 149,
                        "approvalRate": 100,
                        "bayesianMean": 0.99,
                        "tags": ["upload", "custom"],
                        "preview_path": str(fpath),
                        "hires_path": str(fpath),
                        "is_champion": False,
                        "champion_rank": None,
                        "is_user_upload": True,
                    })

        # Sort items by popularity score descending (aligns with Kustoski Panel & Leaderboard)
        items.sort(key=lambda x: (
            0 if x["is_user_upload"] else 1,
            -(x.get("score", 0)),
            -(x.get("bayesianMean", 0)),
            -(x.get("superlikes", 0)),
            -(x.get("likes", 0))
        ))

        # Assign global dynamic ranks
        for i, item in enumerate(items, 1):
            item["rank"] = i

        self.items = items
        self.item_map = {item["id"]: item for item in items}
        print(f"[CatalogManager] Indexed {len(self._file_index)} master files. Loaded {len(self.items)} designs successfully with live votes overlay.")

    def get_all(self, category: Optional[str] = None, search: Optional[str] = None) -> List[Dict]:
        """Filter and return items."""
        res = self.items
        if category and category != "Sve" and category != "all":
            if category == "champions" or category == "Top Voted":
                res = [x for x in res if x["is_champion"] or x.get("rank", 999) <= 15]
            else:
                res = [x for x in res if x["category"].lower() == category.lower()]

        if search:
            q = search.lower().strip()
            res = [x for x in res if (
                q in x["title"].lower() or 
                q in x["slug"].lower() or 
                q in x["category"].lower() or 
                any(q in t.lower() for t in x.get("tags", []))
            )]
        return res

    def get_by_id(self, item_id: str) -> Optional[Dict]:
        return self.item_map.get(item_id)

    def get_categories(self) -> List[Dict]:
        cats = {}
        for item in self.items:
            cat = item["category"]
            cats[cat] = cats.get(cat, 0) + 1
        
        result = [{"name": "Sve", "count": len(self.items)}]
        result.append({"name": "Top Voted", "count": len([x for x in self.items if x["is_champion"] or x.get("rank", 999) <= 15])})
        for name, count in sorted(cats.items(), key=lambda x: -x[1]):
            result.append({"name": name, "count": count})
        return result

    def get_stats(self) -> Dict:
        total_votes = sum(x.get("totalVotes", 0) for x in self.items)
        total_likes = sum(x.get("likes", 0) for x in self.items)
        total_superlikes = sum(x.get("superlikes", 0) for x in self.items)
        return {
            "total_designs": len(self.items),
            "total_votes": total_votes,
            "total_likes": total_likes,
            "total_superlikes": total_superlikes,
            "champions_count": len([x for x in self.items if x["is_champion"]]),
        }
