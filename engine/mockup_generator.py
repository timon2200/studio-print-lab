#!/usr/bin/env python3
"""
Studio Varaždin — Realistic Apparel Mockup Generator
Composites transparent print designs onto realistic garment backdrops
with cotton fabric texture and dynamic lighting.
"""

import os
import time
from pathlib import Path
from typing import Dict, Any, Tuple
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

from engine.paths import APP_ROOT

OUTPUT_MOCKUPS_DIR = APP_ROOT / "output" / "mockups"
OUTPUT_MOCKUPS_DIR.mkdir(parents=True, exist_ok=True)

class MockupGenerator:
    @staticmethod
    def hex_to_rgb(hex_code: str) -> Tuple[int, int, int]:
        hex_code = hex_code.lstrip("#")
        if len(hex_code) == 3:
            hex_code = "".join(c * 2 for c in hex_code)
        return (int(hex_code[0:2], 16), int(hex_code[2:4], 16), int(hex_code[4:6], 16))

    @staticmethod
    def generate_garment_mockup(
        artwork_path: str,
        bg_hex: str = "#171E19",
        shirt_mode: str = "chest_center",
        scale_pct: float = 0.65,
        target_w: int = 1600,
        target_h: int = 2000
    ) -> Dict[str, Any]:
        """
        Renders artwork onto a realistic t-shirt garment backdrop.
        """
        t0 = time.time()
        art = Image.open(artwork_path)
        if art.mode != "RGBA":
            art = art.convert("RGBA")

        # Check if artwork lacks real transparency (i.e. solid rectangular background)
        art_np = np.array(art)
        alpha_channel = art_np[:, :, 3]
        transparent_ratio = np.count_nonzero(alpha_channel < 240) / float(alpha_channel.size)

        # If artwork is solid/opaque (e.g. raw master or un-isolated AI image), isolate background on-the-fly
        if transparent_ratio < 0.05:
            from engine.local_cleaner import LocalCleaner
            clean_res = LocalCleaner.clean_and_isolate(
                image_path=artwork_path,
                threshold=24.0,
                feather_px=1.5,
                choke_px=1,
                defringe_pct=75.0,
                solid_boost=1.4
            )
            if clean_res.get("success") and clean_res.get("filepath") and os.path.exists(clean_res["filepath"]):
                art = Image.open(clean_res["filepath"]).convert("RGBA")

        bg_rgb = MockupGenerator.hex_to_rgb(bg_hex)
        canvas = Image.new("RGB", (target_w, target_h), bg_rgb)

        # 1. Generate realistic synthetic fabric texture noise
        noise = np.random.normal(0, 4.0, (target_h, target_w)).astype(np.float32)
        noise_img = Image.fromarray(np.clip(128 + noise, 0, 255).astype(np.uint8))
        
        # Soft blend noise into garment
        canvas = Image.blend(canvas, ImageOps.colorize(noise_img, bg_rgb, (255, 255, 255)), 0.05)

        # 2. Draw subtle realistic garment collar & shoulder shading
        draw = ImageDraw.Draw(canvas, "RGBA")
        # Top collar contour
        draw.arc([target_w // 2 - 250, -100, target_w // 2 + 250, 160], start=0, end=180, fill=(0, 0, 0, 40), width=8)
        draw.arc([target_w // 2 - 240, -90, target_w // 2 + 240, 150], start=0, end=180, fill=(255, 255, 255, 20), width=3)
        
        # Subtle vignette / lighting curve
        vig = Image.new("L", (target_w, target_h), 0)
        vig_draw = ImageDraw.Draw(vig)
        vig_draw.ellipse([100, 100, target_w - 100, target_h - 100], fill=60)
        vig_blur = vig.filter(ImageFilter.GaussianBlur(150))
        
        lum = 0.299 * bg_rgb[0] + 0.587 * bg_rgb[1] + 0.114 * bg_rgb[2]
        if lum < 120:
            # Highlight center chest for dark shirts
            canvas = Image.blend(canvas, ImageOps.colorize(vig_blur, bg_rgb, (min(255, bg_rgb[0] + 30), min(255, bg_rgb[1] + 30), min(255, bg_rgb[2] + 30))), 0.15)
        else:
            # Subtle drop shadow for light shirts
            canvas = Image.blend(canvas, ImageOps.colorize(vig_blur, (max(0, bg_rgb[0] - 20), max(0, bg_rgb[1] - 20), max(0, bg_rgb[2] - 20)), bg_rgb), 0.10)

        # 3. Position and paste the artwork
        aw, ah = art.size
        max_print_w = int(target_w * scale_pct)
        max_print_h = int(target_h * scale_pct)
        
        fit_scale = min(max_print_w / float(aw), max_print_h / float(ah))
        new_aw = int(aw * fit_scale)
        new_ah = int(ah * fit_scale)

        art_scaled = art.resize((new_aw, new_ah), Image.Resampling.LANCZOS)

        pos_x = (target_w - new_aw) // 2
        # Position slightly above center (chest print placement)
        pos_y = int(target_h * 0.22) if shirt_mode == "chest_center" else int(target_h * 0.18)

        canvas.paste(art_scaled, (pos_x, pos_y), art_scaled)

        # Save mockup
        stem = Path(artwork_path).stem
        out_filename = f"Mockup_{stem}_{bg_hex.replace('#', '')}_{int(time.time())}.png"
        out_filepath = OUTPUT_MOCKUPS_DIR / out_filename
        canvas.save(out_filepath, "PNG")

        dur = time.time() - t0
        return {
            "success": True,
            "filename": out_filename,
            "filepath": str(out_filepath),
            "url": f"/api/files/mockups/{out_filename}",
            "bg_hex": bg_hex,
            "duration": round(dur, 2)
        }
