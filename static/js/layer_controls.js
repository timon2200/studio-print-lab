/**
 * Studio Varaždin — Ming Image 0.1 Design Layer & Photoshop PSD Controller
 * Step 04 in the Print Lab Pipeline (Right after DTF Alpha Masking).
 * Features:
 * - inclusionAI/ming-image-0.1-design-layer OpenRouter integration
 * - Decomposes designs into 2-9 transparent RGBA PNG layers
 * - Exports multi-layer Adobe Photoshop (.psd) files
 * - Interactive layer stack with real-time visibility toggles & solo inspection
 * - Individual PNG layer downloads and complete Layers ZIP bundle
 * - Full per-image state persistence across designs & generations
 */

export class LayerControls {
  constructor(app) {
    this.app = app;
    this.presets = [];
    this.currentLayers = [];
    this.psdUrl = null;
    this.psdFilename = null;
    this.previewUrl = null;
    this.soloLayerIndex = null;
    this.layerVisibility = {};

    this.initElements();
    this.bindEvents();
    this.loadPresets();
  }

  initElements() {
    // Source buttons
    this.btnLayerSrcDTF = document.getElementById("btnLayerSrcDTF");
    this.btnLayerSrcAI = document.getElementById("btnLayerSrcAI");
    this.btnLayerSrcOrig = document.getElementById("btnLayerSrcOrig");

    // Prompt & Presets
    this.layerPromptInput = document.getElementById("layerPromptInput");
    this.layerPresetChips = document.getElementById("layerPresetChips");
    this.btnRunLayerSegment = document.getElementById("btnRunLayerSegment");

    // Results & Layers Stack (Sidebar)
    this.layersListContainer = document.getElementById("layersListContainer");
    this.layerCountBadge = document.getElementById("layerCountBadge");
    this.btnDownloadPSD = document.getElementById("btnDownloadPSD");
    this.btnDownloadLayersZip = document.getElementById("btnDownloadLayersZip");
    this.layerStatusBanner = document.getElementById("layerStatusBanner");

    // Floating Photoshop Layers Palette HUD (Artboard Canvas)
    this.floatingLayersPalette = document.getElementById("floatingLayersPalette");
    this.paletteLayersList = document.getElementById("paletteLayersList");
    this.btnPaletteShowAll = document.getElementById("btnPaletteShowAll");
    this.btnPaletteHideAll = document.getElementById("btnPaletteHideAll");
    this.paletteCountBadge = document.getElementById("paletteCountBadge");

    // Telemetry Badges
    this.layerMetricCount = document.getElementById("layerMetricCount");
    this.layerMetricPsdSize = document.getElementById("layerMetricPsdSize");
    this.layerMetricTime = document.getElementById("layerMetricTime");
  }

  bindEvents() {
    // Source Switchers
    if (this.btnLayerSrcDTF) {
      this.btnLayerSrcDTF.addEventListener("click", () => this.setSourceMode("dtf"));
    }
    if (this.btnLayerSrcAI) {
      this.btnLayerSrcAI.addEventListener("click", () => this.setSourceMode("ai"));
    }
    if (this.btnLayerSrcOrig) {
      this.btnLayerSrcOrig.addEventListener("click", () => this.setSourceMode("original"));
    }

    // Run Segmentation Button
    if (this.btnRunLayerSegment) {
      this.btnRunLayerSegment.addEventListener("click", () => this.runSegmentation());
    }

    // Floating Palette Quick Actions
    if (this.btnPaletteShowAll) {
      this.btnPaletteShowAll.addEventListener("click", () => this.showAllLayers());
    }
    if (this.btnPaletteHideAll) {
      this.btnPaletteHideAll.addEventListener("click", () => this.hideAllLayers());
    }

    // Download Master PSD
    if (this.btnDownloadPSD) {
      this.btnDownloadPSD.addEventListener("click", () => {
        const psdUrl = this.app.activeImage?.state?.layer_result?.psd_url || this.psdUrl;
        if (psdUrl) {
          const filename = `${this.app.currentDesign?.slug || 'design'}_${this.app.activeImage?.version_label || 'Master'}_Photoshop_Layers.psd`.replace(/\s+/g, '_');
          this.app.downloadFile(psdUrl, filename);
          this.app.feedback.showToast("✅ Preuzimanje višeslojnog Photoshop PSD Mastera započeto.", "success", 3000);
        } else {
          this.app.feedback.showToast("Prvo pokrenite Ming layer segmentaciju za kreiranje PSD-a.", "info");
        }
      });
    }

    // Download Layers ZIP
    if (this.btnDownloadLayersZip) {
      this.btnDownloadLayersZip.addEventListener("click", () => {
        const activeImgId = this.app.activeImage?.id;
        if (!activeImgId) {
          this.app.feedback.showToast("Nema aktivne slike za izvoz slojeva.", "error");
          return;
        }
        const designTitle = this.app.currentDesign?.title || "Design";
        const zipUrl = `/api/layers/zip?image_id=${encodeURIComponent(activeImgId)}&design_title=${encodeURIComponent(designTitle)}`;
        const filename = `${this.app.currentDesign?.slug || 'design'}_PNG_Layers.zip`.replace(/\s+/g, '_');
        this.app.downloadFile(zipUrl, filename);
        this.app.feedback.showToast("📦 Preuzimanje paketa PNG slojeva (.zip) započeto.", "success", 3000);
      });
    }
  }

  async loadPresets() {
    try {
      const res = await fetch("/api/layers/presets");
      if (res.ok) {
        const data = await res.json();
        this.presets = data.presets || [];
        this.renderPresetChips();
      }
    } catch (e) {
      console.warn("[LayerControls] Error loading layer presets:", e);
    }
  }

  showStatus(msg, type = "info", progress = false) {
    if (!this.layerStatusBanner) return;
    this.layerStatusBanner.style.display = "flex";
    this.layerStatusBanner.className = `status-banner ${type}`;
    this.layerStatusBanner.innerHTML = `
      ${progress ? '<span class="btn-spinner" style="border-top-color:var(--accent-gold-bright); width:14px; height:14px;"></span>' : ''}
      <span style="font-weight:600; font-family:var(--font-mono); font-size:0.75rem;">${msg}</span>
    `;
  }

  hideStatus() {
    if (this.layerStatusBanner) {
      this.layerStatusBanner.style.display = "none";
    }
  }

  renderPresetChips() {
    if (!this.layerPresetChips || !this.presets.length) return;
    this.layerPresetChips.innerHTML = "";

    this.presets.forEach((preset, idx) => {
      const chip = document.createElement("button");
      chip.className = `chip-btn ${idx === 0 ? "active" : ""}`;
      chip.textContent = preset.title;
      chip.title = preset.description;
      chip.addEventListener("click", () => {
        this.layerPresetChips.querySelectorAll(".chip-btn").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        if (this.layerPromptInput) {
          this.layerPromptInput.value = preset.prompt;
        }
        if (this.app.feedback) {
          this.app.feedback.showToast(`Postavljen plan slojeva: "${preset.title}"`, "info", 2000);
        }
      });
      this.layerPresetChips.appendChild(chip);
    });

    if (this.layerPromptInput && !this.layerPromptInput.value && this.presets[0]) {
      this.layerPromptInput.value = this.presets[0].prompt;
    }
  }

  setSourceMode(mode) {
    [this.btnLayerSrcDTF, this.btnLayerSrcAI, this.btnLayerSrcOrig].forEach(btn => {
      if (btn) btn.classList.remove("active");
    });

    if (mode === "dtf" && this.btnLayerSrcDTF) this.btnLayerSrcDTF.classList.add("active");
    else if (mode === "ai" && this.btnLayerSrcAI) this.btnLayerSrcAI.classList.add("active");
    else if (mode === "original" && this.btnLayerSrcOrig) this.btnLayerSrcOrig.classList.add("active");

    if (this.app.feedback) {
      const labels = { dtf: "DTF Alpha Maska", ai: "AI Očišćena Verzija", original: "Izvorni Predložak" };
      this.app.feedback.showToast(`Izvor za dekompoziciju: ${labels[mode] || mode.toUpperCase()}`, "info", 1500);
    }

    if (this.app.activeImage?.state) {
      this.app.activeImage.state.layer_source_mode = mode;
      this.app.triggerDebouncedStateSave();
    }
  }

  getSourceImagePath() {
    const active = this.app.activeImage;
    const mode = active?.state?.layer_source_mode || "dtf";

    if (mode === "dtf") {
      const dtfFp = active?.state?.dtf_filepath || active?.state?.dtf_result?.filepath;
      if (dtfFp) return dtfFp;
    }

    if (mode === "ai") {
      if (active && !active.is_original && active.filepath) {
        return active.filepath;
      }
    }

    // Fallback to active image or original design master
    if (active?.filepath) return active.filepath;
    const item = this.app.currentDesign;
    return item?.hires_path || item?.preview_path || "";
  }

  async runSegmentation() {
    const imgPath = this.getSourceImagePath();
    if (!imgPath) {
      this.app.feedback.showToast("Greška: nije pronađena izvorna slika za segmentaciju.", "error");
      return;
    }

    const prompt = this.layerPromptInput?.value?.trim() || (this.presets[0]?.prompt || "");
    const activeImgId = this.app.activeImage?.id || "gen_original";
    const designId = this.app.currentDesign?.id || "";

    // 1. Anti-duplicate Request Lock & Animated Button with live timer
    const locked = this.app.feedback.acquireLock(
      "layers_segment",
      this.btnRunLayerSegment,
      "Ming 0.1 Obrada..."
    );
    if (!locked) return;

    // 2. Status Banner in Step 04 settings
    this.showStatus("Dekompozicija dizajna u tijeku (inclusionAI Ming 0.1 model)...", "info", true);

    // 3. Central Canvas Radar Loading Overlay with live elapsed seconds
    this.app.feedback.showCanvasOverlay(
      "MING 0.1 DESIGN LAYER DEKOMPOZICIJA",
      "Slanje zahtjeva na model · Razdvajanje na transparentne RGBA slojeve i kreiranje Photoshop PSD-a...",
      "KORAK 04 · MING PSD LAYER ENGINE"
    );

    const t0 = performance.now();

    try {
      const res = await fetch("/api/layers/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_path: imgPath,
          image_id: activeImgId,
          design_id: designId,
          source_mode: this.app.activeImage?.state?.layer_source_mode || "dtf",
          prompt: prompt,
          target_height: 2048
        })
      });

      const data = await res.json();

      if (data.success) {
        const durSec = ((performance.now() - t0) / 1000).toFixed(1);
        const psdSizeMb = data.psd_filesize_bytes ? (data.psd_filesize_bytes / (1024 * 1024)).toFixed(1) : "0";

        this.showStatus(`✅ Dekomponirano ${data.layer_count} slojeva u ${durSec}s! Spreman Photoshop PSD (${psdSizeMb} MB).`, "success");
        this.app.feedback.showToast(`✅ Uspješno dekomponirano ${data.layer_count} slojeva i generiran Photoshop PSD (${psdSizeMb} MB) u ${durSec}s!`, "success", 4000);

        this.applyLayerResult(data);

        // Update active image state
        if (this.app.activeImage) {
          if (!this.app.activeImage.state) this.app.activeImage.state = {};
          this.app.activeImage.state.layer_result = data;
          this.app.activeImage.state.layer_psd_filepath = data.psd_filepath;
          this.app.activeImage.state.layer_psd_url = data.psd_url;
          this.app.activeImage.state.layer_preview_url = data.preview_url;
          this.app.activeImage.state.layer_segments = data.layers;
          this.app.activeImage.state.layer_count = data.layer_count;
          this.app.activeImage.state.layer_prompt_used = prompt;
          this.app.triggerDebouncedStateSave();
        }

        // Switch to view mode and refresh stage
        this.app.canvasController.goToStep(4, "layer_psd");
      } else {
        this.showStatus(`❌ Greška pri Ming segmentaciji: ${data.error || 'Nepoznata greška'}`, "error");
        this.app.feedback.showToast(`Greška pri Ming segmentaciji: ${data.error || 'Nepoznata greška'}`, "error", 5000);
      }
    } catch (err) {
      console.error("[LayerControls] Segmentation error:", err);
      this.showStatus(`❌ Mrežna greška pri pozivu Ming modela: ${err.message}`, "error");
      this.app.feedback.showToast(`Mrežna greška pri pozivu Ming modela: ${err.message}`, "error", 5000);
    } finally {
      this.app.feedback.releaseLock("layers_segment", this.btnRunLayerSegment);
    }
  }

  applyLayerResult(result) {
    if (!result || !result.layers) return;

    this.currentLayers = result.layers;
    this.psdUrl = result.psd_url;
    this.psdFilename = result.psd_filename;
    this.previewUrl = result.preview_url;
    this.soloLayerIndex = null;

    // Reset visibility and opacities (defaults to 100% visible)
    this.layerVisibility = {};
    this.layerOpacity = {};
    this.currentLayers.forEach(l => {
      this.layerVisibility[l.index] = true;
      this.layerOpacity[l.index] = 1.0;
    });

    this.renderLayersStack();
    this.renderFloatingPalette();
    this.updateTelemetry(result);

    if (this.btnDownloadPSD) {
      this.btnDownloadPSD.style.display = "flex";
      const span = this.btnDownloadPSD.querySelector("span");
      if (span) span.textContent = `📁 PREUZMI PHOTOSHOP PSD (${(result.psd_filesize_bytes ? (result.psd_filesize_bytes / (1024*1024)).toFixed(1) + ' MB' : 'MASTER')})`;
    }
    if (this.btnDownloadLayersZip) {
      this.btnDownloadLayersZip.style.display = "flex";
    }

    if (this.app.canvasController) {
      this.app.canvasController.renderLayersMode();
    }
  }

  showAllLayers() {
    this.soloLayerIndex = null;
    this.currentLayers.forEach(l => {
      this.layerVisibility[l.index] = true;
    });
    this.renderLayersStack();
    this.renderFloatingPalette();
    if (this.app.canvasController) {
      this.app.canvasController.renderLayersMode();
    }
    this.app.feedback.showToast("👁️ Svi slojevi su prikazani.", "info", 1500);
  }

  hideAllLayers() {
    this.soloLayerIndex = null;
    this.currentLayers.forEach(l => {
      this.layerVisibility[l.index] = false;
    });
    this.renderLayersStack();
    this.renderFloatingPalette();
    if (this.app.canvasController) {
      this.app.canvasController.renderLayersMode();
    }
    this.app.feedback.showToast("🚫 Svi slojevi su skriveni.", "info", 1500);
  }

  setLayerOpacity(index, opacityPct) {
    const val = Math.max(0, Math.min(100, parseInt(opacityPct, 10))) / 100;
    this.layerOpacity[index] = val;

    // Fast inline update for artboard canvas slice (zero DOM rebuild)
    if (this.app.canvasController?.layersContainer) {
      const slice = this.app.canvasController.layersContainer.querySelector(`.artboard-layer-slice[data-layer-index="${index}"]`);
      if (slice) {
        slice.style.opacity = val;
      }
    }

    // Sync opacity labels in floating palette and sidebar
    const fpSlider = this.paletteLayersList?.querySelector(`.palette-layer-row[data-layer-index="${index}"] .palette-op-slider`);
    if (fpSlider && parseInt(fpSlider.value, 10) !== parseInt(opacityPct, 10)) {
      fpSlider.value = opacityPct;
    }

    const sbLabel = this.layersListContainer?.querySelector(`.layer-stack-card[data-layer-index="${index}"] .layer-op-val`);
    if (sbLabel) {
      sbLabel.textContent = `${Math.round(val * 100)}%`;
    }
  }

  toggleLayerVisibility(index) {
    this.layerVisibility[index] = !this.layerVisibility[index];
    this.soloLayerIndex = null;
    this.renderLayersStack();
    this.renderFloatingPalette();
    if (this.app.canvasController) {
      this.app.canvasController.renderLayersMode();
    }
  }

  toggleSoloLayer(index) {
    if (this.soloLayerIndex === index) {
      this.soloLayerIndex = null;
      // Restore all visible
      this.currentLayers.forEach(l => {
        this.layerVisibility[l.index] = true;
      });
    } else {
      this.soloLayerIndex = index;
      this.currentLayers.forEach(l => {
        this.layerVisibility[l.index] = (l.index === index);
      });
    }
    this.renderLayersStack();
    this.renderFloatingPalette();
    if (this.app.canvasController) {
      this.app.canvasController.renderLayersMode();
    }
  }

  moveLayerByShift(layerIndex, shift) {
    const curIdx = this.currentLayers.findIndex(l => l.index === layerIndex);
    if (curIdx === -1) return;

    const newIdx = curIdx + shift;
    if (newIdx < 0 || newIdx >= this.currentLayers.length) return;

    // Swap layers in stack
    const temp = this.currentLayers[curIdx];
    this.currentLayers[curIdx] = this.currentLayers[newIdx];
    this.currentLayers[newIdx] = temp;

    this.renderLayersStack();
    this.renderFloatingPalette();
    if (this.app.canvasController) {
      this.app.canvasController.renderLayersMode();
    }
    this.syncReorderedState();
    this.app.feedback.showToast(`↕️ Sloj "${temp.name}" premješten.`, "info", 1500);
  }

  reorderLayerToIndex(fromLayerIndex, toLayerIndex, placeAbove = false) {
    if (fromLayerIndex === toLayerIndex) return;

    const fromIdx = this.currentLayers.findIndex(l => l.index === fromLayerIndex);
    const toIdx = this.currentLayers.findIndex(l => l.index === toLayerIndex);
    if (fromIdx === -1 || toIdx === -1) return;

    const [movedLayer] = this.currentLayers.splice(fromIdx, 1);
    
    let targetInsert = this.currentLayers.findIndex(l => l.index === toLayerIndex);
    if (placeAbove) {
      targetInsert += 1;
    }
    
    this.currentLayers.splice(targetInsert, 0, movedLayer);

    this.renderLayersStack();
    this.renderFloatingPalette();
    if (this.app.canvasController) {
      this.app.canvasController.renderLayersMode();
    }
    this.syncReorderedState();
    this.app.feedback.showToast(`↕️ Sloj "${movedLayer.name}" presložen.`, "info", 1500);
  }

  syncReorderedState() {
    if (this.app.activeImage) {
      if (!this.app.activeImage.state) this.app.activeImage.state = {};
      this.app.activeImage.state.layer_segments = this.currentLayers;
      if (this.app.activeImage.state.layer_result) {
        this.app.activeImage.state.layer_result.layers = this.currentLayers;
      }
      this.app.triggerDebouncedStateSave();
    }

    clearTimeout(this._reorderDebounce);
    this._reorderDebounce = setTimeout(async () => {
      const activeImgId = this.app.activeImage?.id;
      if (!activeImgId) return;

      try {
        await fetch("/api/layers/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_id: activeImgId,
            design_id: this.app.currentDesign?.id || "",
            ordered_layers: this.currentLayers,
            rebuild_psd: true
          })
        });
      } catch (err) {
        console.warn("[LayerControls] Error syncing reordered PSD on backend:", err);
      }
    }, 400);
  }

  renderFloatingPalette() {
    if (!this.paletteLayersList) return;
    this.paletteLayersList.innerHTML = "";

    if (!this.currentLayers.length) {
      if (this.floatingLayersPalette) this.floatingLayersPalette.style.display = "none";
      if (this.paletteCountBadge) this.paletteCountBadge.textContent = "0";
      return;
    }

    if (this.paletteCountBadge) {
      this.paletteCountBadge.textContent = `${this.currentLayers.length}`;
    }

    // Top-to-bottom stack order (photoshop style: top layer is first in UI)
    const reversed = [...this.currentLayers].reverse();

    reversed.forEach((layer, uiIdx) => {
      const isVis = this.layerVisibility[layer.index] !== false;
      const op = Math.round((this.layerOpacity[layer.index] !== undefined ? this.layerOpacity[layer.index] : 1.0) * 100);
      const isSolo = this.soloLayerIndex === layer.index;
      const isFirstInUi = uiIdx === 0;
      const isLastInUi = uiIdx === reversed.length - 1;

      const row = document.createElement("div");
      row.className = `palette-layer-row ${!isVis ? 'is-hidden' : ''} ${isSolo ? 'is-solo' : ''}`;
      row.dataset.layerIndex = layer.index;
      row.setAttribute("draggable", "true");

      row.innerHTML = `
        <div class="palette-row-left">
          <div class="layer-drag-grip" style="padding:0 2px; font-size:0.6rem; opacity:0.5; cursor:grab;" title="Povuci za promjenu redoslijeda">⋮⋮</div>
          <button class="palette-eye-btn ${isVis ? '' : 'hidden'}" title="${isVis ? 'Sakrij sloj' : 'Prikaži sloj'}" data-action="toggle-vis">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              ${isVis 
                ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>' 
                : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'}
            </svg>
          </button>
          <div style="width:20px; height:20px; border-radius:2px; background:#111; border:1px solid rgba(255,255,255,0.1); overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
            <img src="${layer.url}" alt="${layer.name}" style="width:100%; height:100%; object-fit:contain;">
          </div>
          <span class="palette-layer-title" title="#0${layer.index} ${layer.name}">#0${layer.index} ${layer.name}</span>
        </div>
        <div class="palette-row-actions">
          <button class="palette-arrow-btn" data-action="move-up" ${isFirstInUi ? 'disabled' : ''} title="Pomakni prema gore (viši sloj)">▲</button>
          <button class="palette-arrow-btn" data-action="move-down" ${isLastInUi ? 'disabled' : ''} title="Pomakni prema dolje (niži sloj)">▼</button>
          <input type="range" class="palette-op-slider" min="0" max="100" value="${op}" title="Prozirnost: ${op}%" data-action="opacity">
          <button class="palette-mini-btn ${isSolo ? 'active' : ''}" title="Solo prikaz" data-action="solo" style="font-size:0.58rem; padding:1px 4px;">S</button>
        </div>
      `;

      // Arrow Reorder Handlers (In UI reversed list: ▲ means +1 shift in currentLayers, ▼ means -1 shift)
      const btnUp = row.querySelector("[data-action='move-up']");
      if (btnUp) {
        btnUp.addEventListener("click", (e) => {
          e.stopPropagation();
          this.moveLayerByShift(layer.index, 1);
        });
      }

      const btnDown = row.querySelector("[data-action='move-down']");
      if (btnDown) {
        btnDown.addEventListener("click", (e) => {
          e.stopPropagation();
          this.moveLayerByShift(layer.index, -1);
        });
      }

      // Drag and Drop
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", String(layer.index));
        e.dataTransfer.effectAllowed = "move";
        row.classList.add("is-dragging");
      });

      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          row.classList.add("drag-target-above");
          row.classList.remove("drag-target-below");
        } else {
          row.classList.add("drag-target-below");
          row.classList.remove("drag-target-above");
        }
      });

      row.addEventListener("dragleave", () => {
        row.classList.remove("drag-target-above", "drag-target-below");
      });

      row.addEventListener("drop", (e) => {
        e.preventDefault();
        const fromIdx = parseInt(e.dataTransfer.getData("text/plain"), 10);
        const isAbove = row.classList.contains("drag-target-above");
        row.classList.remove("drag-target-above", "drag-target-below");
        if (!isNaN(fromIdx)) {
          this.reorderLayerToIndex(fromIdx, layer.index, isAbove);
        }
      });

      row.addEventListener("dragend", () => {
        row.classList.remove("is-dragging", "drag-target-above", "drag-target-below");
      });

      // Eye Visibility Toggle
      const btnVis = row.querySelector("[data-action='toggle-vis']");
      if (btnVis) {
        btnVis.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleLayerVisibility(layer.index);
        });
      }

      // Solo Toggle
      const btnSolo = row.querySelector("[data-action='solo']");
      if (btnSolo) {
        btnSolo.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleSoloLayer(layer.index);
        });
      }

      // Opacity slider
      const opSlider = row.querySelector("[data-action='opacity']");
      if (opSlider) {
        opSlider.addEventListener("input", (e) => {
          e.stopPropagation();
          this.setLayerOpacity(layer.index, e.target.value);
        });
      }

      // Hover preview highlight
      row.addEventListener("mouseenter", () => {
        const slice = this.app.canvasController?.layersContainer?.querySelector(`.artboard-layer-slice[data-layer-index="${layer.index}"]`);
        if (slice) {
          slice.style.filter = "drop-shadow(0 0 10px var(--accent-gold-bright))";
        }
      });
      row.addEventListener("mouseleave", () => {
        const slice = this.app.canvasController?.layersContainer?.querySelector(`.artboard-layer-slice[data-layer-index="${layer.index}"]`);
        if (slice) {
          slice.style.filter = "";
        }
      });

      this.paletteLayersList.appendChild(row);
    });

    if (this.floatingLayersPalette && this.app.canvasController?.currentViewMode === "layer_psd") {
      this.floatingLayersPalette.style.display = "flex";
    }
  }

  renderLayersStack() {
    if (!this.layersListContainer) return;
    this.layersListContainer.innerHTML = "";

    if (!this.currentLayers.length) {
      this.layersListContainer.innerHTML = `
        <div style="padding:14px; text-align:center; color:var(--text-muted); font-size:0.75rem; font-family:var(--font-mono);">
          Nema generiranih slojeva. Odaberite plan i kliknite "POKRENI MING LAYER SEGMENTACIJU".
        </div>
      `;
      if (this.layerCountBadge) this.layerCountBadge.textContent = "0 SLOJEVA";
      return;
    }

    if (this.layerCountBadge) {
      this.layerCountBadge.textContent = `${this.currentLayers.length} RGBA SLOJA`;
    }

    // Render in reverse order so top layer is on top of the visual stack
    const reversed = [...this.currentLayers].reverse();

    reversed.forEach((layer, uiIdx) => {
      const item = document.createElement("div");
      const isSolo = this.soloLayerIndex === layer.index;
      const isVis = this.layerVisibility[layer.index] !== false;
      const opPct = Math.round((this.layerOpacity[layer.index] !== undefined ? this.layerOpacity[layer.index] : 1.0) * 100);
      const isFirstInUi = uiIdx === 0;
      const isLastInUi = uiIdx === reversed.length - 1;

      item.className = `layer-stack-card ${isSolo ? 'solo' : ''} ${!isVis ? 'hidden-layer' : ''}`;
      item.dataset.layerIndex = layer.index;
      item.setAttribute("draggable", "true");

      item.innerHTML = `
        <div class="layer-card-left">
          <div class="layer-drag-grip" title="Povuci karticu za promjenu redoslijeda">⋮⋮</div>
          
          <div class="layer-reorder-arrows">
            <button class="btn-arrow-move btn-move-up" data-action="move-up" ${isFirstInUi ? 'disabled' : ''} title="Pomakni prema gore (na vrh)">▲</button>
            <button class="btn-arrow-move btn-move-down" data-action="move-down" ${isLastInUi ? 'disabled' : ''} title="Pomakni prema dolje (na dno)">▼</button>
          </div>

          <button class="btn-layer-vis ${isVis ? 'active' : 'hidden'}" title="${isVis ? 'Sakrij sloj' : 'Prikaži sloj'}" data-action="toggle-vis">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              ${isVis 
                ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>' 
                : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'}
            </svg>
          </button>
          <div class="layer-thumb-wrap">
            <img src="${layer.url}" alt="${layer.name}" class="layer-thumb-img">
          </div>
          <div class="layer-info-col">
            <div class="layer-name-row">
              <span class="layer-idx-num">#0${layer.index}</span>
              <strong class="layer-title-text">${layer.name}</strong>
            </div>
            <div class="layer-meta-row" style="display:flex; align-items:center; gap:8px; margin-top:2px;">
              <span class="layer-cov-pill">${layer.alpha_coverage_pct || 0}%</span>
              <div style="display:inline-flex; align-items:center; gap:4px;">
                <input type="range" class="palette-op-slider" min="0" max="100" value="${opPct}" data-action="opacity" title="Podešavanje prozirnosti sloja">
                <span class="layer-op-val" style="font-family:var(--font-mono); font-size:0.62rem; color:var(--text-muted); min-width:26px;">${opPct}%</span>
              </div>
            </div>
          </div>
        </div>

        <div class="layer-card-actions">
          <button class="btn-layer-tool ${isSolo ? 'active' : ''}" title="Solo prikaz: pregledaj samo ovaj sloj" data-action="solo">
            <span>SOLO</span>
          </button>
          <button class="btn-layer-tool btn-tool-dl" title="Preuzmi ovaj prozirni PNG sloj" data-action="download">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
        </div>
      `;

      // Move Up / Down Arrow Handlers
      const btnUp = item.querySelector("[data-action='move-up']");
      if (btnUp) {
        btnUp.addEventListener("click", (e) => {
          e.stopPropagation();
          this.moveLayerByShift(layer.index, 1);
        });
      }

      const btnDown = item.querySelector("[data-action='move-down']");
      if (btnDown) {
        btnDown.addEventListener("click", (e) => {
          e.stopPropagation();
          this.moveLayerByShift(layer.index, -1);
        });
      }

      // Drag and Drop Listeners
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", String(layer.index));
        e.dataTransfer.effectAllowed = "move";
        item.classList.add("is-dragging");
      });

      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          item.classList.add("drag-target-above");
          item.classList.remove("drag-target-below");
        } else {
          item.classList.add("drag-target-below");
          item.classList.remove("drag-target-above");
        }
      });

      item.addEventListener("dragleave", () => {
        item.classList.remove("drag-target-above", "drag-target-below");
      });

      item.addEventListener("drop", (e) => {
        e.preventDefault();
        const fromIdx = parseInt(e.dataTransfer.getData("text/plain"), 10);
        const isAbove = item.classList.contains("drag-target-above");
        item.classList.remove("drag-target-above", "drag-target-below");
        if (!isNaN(fromIdx)) {
          this.reorderLayerToIndex(fromIdx, layer.index, isAbove);
        }
      });

      item.addEventListener("dragend", () => {
        item.classList.remove("is-dragging", "drag-target-above", "drag-target-below");
      });

      // Visibility Toggle
      const btnVis = item.querySelector("[data-action='toggle-vis']");
      if (btnVis) {
        btnVis.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleLayerVisibility(layer.index);
        });
      }

      // Solo Toggle
      const btnSolo = item.querySelector("[data-action='solo']");
      if (btnSolo) {
        btnSolo.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleSoloLayer(layer.index);
        });
      }

      // Opacity Slider
      const opSlider = item.querySelector("[data-action='opacity']");
      if (opSlider) {
        opSlider.addEventListener("input", (e) => {
          e.stopPropagation();
          this.setLayerOpacity(layer.index, e.target.value);
        });
      }

      // Individual PNG Download
      const btnDl = item.querySelector("[data-action='download']");
      if (btnDl) {
        btnDl.addEventListener("click", (e) => {
          e.stopPropagation();
          const cleanName = `${this.app.currentDesign?.slug || 'design'}_${layer.name}.png`.replace(/\s+/g, '_');
          this.app.downloadFile(layer.url, cleanName);
          this.app.feedback.showToast(`⬇️ Preuzet sloj: ${layer.name}`, "info", 2000);
        });
      }

      this.layersListContainer.appendChild(item);
    });
  }

  updateTelemetry(result) {
    if (this.layerMetricCount) {
      this.layerMetricCount.textContent = `${result.layer_count || this.currentLayers.length} Slojeva`;
    }
    if (this.layerMetricPsdSize) {
      const bytes = result.psd_filesize_bytes || 0;
      this.layerMetricPsdSize.textContent = bytes > 0 ? `${(bytes / (1024*1024)).toFixed(1)} MB` : "Spremno";
    }
    if (this.layerMetricTime) {
      this.layerMetricTime.textContent = `${result.duration || 0}s`;
    }
  }

  restoreState(state) {
    if (!state) {
      this.currentLayers = [];
      this.psdUrl = null;
      this.psdFilename = null;
      this.previewUrl = null;
      this.renderLayersStack();
      this.renderFloatingPalette();
      return;
    }

    const layers = (state.layer_segments && state.layer_segments.length > 0)
      ? state.layer_segments
      : (state.layer_result?.layers && state.layer_result.layers.length > 0)
        ? state.layer_result.layers
        : (state.layer_result?.segments && state.layer_result.segments.length > 0)
          ? state.layer_result.segments
          : [];

    const psdUrl = state.layer_psd_url || state.layer_result?.psd_url || null;
    const psdFp = state.layer_psd_filepath || state.layer_result?.psd_filepath || null;
    const prevUrl = state.layer_preview_url || state.layer_result?.preview_url || null;

    if (layers.length > 0) {
      this.applyLayerResult({
        success: true,
        layers: layers,
        psd_url: psdUrl,
        psd_filepath: psdFp,
        psd_filename: psdFp ? psdFp.split("/").pop() : (state.layer_result?.psd_filename || "Photoshop_Layers.psd"),
        preview_url: prevUrl,
        layer_count: layers.length,
        duration: state.layer_result?.duration || 0
      });
    } else {
      this.currentLayers = [];
      this.psdUrl = null;
      this.psdFilename = null;
      this.previewUrl = null;
      this.renderLayersStack();
      this.renderFloatingPalette();
    }

    if (state.layer_prompt_used && this.layerPromptInput) {
      this.layerPromptInput.value = state.layer_prompt_used;
    }
    if (state.layer_source_mode) {
      this.setSourceMode(state.layer_source_mode);
    }
  }
}


