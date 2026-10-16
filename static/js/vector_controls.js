/**
 * Studio Varaždin — Vector Controls & Tuning Sliders Engine (Per-Image Project Isolated)
 * Step 05 in the Print Lab Pipeline (Right after Ming Layers PSD).
 * Features:
 * - Sub-pixel multi-plate vector tracing (Potrace / vtracer)
 * - Interactive vector layer stack (Photoshop-style)
 * - Real-time hide/show layer visibility toggle & solo inspection
 * - Drag-and-drop and arrow (▲/▼) reordering of vector plates
 * - Instant layer deletion with real-time SVG DOM update
 * - Show all / Hide all / Reset layers actions
 * - Live color picker and color overrides
 * - Direct download of live modified SVG master
 * - Full per-image project state persistence
 */

export class VectorControls {
  constructor(app) {
    this.app = app;
    this.debounceTimer = null;
    this.currentLayers = [];
    this.rawVectorLayers = [];
    this.layerVisibility = {};
    this.layerOpacity = {};
    this.soloLayerId = null;
    this.colorOverrides = {};
    this.deletedLayerIds = new Set();
    this._reorderDebounce = null;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.sliderThreshold = document.getElementById("sliderThreshold");
    this.sliderSpeckle = document.getElementById("sliderSpeckle");
    this.sliderCorner = document.getElementById("sliderCorner");
    this.sliderSmooth = document.getElementById("sliderSmooth");
    this.sliderChoke = document.getElementById("sliderChoke");
    this.sliderColors = document.getElementById("sliderColors");
    this.selectDPI = document.getElementById("selectDPI");
    this.btnVectorize = document.getElementById("btnRunVectorize");
    this.layersContainer = document.getElementById("vectorLayersList");
    this.chkAutoUpdate = document.getElementById("chkAutoUpdate");

    // Value Labels
    this.valThreshold = document.getElementById("valThreshold");
    this.valSpeckle = document.getElementById("valSpeckle");
    this.valCorner = document.getElementById("valCorner");
    this.valSmooth = document.getElementById("valSmooth");
    this.valChoke = document.getElementById("valChoke");
    this.valColors = document.getElementById("valColors");

    // Quick Actions & Toolbar
    this.vectorLayerCountBadge = document.getElementById("vectorLayerCountBadge");
    this.btnVectorShowAll = document.getElementById("btnVectorShowAll");
    this.btnVectorHideAll = document.getElementById("btnVectorHideAll");
    this.btnVectorResetLayers = document.getElementById("btnVectorResetLayers");
    this.btnDownloadVectorSvg = document.getElementById("btnDownloadVectorSvg");
  }

  bindEvents() {
    const sliders = [
      { el: this.sliderThreshold, val: this.valThreshold, unit: "" },
      { el: this.sliderSpeckle, val: this.valSpeckle, unit: " px" },
      { el: this.sliderCorner, val: this.valCorner, unit: "°" },
      { el: this.sliderSmooth, val: this.valSmooth, unit: "" },
      { el: this.sliderChoke, val: this.valChoke, unit: " px" },
      { el: this.sliderColors, val: this.valColors, unit: " b." },
    ];

    sliders.forEach(s => {
      if (!s.el) return;
      s.el.addEventListener("input", () => {
        if (s.val) s.val.textContent = s.el.value + s.unit;
        this.app.triggerDebouncedStateSave();
        if (this.chkAutoUpdate && this.chkAutoUpdate.checked) {
          this.triggerDebouncedVectorize();
        }
      });
    });

    if (this.btnVectorize) {
      this.btnVectorize.addEventListener("click", () => this.runVectorization(true));
    }

    if (this.selectDPI) {
      this.selectDPI.addEventListener("change", () => {
        this.app.triggerDebouncedStateSave();
        if (this.chkAutoUpdate && this.chkAutoUpdate.checked) {
          this.runVectorization(true);
        }
      });
    }

    document.querySelectorAll("input[name='vecEngine']").forEach(r => {
      r.addEventListener("change", () => {
        this.app.triggerDebouncedStateSave();
        if (this.chkAutoUpdate && this.chkAutoUpdate.checked) {
          this.runVectorization(true);
        }
      });
    });

    // Quick Actions
    if (this.btnVectorShowAll) {
      this.btnVectorShowAll.addEventListener("click", () => this.showAllLayers());
    }
    if (this.btnVectorHideAll) {
      this.btnVectorHideAll.addEventListener("click", () => this.hideAllLayers());
    }
    if (this.btnVectorResetLayers) {
      this.btnVectorResetLayers.addEventListener("click", () => this.resetLayers());
    }
    if (this.btnDownloadVectorSvg) {
      this.btnDownloadVectorSvg.addEventListener("click", () => this.downloadLiveSvg());
    }
  }

  restoreState(state = {}) {
    const setVal = (el, badge, val, unit = "") => {
      if (!el || val === undefined) return;
      el.value = val;
      if (badge) badge.textContent = `${val}${unit}`;
    };

    setVal(this.sliderColors, this.valColors, state.vector_colors ?? 8, " b.");
    setVal(this.sliderCorner, this.valCorner, state.vector_corner ?? 30, "°");
    setVal(this.sliderSmooth, this.valSmooth, state.vector_smooth ?? 2.5, "");
    setVal(this.sliderSpeckle, this.valSpeckle, state.vector_speckle ?? 2, " px");
    if (this.selectDPI && state.vector_dpi) {
      this.selectDPI.value = state.vector_dpi;
    }

    if (state.vector_engine) {
      const radio = document.querySelector(`input[name='vecEngine'][value='${state.vector_engine}']`);
      if (radio) radio.checked = true;
    }

    this.colorOverrides = Object.assign({}, state.vector_color_overrides || {});
    this.layerVisibility = Object.assign({}, state.vector_layer_visibility || {});
    this.layerOpacity = Object.assign({}, state.vector_layer_opacity || {});
    this.deletedLayerIds = new Set(state.vector_deleted_layer_ids || []);
    this.soloLayerId = null;

    this.rawVectorLayers = state.vector_raw_layers || state.vector_result?.layers || state.vector_layers || [];

    const rawLayers = (state.vector_layers && state.vector_layers.length > 0)
      ? state.vector_layers
      : (state.vector_result?.layers && state.vector_result.layers.length > 0)
        ? state.vector_result.layers
        : this.rawVectorLayers;

    if (rawLayers && rawLayers.length > 0) {
      // Ensure IDs & indices
      const normalized = rawLayers.map((l, idx) => ({
        id: l.id || `layer_${l.index || idx + 1}`,
        index: l.index !== undefined ? l.index : idx + 1,
        color: l.color || "#ffffff",
        name: l.name || `Layer ${String(l.index || idx + 1).padStart(2, '0')}`,
        path_count: l.path_count || 0
      }));

      // Filter out deleted
      this.currentLayers = normalized.filter(l => !this.deletedLayerIds.has(l.id));
      this.renderLayers(this.currentLayers);
      this.applySvgModifications();
    } else {
      this.currentLayers = [];
      if (this.layersContainer) {
        this.layersContainer.innerHTML = `<div class="layer-item" style="color:var(--text-muted); padding:8px;">Vektorski slojevi spremni za generiranje</div>`;
      }
      if (this.vectorLayerCountBadge) this.vectorLayerCountBadge.textContent = "0 SLOJEVA";
    }

    if (this.btnDownloadVectorSvg) {
      this.btnDownloadVectorSvg.style.display = (this.currentLayers.length > 0) ? "flex" : "none";
    }
  }

  triggerDebouncedVectorize() {
    clearTimeout(this.debounceTimer);
    if (this.app.feedback) {
      const banner = document.getElementById("aiStatusBanner");
      if (banner) {
        banner.style.display = "flex";
        banner.className = "status-banner info";
        banner.innerHTML = `<span class="btn-spinner" style="border-top-color:var(--accent-gold);"></span><span>Prilagođavam parametre vektorizacije...</span>`;
      }
    }
    this.debounceTimer = setTimeout(() => {
      this.runVectorization(false);
    }, 450);
  }

  async runVectorization(showFullOverlay = false) {
    const active = this.app.activeImage;
    if (!active) return;

    if (this.app.feedback.isLocked("vectorization")) return;

    let activeSource = active.state?.dtf_result?.filepath || this.app.dtfData?.filepath || active.filepath;
    if (!activeSource) {
      activeSource = this.app.currentDesign?.hires_path || this.app.currentDesign?.preview_path;
    }

    const locked = this.app.feedback.acquireLock("vectorization", this.btnVectorize, "Vektorizacija...");
    if (!locked) return;

    if (showFullOverlay) {
      this.app.feedback.showCanvasOverlay(
        "SUB-PIXEL VEKTORIZACIJA U TIJEKU",
        `Generiranje Bézier krivulja za ${active.version_label}...`,
        "FAZA 4: VEKTOR MASTER"
      );
    }

    const engine = document.querySelector("input[name='vecEngine']:checked")?.value || "vtracer";
    const payload = {
      image_path: activeSource,
      image_id: active.id,
      design_id: this.app.currentDesign?.id || "",
      engine: engine,
      color_mode: engine === "potrace" ? "binary" : "color",
      color_precision: parseInt(this.sliderColors?.value || 8),
      filter_speckle: parseInt(this.sliderSpeckle?.value || 2),
      corner_threshold: parseInt(this.sliderCorner?.value || 30),
      length_threshold: parseFloat(this.sliderSmooth?.value || 2.5),
      layer_difference: 16,
      curve_mode: "spline",
      hierarchical: "stacked",
      remove_bg_plate: true,
      bg_is_dark: false,
      target_height: parseInt(this.selectDPI?.value || 2048),
      color_replacements: this.colorOverrides
    };

    try {
      const res = await fetch("/api/vectorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        const layers = (data.layers || []).map((l, idx) => ({
          id: l.id || `layer_${l.index || idx + 1}`,
          index: l.index !== undefined ? l.index : idx + 1,
          color: l.color || "#ffffff",
          name: l.name || `Layer ${String(l.index || idx + 1).padStart(2, '0')}`,
          path_count: l.path_count || 0
        }));

        this.rawVectorLayers = JSON.parse(JSON.stringify(layers));
        this.currentLayers = JSON.parse(JSON.stringify(layers));
        this.deletedLayerIds.clear();
        this.soloLayerId = null;

        // Reset visibility to true for all
        this.layerVisibility = {};
        this.currentLayers.forEach(l => {
          this.layerVisibility[l.id] = true;
        });

        this.app.setVectorResult(data);
        this.renderLayers(this.currentLayers);
        this.applySvgModifications();
        this.syncVectorState();

        if (this.btnDownloadVectorSvg) {
          this.btnDownloadVectorSvg.style.display = "flex";
        }

        if (showFullOverlay) {
          this.app.feedback.showToast(`📐 Vektorizirano ${data.total_paths} putanja kroz ${data.layers.length} sloja (${data.duration}s)!`, "success", 3000);
        }
      } else {
        console.error("[VectorControls] Vectorization error:", data.error);
        this.app.feedback.showToast(`❌ Greška vektorizacije: ${data.error}`, "error", 4000);
      }
    } catch (err) {
      console.error("[VectorControls] Request failed:", err);
      this.app.feedback.showToast(`❌ Greška: ${err.message}`, "error", 4000);
    } finally {
      this.app.feedback.releaseLock("vectorization", this.btnVectorize);
    }
  }

  getSvgGroupForLayer(svgEl, layer) {
    if (!svgEl || !layer) return null;
    
    // 1. Direct ID / data-layer-id match
    let g = svgEl.querySelector(`[data-layer-id="${layer.id}"]`)
         || svgEl.querySelector(`#${layer.id}`)
         || svgEl.querySelector(`#LAYER_${String(layer.index).padStart(2, '0')}`)
         || svgEl.querySelector(`#LAYER_${layer.index}`);
    if (g) return g;

    // 2. By inkscape label or title
    if (layer.name) {
      g = svgEl.querySelector(`g[inkscape\\:label="${layer.name}"]`)
       || svgEl.querySelector(`g[label="${layer.name}"]`);
      if (g) return g;
    }

    // 3. By index among top-level <g> children
    const groups = Array.from(svgEl.querySelectorAll("svg > g"));
    if (layer.index !== undefined && groups[layer.index - 1]) {
      return groups[layer.index - 1];
    }

    return null;
  }

  applySvgModifications() {
    const svgEl = this.app.canvasController?.svgContainer?.querySelector("svg");
    if (!svgEl) return;

    // Tag untagged groups if needed
    const topGroups = Array.from(svgEl.querySelectorAll("svg > g"));
    topGroups.forEach((g, idx) => {
      if (!g.getAttribute("data-layer-id")) {
        const fallbackId = g.id || `layer_${idx + 1}`;
        g.setAttribute("data-layer-id", fallbackId);
        g.setAttribute("data-layer-index", String(idx + 1));
      }
    });

    // 1. Reorder <g> elements in SVG DOM to match this.currentLayers stack order (bottom to top)
    this.currentLayers.forEach(layer => {
      const g = this.getSvgGroupForLayer(svgEl, layer);
      if (g && g.parentNode === svgEl) {
        svgEl.appendChild(g); // Moving to end places it visually on top
      }
    });

    // 2. Apply Visibility, Solo, Deletions, and Color overrides
    topGroups.forEach(g => {
      const gLayerId = g.getAttribute("data-layer-id") || g.id;
      const matchedLayer = this.currentLayers.find(l => 
        l.id === gLayerId || 
        `#LAYER_${String(l.index).padStart(2, '0')}` === `#${g.id}` ||
        `LAYER_${String(l.index).padStart(2, '0')}` === g.id
      );

      if (!matchedLayer || this.deletedLayerIds.has(gLayerId) || (matchedLayer && this.deletedLayerIds.has(matchedLayer.id))) {
        g.style.display = "none";
        return;
      }

      if (this.soloLayerId) {
        g.style.display = (matchedLayer.id === this.soloLayerId) ? "" : "none";
      } else {
        const isVis = this.layerVisibility[matchedLayer.id] !== false;
        g.style.display = isVis ? "" : "none";
      }

      // Color overrides
      const overrideColor = this.colorOverrides[matchedLayer.color];
      if (overrideColor) {
        g.setAttribute("fill", overrideColor);
        g.style.fill = overrideColor;
      }
    });
  }

  showAllLayers() {
    this.soloLayerId = null;
    this.currentLayers.forEach(l => {
      this.layerVisibility[l.id] = true;
    });
    this.renderLayers(this.currentLayers);
    this.applySvgModifications();
    this.syncVectorState();
    this.app.feedback.showToast("👁️ Svi vektorski slojevi su prikazani.", "info", 1500);
  }

  hideAllLayers() {
    this.soloLayerId = null;
    this.currentLayers.forEach(l => {
      this.layerVisibility[l.id] = false;
    });
    this.renderLayers(this.currentLayers);
    this.applySvgModifications();
    this.syncVectorState();
    this.app.feedback.showToast("🚫 Svi vektorski slojevi su skriveni.", "info", 1500);
  }

  toggleLayerVisibility(layerId) {
    this.layerVisibility[layerId] = !(this.layerVisibility[layerId] !== false);
    this.soloLayerId = null;
    this.renderLayers(this.currentLayers);
    this.applySvgModifications();
    this.syncVectorState();
  }

  toggleSoloLayer(layerId) {
    if (this.soloLayerId === layerId) {
      this.soloLayerId = null;
      this.currentLayers.forEach(l => {
        this.layerVisibility[l.id] = true;
      });
    } else {
      this.soloLayerId = layerId;
      this.currentLayers.forEach(l => {
        this.layerVisibility[l.id] = (l.id === layerId);
      });
    }
    this.renderLayers(this.currentLayers);
    this.applySvgModifications();
    this.syncVectorState();
  }

  deleteLayer(layerId) {
    const idx = this.currentLayers.findIndex(l => l.id === layerId);
    if (idx === -1) return;

    const removed = this.currentLayers.splice(idx, 1)[0];
    this.deletedLayerIds.add(layerId);
    if (this.soloLayerId === layerId) {
      this.soloLayerId = null;
    }

    this.renderLayers(this.currentLayers);
    this.applySvgModifications();
    this.syncVectorState();
    this.app.feedback.showToast(`🗑️ Sloj "${removed.name}" uklonjen iz vektora.`, "info", 2000);
  }

  resetLayers() {
    if (!this.rawVectorLayers || this.rawVectorLayers.length === 0) {
      this.runVectorization(true);
      return;
    }

    this.currentLayers = JSON.parse(JSON.stringify(this.rawVectorLayers));
    this.deletedLayerIds.clear();
    this.soloLayerId = null;
    this.colorOverrides = {};
    this.layerVisibility = {};
    this.currentLayers.forEach(l => {
      this.layerVisibility[l.id] = true;
    });

    this.renderLayers(this.currentLayers);
    this.applySvgModifications();
    this.syncVectorState();
    this.app.feedback.showToast("↺ Vektorski slojevi vraćeni na izvorno stanje.", "success", 2000);
  }

  moveLayerByShift(layerId, shift) {
    const curIdx = this.currentLayers.findIndex(l => l.id === layerId);
    if (curIdx === -1) return;

    const newIdx = curIdx + shift;
    if (newIdx < 0 || newIdx >= this.currentLayers.length) return;

    const temp = this.currentLayers[curIdx];
    this.currentLayers[curIdx] = this.currentLayers[newIdx];
    this.currentLayers[newIdx] = temp;

    this.renderLayers(this.currentLayers);
    this.applySvgModifications();
    this.syncVectorState();
    this.app.feedback.showToast(`↕️ Sloj "${temp.name}" premješten.`, "info", 1500);
  }

  reorderLayerToIndex(fromLayerId, toLayerId, placeAbove = false) {
    if (fromLayerId === toLayerId) return;

    const fromIdx = this.currentLayers.findIndex(l => l.id === fromLayerId);
    const toIdx = this.currentLayers.findIndex(l => l.id === toLayerId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [movedLayer] = this.currentLayers.splice(fromIdx, 1);
    let targetInsert = this.currentLayers.findIndex(l => l.id === toLayerId);
    if (placeAbove) {
      targetInsert += 1;
    }

    this.currentLayers.splice(targetInsert, 0, movedLayer);

    this.renderLayers(this.currentLayers);
    this.applySvgModifications();
    this.syncVectorState();
    this.app.feedback.showToast(`↕️ Sloj "${movedLayer.name}" presložen.`, "info", 1500);
  }

  syncVectorState() {
    if (this.app.activeImage) {
      if (!this.app.activeImage.state) this.app.activeImage.state = {};
      this.app.activeImage.state.vector_layers = this.currentLayers;
      this.app.activeImage.state.vector_raw_layers = this.rawVectorLayers;
      this.app.activeImage.state.vector_layer_visibility = this.layerVisibility;
      this.app.activeImage.state.vector_layer_opacity = this.layerOpacity;
      this.app.activeImage.state.vector_deleted_layer_ids = Array.from(this.deletedLayerIds);
      this.app.activeImage.state.vector_color_overrides = this.colorOverrides;
      if (this.app.activeImage.state.vector_result) {
        this.app.activeImage.state.vector_result.layers = this.currentLayers;
      }
      this.app.triggerDebouncedStateSave();
    }
  }

  renderLayers(layers) {
    this.currentLayers = layers;
    if (!this.layersContainer) return;
    this.layersContainer.innerHTML = "";

    if (this.vectorLayerCountBadge) {
      this.vectorLayerCountBadge.textContent = `${layers.length} SLOJEVA`;
    }

    if (layers.length === 0) {
      this.layersContainer.innerHTML = `
        <div style="color:var(--text-muted); font-size:0.75rem; padding:12px; text-align:center; font-style:italic;">
          Nema vidljivih slojeva. Kliknite "↺ Resetiraj" ili "OSVJEŽI VEKTOR".
        </div>
      `;
      return;
    }

    // Top-to-bottom stack order (Photoshop style: top visual layer is first in UI)
    const reversed = [...layers].reverse();

    reversed.forEach((layer, uiIdx) => {
      const isVis = this.layerVisibility[layer.id] !== false;
      const isSolo = this.soloLayerId === layer.id;
      const isFirstInUi = uiIdx === 0;
      const isLastInUi = uiIdx === reversed.length - 1;
      const effectiveColor = this.colorOverrides[layer.color] || layer.color;

      const item = document.createElement("div");
      item.className = `layer-stack-card ${isSolo ? 'solo' : ''} ${!isVis ? 'hidden-layer' : ''}`;
      item.dataset.layerId = layer.id;
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

          <div style="display:flex; align-items:center; gap:6px;">
            <input type="color" value="${effectiveColor}" class="layer-color-picker" data-orig="${layer.color}" title="Promijeni boju ovog sloja" style="width:24px; height:24px; border:none; border-radius:3px; cursor:pointer; background:transparent; padding:0;">
          </div>

          <div class="layer-info-col">
            <div class="layer-name-row">
              <span class="layer-idx-num">#0${layer.index}</span>
              <strong class="layer-title-text">${layer.name}</strong>
            </div>
            <div class="layer-meta-row" style="display:flex; align-items:center; gap:6px; margin-top:2px;">
              <span class="layer-cov-pill" style="color:var(--accent-gold-bright); background:rgba(208,160,65,0.12); font-weight:700;">${layer.path_count} krivulja</span>
              <span class="layer-dim-pill" style="font-family:var(--font-mono); font-size:0.65rem;">${effectiveColor.toUpperCase()}</span>
            </div>
          </div>
        </div>

        <div class="layer-card-actions">
          <button class="btn-layer-tool ${isSolo ? 'active' : ''}" title="Solo prikaz: pregledaj samo ovaj sloj" data-action="solo">
            <span>SOLO</span>
          </button>
          <button class="btn-layer-tool btn-tool-delete" title="Ukloni ovaj sloj iz vektora" data-action="delete">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      `;

      // Up / Down arrows (In reversed UI list: ▲ means move higher in visual stack = +1 shift in currentLayers)
      const btnUp = item.querySelector("[data-action='move-up']");
      if (btnUp) {
        btnUp.addEventListener("click", (e) => {
          e.stopPropagation();
          this.moveLayerByShift(layer.id, 1);
        });
      }

      const btnDown = item.querySelector("[data-action='move-down']");
      if (btnDown) {
        btnDown.addEventListener("click", (e) => {
          e.stopPropagation();
          this.moveLayerByShift(layer.id, -1);
        });
      }

      // Drag and drop listeners
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", String(layer.id));
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
        const fromId = e.dataTransfer.getData("text/plain");
        const isAbove = item.classList.contains("drag-target-above");
        item.classList.remove("drag-target-above", "drag-target-below");
        if (fromId) {
          this.reorderLayerToIndex(fromId, layer.id, isAbove);
        }
      });

      item.addEventListener("dragend", () => {
        item.classList.remove("is-dragging", "drag-target-above", "drag-target-below");
      });

      // Visibility toggle
      const btnVis = item.querySelector("[data-action='toggle-vis']");
      if (btnVis) {
        btnVis.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleLayerVisibility(layer.id);
        });
      }

      // Solo toggle
      const btnSolo = item.querySelector("[data-action='solo']");
      if (btnSolo) {
        btnSolo.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleSoloLayer(layer.id);
        });
      }

      // Delete button
      const btnDel = item.querySelector("[data-action='delete']");
      if (btnDel) {
        btnDel.addEventListener("click", (e) => {
          e.stopPropagation();
          this.deleteLayer(layer.id);
        });
      }

      // Color picker
      const picker = item.querySelector(".layer-color-picker");
      if (picker) {
        picker.addEventListener("change", (e) => {
          const origColor = e.target.getAttribute("data-orig") || layer.color;
          const newColor = e.target.value;
          this.colorOverrides[origColor] = newColor;
          this.colorOverrides[layer.color] = newColor;
          this.app.feedback.showToast(`Prilagođena boja sloja: ${newColor.toUpperCase()}`, "info", 1500);
          this.renderLayers(this.currentLayers);
          this.applySvgModifications();
          this.syncVectorState();
        });
      }

      // Hover highlight on canvas SVG
      item.addEventListener("mouseenter", () => {
        const svgEl = this.app.canvasController?.svgContainer?.querySelector("svg");
        if (svgEl) {
          const g = this.getSvgGroupForLayer(svgEl, layer);
          if (g) {
            g.style.filter = "drop-shadow(0 0 10px var(--accent-gold-bright))";
          }
        }
      });
      item.addEventListener("mouseleave", () => {
        const svgEl = this.app.canvasController?.svgContainer?.querySelector("svg");
        if (svgEl) {
          const g = this.getSvgGroupForLayer(svgEl, layer);
          if (g) {
            g.style.filter = "";
          }
        }
      });

      this.layersContainer.appendChild(item);
    });
  }

  downloadLiveSvg() {
    const svgEl = this.app.canvasController?.svgContainer?.querySelector("svg");
    if (!svgEl) {
      this.app.feedback.showToast("Nema dostupnog vektorskog SVG-a za preuzimanje.", "error");
      return;
    }

    try {
      const clone = svgEl.cloneNode(true);
      const hiddenGroups = clone.querySelectorAll("g[style*='display: none'], g[display='none']");
      hiddenGroups.forEach(g => g.remove());

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clone);
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const filename = `${this.app.currentDesign?.slug || 'design'}_${this.app.activeImage?.version_label || 'Vector'}_Master.svg`.replace(/\s+/g, '_');
      this.app.downloadFile(url, filename);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      this.app.feedback.showToast(`✅ Preuzet prilagođeni SVG: ${filename}`, "success", 3000);
    } catch (e) {
      console.error("[VectorControls] Error downloading live SVG:", e);
      this.app.feedback.showToast(`Greška pri izvozu SVG-a: ${e.message}`, "error");
    }
  }
}
