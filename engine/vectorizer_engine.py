#!/usr/bin/env python3
"""
Studio Varaždin — Sub-Pixel Vectorization Engine
Provides Multi-Plate Potrace vectorization with K-Means color quantization,
smooth Bézier curve fitting, layer separation, and live resvg rasterization.
"""

import os
import re
import time
import subprocess
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
from PIL import Image
import cv2

import shutil
from engine.paths import APP_ROOT

OUTPUT_VEC_DIR = APP_ROOT / "output" / "vectors"
OUTPUT_VEC_DIR.mkdir(parents=True, exist_ok=True)
RESVG_BIN = shutil.which("resvg") or ("/opt/homebrew/bin/resvg" if os.path.exists("/opt/homebrew/bin/resvg") else ("/usr/local/bin/resvg" if os.path.exists("/usr/local/bin/resvg") else "resvg"))
POTRACE_BIN = shutil.which("potrace") or ("/opt/homebrew/bin/potrace" if os.path.exists("/opt/homebrew/bin/potrace") else ("/usr/local/bin/potrace" if os.path.exists("/usr/local/bin/potrace") else "potrace"))

class VectorizerEngine:
    @staticmethod
    def rgb_to_hex(rgb: Tuple[int, int, int]) -> str:
        return "#{:02x}{:02x}{:02x}".format(int(rgb[0]), int(rgb[1]), int(rgb[2]))

    @staticmethod
    def extract_dominant_color_plates(
        arr_rgba: np.ndarray,
        num_colors: int = 4
    ) -> List[Tuple[str, np.ndarray]]:
        """
        Quantizes foreground pixels into K dominant color plates.
        Returns list of (hex_color, binary_mask).
        """
        h, w, _ = arr_rgba.shape
        alpha = arr_rgba[:, :, 3]
        fg_mask = alpha > 30

        if not np.any(fg_mask):
            return []

        fg_pixels = arr_rgba[fg_mask, :3]
        k = max(1, min(num_colors, 16, len(fg_pixels)))
        
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
        _, labels, centers = cv2.kmeans(fg_pixels.astype(np.float32), k, None, criteria, 5, cv2.KMEANS_PP_CENTERS)
        centers = np.uint8(centers)

        plates = []
        for c in centers:
            hex_code = VectorizerEngine.rgb_to_hex(c)
            diff = np.sqrt(np.sum((arr_rgba[:, :, :3].astype(np.float32) - c.astype(np.float32))**2, axis=2))
            layer_mask = (diff < 55) & fg_mask
            if np.sum(layer_mask) > 40:
                plates.append((hex_code, layer_mask.astype(np.uint8) * 255))

        return plates

    @staticmethod
    def vectorize_image(
        image_path: str,
        engine: str = "vtracer",
        color_mode: str = "color",
        color_precision: int = 4,
        filter_speckle: int = 2,
        corner_threshold: int = 30,
        length_threshold: float = 2.5,
        layer_difference: int = 16,
        curve_mode: str = "spline",
        hierarchical: str = "stacked",
        remove_bg_plate: bool = True,
        bg_is_dark: bool = False,
        target_height: int = 2048,
        color_replacements: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Converts raster image to precision SVG and extracts color layers.
        """
        t0 = time.time()
        img = Image.open(image_path)
        if img.mode != "RGBA":
            # If RGB, convert to RGBA with non-zero alpha
            img = img.convert("RGBA")

        w_orig, h_orig = img.size

        # Scale canvas for precision
        if target_height and target_height != h_orig:
            scale = target_height / float(h_orig)
            new_w = int(w_orig * scale)
            img = img.resize((new_w, target_height), Image.Resampling.LANCZOS)
        else:
            new_w, target_height = img.size

        arr_rgba = np.array(img)
        stem = Path(image_path).stem
        timestamp = int(time.time() * 1000)
        out_svg_filename = f"Vector_{stem}_{timestamp}.svg"
        out_svg_path = OUTPUT_VEC_DIR / out_svg_filename
        out_preview_png = OUTPUT_VEC_DIR / f"Vector_Preview_{stem}_{timestamp}.png"

        tmp_dir = "/tmp/studio_varazdin_potrace_tmp"
        os.makedirs(tmp_dir, exist_ok=True)

        try:
            num_plates = max(1, min(color_precision, 8))
            plates = VectorizerEngine.extract_dominant_color_plates(arr_rgba, num_colors=num_plates)
            
            svg_layers_xml = []
            layer_info_list = []
            total_paths_count = 0

            # Potrace alphamax: 0.0 (sharp) to 1.33 (smooth)
            alphamax = min(1.33, max(0.0, float(corner_threshold) / 60.0))
            speckle_val = max(0, filter_speckle)

            for idx, (fill_hex, mask) in enumerate(plates, 1):
                # Apply user color override if provided
                if color_replacements and fill_hex in color_replacements:
                    fill_hex = color_replacements[fill_hex]

                # Optional Gaussian smooth to eliminate raster pixel aliasing
                if length_threshold > 1.0:
                    k_s = 3
                    mask = cv2.GaussianBlur(mask, (k_s, k_s), float(length_threshold) * 0.4)
                    _, mask = cv2.threshold(mask, 120, 255, cv2.THRESH_BINARY)

                pbm_path = f"{tmp_dir}/{stem}_{idx}_{timestamp}.pbm"
                svg_path = f"{tmp_dir}/{stem}_{idx}_{timestamp}.svg"

                Image.fromarray(255 - mask).save(pbm_path)

                subprocess.run([
                    POTRACE_BIN, "-s",
                    "-t", str(speckle_val),
                    "-a", f"{alphamax:.2f}",
                    "-O", "0.2",
                    "-u", "10",
                    "-o", svg_path,
                    pbm_path
                ], check=True)

                if os.path.exists(svg_path):
                    with open(svg_path, "r", encoding="utf-8") as f:
                        svg_content = f.read()

                    m_g = re.search(r'<g\s+transform=\"([^\"]+)\"[^>]*>(.*?)</g>', svg_content, re.DOTALL)
                    if m_g:
                        trans_str, body_str = m_g.group(1), m_g.group(2).strip()
                        path_count = len(re.findall(r"<path\s+[^>]+/>", body_str))
                        total_paths_count += path_count

                        layer_name = f"Layer {idx:02d} ({fill_hex.upper()})"
                        layer_id = f"layer_{idx}"
                        layer_info_list.append({
                            "id": layer_id,
                            "index": idx,
                            "color": fill_hex,
                            "name": layer_name,
                            "path_count": path_count
                        })

                        svg_layers_xml.append(
                            f'  <g id="LAYER_{idx:02d}" data-layer-id="{layer_id}" data-layer-index="{idx}" inkscape:label="{layer_name}" inkscape:groupmode="layer" fill="{fill_hex}" transform="{trans_str}">\n'
                            f'    {body_str}\n'
                            f'  </g>'
                        )

                # Cleanup temp
                if os.path.exists(pbm_path): os.remove(pbm_path)
                if os.path.exists(svg_path): os.remove(svg_path)

            master_svg = f"""<?xml version="1.0" standalone="no"?>
<!-- Studio Varaždin Precision Vector Master -->
<svg version="1.1" id="Studio_Varazdin_Vector_Master" xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 {new_w} {target_height}" width="{new_w}" height="{target_height}" preserveAspectRatio="xMidYMid meet">
  <defs>
    <style type="text/css">
      path {{ fill-rule: evenodd; }}
    </style>
  </defs>
{"\n".join(svg_layers_xml)}
</svg>
"""
            with open(out_svg_path, "w", encoding="utf-8") as f:
                f.write(master_svg)

            # Rasterize preview with resvg
            has_resvg = False
            try:
                subprocess.run([RESVG_BIN, "-h", str(min(1600, target_height)), str(out_svg_path), str(out_preview_png)], check=True)
                has_resvg = True
            except Exception as e:
                print(f"[VectorizerEngine] resvg render error: {e}", flush=True)

            dur = time.time() - t0
            return {
                "success": True,
                "engine": "potrace_multi_plate",
                "svg_filename": out_svg_filename,
                "svg_filepath": str(out_svg_path),
                "svg_url": f"/api/files/vectors/{out_svg_filename}",
                "preview_url": f"/api/files/vectors/{out_preview_png.name}" if has_resvg else "",
                "width": new_w,
                "height": target_height,
                "total_paths": total_paths_count,
                "layers": layer_info_list,
                "duration": round(dur, 3)
            }

        except Exception as e:
            print(f"[VectorizerEngine] Error: {e}", flush=True)
            return {
                "success": False,
                "error": str(e),
                "duration": round(time.time() - t0, 3)
            }
