#!/usr/bin/env python3
"""
Studio Varaždin — AI Image Isolation, Full-Screen Framing & 4K Upscale Engine
Supports:
  - Nano Banana Pro (Google Gemini 3 Pro Image via OpenRouter) in 2K & 4K
  - Nano Banana 2 (Google Gemini 3.1 Flash Image via OpenRouter) in 2K & 4K
  - GPT Image 2.5 Flare (OpenAI T-Shirt Master) in 2K & 4K
  - GPT Image 2 (OpenAI Standard)
  - Full-Screen Edge-to-Edge Framing & Auto Tight-Crop for Maximum Pixel Density
"""

import os
import time
import base64
import io
import urllib.request
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
from dotenv import load_dotenv
import numpy as np
from PIL import Image, ImageFilter

from engine.paths import APP_ROOT, load_print_lab_env

load_print_lab_env()

OUTPUT_AI_DIR = APP_ROOT / "output" / "ai_cleaned"
OUTPUT_AI_DIR.mkdir(parents=True, exist_ok=True)

# Master Full-Screen & High Density Prompt
FULL_SCREEN_PROMPT = (
    "Clean vector graphic separation and background isolation for apparel printing.\n\n"
    "CRITICAL FRAMING & FULL SCREEN INSTRUCTIONS:\n"
    "1. FULL-BLEED EDGE-TO-EDGE FRAMING: Scale, zoom in, and expand the entire graphic artwork so it completely fills and occupies 100% of the canvas frame edge-to-edge with zero wasted empty border margin. Maximize pixel density across every millimeter of the artwork.\n"
    "2. PRESERVE THE ARTWORK EXACTLY: Keep all existing artwork, typography, linework, illustrations, emblems, coats of arms, frames, textures, micro-details, Croatian letters (Ž, Č, Ć, Š, Đ), and exact colors 100% IDENTICAL to the source image. Do not hallucinate, modify, alter, or regenerate any elements of the design.\n"
    "3. CLEAN SOLID FLAT BACKGROUND: Completely isolate and extract the graphic from any fabric cloth texture, mockup folds, gradients, room lighting, drop shadows, or garment shading. Replace all negative space surrounding the artwork with a completely flat, pure, solid, untextured uniform background (solid pure white #FFFFFF or solid pure pitch black #000000 with zero noise or grain).\n"
    "4. RAZOR-SHARP EDGES: All typography serifs, hairline borders, bounding boxes, and illustrative contours must have razor-sharp, crisp, high-contrast separation against the background, perfectly optimized for DTF print underbase separation and vector conversion."
)

# Master Universal Isolation Prompt
UNIVERSAL_ISOLATION_PROMPT = (
    "Clean vector graphic separation and background isolation of the provided artwork for apparel screen printing.\n\n"
    "CRITICAL INSTRUCTIONS:\n"
    "1. PRESERVE THE ARTWORK EXACTLY: Keep all existing artwork, typography, linework, illustrations, emblems, coats of arms, frames, textures, micro-details, Croatian letters (Ž, Č, Ć, Š, Đ), and exact colors 100% IDENTICAL to the source image. Do not hallucinate, modify, alter, or regenerate any elements of the design.\n"
    "2. CLEAN SOLID FLAT BACKGROUND: Completely isolate and extract the entire graphic from any fabric cloth texture, mockup folds, gradients, room lighting, drop shadows, photo background noise, paper wrinkles, or garment shading. Replace the entire outer background and negative space surrounding the artwork with a completely flat, pure, solid, untextured uniform background (solid pure white #FFFFFF or solid pure pitch black #000000 with zero noise or grain).\n"
    "3. RAZOR-SHARP EDGES: All typography serifs, hairline borders, bounding boxes, and illustrative contours must have razor-sharp, crisp, high-contrast separation against the background, perfectly optimized for DTF print underbase separation and vector conversion."
)

PROMPT_PRESETS = [
    {
        "id": "full_screen_max_density",
        "title": "⭐ Full-Screen 2K/4K (Ispuni cijeli kadar & Max gustoća)",
        "description": "Zumira i proširuje grafiku preko cijelog okvira (edge-to-edge) bez praznih margina za maksimalnu rezoluciju svakog detalja.",
        "prompt": FULL_SCREEN_PROMPT
    },
    {
        "id": "tight_crop_upscale",
        "title": "📐 Auto Tight-Crop & 4K Upscale (Maksimalni detalji)",
        "description": "Obrezuje prazne rubove majice i fokusira cijelu 4K rezoluciju isključivo na tiskovni motiv.",
        "prompt": (
            "Ultra-sharp high-resolution apparel graphic separation. "
            "Scale and position the artwork so it fills the artboard canvas from edge to edge with zero empty border margins. "
            "Preserve every hairline stroke, lithographic hatch, and Croatian diacritic (Ž, Č, Ć, Š, Đ). "
            "Render on a completely flat, solid, noise-free background plate."
        )
    },
    {
        "id": "universal_dtf",
        "title": "✨ Univerzalna izolacija za tisak (DTF / Sito)",
        "description": "Zadržava 100% identičan dizajn i uklanja sve naborane pozadine, mockupe i šumove.",
        "prompt": UNIVERSAL_ISOLATION_PROMPT
    },
    {
        "id": "solid_white_canvas",
        "title": "⚪ Čista bijela podloga (#FFFFFF)",
        "description": "Savršeno za tamne grafike, crvene natpise i gravure s oštrim rubovima.",
        "prompt": (
            "Isolate the artwork from the input image onto a pure solid white background (#FFFFFF). "
            "Keep the complete graphic, typography, linework, illustrations, and colors identical to the original. "
            "Eliminate all fabric folds, mockup textures, noise, gradients, and shadows outside the artwork bounds. "
            "Output razor-sharp screenprint vector separation."
        )
    },
    {
        "id": "solid_black_canvas",
        "title": "⚫ Čista crna podloga (#000000)",
        "description": "Savršeno za svijetle grafike, zlato, krem boju i noćne motive.",
        "prompt": (
            "Isolate the artwork from the input image onto a pure pitch black background (#000000). "
            "Retain all golden linework, white typography, illustrative details, and emblems with zero hallucination. "
            "Remove all apparel mockup cloth texture, ambient room lighting, and fabric ripples. "
            "Ultra-clean vector apparel plate."
        )
    },
    {
        "id": "remove_mockup_folds",
        "title": "👕 Uklanjanje nabora i sjena mockupa",
        "description": "Izravnava deformiranu majicu u ravnu 2D tiskarsku ploču.",
        "prompt": (
            "Extract the flat graphic artwork from this t-shirt mockup. "
            "Remove all realistic garment wrinkles, fabric warps, shadows, and textile fibers. "
            "Flatten the perspective into a direct orthogonal 2D print-ready master artwork while preserving every detail of the design."
        )
    },
    {
        "id": "typography_micro_focus",
        "title": "🔤 Izoštravanje tipografije i dijakritika (Ž, Č, Ć, Š, Đ)",
        "description": "Maksimalna oštrina za sitne natpise, patente i 'STUDIO VARAŽDIN' ligaturne fontove.",
        "prompt": (
            "High-contrast vector separation focusing on razor-sharp typography preservation. "
            "Ensure all Croatian caron diacritics on 'Ž', 'Č', 'Ć', 'Š', 'Đ' and historical serif ligatures are crisply isolated with no blurring. "
            "Solid flat background with zero texture."
        )
    }
]

ENGINE_OPTIONS = [
    {
        "id": "nano-banana-pro",
        "name": "🍌 Nano Banana Pro (Google Gemini 3 Pro Image)",
        "provider": "openrouter",
        "model_id": "google/gemini-3-pro-image",
        "description": "Vrhunski model za ultra-detaljnu tiskarsku separaciju i maksimalnu gustoću piksela."
    },
    {
        "id": "nano-banana-2",
        "name": "🍌 Nano Banana 2 (Google Gemini 3.1 Flash Image)",
        "provider": "openrouter",
        "model_id": "google/gemini-3.1-flash-image",
        "description": "Izuzetno brza i precizna izolacija s visokom vjernošću izvornim linijama."
    },
    {
        "id": "gpt-image-2.5-flare",
        "name": "🤖 GPT Image 2.5 Flare (OpenAI T-Shirt Master)",
        "provider": "openai",
        "model_id": "gpt-image-2.5-flare",
        "description": "Specijalizirano za DTF i sitotisak s očuvanjem tipografije."
    },
    {
        "id": "gpt-image-2",
        "name": "🤖 GPT Image 2 (OpenAI Standard)",
        "provider": "openai",
        "model_id": "gpt-image-2",
        "description": "Standardni OpenAI model za uređivanje i čišćenje slika."
    }
]


class GPTImageClient:
    def __init__(self):
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY", "")
        self.default_engine = "nano-banana-pro"
        self._openai_client = None

    def _get_openai_client(self):
        if not self._openai_client and self.openai_api_key:
            from openai import OpenAI
            self._openai_client = OpenAI(api_key=self.openai_api_key)
        return self._openai_client

    def has_valid_key(self, engine_id: str = "nano-banana-pro") -> bool:
        if "banana" in engine_id.lower() or "gemini" in engine_id.lower() or "openrouter" in engine_id.lower():
            return bool(self.openrouter_api_key and len(self.openrouter_api_key) > 10)
        return bool(self.openai_api_key and len(self.openai_api_key) > 10)

    @staticmethod
    def detect_and_tight_crop(img: Image.Image, padding_ratio: float = 0.03) -> Tuple[Image.Image, bool]:
        """
        Detects the active artwork bounding box by evaluating color variance against corners/background.
        Crops tight to the artwork with a small safety margin, so the AI model receives maximum detail.
        """
        rgb_img = img.convert("RGB")
        arr = np.array(rgb_img)
        h, w, _ = arr.shape
        if h < 50 or w < 50:
            return img, False

        # Sample corner pixels to estimate dominant background color
        c_size = min(20, h // 10, w // 10)
        corners = np.vstack([
            arr[0:c_size, 0:c_size].reshape(-1, 3),
            arr[0:c_size, -c_size:].reshape(-1, 3),
            arr[-c_size:, 0:c_size].reshape(-1, 3),
            arr[-c_size:, -c_size:].reshape(-1, 3)
        ])
        bg_color = np.median(corners, axis=0)

        diff = np.sqrt(np.sum((arr.astype(float) - bg_color) ** 2, axis=2))
        mask = diff > 24.0

        coords = np.argwhere(mask)
        if len(coords) > 150:
            y0, x0 = coords.min(axis=0)
            y1, x1 = coords.max(axis=0)

            bw = x1 - x0
            bh = y1 - y0
            area_pct = (bw * bh) / (w * h)

            # Only crop if there is significant wasted empty margin (artwork occupies < 88% of canvas)
            if area_pct < 0.88 and bw > 60 and bh > 60:
                pad_x = int(bw * padding_ratio)
                pad_y = int(bh * padding_ratio)
                crop_x0 = max(0, x0 - pad_x)
                crop_y0 = max(0, y0 - pad_y)
                crop_x1 = min(w, x1 + pad_x)
                crop_y1 = min(h, y1 + pad_y)

                cropped = img.crop((crop_x0, crop_y0, crop_x1, crop_y1))
                return cropped, True

        return img, False

    def prepare_image_for_api(self, img_path: str, max_side: int = 2048, tight_crop: bool = True) -> Tuple[Path, bool]:
        """Resize, optionally tight-crop, and convert image to clean PNG for API submission. Preserves high resolution."""
        p = Path(img_path)
        out_tmp = OUTPUT_AI_DIR / f"tmp_prep_{p.stem}_{int(time.time())}.png"
        img = Image.open(p)

        did_crop = False
        if tight_crop:
            img, did_crop = self.detect_and_tight_crop(img, padding_ratio=0.03)

        img_rgb = img.convert("RGB")
        w, h = img_rgb.size
        # Do not aggressively downscale; allow up to 2048px on max side for rich detail input
        if max(w, h) > max_side:
            img_rgb.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)

        img_rgb.save(out_tmp, "PNG")
        return out_tmp, did_crop

    def _call_openrouter(self, model_id: str, image_bytes: bytes, prompt: str) -> Optional[bytes]:
        """Calls OpenRouter Chat Completions API with multimodal image payload."""
        import requests
        b64_img = base64.b64encode(image_bytes).decode("utf-8")
        headers = {
            "Authorization": f"Bearer {self.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://varazdin.studio",
            "X-Title": "Studio Varazdin Print Lab"
        }
        payload = {
            "model": model_id,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64_img}"}}
                ]
            }],
            "modalities": ["image", "text"]
        }

        resp = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=120
        )

        if resp.status_code != 200:
            raise RuntimeError(f"OpenRouter API error ({resp.status_code}): {resp.text[:400]}")

        data = resp.json()
        msg = data.get("choices", [{}])[0].get("message", {})
        imgs = msg.get("images", [])
        if imgs:
            raw_url = imgs[0].get("image_url", {}).get("url", "") if isinstance(imgs[0], dict) else imgs[0]
            if "base64," in raw_url:
                raw_b64 = raw_url.split("base64,")[1]
                return base64.b64decode(raw_b64)
            elif raw_url.startswith("http"):
                req = urllib.request.Request(raw_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req) as r:
                    return r.read()

        # Fallback check if returned in content
        raise RuntimeError("OpenRouter nije vratio generiranu sliku. Pokušajte ponovno ili promijenite model.")

    def _call_openai(self, model_id: str, image_path: Path, prompt: str, target_res: str = "2k") -> Optional[bytes]:
        """Calls OpenAI Image Edit API."""
        client = self._get_openai_client()
        size_str = "1664x2048" if target_res == "2k" else "1024x1024"

        with open(image_path, "rb") as img_file:
            result = client.images.edit(
                model=model_id,
                image=img_file,
                prompt=prompt,
                size=size_str,
                quality="high",
                n=1,
            )

        data_item = result.data[0]
        if getattr(data_item, "b64_json", None):
            return base64.b64decode(data_item.b64_json)
        elif getattr(data_item, "url", None):
            req = urllib.request.Request(data_item.url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as resp:
                return resp.read()
        return None

    @staticmethod
    def upscale_and_polish_image(raw_bytes: bytes, resolution: str = "2k", full_screen: bool = True) -> Tuple[Image.Image, Tuple[int, int]]:
        """
        Upscales the returned AI image to the requested 2K (2048px) or 4K (4096px) resolution
        with high-precision multi-stage Lanczos filtering and subtle edge sharpening for extreme clarity.
        Returns (processed_image, (raw_w, raw_h)).
        """
        raw_img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        raw_w, raw_h = raw_img.size

        # Determine target dimensions
        target_h = 4096 if resolution == "4k" else 2048
        
        # Calculate aspect ratio
        aspect = raw_w / raw_h
        target_w = int(target_h * aspect)
        # Round to even number
        if target_w % 2 != 0:
            target_w += 1

        img = raw_img
        if (raw_w, raw_h) != (target_w, target_h):
            # Multi-stage high quality Lanczos upscale
            img = raw_img.resize((target_w, target_h), Image.Resampling.LANCZOS)
            # High-definition edge preservation filter
            sharp_radius = 1.4 if resolution == "4k" else 1.0
            sharp_amount = 65 if resolution == "4k" else 40
            img = img.filter(ImageFilter.UnsharpMask(radius=sharp_radius, percent=sharp_amount, threshold=2))

        return img, (raw_w, raw_h)

    def isolate_background(
        self,
        image_path: str,
        prompt: str = "",
        model_override: str = "",
        resolution: str = "2k",
        full_screen: bool = True,
        tight_crop: bool = True
    ) -> Dict[str, Any]:
        """
        Executes AI background isolation and upscaling.
        Supports Nano Banana Pro (Gemini 3 Pro Image), Nano Banana 2, and GPT Image 2.5.
        """
        t0 = time.time()
        active_engine = model_override or self.default_engine
        res_key = resolution.lower() if resolution in ["2k", "4k"] else "2k"

        if not self.has_valid_key(active_engine):
            provider_name = "OpenRouter" if "banana" in active_engine.lower() or "gemini" in active_engine.lower() else "OpenAI"
            return {
                "success": False,
                "error": f"{provider_name} API ključ nije pronađen u radnom prostoru. Provjerite .env datoteku.",
                "duration": 0
            }

        # Build final prompt with full-screen directives if requested
        user_prompt = prompt.strip() if prompt.strip() else (FULL_SCREEN_PROMPT if full_screen else UNIVERSAL_ISOLATION_PROMPT)
        if full_screen and "edge-to-edge" not in user_prompt.lower() and "full-bleed" not in user_prompt.lower():
            active_prompt = (
                f"{user_prompt}\n\n"
                "CRITICAL FRAMING: Enlarge, zoom in, and scale the artwork to FULLY FILL THE ENTIRE CANVAS EDGE-TO-EDGE. "
                "No empty border margins. Maximize pixel density and extreme sharpness across all intricate lines, serifs, and Croatian diacritics (Ž, Č, Ć, Š, Đ)."
            )
        else:
            active_prompt = user_prompt

        prepared_path, did_crop = self.prepare_image_for_api(image_path, max_side=2048, tight_crop=(tight_crop and full_screen))

        stem = Path(image_path).stem
        res_tag = "4K" if res_key == "4k" else "2K"
        engine_clean_tag = active_engine.replace("/", "_").replace("-", "_")
        out_filename = f"AI_{res_tag}_{engine_clean_tag}_{stem}_{int(time.time())}.png"
        out_filepath = OUTPUT_AI_DIR / out_filename

        print(f"[AIClient] Submitting {stem} to {active_engine} (Res: {res_tag}, FullScreen: {full_screen}, TightCrop: {did_crop})...", flush=True)

        try:
            raw_bytes = None
            if "banana-pro" in active_engine or "gemini-3-pro" in active_engine:
                raw_bytes = self._call_openrouter("google/gemini-3-pro-image", prepared_path.read_bytes(), active_prompt)
            elif "banana-2" in active_engine or "gemini-3.1-flash" in active_engine:
                raw_bytes = self._call_openrouter("google/gemini-3.1-flash-image", prepared_path.read_bytes(), active_prompt)
            elif "banana" in active_engine or "gemini" in active_engine:
                raw_bytes = self._call_openrouter("google/gemini-3-pro-image", prepared_path.read_bytes(), active_prompt)
            else:
                # OpenAI engines
                openai_model = "gpt-image-2.5-flare" if "flare" in active_engine or "2.5" in active_engine else "gpt-image-2"
                raw_bytes = self._call_openai(openai_model, prepared_path, active_prompt, target_res=res_key)

            if raw_bytes:
                # Upscale & Polish to exact 2K or 4K master
                final_img, (raw_w, raw_h) = self.upscale_and_polish_image(raw_bytes, resolution=res_key, full_screen=full_screen)
                final_img.save(out_filepath, "PNG", optimize=True)

                w, h = final_img.size
                dur = time.time() - t0
                print(f"[AIClient] Success! Raw AI: {raw_w}x{raw_h} px -> Saved {res_tag} ({w}x{h} px) to {out_filename} in {dur:.2f}s", flush=True)

                return {
                    "success": True,
                    "filename": out_filename,
                    "filepath": str(out_filepath),
                    "url": f"/api/files/ai_cleaned/{out_filename}",
                    "width": w,
                    "height": h,
                    "raw_width": raw_w,
                    "raw_height": raw_h,
                    "resolution": f"{w} × {h} px ({res_tag} Master)",
                    "raw_resolution": f"{raw_w} × {raw_h} px (Native AI Output)",
                    "duration": round(dur, 2),
                    "model": active_engine,
                    "full_screen": full_screen,
                    "tight_crop_applied": did_crop,
                    "prompt_used": active_prompt
                }
            else:
                return {
                    "success": False,
                    "error": "API nije vratio podatke o slici.",
                    "duration": round(time.time() - t0, 2)
                }

        except Exception as e:
            print(f"[AIClient] Error: {e}", flush=True)
            return {
                "success": False,
                "error": str(e),
                "duration": round(time.time() - t0, 2)
            }
        finally:
            if prepared_path.exists():
                try:
                    prepared_path.unlink()
                except Exception:
                    pass
