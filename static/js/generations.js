/**
 * Studio Varaždin — AI Generation History & Multi-Version Reel Controller
 * Persistent SQLite-backed version manager with A/B visual split testing,
 * state auto-saving, telemetry tracking, and zero-data-loss guarantees.
 */

export class GenerationsController {
  constructor(app) {
    this.app = app;
    this.generations = [];
    this.activeGenerationId = "gen_original";
    this.compareTargetId = null;
    this.isReelCollapsed = false;
    this._saveStateTimeout = null;

    this.initElements();
    this.bindEvents();
    this.loadGlobalStats();
  }

  initElements() {
    // Filmstrip Containers
    this.filmstripBar = document.getElementById("generationsFilmstripBar");
    this.trackEl = document.getElementById("generationsTrack");
    this.btnToggleReel = document.getElementById("btnToggleReel");
    this.reelBadgeCount = document.getElementById("reelBadgeCount");
    this.reelActiveBadge = document.getElementById("reelActiveBadge");

    // Quick Compare Bar & Floating HUD
    this.btnQuickCompare = document.getElementById("btnQuickCompare");
    this.btnHoldOriginal = document.getElementById("btnHoldOriginal");
    this.compareModeGroup = document.getElementById("compareModeGroup");
    this.onionSkinWrap = document.getElementById("onionSkinWrap");
    this.sliderOnionSkin = document.getElementById("sliderOnionSkin");
    this.valOnionSkin = document.getElementById("valOnionSkin");
    this.btnNewGenPrompt = document.getElementById("btnNewGenPrompt");

    // Step 2 Sidebar Container
    this.step2HistoryContainer = document.getElementById("step2GenerationsList");
    this.step2GenCountBadge = document.getElementById("step2GenCountBadge");
  }

  bindEvents() {
    if (this.btnToggleReel && this.filmstripBar) {
      this.btnToggleReel.addEventListener("click", () => {
        this.isReelCollapsed = !this.isReelCollapsed;
        this.filmstripBar.classList.toggle("collapsed", this.isReelCollapsed);
        const icon = this.btnToggleReel.querySelector("svg");
        if (icon) {
          icon.style.transform = this.isReelCollapsed ? "rotate(180deg)" : "rotate(0deg)";
        }
        setTimeout(() => this.app.canvasController.fitToScreen(false), 150);
      });
    }

    if (this.btnQuickCompare) {
      this.btnQuickCompare.addEventListener("click", () => {
        this.toggleQuickCompare();
      });
    }

    if (this.btnHoldOriginal) {
      // Hold down to view original (Flicker / Peek test)
      const startPeek = () => {
        if (!this.app.currentDesign) return;
        this.app.canvasController.peekOriginal(true);
        this.btnHoldOriginal.classList.add("active");
      };
      const endPeek = () => {
        this.app.canvasController.peekOriginal(false);
        this.btnHoldOriginal.classList.remove("active");
      };

      this.btnHoldOriginal.addEventListener("mousedown", startPeek);
      window.addEventListener("mouseup", endPeek);
      this.btnHoldOriginal.addEventListener("touchstart", (e) => { e.preventDefault(); startPeek(); });
      window.addEventListener("touchend", endPeek);
    }

    if (this.compareModeGroup) {
      this.compareModeGroup.querySelectorAll(".compare-mode-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const mode = btn.dataset.comparemode;
          this.compareModeGroup.querySelectorAll(".compare-mode-btn").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          this.app.canvasController.setComparisonVisualMode(mode);
          if (this.onionSkinWrap) {
            this.onionSkinWrap.style.display = mode === "onion" ? "flex" : "none";
          }
        });
      });
    }

    if (this.sliderOnionSkin) {
      this.sliderOnionSkin.addEventListener("input", (e) => {
        const val = parseInt(e.target.value);
        if (this.valOnionSkin) this.valOnionSkin.textContent = `${val}%`;
        this.app.canvasController.setOnionSkinOpacity(val / 100);
      });
    }

    if (this.btnNewGenPrompt) {
      this.btnNewGenPrompt.addEventListener("click", () => {
        this.app.canvasController.goToStep(2, "ai_cleaned");
        const textarea = document.getElementById("promptInput");
        if (textarea) {
          textarea.focus();
          textarea.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }

    // Auto-save listeners on sliders and options
    this.attachAutoSaveListeners();
  }

  attachAutoSaveListeners() {
    const inputsToWatch = [
      "sliderDtfThreshold", "sliderDtfFeather", "sliderDtfChoke", "sliderDtfDefringe",
      "sliderDtfDespeckle", "sliderDtfSolid", "chkDtfProtectLines", "chkDtfInvertInk",
      "sliderColors", "sliderCorner", "sliderSmooth", "sliderSpeckle", "selectDPI",
      "chkGarmentTexture", "chkInvertInk", "selectDtfMethod", "dtfCustomHexInput"
    ];

    inputsToWatch.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", () => this.triggerDebouncedStateSave());
        el.addEventListener("change", () => this.triggerDebouncedStateSave());
      }
    });
  }

  async loadGlobalStats() {
    try {
      const res = await fetch("/api/stats/generations");
      if (res.ok) {
        const data = await res.json();
        const totalPreserved = data.total_generations_preserved || 0;
        const totalCost = data.total_cost_estimate || 0.0;
        console.log(`[GenerationsController] Database loaded: ${totalPreserved} versions preserved (~$${totalCost} investment)`);
      }
    } catch (e) {}
  }

  async loadGenerationsForCurrentDesign() {
    const item = this.app.currentDesign;
    if (!item) return;

    try {
      const res = await fetch(`/api/generations/${encodeURIComponent(item.id)}`);
      if (res.ok) {
        const data = await res.json();
        this.generations = data.generations || [];

        // Match active generation
        let activeGen = null;
        if (data.active_generation_id) {
          activeGen = this.generations.find(g => g.id === data.active_generation_id);
        }
        if (!activeGen) {
          activeGen = this.generations.find(g => g.id === this.activeGenerationId) || this.generations[0];
        }

        if (activeGen) {
          this.activeGenerationId = activeGen.id;
          await this.app.setActiveImage(activeGen, false);
        }

        this.renderFilmstrip();
        this.renderStep2History();
        this.updateHeaderBadges();
      }
    } catch (err) {
      console.error("[GenerationsController] Error fetching generations from SQLite:", err);
    }
  }

  triggerDebouncedStateSave() {
    this.app.triggerDebouncedStateSave();
  }

  async saveDesignState() {
    await this.app.saveActiveImageState();
  }

  updateHeaderBadges() {
    const total = this.generations.length;
    const aiCount = Math.max(0, total - 1);

    if (this.reelBadgeCount) {
      this.reelBadgeCount.textContent = `${aiCount} AI ${aiCount === 1 ? 'verzija' : 'verzije'}`;
    }
    if (this.step2GenCountBadge) {
      this.step2GenCountBadge.textContent = `${total} ${total === 1 ? 'Verzija' : 'Verzije'} (Baza)`;
    }

    // Active generation label
    const activeGen = this.generations.find(g => g.id === this.activeGenerationId) || this.generations[0];
    if (this.reelActiveBadge && activeGen) {
      this.reelActiveBadge.textContent = activeGen.is_original ? "BAZA: ORIGINAL" : `AKTIVNO: ${activeGen.version_label}`;
    }
  }

  renderFilmstrip() {
    if (!this.trackEl) return;
    this.trackEl.innerHTML = "";

    if (this.generations.length === 0) {
      this.trackEl.innerHTML = `<div class="empty-reel-msg">Učitavanje perzistentnih verzija predloška...</div>`;
      return;
    }

    this.generations.forEach((gen) => {
      const card = document.createElement("div");
      const isOrig = gen.is_original === true;
      const isActive = gen.id === this.activeGenerationId || (!this.activeGenerationId && isOrig);
      const isFav = Boolean(gen.is_favorite);

      card.className = `filmstrip-card ${isOrig ? 'card-original' : 'card-ai'} ${isActive ? 'active' : ''}`;
      card.dataset.genId = gen.id;

      // Image source
      const imgSrc = gen.url || (gen.filepath ? `/api/image-serve?path=${encodeURIComponent(gen.filepath)}` : '');
      const costBadge = gen.cost_estimate ? `~$${gen.cost_estimate.toFixed(2)}` : '';

      card.innerHTML = `
        <div class="card-thumb-wrap">
          <img src="${imgSrc}" class="card-thumb-img" alt="${gen.version_label}" loading="eager">
          
          <div class="card-version-tag ${isOrig ? 'tag-original' : 'tag-ai'}">
            ${isOrig ? '🏛️ ORIGINAL' : gen.version_label}
          </div>

          ${isFav ? '<span class="card-fav-star" title="Označeno kao favorit">★</span>' : ''}
          ${isOrig ? '<span class="card-master-pill">★ BAZA</span>' : `<span class="card-model-pill">${gen.model_name || 'AI 4K'}</span>`}

          <div class="card-hover-actions">
            <button class="card-mini-btn btn-act-load" title="Učitaj i postavi kao aktivno" data-action="load">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>Aktiviraj</span>
            </button>
            <button class="card-mini-btn btn-act-compare" title="Usporedi ovu verziju s Originalom (Split A/B)" data-action="compare">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <rect x="2" y="3" width="20" height="18" rx="2"></rect>
                <line x1="12" y1="3" x2="12" y2="21"></line>
              </svg>
              <span>Usporedi</span>
            </button>
            <button class="card-mini-btn btn-act-download" title="Preuzmi ovu verziju u punoj rezoluciji" data-action="download">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Preuzmi</span>
            </button>
          </div>
        </div>

        <div class="card-info-footer">
          <div class="card-info-title" title="${gen.model_name || 'AI Cleaned'}">${isOrig ? 'Izvorni Master' : (gen.model_name || 'AI Cleaned')}</div>
          <div class="card-info-meta">
            <span class="meta-res">${gen.resolution ? gen.resolution.split(' ')[0] : '2048'} px</span>
            ${!isOrig && costBadge ? `<span class="meta-cost" style="color:var(--accent-green-bright); font-weight:800;">${costBadge}</span>` : ''}
          </div>
        </div>
      `;

      // Click card to activate
      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-action='compare']")) {
          e.stopPropagation();
          this.triggerDirectCompare(gen);
          return;
        }
        if (e.target.closest("[data-action='download']")) {
          e.stopPropagation();
          const fileUrl = gen.url || (gen.filepath ? `/api/image-serve?path=${encodeURIComponent(gen.filepath)}` : '');
          if (fileUrl) {
            const filename = (gen.filename || `${this.app.currentDesign?.slug || 'design'}_${gen.version_label || 'version'}.png`).replace(/\s+/g, "_");
            this.app.downloadFile(fileUrl, filename);
            this.app.feedback.showToast(`✅ Preuzimanje ${gen.version_label || 'verzije'} započeto!`, "success", 2500);
          }
          return;
        }
        this.selectGeneration(gen);
      });

      this.trackEl.appendChild(card);
    });

    // Add "Nova Generacija" (+) Card at end
    const newCard = document.createElement("div");
    newCard.className = "filmstrip-card card-new-action";
    newCard.innerHTML = `
      <div class="card-new-inner" title="Pokreni novu AI izolaciju / upscale s prilagođenim promptom">
        <div class="new-plus-circle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
        <span class="new-text">NOVA AI VERZIJA</span>
        <span class="new-sub">4K · Nano Banana</span>
      </div>
    `;
    newCard.addEventListener("click", () => {
      this.app.canvasController.goToStep(2, "ai_cleaned");
      const textarea = document.getElementById("promptInput");
      if (textarea) {
        textarea.focus();
        textarea.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    this.trackEl.appendChild(newCard);
  }

  renderStep2History() {
    if (!this.step2HistoryContainer) return;
    this.step2HistoryContainer.innerHTML = "";

    if (this.generations.length <= 1) {
      this.step2HistoryContainer.innerHTML = `
        <div style="padding:14px; text-align:center; color:var(--text-muted); font-size:0.72rem; background:var(--bg-card); border-radius:var(--radius-xs); border:1.5px dashed var(--border-dark);">
          <span>Trenutno je u bazi samo <strong>Izvorni Master</strong>. Pokrenite Nano Banana Pro ili GPT iznad kako biste stvorili i sačuvali novu AI verziju.</span>
        </div>
      `;
      return;
    }

    this.generations.forEach((gen, idx) => {
      const itemEl = document.createElement("div");
      const isOrig = gen.is_original === true;
      const isActive = gen.id === this.activeGenerationId || (!this.activeGenerationId && isOrig);
      const isFav = Boolean(gen.is_favorite);

      let versionTag = isOrig ? "BASE" : (gen.version_label || `v${idx || 1}`);
      if (typeof versionTag === "string" && versionTag.startsWith("GEN #")) {
        versionTag = "v" + parseInt(versionTag.replace("GEN #", ""), 10);
      }

      let modelTitle = isOrig ? "Izvorni Master" : (gen.model_name || "AI Cleaned");
      modelTitle = modelTitle
        .replace(/\(Google Gemini.*?\)/gi, "")
        .replace(/\(OpenAI.*?\)/gi, "")
        .replace(/\(4K\)/gi, "")
        .replace(/\(2K\)/gi, "")
        .trim();

      itemEl.className = `history-item-row ${isActive ? "active" : ""} ${isOrig ? "item-orig" : "item-ai"}`;
      itemEl.dataset.genId = gen.id;
      const imgSrc = gen.url || (gen.filepath ? `/api/image-serve?path=${encodeURIComponent(gen.filepath)}` : "");
      const costBadge = gen.cost_estimate ? `~$${gen.cost_estimate.toFixed(2)}` : "";

      let resPill = "Master";
      if (!isOrig) {
        if (gen.resolution && gen.resolution.includes("4K")) resPill = "4K";
        else if (gen.resolution && gen.resolution.includes("2K")) resPill = "2K";
        else if (gen.width >= 3000 || gen.height >= 3000) resPill = "4K";
        else resPill = "2K";
      }

      const dimStr = (gen.width && gen.height) ? `${gen.width}×${gen.height} px` : (gen.resolution ? gen.resolution.split(" ")[0] + " px" : "2048 px");

      itemEl.innerHTML = `
        <div class="history-main-body">
          <div class="history-thumb-wrap" title="Klikni za pregled verzije">
            <img src="${imgSrc}" class="history-thumb-img" alt="${versionTag}">
            <span class="history-badge-num ${isOrig ? 'badge-orig' : 'badge-ai'}">${versionTag}</span>
          </div>

          <div class="history-details-col">
            <div class="history-header-line">
              <strong class="history-model-name" title="${gen.model_name || 'AI Cleaned'}" style="color:${isOrig ? 'var(--accent-gold-bright)' : 'var(--text-primary)'};">${modelTitle}</strong>
              <div class="history-badges-wrap">
                ${costBadge ? `<span class="history-micro-pill pill-cost">${costBadge}</span>` : ""}
                <span class="history-micro-pill ${isOrig ? 'pill-orig' : 'pill-format'}">${resPill}</span>
              </div>
            </div>

            <div class="history-specs-line">
              <span>${dimStr}</span>
              ${gen.duration ? `<span class="spec-dot">·</span><span>${gen.duration}s</span>` : ""}
              ${gen.full_screen ? `<span class="spec-dot">·</span><span class="spec-highlight">Full-Screen</span>` : ""}
              ${isFav ? `<span class="spec-dot">·</span><span class="spec-fav">★ Favorit</span>` : ""}
            </div>
          </div>
        </div>

        <div class="history-actions-row">
          <button class="btn-history-activate ${isActive ? 'is-active' : ''}" data-action="load" title="${isActive ? 'Ova verzija je trenutno aktivna na platnu' : 'Postavi kao aktivnu verziju'}">
            ${isActive 
              ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Trenutno Aktivno</span>`
              : `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg><span>Aktiviraj</span>`
            }
          </button>

          <div class="history-icon-tools">
            <button class="btn-micro-icon" data-action="compare" title="Usporedi ovu verziju s Originalom (Split A/B)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <rect x="2" y="3" width="20" height="18" rx="2"></rect>
                <line x1="12" y1="3" x2="12" y2="21"></line>
              </svg>
            </button>

            <button class="btn-micro-icon" data-action="download" title="Preuzmi ovu verziju u punoj rezoluciji (.png)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
            
            ${gen.prompt_used ? `
              <button class="btn-micro-icon" data-action="copy-prompt" title="Kopiraj korišteni prompt u međuspremnik">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            ` : ""}

            <button class="btn-micro-icon ${isFav ? 'is-fav' : ''}" data-action="fav" title="${isFav ? 'Ukloni iz favorita' : 'Označi kao favorit'}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            </button>

            ${!isOrig ? `
              <button class="btn-micro-icon btn-micro-danger" data-action="delete" title="Ukloni / arhiviraj ovu verziju">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            ` : ""}
          </div>
        </div>
      `;

      itemEl.querySelector("[data-action='load']").addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectGeneration(gen);
      });
      itemEl.querySelector(".history-thumb-wrap").addEventListener("click", () => {
        this.selectGeneration(gen);
      });
      itemEl.querySelector("[data-action='compare']").addEventListener("click", (e) => {
        e.stopPropagation();
        this.triggerDirectCompare(gen);
      });
      itemEl.querySelector("[data-action='download']").addEventListener("click", (e) => {
        e.stopPropagation();
        const fileUrl = gen.url || (gen.filepath ? `/api/image-serve?path=${encodeURIComponent(gen.filepath)}` : '');
        if (fileUrl) {
          const filename = (gen.filename || `${this.app.currentDesign?.slug || 'design'}_${gen.version_label || 'version'}.png`).replace(/\s+/g, "_");
          this.app.downloadFile(fileUrl, filename);
          this.app.feedback.showToast(`✅ Preuzimanje ${gen.version_label || 'verzije'} započeto!`, "success", 2500);
        } else {
          this.app.feedback.showToast("Datoteka nije dostupna za preuzimanje.", "error");
        }
      });
      const promptBtn = itemEl.querySelector("[data-action='copy-prompt']");
      if (promptBtn) {
        promptBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (gen.prompt_used) {
            navigator.clipboard.writeText(gen.prompt_used);
            this.app.feedback.showToast("📋 Prompt kopiran u međuspremnik!", "success", 2000);
            const textarea = document.getElementById("promptInput");
            if (textarea) textarea.value = gen.prompt_used;
          }
        });
      }
      itemEl.querySelector("[data-action='fav']").addEventListener("click", async (e) => {
        e.stopPropagation();
        await this.toggleFavorite(gen.id);
      });
      const delBtn = itemEl.querySelector("[data-action='delete']");
      if (delBtn) {
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.deleteGeneration(gen.id);
        });
      }

      this.step2HistoryContainer.appendChild(itemEl);
    });
  }

  async selectGeneration(gen, targetStep = null) {
    if (!gen) return;
    this.activeGenerationId = gen.id;
    await this.app.setActiveImage(gen, targetStep);
    this.updateActiveCardHighlights();
    this.updateHeaderBadges();
    const name = gen.is_original ? "Izvorni Master" : (gen.version_label || gen.model_name || "AI Verzija");
    this.app.feedback.showToast(`✨ Aktivirano: ${name}`, "success", 1500);
  }

  updateActiveCardHighlights() {
    if (this.trackEl) {
      this.trackEl.querySelectorAll(".filmstrip-card").forEach(c => {
        const id = c.dataset.genId;
        c.classList.toggle("active", id === this.activeGenerationId);
      });
    }
    if (this.step2HistoryContainer) {
      this.step2HistoryContainer.querySelectorAll(".history-item-row").forEach(r => {
        const id = r.dataset.genId;
        const isActive = (id === this.activeGenerationId) || (!this.activeGenerationId && r.classList.contains("item-orig"));
        r.classList.toggle("active", isActive);

        const actBtn = r.querySelector(".btn-history-activate");
        if (actBtn) {
          actBtn.classList.toggle("is-active", isActive);
          actBtn.title = isActive ? "Ova verzija je trenutno aktivna na platnu" : "Postavi kao aktivnu verziju";
          actBtn.innerHTML = isActive
            ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Trenutno Aktivno</span>`
            : `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg><span>Aktiviraj</span>`;
        }
      });
    }
  }

  triggerDirectCompare(gen) {
    const orig = this.generations.find(g => g.is_original) || this.generations[0];
    if (!orig) return;

    this.compareTargetId = gen.id;
    const beforeUrl = orig.url || (orig.filepath ? `/api/image-serve?path=${encodeURIComponent(orig.filepath)}` : '');
    const afterUrl = gen.url || (gen.filepath ? `/api/image-serve?path=${encodeURIComponent(gen.filepath)}` : '');

    this.app.canvasController.openDirectComparison(beforeUrl, afterUrl, orig.version_label || 'Original', gen.version_label || 'AI Verzija');
    this.app.canvasController.goToStep(5, "split_compare");
    this.app.feedback.showToast(`⚖️ Usporedba: ${orig.badge_title} vs ${gen.version_label}`, "info", 3000);
  }

  toggleQuickCompare() {
    const orig = this.generations.find(g => g.is_original) || this.generations[0];
    const currentAI = this.generations.find(g => g.id === this.activeGenerationId && !g.is_original) || this.generations[this.generations.length - 1];

    if (!currentAI || currentAI.is_original) {
      this.app.feedback.showToast("Pokrenite barem jednu AI generaciju za usporedbu s originalom.", "warning", 3000);
      return;
    }

    this.triggerDirectCompare(currentAI);
  }

  async toggleFavorite(genId) {
    try {
      const res = await fetch(`/api/generations/${encodeURIComponent(genId)}/favorite`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        const gen = this.generations.find(g => g.id === genId);
        if (gen) gen.is_favorite = data.is_favorite;
        this.renderFilmstrip();
        this.renderStep2History();
        this.app.feedback.showToast(data.is_favorite ? "★ Označeno kao favorit!" : "Uklonjeno iz favorita", "info", 1500);
      }
    } catch (e) {}
  }

  async deleteGeneration(genId) {
    if (!confirm("Želite li arhivirati ovu AI verziju? (Datoteka ostaje sigurna u arhivi na disku)")) return;

    try {
      const res = await fetch(`/api/generations/${encodeURIComponent(genId)}`, {
        method: "DELETE"
      });
      if (res.ok) {
        this.app.feedback.showToast("Verzija arhivirana iz baze.", "info", 2000);
        await this.loadGenerationsForCurrentDesign();
        if (this.activeGenerationId === genId) {
          const fallback = this.generations[0];
          if (fallback) this.selectGeneration(fallback);
        }
      }
    } catch (err) {
      console.error("[GenerationsController] Error deleting generation:", err);
      this.app.feedback.showToast("Greška pri uklanjanju generacije.", "error");
    }
  }

  addGeneratedResult(genEntry) {
    if (!genEntry) return;
    const exists = this.generations.find(g => g.id === genEntry.id);
    if (!exists) {
      if (!genEntry.version_label) {
        const nextIdx = this.generations.length;
        genEntry.version_label = `v${nextIdx}`;
        genEntry.badge_title = `VERZIJA #${nextIdx}`;
      }
      this.generations.push(genEntry);
    }
    this.activeGenerationId = genEntry.id;
    this.renderFilmstrip();
    this.renderStep2History();
    this.updateHeaderBadges();
    this.updateActiveCardHighlights();
  }
}
