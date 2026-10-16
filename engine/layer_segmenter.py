import re
import os
import io
import time
import base64
import zipfile
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import requests
import numpy as np
from PIL import Image, ImageFilter
from dotenv import load_dotenv
import pytoshop
from pytoshop import layers

from engine.paths import APP_ROOT, load_print_lab_env

load_print_lab_env()

OUTPUT_LAYERS_DIR = APP_ROOT / "output" / "layers"
OUTPUT_LAYERS_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_MODEL = "inclusionai/ming-image-0.1-design-layer"

LAYER_PRESETS = [
    {
        "id": "5_layers_master",
        "title": "👑 5 Slojeva: Master Cehovska Produkcija (Lineart + Boje + Sjene + Lik + Podloga)",
        "description": "Najviša razina tiskarske separacije: Pozadinska ploča, tamne sjene i gradijenti, zlatni akcenti i boje, centralni heroj/lik, te čiste crne linije crteža i tipografija.",
        "prompt": "Decompose this graphic design into 5 distinct transparent RGBA layers with strict alpha transparency:\nLayer 1: Solid background base plate and atmospheric texture.\nLayer 2: Shadow tones, halftones, and dark gradient shading.\nLayer 3: Accent colors, gold foil fills, and vibrant highlights.\nLayer 4: Central character illustrations, engravings, and hero artwork.\nLayer 5: Pure black ink keylines, outlines, fine details, and typography.",
        "layer_names": ["01_Pozadinska_Ploca", "02_Sjene_I_Gradijenti", "03_Zlatne_Boje_I_Akcenti", "04_Glavni_Lik_Ilustracija", "05_Ink_Linije_I_Tekst"]
    },
    {
        "id": "4_layers_lineart_colors",
        "title": "✒️ 4 Sloja: Linijski crtež + Zlatne boje + Sjene + Podloga (Line Art & Inks)",
        "description": "Idealno za drvoreze i bakroreze: Izdvaja crni tuš (linijski crtež), zlatne pigmente, duboke sjene i neutralnu podlogu.",
        "prompt": "Decompose this graphic design into 4 distinct transparent RGBA layers with strict alpha transparency:\nLayer 1: Solid background base plate and parchment texture.\nLayer 2: Gradient shadows and halftone shading.\nLayer 3: Gold and accent color fills.\nLayer 4: Pure black ink keylines, woodcut etching linework, and fine outlines.",
        "layer_names": ["01_Pozadinska_Ploca", "02_Sjene_I_Halftoni", "03_Zlatne_Boje_Fills", "04_Ink_Linijski_Crtez"]
    },
    {
        "id": "4_layers_complex",
        "title": "🏛️ 4 Sloja: Arhitektura + Likovi + Okviri + Tipografija (Architectural & Emblem)",
        "description": "Separacija za heraldičke i arhitektonske majice: Pozadina, barokni okviri i vitice, kule/kipovi, i zasebna tipografija.",
        "prompt": "Decompose this graphic design into 4 distinct transparent RGBA layers with strict alpha transparency:\nLayer 1: Solid background plate.\nLayer 2: Structural framing, borderlines, filigree, and architectural arches.\nLayer 3: Central illustrative character, fortress, crest, or main emblem.\nLayer 4: Typographic lettering, numbers, dates, and diacritics.",
        "layer_names": ["01_Pozadina", "02_Okviri_I_Arhitektura", "03_Glavni_Lik_Kula", "04_Tipografija_I_Oznake"]
    },
    {
        "id": "3_layers_apparel",
        "title": "👕 3 Sloja: Streetwear Standard (Pozadina + Kompletna Grafika + Tipografija)",
        "description": "Standardna separacija za majice: Pozadinska ploča, glavni grafički motivi/ilustracije na prozirnom, i izolirani tekst.",
        "prompt": "Decompose the design into 3 distinct transparent RGBA layers with strict alpha transparency:\nLayer 1: Background base plate.\nLayer 2: Main illustrative artwork and central graphics without lettering.\nLayer 3: Typography, lettering, headlines, and fine diacritics.",
        "layer_names": ["01_Pozadina", "02_Grafika_Ilustracija", "03_Tipografija_Tekst"]
    },
    {
        "id": "2_layers_pure_text",
        "title": "🎯 2 Sloja: Čista Grafika vs Čista Tipografija (Artwork vs Text)",
        "description": "Potpuno odvaja sav tekst i natpise od grafičke ilustracije, omogućujući zasebnu promjenu boja slova ili grafike.",
        "prompt": "Decompose into 2 distinct transparent RGBA layers with strict alpha transparency:\nLayer 1: Complete graphic artwork, illustrations, and background with all text removed.\nLayer 2: Isolated clean typography, headings, labels, and numbers on 100% transparent alpha.",
        "layer_names": ["01_Grafika_Bez_Teksta", "02_Cista_Tipografija"]
    },
    {
        "id": "2_layers_fg_bg",
        "title": "⚡ 2 Sloja: Prednji plan bez pozadine (Foreground Only + Background)",
        "description": "Brza binarna separacija: Kompletni prednji plan (grafika i tekst) na 100% prozirnoj pozadini + izolirana pozadinska ploča.",
        "prompt": "Decompose the design into 2 distinct transparent RGBA layers:\nLayer 1: Background base plate.\nLayer 2: Complete foreground artwork, illustrations, emblems, and typography on 100% transparent alpha background.",
        "layer_names": ["01_Pozadina", "02_Prednji_Plan_Kompletno"]
    }
]


class LayerSegmenter:
    def __init__(self):
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY", "")
        self.model = DEFAULT_MODEL

    def has_valid_key(self) -> bool:
        return bool(self.openrouter_api_key and len(self.openrouter_api_key) > 10)

    @staticmethod
    def get_presets() -> List[Dict[str, Any]]:
        return LAYER_PRESETS

    @staticmethod
    def _parse_layer_names_from_prompt(prompt: str) -> List[str]:
        """Extracts human-readable layer names from user prompts like 'Layer 1: Background, Layer 2: Graphics...'"""
        names = []
        matches = re.findall(r'Layer\s*(\d+)[:\-\s]+([^\n\r\.\,]+)', prompt, re.IGNORECASE)
        for num, desc in matches:
            clean_desc = desc.strip().replace(" ", "_")
            clean_desc = "".join(c for c in clean_desc if c.isalnum() or c in "_-")
            if clean_desc:
                names.append(f"{int(num):02d}_{clean_desc[:25]}")
        return names

    @staticmethod
    def _calculate_alpha_coverage(img_rgba: Image.Image) -> float:
        """Calculates percentage of non-transparent pixels in RGBA image."""
        arr = np.array(img_rgba)
        if arr.shape[2] < 4:
            return 100.0
        alpha = arr[:, :, 3]
        non_transparent = np.count_nonzero(alpha > 10)
        total = alpha.size
        return round((non_transparent / total) * 100, 1) if total > 0 else 0.0

    @staticmethod
    def _refine_layer_alpha(img_rgba: Image.Image, is_base_layer: bool = False) -> Image.Image:
        """
        Enhances transparency separation for non-base layers:
        - Detects whether solid corner background bleeds into foreground lineart/text.
        - Gently defringes alpha edge halos for smooth composite on any garment color.
        """
        arr = np.array(img_rgba).copy()
        if arr.shape[2] < 4:
            return img_rgba

        alpha = arr[:, :, 3]

        # For non-base layers (e.g. keylines, text, artwork overlays)
        if not is_base_layer and np.all(alpha[0:5, 0:5] == 255) and np.all(alpha[-5:, -5:] == 255):
            corner_rgb = arr[0, 0, :3].astype(float)
            diff = np.sqrt(np.sum((arr[:, :, :3].astype(float) - corner_rgb) ** 2, axis=2))
            # If pixels closely match the corner background, key out background
            mask_bg = diff < 18.0
            arr[mask_bg, 3] = 0

        # Gentle edge alpha defringing
        alpha = arr[:, :, 3]
        if np.count_nonzero(alpha > 0) > 0 and np.count_nonzero(alpha == 0) > 0:
            fringe_mask = (alpha > 0) & (alpha < 35)
            arr[fringe_mask, 3] = (alpha[fringe_mask].astype(float) * 0.7).astype(np.uint8)

        return Image.fromarray(arr)

    @staticmethod
    def _create_psd_file(
        layer_images: List[Image.Image],
        layer_names: List[str],
        output_psd_path: Path
    ) -> bool:
        """
        Creates a valid multi-layer Adobe Photoshop (.psd) file using pytoshop.
        Ensures proper 8-bit RGBA channel writing with uncompressed (raw) channel arrays
        for maximum compatibility with Adobe Photoshop, Illustrator, and Affinity Photo.
        """
        if not layer_images:
            return False

        h, w = layer_images[0].size[1], layer_images[0].size[0]
        psd = pytoshop.core.PsdFile(num_channels=3, height=h, width=w, depth=8, color_mode=3)

        for i, img in enumerate(layer_images):
            # Ensure correct dimensions
            if img.size != (w, h):
                img = img.resize((w, h), Image.Resampling.LANCZOS)
            
            rgba = np.array(img.convert("RGBA"))
            r_chan = rgba[:, :, 0]
            g_chan = rgba[:, :, 1]
            b_chan = rgba[:, :, 2]
            a_chan = rgba[:, :, 3]

            lname = layer_names[i] if i < len(layer_names) else f"Layer {i+1}"

            # Create LayerRecord with raw channels
            layer_rec = layers.LayerRecord(
                channels={
                    0: layers.ChannelImageData(image=r_chan, compression=0),
                    1: layers.ChannelImageData(image=g_chan, compression=0),
                    2: layers.ChannelImageData(image=b_chan, compression=0),
                    -1: layers.ChannelImageData(image=a_chan, compression=0)
                },
                top=0,
                left=0,
                bottom=h,
                right=w,
                blend_mode=b'norm',
                name=lname,
                opacity=255,
                visible=True
            )
            psd.layer_and_mask_info.layer_info.layer_records.append(layer_rec)

        with open(output_psd_path, "wb") as f:
            psd.write(f)

        return output_psd_path.exists() and output_psd_path.stat().st_size > 0

    def segment_design(
        self,
        image_path: str,
        prompt: str = "",
        target_height: int = 2048,
        layer_names: Optional[List[str]] = None,
        model_override: str = ""
    ) -> Dict[str, Any]:
        """
        Decomposes an image into transparent RGBA PNG layers and exports a Photoshop PSD master.
        """
        t0 = time.time()
        active_model = model_override or self.model

        if not self.has_valid_key():
            return {
                "success": False,
                "error": "OpenRouter API ključ nije pronađen u radnom prostoru (.env).",
                "duration": 0
            }

        input_p = Path(image_path)
        if not input_p.exists():
            return {
                "success": False,
                "error": f"Izvorna slika ne postoji: {image_path}",
                "duration": 0
            }

        # 1. Load source image and prepare for Ming Image API
        src_img = Image.open(input_p)
        orig_w, orig_h = src_img.size

        # Create optimal size input for Ming-Image-0.1-Design-Layer (max 1024 side)
        prep_img = src_img.copy()
        if max(prep_img.size) > 1024:
            prep_img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)

        # Convert to PNG buffer for base64
        buf = io.BytesIO()
        prep_img.save(buf, format="PNG")
        b64_str = base64.b64encode(buf.getvalue()).decode("utf-8")

        # 2. Build prompt
        active_prompt = prompt.strip() if prompt.strip() else LAYER_PRESETS[0]["prompt"]
        
        # Determine layer names
        active_layer_names = layer_names or []
        if not active_layer_names:
            # Check if matching preset
            for p in LAYER_PRESETS:
                if p["prompt"].strip() == active_prompt.strip() or p["id"] in active_prompt:
                    active_layer_names = p["layer_names"]
                    break
            
            # If not matched to preset, try parsing from prompt
            if not active_layer_names:
                active_layer_names = self._parse_layer_names_from_prompt(active_prompt)

        headers = {
            "Authorization": f"Bearer {self.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://varazdin.studio",
            "X-Title": "Studio Varazdin Print Lab - Ming Layer Segmentation"
        }

        payload = {
            "model": active_model,
            "prompt": active_prompt,
            "input_references": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{b64_str}"
                    }
                }
            ]
        }

        print(f"[LayerSegmenter] Calling OpenRouter ({active_model}) for {input_p.name}...", flush=True)

        try:
            resp = requests.post(
                "https://openrouter.ai/api/v1/images",
                headers=headers,
                json=payload,
                timeout=180
            )

            if resp.status_code != 200:
                err_msg = resp.text[:400]
                try:
                    err_json = resp.json()
                    if "error" in err_json:
                        err_msg = err_json["error"].get("message", err_msg)
                except Exception:
                    pass
                raise RuntimeError(f"OpenRouter API greška ({resp.status_code}): {err_msg}")

            res_json = resp.json()
            data_items = res_json.get("data", [])
            if not data_items:
                raise RuntimeError("OpenRouter nije vratio slojeve u odgovoru.")

            ts = int(time.time())
            clean_stem = "".join(c if c.isalnum() or c in "._-" else "_" for c in input_p.stem)
            
            # Target print dimensions
            target_h = max(1024, target_height)
            aspect = orig_w / orig_h if orig_h > 0 else 1.0
            target_w = int(target_h * aspect)
            if target_w % 2 != 0:
                target_w += 1

            # 3. Process each returned RGBA layer
            layer_entries: List[Dict[str, Any]] = []
            layer_images_fullres: List[Image.Image] = []

            for idx, item in enumerate(data_items):
                layer_num = idx + 1
                raw_b64 = item.get("b64_json", "")
                if not raw_b64 and item.get("url"):
                    r_img = requests.get(item["url"], timeout=60)
                    raw_bytes = r_img.content
                else:
                    raw_bytes = base64.b64decode(raw_b64)

                layer_pil = Image.open(io.BytesIO(raw_bytes)).convert("RGBA")
                raw_lw, raw_lh = layer_pil.size

                # Upscale to target print dimensions with Lanczos
                if (raw_lw, raw_lh) != (target_w, target_h):
                    layer_pil = layer_pil.resize((target_w, target_h), Image.Resampling.LANCZOS)

                # Name and save individual PNG layer
                default_name = f"Sloj_{layer_num:02d}"
                if idx < len(active_layer_names):
                    layer_display_name = active_layer_names[idx]
                else:
                    layer_display_name = default_name

                # Apply smart alpha refinement (key out solid background bleed on non-base layers & defringe edges)
                is_base = (idx == 0) or ("pozadin" in layer_display_name.lower()) or ("ploca" in layer_display_name.lower())
                layer_pil = self._refine_layer_alpha(layer_pil, is_base_layer=is_base)

                layer_images_fullres.append(layer_pil)

                safe_layer_name = "".join(c if c.isalnum() or c in "._-" else "_" for c in layer_display_name)
                layer_filename = f"Layer_{layer_num:02d}_{safe_layer_name}_{clean_stem}_{ts}.png"
                layer_filepath = OUTPUT_LAYERS_DIR / layer_filename
                
                layer_pil.save(layer_filepath, "PNG", optimize=True)

                coverage = self._calculate_alpha_coverage(layer_pil)

                layer_entries.append({
                    "index": layer_num,
                    "id": f"layer_{layer_num}_{ts}",
                    "name": layer_display_name,
                    "filename": layer_filename,
                    "filepath": str(layer_filepath),
                    "url": f"/api/files/layers/{layer_filename}",
                    "width": target_w,
                    "height": target_h,
                    "alpha_coverage_pct": coverage,
                    "visible": True
                })

            # 4. Generate layered Adobe Photoshop (.psd) Master
            psd_filename = f"PSD_Master_{clean_stem}_{ts}.psd"
            psd_filepath = OUTPUT_LAYERS_DIR / psd_filename
            
            names_for_psd = [entry["name"] for entry in layer_entries]
            self._create_psd_file(layer_images_fullres, names_for_psd, psd_filepath)

            # 5. Generate composite merged preview
            composite = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
            for l_img in layer_images_fullres:
                composite.alpha_composite(l_img)
            
            preview_filename = f"Composite_Preview_{clean_stem}_{ts}.png"
            preview_filepath = OUTPUT_LAYERS_DIR / preview_filename
            composite.save(preview_filepath, "PNG", optimize=True)

            dur = round(time.time() - t0, 2)
            print(f"[LayerSegmenter] Successfully segmented {len(layer_entries)} layers & created PSD ({psd_filename}) in {dur}s", flush=True)

            return {
                "success": True,
                "layer_count": len(layer_entries),
                "layers": layer_entries,
                "psd_filename": psd_filename,
                "psd_filepath": str(psd_filepath),
                "psd_url": f"/api/files/layers/{psd_filename}",
                "psd_filesize_bytes": psd_filepath.stat().st_size if psd_filepath.exists() else 0,
                "preview_filename": preview_filename,
                "preview_filepath": str(preview_filepath),
                "preview_url": f"/api/files/layers/{preview_filename}",
                "width": target_w,
                "height": target_h,
                "duration": dur,
                "model": active_model,
                "prompt_used": active_prompt
            }

        except Exception as e:
            print(f"[LayerSegmenter] Error: {e}", flush=True)
            return {
                "success": False,
                "error": str(e),
                "duration": round(time.time() - t0, 2)
            }

    def reorder_psd(
        self,
        layer_filepaths: List[str],
        layer_names: List[str],
        output_psd_path: str
    ) -> Dict[str, Any]:
        """
        Re-builds an Adobe Photoshop PSD Master from ordered transparent PNG layer file paths.
        """
        try:
            images = []
            valid_names = []
            for i, fp in enumerate(layer_filepaths):
                p = Path(fp)
                if p.exists():
                    images.append(Image.open(p).convert("RGBA"))
                    name = layer_names[i] if i < len(layer_names) else f"Layer {i+1}"
                    valid_names.append(name)
            
            if not images:
                return {"success": False, "error": "Nema važećih slojeva za izradu PSD-a."}
            
            out_p = Path(output_psd_path)
            out_p.parent.mkdir(parents=True, exist_ok=True)
            
            success = self._create_psd_file(images, valid_names, out_p)
            if success:
                return {
                    "success": True,
                    "psd_filepath": str(out_p),
                    "psd_filesize_bytes": out_p.stat().st_size
                }
            else:
                return {"success": False, "error": "Kreiranje PSD datoteke nije uspjelo."}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @staticmethod
    def create_layers_zip(layer_entries: List[Dict[str, Any]], design_title: str) -> io.BytesIO:
        """Packages all PNG layers and PSD into an in-memory zip archive."""
        zip_buf = io.BytesIO()
        clean_title = "".join(c if c.isalnum() or c in "._-" else "_" for c in design_title)

        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for item in layer_entries:
                fp = item.get("filepath", "")
                if fp and os.path.exists(fp):
                    zf.write(fp, arcname=f"PNG_Layers/{item.get('name', 'Layer')}.png")
            
            manifest = (
                f"Studio Varaždin · Ming Layer Decomposition Export\n"
                f"Design: {design_title}\n"
                f"Layers: {len(layer_entries)}\n"
                f"Exported: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
            )
            zf.writestr("README_LAYERS.txt", manifest)

        zip_buf.seek(0)
        return zip_buf

