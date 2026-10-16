/**
 * Studio Varaždin — Prompt Engine & AI Isolation Controller
 * Supports Nano Banana Pro (2K & 4K), Nano Banana 2, GPT Image 2.5 Flare, Full-Screen Framing & Tight-Crop
 */

export class PromptController {
  constructor(app) {
    this.app = app;
    this.fullScreenPrompt = "";
    this.universalPrompt = "";
    this.presets = [];
    this.engines = [];
    this.hasOpenRouterKey = false;
    this.hasOpenAIKey = false;
    this.defaultModel = "nano-banana-pro";
    
    // UI Elements
    this.textarea = document.getElementById("promptInput");
    this.presetContainer = document.getElementById("presetChips");
    this.btnRunAI = document.getElementById("btnRunAI");
    this.btnRunLocal = document.getElementById("btnRunLocal");
    this.statusBanner = document.getElementById("aiStatusBanner");
    this.modelSelect = document.getElementById("modelSelect");
    this.resolutionSelect = document.getElementById("resolutionSelect");
    this.chkFullScreen = document.getElementById("chkFullScreen");
    this.chkTightCrop = document.getElementById("chkTightCrop");
    this.aiEngineBadge = document.getElementById("aiEngineBadge");
    this.resDescBadge = document.getElementById("resDescBadge");

    this.init();
  }

  async init() {
    try {
      const res = await fetch("/api/prompts/presets");
      const data = await res.json();
      this.fullScreenPrompt = data.full_screen_prompt || "";
      this.universalPrompt = data.universal_prompt || "";
      this.presets = data.presets || [];
      this.engines = data.engines || [];
      this.hasOpenRouterKey = data.has_openrouter_key;
      this.hasOpenAIKey = data.has_openai_key;
      this.defaultModel = data.default_model || "nano-banana-pro";

      if (this.textarea) {
        this.textarea.value = this.fullScreenPrompt || this.universalPrompt;
      }
      this.renderPresets();
      this.bindEvents();
      this.updateButtonLabel();
    } catch (err) {
      console.error("[PromptController] Failed to load prompt presets:", err);
      if (this.app.feedback) {
        this.app.feedback.showToast("Greška pri učitavanju AI modela i predložaka prompta.", "error");
      }
    }
  }

  renderPresets() {
    if (!this.presetContainer) return;
    this.presetContainer.innerHTML = "";
    this.presets.forEach((p, idx) => {
      const btn = document.createElement("button");
      btn.className = `chip-btn ${idx === 0 ? "active" : ""}`;
      btn.textContent = p.title;
      btn.title = p.description;
      btn.addEventListener("click", () => {
        if (this.textarea) {
          this.textarea.value = p.prompt;
        }
        document.querySelectorAll(".chip-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        if (p.id.includes("full_screen") || p.id.includes("tight_crop")) {
          if (this.chkFullScreen) this.chkFullScreen.checked = true;
          if (this.chkTightCrop) this.chkTightCrop.checked = true;
        }

        this.updateButtonLabel();
        if (this.app.feedback) {
          this.app.feedback.showToast(`Postavljen predložak: "${p.title}"`, "info", 2000);
        }
      });
      this.presetContainer.appendChild(btn);
    });
  }

  bindEvents() {
    if (this.btnRunAI) {
      this.btnRunAI.addEventListener("click", () => this.runAIIsolation());
    }
    if (this.btnRunLocal) {
      this.btnRunLocal.addEventListener("click", () => this.runLocalIsolation());
    }

    if (this.modelSelect) {
      this.modelSelect.addEventListener("change", () => this.updateButtonLabel());
    }
    if (this.resolutionSelect) {
      this.resolutionSelect.addEventListener("change", () => this.updateButtonLabel());
    }
    if (this.chkFullScreen) {
      this.chkFullScreen.addEventListener("change", () => this.updateButtonLabel());
    }
    if (this.chkTightCrop) {
      this.chkTightCrop.addEventListener("change", () => this.updateButtonLabel());
    }
  }

  updateButtonLabel() {
    const model = this.modelSelect ? this.modelSelect.value : this.defaultModel;
    const res = this.resolutionSelect ? this.resolutionSelect.value.toUpperCase() : "4K";
    const isFullScreen = this.chkFullScreen ? this.chkFullScreen.checked : true;

    let modelShort = "NANO BANANA PRO";
    if (model === "nano-banana-2") modelShort = "NANO BANANA 2";
    else if (model === "gpt-image-2.5-flare") modelShort = "GPT IMAGE 2.5";
    else if (model === "gpt-image-2") modelShort = "GPT IMAGE 2";

    if (this.aiEngineBadge) {
      this.aiEngineBadge.textContent = `${modelShort} · ${res}`;
    }
    if (this.resDescBadge) {
      this.resDescBadge.textContent = res === "4K" ? "4096 px" : "2048 px";
    }

    if (this.btnRunAI) {
      const fsTag = isFullScreen ? "FULL-SCREEN" : "STANDARD";
      const span = this.btnRunAI.querySelector("span");
      if (span) {
        span.textContent = `POKRENI ${modelShort} (${res} ${fsTag})`;
      }
    }
  }

  showStatus(msg, type = "info", progress = false) {
    if (!this.statusBanner) return;
    this.statusBanner.style.display = "flex";
    this.statusBanner.className = `status-banner ${type}`;
    this.statusBanner.innerHTML = `
      ${progress ? '<span class="btn-spinner" style="border-top-color:var(--accent-gold-bright);"></span>' : ''}
      <span style="font-weight:600;">${msg}</span>
    `;
  }

  hideStatus() {
    if (this.statusBanner) {
      this.statusBanner.style.display = "none";
    }
  }

  async runAIIsolation() {
    const item = this.app.currentDesign;
    if (!item) {
      this.app.feedback.showToast("Odaberite dizajn prije pokretanja izolacije.", "warning");
      return;
    }

    const model = this.modelSelect ? this.modelSelect.value : this.defaultModel;
    const resolution = this.resolutionSelect ? this.resolutionSelect.value : "4k";
    const isFullScreen = this.chkFullScreen ? this.chkFullScreen.checked : true;
    const isTightCrop = this.chkTightCrop ? this.chkTightCrop.checked : true;

    let modelName = "Nano Banana Pro";
    if (model === "nano-banana-2") modelName = "Nano Banana 2";
    else if (model === "gpt-image-2.5-flare") modelName = "GPT Image 2.5 Flare";
    else if (model === "gpt-image-2") modelName = "GPT Image 2";

    // Anti-duplicate Lock
    const locked = this.app.feedback.acquireLock("ai_isolation", this.btnRunAI, `${modelName} (${resolution.toUpperCase()})...`);
    if (!locked) return;

    const promptText = this.textarea ? this.textarea.value : (this.fullScreenPrompt || this.universalPrompt);

    const resLabel = resolution === "4k" ? "4K Ultra HD (4096px)" : "2K Master (2048px)";
    this.showStatus(`Slanje zahtjeva na ${modelName} (${resLabel})...`, "info", true);
    
    this.app.feedback.showCanvasOverlay(
      `${modelName.toUpperCase()} · ${resolution.toUpperCase()} IZOLACIJA`,
      `Obrada modelom ${modelName} · ${isFullScreen ? "Full-Screen proširenje & " : ""}${resLabel} čišćenje...`,
      "KORAK 02: AI OBRADA"
    );
    this.app.feedback.showToast(`🍌 Pokrenuta ${modelName} (${resolution.toUpperCase()}) obrada za: "${item.title}"`, "info", 4000);

    try {
      const res = await fetch("/api/ai/isolate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_path: item.hires_path || item.preview_path,
          prompt: promptText,
          model: model,
          resolution: resolution,
          full_screen: isFullScreen,
          tight_crop: isTightCrop
        })
      });
      const data = await res.json();
      if (data.success) {
        const cropNote = data.tight_crop_applied ? " + Auto Tight-Crop" : "";
        this.showStatus(`Uspješno izolirano putem ${data.model} · ${data.resolution} (${data.duration}s)!`, "success");
        this.app.feedback.showToast(`✅ ${modelName} (${data.resolution}${cropNote}) dovršeno u ${data.duration}s!`, "success", 5000);
        this.app.setAICleanedResult(data);
      } else {
        this.showStatus(`Greška API-ja: ${data.error}`, "error");
        this.app.feedback.showToast(`❌ Greška AI API-ja: ${data.error}`, "error", 6000);
      }
    } catch (err) {
      this.showStatus(`Mrežna greška: ${err.message}`, "error");
      this.app.feedback.showToast(`❌ Mrežna greška: ${err.message}`, "error", 5000);
    } finally {
      this.app.feedback.releaseLock("ai_isolation", this.btnRunAI);
    }
  }

  async runLocalIsolation() {
    const item = this.app.currentDesign;
    if (!item) return;

    const locked = this.app.feedback.acquireLock("local_isolation", this.btnRunLocal, "Lokalna obrada...");
    if (!locked) return;

    this.showStatus("Izvršavam trenutnu lokalnu algoritamsku izolaciju...", "info", true);
    this.app.feedback.showCanvasOverlay(
      "TRENUTNA LOKALNA IZOLACIJA",
      "OpenCV flood-fill segmentacija i uklanjanje rubova...",
      "KORAK 01: LOKALNI ALGORITAM"
    );

    try {
      const activePath = this.app.activeImage?.filepath || item.hires_path || item.preview_path;
      const res = await fetch("/api/local/isolate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_path: activePath,
          image_id: this.app.activeImage?.id || "gen_original",
          threshold: parseFloat(document.getElementById("sliderDtfThreshold")?.value || 24),
          choke_px: parseInt(document.getElementById("sliderDtfChoke")?.value || 1),
          feather_px: parseFloat(document.getElementById("sliderDtfFeather")?.value || 1.5),
          despeckle_size: parseInt(document.getElementById("sliderDtfDespeckle")?.value || 20),
          invert_to_dark_ink: document.getElementById("chkDtfInvertInk")?.checked || false,
          target_height: parseInt(document.getElementById("selectDPI")?.value || 2048)
        })
      });
      const data = await res.json();
      if (data.success) {
        this.showStatus(`Lokalna izolacija dovršena u ${data.duration}s!`, "success");
        this.app.feedback.showToast(`⚡ Transparentni DTF kreiran u ${data.duration}s!`, "success", 3000);
        this.app.setDTFResult(data);
      } else {
        this.showStatus(`Greška obrade: ${data.error}`, "error");
        this.app.feedback.showToast(`❌ Greška: ${data.error}`, "error", 4000);
      }
    } catch (err) {
      this.showStatus(`Greška: ${err.message}`, "error");
      this.app.feedback.showToast(`❌ Greška: ${err.message}`, "error", 4000);
    } finally {
      this.app.feedback.releaseLock("local_isolation", this.btnRunLocal);
    }
  }
}
