#!/usr/bin/env python3
"""
Studio Varaždin — Print Studio & Vector Lab
FastAPI Backend Application
Supports isolated per-image project states, robust recovery, and unified pipeline propagation.
"""

import os
import io
import zipfile
import shutil
import time
import base64
from pathlib import Path
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine.paths import APP_ROOT, WORKSPACE_ROOT, resolve_portable_path, get_assets_pack_dirs
from engine.catalog_manager import CatalogManager
from engine.gpt_image_client import GPTImageClient, FULL_SCREEN_PROMPT, UNIVERSAL_ISOLATION_PROMPT, PROMPT_PRESETS, ENGINE_OPTIONS
from engine.db_manager import DatabaseManager
from engine.local_cleaner import LocalCleaner
from engine.layer_segmenter import LayerSegmenter
from engine.vectorizer_engine import VectorizerEngine
from engine.mockup_generator import MockupGenerator

STATIC_DIR = APP_ROOT / "static"
OUTPUT_DIR = APP_ROOT / "output"
UPLOADS_DIR = APP_ROOT / "uploads"
LAYERS_DIR = OUTPUT_DIR / "layers"

for d in [STATIC_DIR, OUTPUT_DIR, UPLOADS_DIR, LAYERS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Studio Varaždin · Print Studio & Vector Lab",
    description="Automated AI Background Isolation, Ming-Image Layer Decomposition, Sub-Pixel Vector Tracing, and DTF Mastering for Apparel",
    version="2.6.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if any(request.url.path.endswith(ext) for ext in [".js", ".css", ".html", ".json"]) or request.url.path == "/":
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

@app.get("/favicon.ico")
async def favicon():
    from fastapi.responses import Response
    return Response(status_code=204)

catalog = CatalogManager()
gpt_client = GPTImageClient()
layer_segmenter = LayerSegmenter()
db_mgr = DatabaseManager(catalog_manager=catalog)

# -----------------------------------------------------------------------------
# PYDANTIC MODELS
# -----------------------------------------------------------------------------

class UploadBase64Request(BaseModel):
    filename: str
    data_url: str

class LocalIsolateRequest(BaseModel):
    image_path: str
    image_id: Optional[str] = None
    design_id: Optional[str] = None
    source_mode: str = "auto"
    method: str = "auto"
    custom_bg_hex: Optional[str] = None
    threshold: float = 24.0
    feather_px: float = 1.5
    choke_px: int = 1
    defringe_pct: float = 75.0
    despeckle_size: int = 20
    solid_boost: float = 1.4
    protect_dark_lines: bool = True
    invert_to_dark_ink: bool = False
    target_height: int = 2048

class AIIsolateRequest(BaseModel):
    image_path: str
    prompt: Optional[str] = None
    model: Optional[str] = "nano-banana-pro"
    resolution: Optional[str] = "2k"
    full_screen: bool = True
    tight_crop: bool = True

class LayerSegmentRequest(BaseModel):
    image_path: str
    image_id: Optional[str] = None
    design_id: Optional[str] = None
    source_mode: str = "dtf"
    prompt: Optional[str] = None
    target_height: int = 2048
    layer_names: Optional[List[str]] = None

class LayerReorderRequest(BaseModel):
    image_id: str
    design_id: Optional[str] = None
    ordered_layers: List[Dict[str, Any]]
    rebuild_psd: bool = True

class VectorizeRequest(BaseModel):
    image_path: str
    image_id: Optional[str] = None
    design_id: Optional[str] = None
    engine: str = "vtracer"
    color_mode: str = "color"
    color_precision: int = 4
    filter_speckle: int = 2
    corner_threshold: int = 30
    length_threshold: float = 2.5
    layer_difference: int = 16
    curve_mode: str = "spline"
    hierarchical: str = "stacked"
    remove_bg_plate: bool = True
    bg_is_dark: bool = False
    target_height: int = 2048
    color_replacements: Optional[Dict[str, str]] = None

class MockupRequest(BaseModel):
    artwork_path: str
    image_id: Optional[str] = None
    design_id: Optional[str] = None
    bg_hex: str = "#171E19"
    shirt_mode: str = "chest_center"
    scale_pct: float = 0.65

class ExportBundleRequest(BaseModel):
    design_title: str
    dtf_path: Optional[str] = None
    psd_path: Optional[str] = None
    svg_path: Optional[str] = None
    mockup_path: Optional[str] = None

class SaveDesignStateRequest(BaseModel):
    active_generation_id: Optional[str] = "gen_original"
    active_step: Optional[int] = 1

class SaveImageStateRequest(BaseModel):
    design_id: Optional[str] = ""
    dtf_threshold: Optional[float] = 24.0
    dtf_feather: Optional[float] = 1.5
    dtf_choke: Optional[int] = 1
    dtf_defringe: Optional[float] = 75.0
    dtf_despeckle: Optional[int] = 20
    dtf_solid: Optional[float] = 1.4
    dtf_protect_lines: Optional[bool] = True
    dtf_invert_ink: Optional[bool] = False
    dtf_method: Optional[str] = "auto"
    dtf_custom_bg_hex: Optional[str] = "#171E19"
    dtf_filepath: Optional[str] = ""
    dtf_url: Optional[str] = ""
    dtf_coverage_pct: Optional[float] = 0.0
    dtf_halo_score: Optional[float] = 99.8
    layer_psd_filepath: Optional[str] = ""
    layer_psd_url: Optional[str] = ""
    layer_preview_url: Optional[str] = ""
    layer_segments: Optional[List[Dict[str, Any]]] = None
    layer_count: Optional[int] = 0
    layer_prompt_used: Optional[str] = ""
    layer_source_mode: Optional[str] = "dtf"
    vector_engine: Optional[str] = "vtracer"
    vector_colors: Optional[int] = 8
    vector_corner: Optional[int] = 30
    vector_smooth: Optional[float] = 2.5
    vector_speckle: Optional[int] = 2
    vector_dpi: Optional[int] = 2048
    vector_color_overrides: Optional[Dict[str, str]] = None
    vector_layer_visibility: Optional[Dict[str, bool]] = None
    vector_layer_opacity: Optional[Dict[str, float]] = None
    vector_deleted_layer_ids: Optional[List[str]] = None
    vector_raw_layers: Optional[List[Dict[str, Any]]] = None
    vector_svg_filepath: Optional[str] = ""
    vector_svg_url: Optional[str] = ""
    vector_preview_url: Optional[str] = ""
    vector_layers: Optional[List[Dict[str, Any]]] = None
    vector_total_paths: Optional[int] = 0
    garment_color: Optional[str] = "#171E19"
    garment_texture: Optional[bool] = False
    mockup_url: Optional[str] = ""
    mockup_filepath: Optional[str] = ""
    last_active_step: Optional[int] = 1

# -----------------------------------------------------------------------------
# API ROUTES: CATALOG & STATS
# -----------------------------------------------------------------------------

@app.get("/api/stats")
def get_stats():
    return catalog.get_stats()

@app.get("/api/categories")
def get_categories():
    return catalog.get_categories()

@app.get("/api/catalog")
def get_catalog(
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None)
):
    return catalog.get_all(category=category, search=search)

@app.get("/api/design/{item_id}")
def get_design_details(item_id: str):
    item = catalog.get_by_id(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Design not found")
    return item

@app.post("/api/upload")
def upload_custom_image_base64(req: UploadBase64Request):
    filename = req.filename
    clean_stem = "".join(c if c.isalnum() or c in "._-" else "_" for c in Path(filename).stem)
    ext = Path(filename).suffix or ".png"
    dest_path = UPLOADS_DIR / f"{clean_stem}_{int(time.time())}{ext}"
    
    data_header, raw_b64 = req.data_url.split(",", 1) if "," in req.data_url else ("", req.data_url)
    image_bytes = base64.b64decode(raw_b64)
    
    with open(dest_path, "wb") as f:
        f.write(image_bytes)
    
    catalog.reload_catalog()
    return {
        "success": True,
        "filename": dest_path.name,
        "filepath": str(dest_path),
        "url": f"/api/files/uploads/{dest_path.name}"
    }

# -----------------------------------------------------------------------------
# API ROUTES: PROMPTS & ISOLATION
# -----------------------------------------------------------------------------

@app.get("/api/prompts/presets")
def get_prompt_presets():
    return {
        "full_screen_prompt": FULL_SCREEN_PROMPT,
        "universal_prompt": UNIVERSAL_ISOLATION_PROMPT,
        "presets": PROMPT_PRESETS,
        "engines": ENGINE_OPTIONS,
        "has_openai_key": bool(gpt_client.openai_api_key),
        "has_openrouter_key": bool(gpt_client.openrouter_api_key),
        "default_model": gpt_client.default_engine
    }

@app.get("/api/generations/{item_id}")
def get_design_generations(item_id: str):
    item = catalog.get_by_id(item_id)
    if not item:
        for cat_item in catalog.items:
            if cat_item.get("id") == item_id or cat_item.get("slug") == item_id or cat_item.get("title") == item_id:
                item = cat_item
                break
    if not item:
        clean_stem = Path(item_id).stem
        item = {
            "id": item_id,
            "slug": clean_stem,
            "title": clean_stem.replace("_", " "),
            "hires_path": item_id if os.path.exists(item_id) else "",
            "preview_path": item_id if os.path.exists(item_id) else ""
        }
    
    gens = db_mgr.get_generations_for_design(item)
    saved_design_state = db_mgr.get_design_state(item.get("id") or item_id)
    active_gen_id = saved_design_state.get("active_generation_id") if saved_design_state else None
    
    return {
        "success": True,
        "design_id": item.get("id"),
        "design_title": item.get("title"),
        "active_generation_id": active_gen_id,
        "generations": gens,
        "total_count": len(gens)
    }

@app.delete("/api/generations/{gen_id}")
def delete_generation_route(gen_id: str):
    success = db_mgr.soft_delete_generation(gen_id)
    if not success:
        raise HTTPException(status_code=404, detail="Generacija nije pronađena.")
    return {"success": True, "message": "Generacija uspješno uklonjena."}

@app.post("/api/generations/{gen_id}/favorite")
def toggle_generation_favorite_route(gen_id: str):
    fav = db_mgr.toggle_favorite(gen_id)
    if fav is None:
        raise HTTPException(status_code=404, detail="Generacija nije pronađena.")
    return {"success": True, "is_favorite": fav}

@app.get("/api/stats/generations")
def get_generation_stats():
    return db_mgr.get_all_stats()

# -----------------------------------------------------------------------------
# API ROUTES: DESIGN & IMAGE STATES (ISOLATED PER IMAGE PROJECT)
# -----------------------------------------------------------------------------

@app.get("/api/design/{item_id}/state")
def get_design_state_route(item_id: str):
    state = db_mgr.get_design_state(item_id)
    return {"success": True, "state": state}

@app.post("/api/design/{item_id}/state")
def save_design_state_route(item_id: str, req: SaveDesignStateRequest):
    saved = db_mgr.save_design_state(item_id, req.dict())
    return {"success": saved}

@app.get("/api/image/{image_id}/state")
def get_image_state_route(image_id: str):
    state = db_mgr.get_image_state(image_id)
    return {"success": True, "state": state}

@app.post("/api/image/{image_id}/state")
def save_image_state_route(image_id: str, req: SaveImageStateRequest):
    saved = db_mgr.save_image_state(image_id, req.design_id or "", req.dict())
    return {"success": saved}

# -----------------------------------------------------------------------------
# API ROUTES: AI PROCESSING, DTF ALPHA & VECTORIZATION
# -----------------------------------------------------------------------------

@app.post("/api/ai/isolate")
def run_ai_isolation(req: AIIsolateRequest):
    img_path = resolve_portable_path(req.image_path)
    item = None
    if not os.path.exists(img_path):
        item = catalog.get_by_id(req.image_path)
        if item and os.path.exists(item.get("hires_path", "")):
            img_path = item["hires_path"]
        elif item and os.path.exists(item.get("preview_path", "")):
            img_path = item["preview_path"]
        else:
            raise HTTPException(status_code=404, detail=f"Image file not found: {req.image_path}")
    else:
        for cat_item in catalog.items:
            if cat_item.get("hires_path") == img_path or cat_item.get("preview_path") == img_path:
                item = cat_item
                break

    res = gpt_client.isolate_background(
        image_path=img_path,
        prompt=req.prompt or "",
        model_override=req.model or "",
        resolution=req.resolution or "2k",
        full_screen=req.full_screen,
        tight_crop=req.tight_crop
    )

    if res.get("success"):
        gen_entry = db_mgr.record_generation(
            filename=res["filename"],
            filepath=res["filepath"],
            url=res["url"],
            design_id=item.get("id") if item else "",
            design_title=item.get("title") if item else Path(img_path).stem.replace("_", " "),
            design_slug=item.get("slug") if item else Path(img_path).stem,
            model=req.model or "nano-banana-pro",
            resolution=req.resolution or "2k",
            width=res.get("width", 2048),
            height=res.get("height", 2048),
            duration=res.get("duration", 0),
            prompt_used=res.get("prompt_used", req.prompt or ""),
            full_screen=req.full_screen,
            tight_crop_applied=res.get("tight_crop_applied", False)
        )
        res["generation_entry"] = gen_entry
        if item:
            res["all_generations"] = db_mgr.get_generations_for_design(item)

    return res

@app.post("/api/local/isolate")
@app.post("/api/isolate/local")
def run_local_isolation(req: LocalIsolateRequest):
    img_path = resolve_portable_path(req.image_path)
    if not os.path.exists(img_path):
        item = catalog.get_by_id(req.image_path)
        if item and os.path.exists(item.get("hires_path", "")):
            img_path = item["hires_path"]
        elif item and os.path.exists(item.get("preview_path", "")):
            img_path = item["preview_path"]
        else:
            raise HTTPException(status_code=404, detail=f"Image file not found: {req.image_path}")

    res = LocalCleaner.clean_and_isolate(
        image_path=img_path,
        source_mode=req.source_mode,
        method=req.method,
        custom_bg_hex=req.custom_bg_hex,
        threshold=req.threshold,
        feather_px=req.feather_px,
        choke_px=req.choke_px,
        defringe_pct=req.defringe_pct,
        despeckle_size=req.despeckle_size,
        solid_boost=req.solid_boost,
        protect_dark_lines=req.protect_dark_lines,
        invert_to_dark_ink=req.invert_to_dark_ink,
        target_height=req.target_height
    )

    if res.get("success") and req.image_id:
        existing = db_mgr.get_image_state(req.image_id) or db_mgr._default_state(req.image_id, req.design_id or "")
        existing["dtf_threshold"] = req.threshold
        existing["dtf_feather"] = req.feather_px
        existing["dtf_choke"] = req.choke_px
        existing["dtf_defringe"] = req.defringe_pct
        existing["dtf_despeckle"] = req.despeckle_size
        existing["dtf_solid"] = req.solid_boost
        existing["dtf_protect_lines"] = req.protect_dark_lines
        existing["dtf_invert_ink"] = req.invert_to_dark_ink
        existing["dtf_method"] = req.method
        existing["dtf_custom_bg_hex"] = req.custom_bg_hex or "#171E19"
        existing["dtf_filepath"] = res.get("filepath", "")
        existing["dtf_url"] = res.get("url", "")
        existing["dtf_coverage_pct"] = res.get("alpha_coverage_pct", 0.0)
        existing["dtf_halo_score"] = res.get("zero_halo_score", 99.8)
        db_mgr.save_image_state(req.image_id, req.design_id or existing.get("design_id", ""), existing)

    return res

@app.get("/api/layers/presets")
def get_layer_presets():
    return {
        "presets": layer_segmenter.get_presets(),
        "model": "inclusionai/ming-image-0.1-design-layer",
        "has_key": layer_segmenter.has_valid_key()
    }

@app.post("/api/layers/segment")
def run_layer_segmentation(req: LayerSegmentRequest):
    img_path = resolve_portable_path(req.image_path)
    if not os.path.exists(img_path):
        item = catalog.get_by_id(req.image_path)
        if item and os.path.exists(item.get("hires_path", "")):
            img_path = item["hires_path"]
        elif item and os.path.exists(item.get("preview_path", "")):
            img_path = item["preview_path"]
        else:
            raise HTTPException(status_code=404, detail=f"Image file not found: {req.image_path}")

    res = layer_segmenter.segment_design(
        image_path=img_path,
        prompt=req.prompt or "",
        target_height=req.target_height,
        layer_names=req.layer_names
    )

    if res.get("success") and req.image_id:
        existing = db_mgr.get_image_state(req.image_id) or db_mgr._default_state(req.image_id, req.design_id or "")
        existing["layer_psd_filepath"] = res.get("psd_filepath", "")
        existing["layer_psd_url"] = res.get("psd_url", "")
        existing["layer_preview_url"] = res.get("preview_url", "")
        existing["layer_segments"] = res.get("layers", [])
        existing["layer_count"] = res.get("layer_count", 0)
        existing["layer_prompt_used"] = res.get("prompt_used", "")
        existing["layer_source_mode"] = req.source_mode
        db_mgr.save_image_state(req.image_id, req.design_id or existing.get("design_id", ""), existing)

    return res

@app.post("/api/layers/reorder")
def reorder_layers_endpoint(req: LayerReorderRequest):
    state = db_mgr.get_image_state(req.image_id)
    if not state:
        raise HTTPException(status_code=404, detail="Image state not found")

    state["layer_segments"] = req.ordered_layers
    psd_fp = resolve_portable_path(state.get("layer_psd_filepath"))

    if req.rebuild_psd and psd_fp:
        layer_filepaths = [resolve_portable_path(l.get("filepath", "")) for l in req.ordered_layers if l.get("filepath")]
        layer_names = [l.get("name", "") for l in req.ordered_layers if l.get("name")]
        if layer_filepaths and len(layer_filepaths) == len(req.ordered_layers):
            psd_res = layer_segmenter.reorder_psd(layer_filepaths, layer_names, psd_fp)
            if psd_res.get("success"):
                state["layer_psd_filesize_bytes"] = psd_res.get("psd_filesize_bytes")

    db_mgr.save_image_state(req.image_id, req.design_id or state.get("design_id", ""), state)
    return {
        "success": True,
        "layers": req.ordered_layers,
        "psd_url": state.get("layer_psd_url"),
        "psd_filepath": state.get("layer_psd_filepath")
    }

@app.get("/api/layers/zip")
def download_layers_zip(image_id: str = Query(...), design_title: str = Query("Design")):
    state = db_mgr.get_image_state(image_id)
    if not state or not state.get("layer_segments"):
        raise HTTPException(status_code=404, detail="Slojevi nisu pronađeni za odabranu sliku.")
    
    layers_list = state.get("layer_segments", [])
    zip_buf = LayerSegmenter.create_layers_zip(layers_list, design_title)
    clean_title = "".join(c if c.isalnum() or c in "._-" else "_" for c in design_title)
    
    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={clean_title}_PNG_Layers.zip"}
    )

@app.post("/api/vectorize")
def run_vectorization(req: VectorizeRequest):
    img_path = resolve_portable_path(req.image_path)
    if not os.path.exists(img_path):
        item = catalog.get_by_id(req.image_path)
        if item and os.path.exists(item.get("hires_path", "")):
            img_path = item["hires_path"]
        elif item and os.path.exists(item.get("preview_path", "")):
            img_path = item["preview_path"]
        else:
            raise HTTPException(status_code=404, detail=f"Image file not found: {req.image_path}")

    res = VectorizerEngine.vectorize_image(
        image_path=img_path,
        engine=req.engine,
        color_mode=req.color_mode,
        color_precision=req.color_precision,
        filter_speckle=req.filter_speckle,
        corner_threshold=req.corner_threshold,
        length_threshold=req.length_threshold,
        layer_difference=req.layer_difference,
        curve_mode=req.curve_mode,
        hierarchical=req.hierarchical,
        remove_bg_plate=req.remove_bg_plate,
        bg_is_dark=req.bg_is_dark,
        target_height=req.target_height,
        color_replacements=req.color_replacements
    )

    if res.get("success") and req.image_id:
        existing = db_mgr.get_image_state(req.image_id) or db_mgr._default_state(req.image_id, req.design_id or "")
        existing["vector_engine"] = req.engine
        existing["vector_colors"] = req.color_precision
        existing["vector_corner"] = req.corner_threshold
        existing["vector_smooth"] = req.length_threshold
        existing["vector_speckle"] = req.filter_speckle
        existing["vector_dpi"] = req.target_height
        existing["vector_color_overrides"] = req.color_replacements or {}
        existing["vector_svg_filepath"] = res.get("svg_filepath", "")
        existing["vector_svg_url"] = res.get("svg_url", "")
        existing["vector_preview_url"] = res.get("preview_url", "")
        existing["vector_layers"] = res.get("layers", [])
        existing["vector_total_paths"] = res.get("total_paths", 0)
        db_mgr.save_image_state(req.image_id, req.design_id or existing.get("design_id", ""), existing)

    return res

@app.post("/api/mockup")
def run_mockup_generation(req: MockupRequest):
    art_path = resolve_portable_path(req.artwork_path)
    if not os.path.exists(art_path):
        raise HTTPException(status_code=404, detail=f"Artwork not found: {req.artwork_path}")

    res = MockupGenerator.generate_garment_mockup(
        artwork_path=art_path,
        bg_hex=req.bg_hex,
        shirt_mode=req.shirt_mode,
        scale_pct=req.scale_pct
    )

    if res.get("success") and req.image_id:
        existing = db_mgr.get_image_state(req.image_id) or db_mgr._default_state(req.image_id, req.design_id or "")
        existing["mockup_url"] = res.get("url", "")
        existing["mockup_filepath"] = res.get("filepath", "")
        existing["garment_color"] = req.bg_hex
        db_mgr.save_image_state(req.image_id, req.design_id or existing.get("design_id", ""), existing)

    return res

@app.post("/api/export-bundle")
def export_complete_bundle(req: ExportBundleRequest):
    zip_buffer = io.BytesIO()
    clean_title = "".join(c if c.isalnum() or c in "._-" else "_" for c in req.design_title)

    dtf_p = resolve_portable_path(req.dtf_path)
    psd_p = resolve_portable_path(req.psd_path)
    svg_p = resolve_portable_path(req.svg_path)
    mock_p = resolve_portable_path(req.mockup_path)

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        if dtf_p and os.path.exists(dtf_p):
            zf.write(dtf_p, arcname=f"{clean_title}_DTF_Transparent_300DPI.png")
        if psd_p and os.path.exists(psd_p):
            zf.write(psd_p, arcname=f"{clean_title}_Photoshop_Master_Layers.psd")
        if svg_p and os.path.exists(svg_p):
            zf.write(svg_p, arcname=f"{clean_title}_Modular_Vector_Master.svg")
        if mock_p and os.path.exists(mock_p):
            zf.write(mock_p, arcname=f"{clean_title}_Apparel_Proof_Mockup.png")
        
        manifest = f"Studio Varaždin · T-Shirt Production Package\nDesign: {req.design_title}\nGenerated on: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
        zf.writestr("README_PRODUCTION.txt", manifest)

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={clean_title}_Studio_Varazdin_Print_Package.zip"}
    )

# -----------------------------------------------------------------------------
# STATIC FILE SERVING
# -----------------------------------------------------------------------------

@app.get("/api/files/{subfolder}/{filename}")
def serve_output_file(subfolder: str, filename: str):
    if subfolder in ["ai_cleaned", "dtf", "layers", "vectors", "mockups"]:
        fpath = OUTPUT_DIR / subfolder / filename
        if not fpath.exists():
            for pack_dir in get_assets_pack_dirs():
                cand = pack_dir / "output" / subfolder / filename
                if cand.exists():
                    fpath = cand
                    break
    elif subfolder == "uploads":
        fpath = UPLOADS_DIR / filename
    else:
        raise HTTPException(status_code=400, detail="Invalid subfolder")

    if not fpath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(fpath))

@app.get("/api/image-serve")
def serve_any_image(path: str = Query(...)):
    resolved = resolve_portable_path(path)
    p = Path(resolved)
    if not p.is_absolute():
        p = WORKSPACE_ROOT / resolved
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Image not found: {path}")
    return FileResponse(str(p))

# Mount static folder for frontend HTML/JS/CSS
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
