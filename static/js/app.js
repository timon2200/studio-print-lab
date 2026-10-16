/**
 * Studio Varaždin — Print Studio & Vector Lab Master Application
 * Exact design and filter alignment with Swiper Kustoski Panel (admin.html)
 * Unified Per-Image Project State & Pipeline Management
 */

import { FeedbackManager } from "./feedback.js?v=3.0.0";
import { PromptController } from "./prompt.js?v=3.0.0";
import { DTFControls } from "./dtf_controls.js?v=3.0.0";
import { LayerControls } from "./layer_controls.js?v=3.0.0";
import { VectorControls } from "./vector_controls.js?v=3.0.0";
import { CanvasController } from "./canvas.js?v=3.0.0";
import { GenerationsController } from "./generations.js?v=3.0.0";
import { initAllBrutalistSelects } from "./custom-select.js?v=3.0.0";

class PrintStudioApp {
  constructor() {
    this.currentView = "catalog"; // catalog | editor
    this.masterCatalog = [];
    this.currentDesign = null;
    this.currentIndex = 0;
    
    // Unified Active Image Project State
    this.activeImage = null;
    this.activeGenerationId = null;
    this._saveStateTimeout = null;
    
    // Filter & Sort State (Identical to Swiper Kustoski Panel)
    this.activeCategory = "ALL";
    this.voteFilter = "all"; // 'all' | 'voted' | 'top20' | 'top30' | 'top50' | 'pointsGt0' | 'unvoted'
    this.sortOption = "score-desc";
    this.searchQuery = "";

    // Legacy / shortcut getters pointing to active image state
    this.aiCleanedData = null;
    this.dtfData = null;
    this.vectorData = null;
    this.mockupUrl = null;

    this.feedback = new FeedbackManager();
    this.initElements();
    this.initControllers();
    this.initBrutalistDropdowns();
    this.bindEvents();
    this.initGrain();
    this.loadCatalogAndStats();
  }

  initBrutalistDropdowns() {
    initAllBrutalistSelects(document);
  }

  initElements() {
    // Views & Nav
    this.viewCatalog = document.getElementById("viewCatalog");
    this.viewEditor = document.getElementById("viewEditor");
    this.btnNavCatalog = document.getElementById("btnNavCatalog");
    this.btnNavEditor = document.getElementById("btnNavEditor");

    // Telemetry & Grid
    this.telemetryVoteCount = document.getElementById("telemetryVoteCount");
    this.gridEl = document.getElementById("galleryGrid");

    // Category Nav & Filters
    this.categoryNav = document.getElementById("categoryNav");
    this.adminVoteFilterGroup = document.getElementById("adminVoteFilterGroup");
    this.adminSortSelect = document.getElementById("adminSortSelect");

    // Search Box & Clear
    this.searchInput = document.getElementById("searchInput");
    this.searchClear = document.getElementById("searchClear");

    // Quick Pick Action Buttons
    this.btnTop20 = document.getElementById("btnTop20");
    this.btnTop30 = document.getElementById("btnTop30");
    this.btnTop50 = document.getElementById("btnTop50");
    this.btnPointsGt0 = document.getElementById("btnPointsGt0");
    this.btnResetFilters = document.getElementById("btnResetFilters");

    // Editor Header & Quick Nav
    this.editorDesignTitle = document.getElementById("editorDesignTitle");
    this.editorCategoryBadge = document.getElementById("editorCategoryBadge");
    this.editorRankBadge = document.getElementById("editorRankBadge");
    this.editorResBadge = document.getElementById("editorResBadge");
    this.curTitleBadge = document.getElementById("curTitleBadge");
    this.btnPrevDesign = document.getElementById("btnPrevDesign");
    this.btnNextDesign = document.getElementById("btnNextDesign");

    // File Upload
    this.fileUploadInput = document.getElementById("fileUploadInput");
    this.btnUploadHeader = document.getElementById("btnUploadHeader");

    // Export Buttons
    this.btnExportDTF = document.getElementById("btnExportDTF");
    this.btnExportPSD = document.getElementById("btnExportPSD");
    this.btnExportLayersZip = document.getElementById("btnExportLayersZip");
    this.btnExportSVG = document.getElementById("btnExportSVG");
    this.btnExportMockup = document.getElementById("btnExportMockup");
    this.btnExportZip = document.getElementById("btnExportZip");
  }

  initControllers() {
    this.promptController = new PromptController(this);
    this.dtfControls = new DTFControls(this);
    this.layerControls = new LayerControls(this);
    this.vectorControls = new VectorControls(this);
    this.canvasController = new CanvasController(this);
    this.generationsController = new GenerationsController(this);
  }

  bindEvents() {
    // View Switchers
    if (this.btnNavCatalog) {
      this.btnNavCatalog.addEventListener("click", () => this.switchView("catalog"));
    }
    if (this.btnNavEditor) {
      this.btnNavEditor.addEventListener("click", () => {
        if (!this.currentDesign && this.masterCatalog.length > 0) {
          this.openDesignInEditor(this.masterCatalog[0].id);
        } else {
          this.switchView("editor");
        }
      });
    }

    // Category Filter Pills
    if (this.categoryNav) {
      this.categoryNav.querySelectorAll(".cat-pill").forEach(btn => {
        btn.addEventListener("click", () => {
          const cat = btn.dataset.cat;
          this.activeCategory = cat;
          this.categoryNav.querySelectorAll(".cat-pill").forEach(p => p.classList.remove("active"));
          btn.classList.add("active");
          this.renderCatalogGrid();
        });
      });
    }

    // Vote Filter Pills
    if (this.adminVoteFilterGroup) {
      this.adminVoteFilterGroup.querySelectorAll(".vote-pill").forEach(btn => {
        btn.addEventListener("click", () => {
          const vf = btn.dataset.votefilter;
          this.voteFilter = vf;
          this.adminVoteFilterGroup.querySelectorAll(".vote-pill").forEach(p => p.classList.remove("active"));
          btn.classList.add("active");
          this.renderCatalogGrid();
        });
      });
    }

    // Sort Dropdown
    if (this.adminSortSelect) {
      this.adminSortSelect.addEventListener("change", (e) => {
        this.sortOption = e.target.value;
        this.renderCatalogGrid();
      });
    }

    // Search Input & Clear
    if (this.searchInput) {
      this.searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value;
        if (this.searchClear) {
          this.searchClear.style.display = this.searchQuery ? "block" : "none";
        }
        this.renderCatalogGrid();
      });
    }
    if (this.searchClear) {
      this.searchClear.addEventListener("click", () => {
        this.searchQuery = "";
        if (this.searchInput) this.searchInput.value = "";
        this.searchClear.style.display = "none";
        this.renderCatalogGrid();
      });
    }

    // Quick Pick Buttons
    if (this.btnTop20) {
      this.btnTop20.addEventListener("click", () => {
        this.voteFilter = "top20";
        this.sortOption = "score-desc";
        if (this.adminSortSelect) this.adminSortSelect.value = "score-desc";
        this.updateVoteFilterPills();
        this.renderCatalogGrid();
      });
    }
    if (this.btnTop30) {
      this.btnTop30.addEventListener("click", () => {
        this.voteFilter = "top30";
        this.sortOption = "score-desc";
        if (this.adminSortSelect) this.adminSortSelect.value = "score-desc";
        this.updateVoteFilterPills();
        this.renderCatalogGrid();
      });
    }
    if (this.btnTop50) {
      this.btnTop50.addEventListener("click", () => {
        this.voteFilter = "top50";
        this.sortOption = "score-desc";
        if (this.adminSortSelect) this.adminSortSelect.value = "score-desc";
        this.updateVoteFilterPills();
        this.renderCatalogGrid();
      });
    }
    if (this.btnPointsGt0) {
      this.btnPointsGt0.addEventListener("click", () => {
        this.voteFilter = "pointsGt0";
        this.sortOption = "score-desc";
        if (this.adminSortSelect) this.adminSortSelect.value = "score-desc";
        this.updateVoteFilterPills();
        this.renderCatalogGrid();
      });
    }
    if (this.btnResetFilters) {
      this.btnResetFilters.addEventListener("click", () => {
        this.activeCategory = "ALL";
        this.voteFilter = "all";
        this.sortOption = "score-desc";
        this.searchQuery = "";
        if (this.searchInput) this.searchInput.value = "";
        if (this.searchClear) this.searchClear.style.display = "none";
        if (this.adminSortSelect) this.adminSortSelect.value = "score-desc";
        if (this.categoryNav) {
          this.categoryNav.querySelectorAll(".cat-pill").forEach(p => {
            p.classList.toggle("active", p.dataset.cat === "ALL");
          });
        }
        this.updateVoteFilterPills();
        this.renderCatalogGrid();
      });
    }

    // Design Nav inside Editor
    if (this.btnPrevDesign) {
      this.btnPrevDesign.addEventListener("click", () => this.navigateDesign(-1));
    }
    if (this.btnNextDesign) {
      this.btnNextDesign.addEventListener("click", () => this.navigateDesign(1));
    }

    // Upload
    if (this.btnUploadHeader && this.fileUploadInput) {
      this.btnUploadHeader.addEventListener("click", () => this.fileUploadInput.click());
      this.fileUploadInput.addEventListener("change", (e) => this.handleFileUpload(e));
    }

    // Export Buttons
    if (this.btnExportDTF) {
      this.btnExportDTF.addEventListener("click", async () => {
        const liveCanvas = document.getElementById("liveDtfCanvas");
        const active = this.activeImage;
        
        this.feedback.showToast("Pripremam točan DTF Master u punoj rezoluciji...", "info", 2000);

        // Ensure fresh background sync with current active slider parameters
        if (this.dtfControls) {
          await this.dtfControls.runIsolation(false);
        }

        const dtfUrl = this.activeImage?.state?.dtf_result?.url || this.dtfData?.url;
        if (dtfUrl) {
          const filename = `${this.currentDesign?.slug || 'design'}_${this.activeImage?.version_label || 'DTF'}_Transparent_300DPI.png`.replace(/\s+/g, '_');
          this.downloadFile(dtfUrl, filename);
          this.feedback.showToast("✅ DTF Master PNG (300 DPI) uspješno preuzet!", "success", 3000);
        } else if (liveCanvas && this.dtfControls?.hasLiveRender) {
          // Direct high-res canvas export fallback
          liveCanvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const filename = `${this.currentDesign?.slug || 'design'}_${this.activeImage?.version_label || 'DTF'}_Transparent_Live.png`.replace(/\s+/g, '_');
              this.downloadFile(url, filename);
              this.feedback.showToast("✅ DTF Master preuzet izravno iz aktivnog prikaza!", "success", 3000);
            }
          }, "image/png");
        } else {
          this.feedback.showToast("Greška: nije moguće dohvatiti DTF transparentni sloj.", "error");
        }
      });
    }
    if (this.btnExportPSD) {
      this.btnExportPSD.addEventListener("click", () => {
        const psdUrl = this.activeImage?.state?.layer_result?.psd_url || this.activeImage?.state?.layer_psd_url;
        if (psdUrl) {
          const filename = `${this.currentDesign?.slug || 'design'}_${this.activeImage?.version_label || 'Master'}_Photoshop_Layers.psd`.replace(/\s+/g, '_');
          this.downloadFile(psdUrl, filename);
          this.feedback.showToast("✅ Preuzimanje višeslojnog Photoshop PSD Mastera započeto.", "success", 3000);
        } else {
          this.feedback.showToast("Prvo pokrenite Ming layer segmentaciju u Koraku 04.", "info", 2500);
        }
      });
    }
    if (this.btnExportLayersZip) {
      this.btnExportLayersZip.addEventListener("click", () => {
        const activeImgId = this.activeImage?.id;
        if (!activeImgId) return;
        const designTitle = this.currentDesign?.title || "Design";
        const zipUrl = `/api/layers/zip?image_id=${encodeURIComponent(activeImgId)}&design_title=${encodeURIComponent(designTitle)}`;
        const filename = `${this.currentDesign?.slug || 'design'}_PNG_Layers.zip`.replace(/\s+/g, '_');
        this.downloadFile(zipUrl, filename);
        this.feedback.showToast("📦 Preuzimanje paketa PNG slojeva (.zip) započeto.", "success", 3000);
      });
    }
    if (this.btnExportSVG) {
      this.btnExportSVG.addEventListener("click", async () => {
        if (this.vectorControls && this.canvasController?.svgContainer?.querySelector("svg")) {
          this.vectorControls.downloadLiveSvg();
          return;
        }
        let svgUrl = this.activeImage?.state?.vector_result?.svg_url || this.vectorData?.svg_url;
        if (!svgUrl) {
          this.feedback.showToast("Generiram vektorski SVG master...", "info", 2000);
          await this.vectorControls?.runVectorization(false);
          svgUrl = this.activeImage?.state?.vector_result?.svg_url || this.vectorData?.svg_url;
        }
        if (svgUrl) {
          const filename = `${this.currentDesign?.slug || 'design'}_${this.activeImage?.version_label || 'Vector'}_Master.svg`.replace(/\s+/g, '_');
          this.downloadFile(svgUrl, filename);
          this.feedback.showToast("✅ Preuzimanje Vektorskog SVG započeto.", "success", 3000);
        } else {
          this.feedback.showToast("Greška pri generiranju vektorskog SVG-a.", "error");
        }
      });
    }
    if (this.btnExportMockup) {
      this.btnExportMockup.addEventListener("click", async () => {
        this.feedback.showToast("Generiram mockup s transparentnim motivom...", "info", 2000);
        await this.canvasController.renderMockupMode();
        const mockupUrl = this.activeImage?.state?.mockup_url || this.mockupUrl;
        if (mockupUrl) {
          const filename = `${this.currentDesign?.slug || 'design'}_${this.activeImage?.version_label || 'Mockup'}_Apparel_Proof.png`.replace(/\s+/g, '_');
          this.downloadFile(mockupUrl, filename);
        }
      });
    }
    if (this.btnExportZip) {
      this.btnExportZip.addEventListener("click", () => this.downloadCompleteBundle());
    }

    // Step navigation footer buttons ("data-goto-step")
    document.querySelectorAll("[data-goto-step]").forEach(btn => {
      btn.addEventListener("click", () => {
        const targetStep = parseInt(btn.getAttribute("data-goto-step") || "1");
        this.canvasController.goToStep(targetStep);
      });
    });

    // Drag and Drop Upload onto Window
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length > 0) {
        this.uploadFileDirect(e.dataTransfer.files[0]);
      }
    });

    // Keyboard shortcuts
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (this.currentView === "editor") {
        if (["1", "2", "3", "4", "5", "6", "7"].includes(e.key)) {
          const step = parseInt(e.key);
          this.canvasController.goToStep(step);
        } else if (e.key === "ArrowLeft") {
          this.navigateDesign(-1);
        } else if (e.key === "ArrowRight") {
          this.navigateDesign(1);
        } else if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          this.canvasController.zoomBy(1.25, null, null, true);
        } else if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          this.canvasController.zoomBy(0.8, null, null, true);
        } else if (e.key === "0") {
          e.preventDefault();
          this.canvasController.zoom100(true);
        } else if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          this.canvasController.fitToScreen(true);
        }
      }
    });
  }

  updateVoteFilterPills() {
    if (!this.adminVoteFilterGroup) return;
    this.adminVoteFilterGroup.querySelectorAll(".vote-pill").forEach(p => {
      p.classList.toggle("active", p.dataset.votefilter === this.voteFilter);
    });
  }

  switchView(viewName) {
    this.currentView = viewName;
    if (viewName === "catalog") {
      this.viewCatalog.classList.add("active");
      this.viewEditor.classList.remove("active");
      this.btnNavCatalog.classList.add("active");
      this.btnNavEditor.classList.remove("active");
    } else {
      this.viewCatalog.classList.remove("active");
      this.viewEditor.classList.add("active");
      this.btnNavCatalog.classList.remove("active");
      this.btnNavEditor.classList.add("active");
      setTimeout(() => this.canvasController.fitToScreen(false), 50);
    }
  }

  async loadCatalogAndStats() {
    try {
      // 1. Fetch live telemetry stats
      const statsRes = await fetch("/api/stats");
      if (statsRes.ok) {
        const stats = await statsRes.json();
        if (this.telemetryVoteCount) {
          this.telemetryVoteCount.textContent = (stats.total_votes || 2254).toLocaleString("hr-HR");
        }
      }

      // 2. Fetch full catalog items for 0ms client-side filtering and sorting
      const catalogRes = await fetch("/api/catalog");
      if (catalogRes.ok) {
        this.masterCatalog = await catalogRes.json();
        this.updateCategoryBadges();
        this.renderCatalogGrid();

        // Preload the champion design by default so the editor is never blank
        if (!this.currentDesign && this.masterCatalog.length > 0) {
          this.setDesign(this.masterCatalog[0], false);
        }
      }
    } catch (err) {
      console.error("[PrintStudioApp] Error loading catalog and stats:", err);
      this.feedback.showToast("Greška pri učitavanju kataloga.", "error");
    }
  }

  updateCategoryBadges() {
    const counts = {
      ALL: this.masterCatalog.length,
      City: 0,
      Studio: 0,
      Creative: 0,
      Garda: 0,
      Towers: 0,
      Utility: 0,
      Artwear: 0,
      'Front Hits': 0,
      Experimental: 0,
      'Korisnički uvoz': 0
    };

    this.masterCatalog.forEach(item => {
      const cat = item.category;
      if (counts[cat] !== undefined) {
        counts[cat]++;
      }
    });

    const setBadge = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setBadge("badgeAll", counts.ALL);
    setBadge("badgeCity", counts.City);
    setBadge("badgeStudio", counts.Studio);
    setBadge("badgeCreative", counts.Creative);
    setBadge("badgeGarda", counts.Garda);
    setBadge("badgeTowers", counts.Towers);
    setBadge("badgeUtility", counts.Utility);
    setBadge("badgeArtwear", counts.Artwear);
    setBadge("badgeFrontHits", counts['Front Hits']);
    setBadge("badgeExperimental", counts.Experimental);
    setBadge("badgeUploads", counts['Korisnički uvoz']);

    const pillUploads = document.getElementById("pillUploads");
    if (pillUploads) {
      pillUploads.style.display = counts['Korisnički uvoz'] > 0 ? "inline-flex" : "none";
    }
  }

  getFilteredItems() {
    let items = [...this.masterCatalog];

    // 1. Category Filter
    if (this.activeCategory !== "ALL") {
      items = items.filter(item => (item.category || "").toUpperCase() === this.activeCategory.toUpperCase());
    }

    // 2. Vote Filter
    if (this.voteFilter === "voted") {
      items = items.filter(item => (item.totalVotes || 0) > 0);
    } else if (this.voteFilter === "unvoted") {
      items = items.filter(item => (item.totalVotes || 0) <= 0);
    } else if (this.voteFilter === "pointsGt0") {
      items = items.filter(item => (item.score || 0) > 0);
    }

    // 3. Search Query Filter
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase().trim();
      items = items.filter(item => {
        const titleMatch = (item.title || "").toLowerCase().includes(q);
        const catMatch = (item.category || "").toLowerCase().includes(q);
        const slugMatch = (item.slug || "").toLowerCase().includes(q);
        const tagMatch = item.tags && item.tags.some(t => t.toLowerCase().includes(q));
        return titleMatch || catMatch || slugMatch || tagMatch;
      });
    }

    // 4. Sorting
    if (this.sortOption === "score-desc" || this.voteFilter === "top20" || this.voteFilter === "top30" || this.voteFilter === "top50") {
      items.sort((a, b) => (b.score || 0) - (a.score || 0) || (b.bayesianMean || 0) - (a.bayesianMean || 0) || (b.approvalRate || 0) - (a.approvalRate || 0) || (b.totalVotes || 0) - (a.totalVotes || 0));
    } else if (this.sortOption === "likes-desc") {
      items.sort((a, b) => (b.likes || 0) - (a.likes || 0) || (b.score || 0) - (a.score || 0));
    } else if (this.sortOption === "super-desc") {
      items.sort((a, b) => (b.superlikes || 0) - (a.superlikes || 0) || (b.score || 0) - (a.score || 0));
    } else if (this.sortOption === "votes-desc") {
      items.sort((a, b) => (b.totalVotes || 0) - (a.totalVotes || 0) || (b.score || 0) - (a.score || 0));
    } else if (this.sortOption === "approval-desc") {
      items.sort((a, b) => (b.approvalRate || 0) - (a.approvalRate || 0) || (b.score || 0) - (a.score || 0));
    } else if (this.sortOption === "title-asc") {
      items.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }

    // 5. Slice for Top Quick Picks
    if (this.voteFilter === "top20") {
      items = items.slice(0, 20);
    } else if (this.voteFilter === "top30") {
      items = items.slice(0, 30);
    } else if (this.voteFilter === "top50") {
      items = items.slice(0, 50);
    }

    return items;
  }

  renderCatalogGrid() {
    if (!this.gridEl) return;
    this.gridEl.innerHTML = "";

    const filtered = this.getFilteredItems();

    if (filtered.length === 0) {
      this.gridEl.innerHTML = `
        <div style="grid-column: 1/-1; padding: 60px 24px; text-align: center; color: var(--text-muted); font-family: var(--font-mono); font-size: 0.9rem;">
          Nije pronađen nijedan dizajn za odabrane filtere.
        </div>
      `;
      return;
    }

    filtered.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "gallery-card";
      card.dataset.id = item.id;
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");

      const imgSrc = item.preview_path ? `/api/image-serve?path=${encodeURIComponent(item.preview_path)}` : "";
      const scoreVal = item.score || 0;
      const likesVal = item.likes || 0;
      const superVal = item.superlikes || 0;
      const passVal = item.passes || 0;
      const rankVal = item.rank || (index + 1);
      const isMaster = item.hires_path && !item.hires_path.endsWith(".webp");
      const filename = (item.hires_path || item.preview_path || "").split("/").pop() || `${item.slug}.png`;
      const resText = isMaster ? "1664 × 2048 px" : "WebP";

      card.innerHTML = `
        <div class="gallery-img-wrap" title="Klikni za otvaranje u Radionici (${filename})">
          <img src="${imgSrc}" class="gallery-img" alt="${item.title}" loading="${index < 12 ? 'eager' : 'lazy'}">
          <span class="card-category-tag">${(item.category || '').toUpperCase()}</span>
          
          <div class="card-rank-badge" title="Rang po bodovima">
            #${rankVal}
          </div>

          <div class="card-res-corner-badge" title="Naziv datoteke: ${filename} | Rezolucija: ${resText}">
            ${resText}
          </div>

          <div class="card-corner-actions">
            <button class="card-open-btn" type="button" title="Otvori u Radionici (${filename})" data-action="open">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>
          </div>
        </div>

        <div class="card-footer-info">
          <div class="card-title-text" title="${item.title} (${filename})">${item.title}</div>
          
          <div class="card-stats-line">
            <span class="card-points-pill">★ ${scoreVal} PTS</span>
            <div class="card-votes-stats">
              <span class="stat-val-likes" title="Lajkovi">♥ ${likesVal}</span>
              <span class="stat-val-super" title="Superlike">★ ${superVal}</span>
              <span class="stat-val-pass" title="Preskočeno">✕ ${passVal}</span>
            </div>
          </div>

          <div class="card-meta-bottom">
            <span class="card-id-tag">#${item.id}</span>
            <span class="card-open-action">OTVORI U RADIONICI →</span>
          </div>
        </div>
      `;

      card.addEventListener("click", () => {
        this.openDesignInEditor(item.id);
      });

      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.openDesignInEditor(item.id);
        }
      });

      this.gridEl.appendChild(card);
    });
  }

  async setDesign(item, shouldSwitchView = true) {
    this.currentDesign = item;
    this.currentIndex = this.masterCatalog.findIndex(x => x.id === item.id);
    if (this.currentIndex === -1) this.currentIndex = 0;

    // Update Header Metadata
    if (this.editorDesignTitle) this.editorDesignTitle.textContent = item.title;
    if (this.editorCategoryBadge) this.editorCategoryBadge.textContent = item.category;
    if (this.editorRankBadge) this.editorRankBadge.textContent = `#${item.rank || 1}`;
    if (this.curTitleBadge) this.curTitleBadge.textContent = `#${item.rank || 1} ${item.title}`;
    
    if (this.editorResBadge) {
      const isMaster = item.hires_path && !item.hires_path.endsWith(".webp");
      this.editorResBadge.textContent = isMaster ? "1664 × 2048 px · Master" : "WebP Optimizirano";
      this.editorResBadge.style.color = isMaster ? "var(--accent-gold-bright)" : "var(--text-secondary)";
    }

    if (shouldSwitchView) {
      this.switchView("editor");
      this.feedback.showToast(`🎨 Učitan dizajn #${item.rank || 1}: "${item.title}"`, "info", 2000);
    }

    this.promptController?.hideStatus();

    // Fetch persistent generations & states for this design
    try {
      const res = await fetch(`/api/generations/${encodeURIComponent(item.id)}`);
      if (res.ok) {
        const data = await res.json();
        const generations = data.generations || [];
        this.generationsController.generations = generations;

        // Pick active generation (prioritize saved active_generation_id, or latest AI generation, or original)
        let activeGen = null;
        if (data.active_generation_id) {
          activeGen = generations.find(g => g.id === data.active_generation_id);
        }
        if (!activeGen) {
          // If AI generations exist, default to the latest one; otherwise original
          activeGen = generations.length > 1 ? generations[generations.length - 1] : generations[0];
        }

        if (activeGen) {
          await this.setActiveImage(activeGen, false);
        }
        
        this.generationsController.renderFilmstrip();
        this.generationsController.renderStep2History();
        this.generationsController.updateHeaderBadges();
      }
    } catch (err) {
      console.error("[PrintStudioApp] Error loading generations:", err);
    }
  }

  /**
   * Sets the specified image / generation as the SINGLE ACTIVE PROJECT.
   * Restores its sliders, parameters, DTF live buffer, and outputs across all views.
   */
  async setActiveImage(imageItem, shouldSwitchStep = null) {
    if (!imageItem) return;
    this.activeImage = imageItem;
    this.activeGenerationId = imageItem.id;

    const state = imageItem.state || {};

    // Restore DTF controls state
    if (this.dtfControls) {
      this.dtfControls.restoreState(state);
    }

    // Restore Layer controls state
    if (this.layerControls) {
      this.layerControls.restoreState(state);
    }

    // Restore Vector controls state
    if (this.vectorControls) {
      this.vectorControls.restoreState(state);
    }

    // Restore Garment background
    const garmentCol = state.garment_color || "#171E19";
    if (this.canvasController) {
      this.canvasController.setGarmentColor(garmentCol);
    }

    // Restore prompt
    if (this.promptController && imageItem.prompt_used) {
      const promptInput = document.getElementById("promptInput");
      if (promptInput) promptInput.value = imageItem.prompt_used;
    }

    // Shortcut properties pointing to this active image
    this.aiCleanedData = imageItem.is_original ? null : {
      success: true,
      filename: imageItem.filename,
      filepath: imageItem.filepath,
      url: imageItem.url,
      width: imageItem.width,
      height: imageItem.height,
      resolution: imageItem.resolution,
      model: imageItem.model,
      duration: imageItem.duration,
      prompt_used: imageItem.prompt_used
    };
    this.dtfData = state.dtf_result || null;
    this.layerData = state.layer_result || (state.layer_psd_filepath || (state.layer_segments && state.layer_segments.length > 0) ? {
      psd_filepath: state.layer_psd_filepath,
      psd_url: state.layer_psd_url,
      preview_url: state.layer_preview_url,
      layers: state.layer_segments || [],
      layer_count: state.layer_count || (state.layer_segments ? state.layer_segments.length : 0),
      prompt_used: state.layer_prompt_used,
      source_mode: state.layer_source_mode
    } : null);
    this.vectorData = state.vector_result || null;
    this.mockupUrl = state.mockup_url || null;

    // Prepare 60 FPS live buffer from this active image's URL
    if (this.dtfControls) {
      await this.dtfControls.prepareSourceBuffer(imageItem.url);
      this.dtfControls.renderLiveNow();
    }

    // Update UI highlights and step view
    if (this.generationsController) {
      this.generationsController.updateActiveCardHighlights();
      this.generationsController.updateHeaderBadges();
    }

    if (shouldSwitchStep !== null) {
      this.canvasController.goToStep(shouldSwitchStep);
    } else {
      this.canvasController.refreshActiveView();
    }

    // Save design-level active pointer
    if (this.currentDesign) {
      try {
        fetch(`/api/design/${encodeURIComponent(this.currentDesign.id)}/state`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active_generation_id: imageItem.id, active_step: this.canvasController.currentStep })
        }).catch(() => {});
      } catch (e) {}
    }
  }

  /**
   * Saves all parameters for the currently active image project to SQLite.
   */
  async saveActiveImageState() {
    if (!this.activeImage || !this.currentDesign) return;

    const imgId = this.activeImage.id;
    const dId = this.currentDesign.id;

    const payload = {
      design_id: dId,
      dtf_threshold: parseFloat(document.getElementById("sliderDtfThreshold")?.value || 24),
      dtf_feather: parseFloat(document.getElementById("sliderDtfFeather")?.value || 1.5),
      dtf_choke: parseInt(document.getElementById("sliderDtfChoke")?.value || 1),
      dtf_defringe: parseFloat(document.getElementById("sliderDtfDefringe")?.value || 75),
      dtf_despeckle: parseInt(document.getElementById("sliderDtfDespeckle")?.value || 20),
      dtf_solid: parseFloat(document.getElementById("sliderDtfSolid")?.value || 1.4),
      dtf_protect_lines: document.getElementById("chkDtfProtectLines")?.checked ?? true,
      dtf_invert_ink: document.getElementById("chkDtfInvertInk")?.checked ?? false,
      dtf_method: document.getElementById("selectDtfMethod")?.value || "auto",
      dtf_custom_bg_hex: document.getElementById("dtfCustomHexInput")?.value || "#171E19",
      dtf_filepath: this.activeImage.state?.dtf_result?.filepath || this.dtfData?.filepath || "",
      dtf_url: this.activeImage.state?.dtf_result?.url || this.dtfData?.url || "",
      dtf_coverage_pct: this.activeImage.state?.dtf_result?.alpha_coverage_pct || this.dtfData?.alpha_coverage_pct || 0.0,
      dtf_halo_score: this.activeImage.state?.dtf_result?.zero_halo_score || this.dtfData?.zero_halo_score || 99.8,
      layer_psd_filepath: this.activeImage.state?.layer_psd_filepath || this.activeImage.state?.layer_result?.psd_filepath || this.layerData?.psd_filepath || "",
      layer_psd_url: this.activeImage.state?.layer_psd_url || this.activeImage.state?.layer_result?.psd_url || this.layerData?.psd_url || "",
      layer_preview_url: this.activeImage.state?.layer_preview_url || this.activeImage.state?.layer_result?.preview_url || this.layerData?.preview_url || "",
      layer_segments: (this.layerControls?.currentLayers && this.layerControls.currentLayers.length > 0)
        ? this.layerControls.currentLayers
        : (this.activeImage.state?.layer_segments || this.activeImage.state?.layer_result?.layers || this.layerData?.layers || []),
      layer_count: (this.layerControls?.currentLayers && this.layerControls.currentLayers.length > 0)
        ? this.layerControls.currentLayers.length
        : (this.activeImage.state?.layer_count || this.activeImage.state?.layer_result?.layer_count || this.layerData?.layer_count || 0),
      layer_prompt_used: this.activeImage.state?.layer_prompt_used || this.activeImage.state?.layer_result?.prompt_used || this.layerData?.prompt_used || "",
      layer_source_mode: this.activeImage.state?.layer_source_mode || this.layerControls?.activeSourceMode || "dtf",
      vector_engine: document.querySelector("input[name='vecEngine']:checked")?.value || "vtracer",
      vector_colors: parseInt(document.getElementById("sliderColors")?.value || 8),
      vector_corner: parseInt(document.getElementById("sliderCorner")?.value || 30),
      vector_smooth: parseFloat(document.getElementById("sliderSmooth")?.value || 2.5),
      vector_speckle: parseInt(document.getElementById("sliderSpeckle")?.value || 2),
      vector_dpi: parseInt(document.getElementById("selectDPI")?.value || 2048),
      vector_color_overrides: this.vectorControls?.colorOverrides || {},
      vector_layer_visibility: this.vectorControls?.layerVisibility || {},
      vector_layer_opacity: this.vectorControls?.layerOpacity || {},
      vector_deleted_layer_ids: this.vectorControls?.deletedLayerIds ? Array.from(this.vectorControls.deletedLayerIds) : [],
      vector_raw_layers: this.vectorControls?.rawVectorLayers || [],
      vector_svg_filepath: this.activeImage.state?.vector_result?.svg_filepath || this.vectorData?.svg_filepath || "",
      vector_svg_url: this.activeImage.state?.vector_result?.svg_url || this.vectorData?.svg_url || "",
      vector_preview_url: this.activeImage.state?.vector_result?.preview_url || this.vectorData?.preview_url || "",
      vector_layers: (this.vectorControls?.currentLayers && this.vectorControls.currentLayers.length > 0)
        ? this.vectorControls.currentLayers
        : (this.activeImage.state?.vector_result?.layers || this.vectorData?.layers || []),
      vector_total_paths: this.activeImage.state?.vector_result?.total_paths || this.vectorData?.total_paths || 0,
      garment_color: this.canvasController?.currentGarmentColor || "#171E19",
      garment_texture: document.getElementById("chkGarmentTexture")?.checked ?? false,
      mockup_url: this.activeImage.state?.mockup_url || this.mockupUrl || "",
      mockup_filepath: this.activeImage.state?.mockup_filepath || "",
      last_active_step: this.canvasController?.currentStep || 1
    };

    // Update in-memory state
    this.activeImage.state = Object.assign({}, this.activeImage.state, payload);

    try {
      await fetch(`/api/image/${encodeURIComponent(imgId)}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (e) {}
  }

  triggerDebouncedStateSave() {
    clearTimeout(this._saveStateTimeout);
    this._saveStateTimeout = setTimeout(() => this.saveActiveImageState(), 500);
  }

  openDesignInEditor(itemId) {
    const item = this.masterCatalog.find(x => x.id === itemId);
    if (!item) return;
    this.setDesign(item, true);
  }

  navigateDesign(delta) {
    if (this.masterCatalog.length === 0) return;
    let nextIdx = (this.currentIndex + delta) % this.masterCatalog.length;
    if (nextIdx < 0) nextIdx = this.masterCatalog.length - 1;
    this.openDesignInEditor(this.masterCatalog[nextIdx].id);
  }

  async handleFileUpload(e) {
    const file = e.target.files[0];
    if (file) {
      await this.uploadFileDirect(file);
    }
  }

  async uploadFileDirect(file) {
    this.feedback.showToast(`Učitavam datoteku: ${file.name}...`, "info");
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            data_url: e.target.result
          })
        });
        const data = await res.json();
        if (data.success) {
          this.feedback.showToast(`✅ Slika "${file.name}" uspješno uvezena u radionicu!`, "success");
          await this.loadCatalogAndStats();
          const uploadedItem = this.masterCatalog.find(x => x.preview_path === data.filepath);
          if (uploadedItem) {
            this.openDesignInEditor(uploadedItem.id);
          }
        } else {
          this.feedback.showToast(`❌ Greška uvoza: ${data.error}`, "error");
        }
      } catch (err) {
        console.error("[PrintStudioApp] Upload failed:", err);
        this.feedback.showToast(`❌ Mrežna greška uvoza: ${err.message}`, "error");
      }
    };
    reader.readAsDataURL(file);
  }

  setAICleanedResult(data) {
    if (data.generation_entry) {
      if (this.generationsController) {
        this.generationsController.addGeneratedResult(data.generation_entry);
      }
      this.setActiveImage(data.generation_entry, 2);
    }
    if (this.editorResBadge && data.resolution) {
      this.editorResBadge.textContent = data.resolution;
    }
  }

  setDTFResult(data) {
    this.dtfData = data;
    if (this.activeImage) {
      this.activeImage.state = this.activeImage.state || {};
      this.activeImage.state.dtf_result = data;
      this.saveActiveImageState();
    }
    if (this.canvasController.currentViewMode === "dtf_alpha") {
      this.canvasController.refreshActiveView();
    }
    this.canvasController.updateTelemetryHUD({
      filename: data.filename || "DTF_Alpha_Transparent.png",
      width: data.width,
      height: data.height,
      typeTag: "DTF ALPHA (ZERO-HALO)",
      rawInfo: "Transparent Underbase"
    });
    // Background refresh vector data using tuned DTF Alpha
    if (document.getElementById("chkAutoUpdate")?.checked) {
      this.vectorControls.triggerDebouncedVectorize();
    }
  }

  setLayerResult(data) {
    this.layerData = data;
    if (this.activeImage) {
      this.activeImage.state = this.activeImage.state || {};
      this.activeImage.state.layer_result = data;
      this.saveActiveImageState();
    }
    if (this.canvasController.currentViewMode === "layer_psd") {
      this.canvasController.refreshActiveView();
    }
    this.canvasController.updateTelemetryHUD({
      filename: data.psd_url ? data.psd_url.split("/").pop() : "Master.psd",
      typeTag: "MING SLOJEVI (PSD)",
      rawInfo: `${data.layer_count || (data.segments ? data.segments.length : 0)} RGBA Slojeva`
    });
  }

  setVectorResult(data) {
    this.vectorData = data;
    if (this.activeImage) {
      this.activeImage.state = this.activeImage.state || {};
      this.activeImage.state.vector_result = data;
      this.saveActiveImageState();
    }
    if (this.canvasController.currentViewMode === "vector_svg") {
      this.canvasController.refreshActiveView();
    }
    this.canvasController.updateTelemetryHUD({
      filename: data.svg_url ? data.svg_url.split("/").pop() : "Vector.svg",
      typeTag: "BÉZIER VEKTOR (SVG)",
      rawInfo: `${data.layer_count || 8} Vektorskih slojeva`
    });
  }

  downloadFile(url, filename) {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async downloadCompleteBundle() {
    if (!this.currentDesign || !this.activeImage) return;
    this.feedback.showToast("Pripremam i pakiram cjeloviti tisak paket (.zip)...", "info", 3000);
    
    // Ensure DTF Master is rendered
    if (!this.activeImage.state?.dtf_result?.filepath && this.dtfControls) {
      await this.dtfControls.runIsolation(false);
    }

    // Ensure Mockup is rendered
    if (!this.activeImage.state?.mockup_filepath && this.canvasController) {
      await this.canvasController.renderMockupMode();
    }

    const payload = {
      design_title: `${this.currentDesign.title} - ${this.activeImage.version_label}`,
      dtf_path: this.activeImage.state?.dtf_result?.filepath || this.dtfData?.filepath || null,
      psd_path: this.activeImage.state?.layer_result?.psd_filepath || this.layerData?.psd_filepath || null,
      svg_path: this.activeImage.state?.vector_result?.svg_filepath || this.vectorData?.svg_filepath || null,
      mockup_path: this.activeImage.state?.mockup_filepath || null
    };

    try {
      const res = await fetch("/api/export-bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      this.downloadFile(url, `${this.currentDesign.slug}_${this.activeImage.version_label}_Studio_Varazdin_Package.zip`);
      this.feedback.showToast("✅ Tisak paket uspješno preuzet!", "success", 4000);
    } catch (err) {
      console.error("[PrintStudioApp] Export bundle error:", err);
      this.feedback.showToast(`❌ Greška preuzimanja paketa: ${err.message}`, "error");
    }
  }

  initGrain() {
    const canvas = document.getElementById("grainCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    window.addEventListener("resize", () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    function generateNoise() {
      const imgData = ctx.createImageData(width, height);
      const buffer = new Uint32Array(imgData.data.buffer);
      for (let i = 0; i < buffer.length; i++) {
        if (Math.random() < 0.08) {
          buffer[i] = 0x15ffffff;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }
    generateNoise();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.app = new PrintStudioApp();
});
