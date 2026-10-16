/**
 * Studio Varaždin — Spatial Canvas Engine & Step-by-Step Navigation
 * Fully aligned with the Studio Varaždin Spatial Moodboard navigation architecture:
 * - Buttery smooth trackpad 2-finger panning and exponential pinch-to-zoom focused at cursor
 * - Drag panning with physics-based momentum/inertia glide (exponential velocity smoothing & friction decay)
 * - Multi-touch gestures (1-finger pan with momentum, 2-finger geometric pinch-to-zoom)
 * - Cubic ease-out animated camera transitions (Fit to Screen, 1:1, Zoom In/Out)
 * - Spacebar pan mode & Double-click zoom to fit
 * - Super-resolution split comparison slider, garment switcher & Step-by-step UI sync
 */

export class CanvasController {
  constructor(app) {
    this.app = app;

    // Spatial Camera State
    this.panX = 0;
    this.panY = 0;
    this.scale = 0.55;
    this.minScale = 0.05;
    this.maxScale = 8.0;

    // Artboard canvas geometry (defaults to standard master 1664x2048)
    this.artboardWidth = 1664;
    this.artboardHeight = 2048;

    // Panning & Physics Momentum Variables
    this.isDragging = false;
    this.isPanning = false; // touch
    this.startMouseX = 0;
    this.startMouseY = 0;
    this.lastPanMouseX = 0;
    this.lastPanMouseY = 0;
    this.lastPanTime = 0;
    this.panVx = 0;
    this.panVy = 0;
    this.panInertiaAnim = null;
    this.cameraAnimRaf = null;

    // Multi-touch gestures
    this.pinchStart = null;
    this.isSpacePressed = false;

    // Display & Rendering State
    this.currentViewMode = "original";
    this.currentStep = 1;
    this.currentGarmentColor = "#171E19";
    this.isGarmentTexture = false;

    this.initElements();
    this.initResizer();
    this.bindEvents();
    this.syncStageDimensions();
    this.updateStageBackground();
    this.updateTransform();
  }

  initElements() {
    this.viewport = document.getElementById("canvasViewport");
    this.stage = document.getElementById("artboardStage");
    this.imgMain = document.getElementById("mainArtboardImg");
    this.liveCanvas = document.getElementById("liveDtfCanvas");
    this.layersContainer = document.getElementById("layersRenderContainer");
    this.svgContainer = document.getElementById("svgRenderContainer");
    this.inspectorPane = document.getElementById("inspectorPane");
    this.btnTogglePanel = document.getElementById("btnTogglePanel");
    this.panelResizer = document.getElementById("panelResizer");
    this.curStepBadge = document.getElementById("curStepBadge");

    // Split comparison elements (Full Resolution Zero-Distortion Clip-Path Engine)
    this.splitWrapper = document.getElementById("splitCompareWrapper");
    this.splitBefore = document.getElementById("splitBefore");
    this.splitImgBefore = document.getElementById("splitImgBefore");
    this.splitImgAfter = document.getElementById("splitImgAfter");
    this.splitDivider = document.getElementById("splitDivider");
    this.splitHandle = document.getElementById("splitHandle");
    this.splitTagA = document.getElementById("splitTagA");
    this.splitTagB = document.getElementById("splitTagB");
    this.selectCompareBefore = document.getElementById("selectCompareBefore");
    this.selectCompareAfter = document.getElementById("selectCompareAfter");
    this.splitPositionPct = 50;

    // Multi-Mode Comparison Elements
    this.sideBySideContainer = document.getElementById("sideBySideContainer");
    this.imgSideLeft = document.getElementById("imgSideLeft");
    this.imgSideRight = document.getElementById("imgSideRight");
    this.plateLeftTag = document.getElementById("plateLeftTag");
    this.plateRightTag = document.getElementById("plateRightTag");
    this.onionOverlayImg = document.getElementById("onionOverlayImg");
    this.compareModeGroup = document.getElementById("compareModeGroup");
    this.comparisonVisualMode = "split"; // split | side_by_side | onion | diff
    this.savedBeforePeekSrc = null;

    // Floating Zoom HUD
    this.btnZoomIn = document.getElementById("btnZoomIn");
    this.btnZoomOut = document.getElementById("btnZoomOut");
    this.btnZoomFit = document.getElementById("btnZoomFit");
    this.btnZoom100 = document.getElementById("btnZoom100");
    this.labelZoom = document.getElementById("labelZoomLevel");

    // Floating Image Telemetry HUD (Always Visible in Bottom Corner)
    this.hudElement = document.getElementById("imageTelemetryHud");
    this.hudImageTypeTag = document.getElementById("hudImageTypeTag");
    this.hudFilenameText = document.getElementById("hudFilenameText");
    this.hudResolutionBadge = document.getElementById("hudResolutionBadge");
    this.hudRawInfoBadge = document.getElementById("hudRawInfoBadge");
    this.hudDensityBadge = document.getElementById("hudDensityBadge");

    // Big Step Navigation Buttons
    this.stepPills = document.querySelectorAll(".step-pill");
    this.stepPanels = document.querySelectorAll(".step-settings-panel");
    this.gotoStepBtns = document.querySelectorAll("[data-goto-step]");

    // Garment swatches & options
    this.swatches = document.querySelectorAll(".color-swatch");
    this.customPicker = document.getElementById("customGarmentColor");
    this.chkTexture = document.getElementById("chkGarmentTexture");
    this.chkInvertInk = document.getElementById("chkInvertInk");
  }

  initResizer() {
    try {
      const savedWidth = localStorage.getItem("sv_sidebar_width");
      if (savedWidth && this.inspectorPane) {
        const w = Math.min(Math.max(280, parseInt(savedWidth)), window.innerWidth * 0.55);
        this.inspectorPane.style.width = `${w}px`;
      }
    } catch (e) {}

    if (this.panelResizer && this.inspectorPane) {
      let isResizing = false;

      this.panelResizer.addEventListener("mousedown", () => {
        isResizing = true;
        this.panelResizer.classList.add("dragging");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      });

      window.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        const newWidth = window.innerWidth - e.clientX;
        const minW = 280;
        const maxW = Math.min(700, window.innerWidth * 0.6);

        if (newWidth >= minW && newWidth <= maxW) {
          this.inspectorPane.style.width = `${newWidth}px`;
        }
      });

      window.addEventListener("mouseup", () => {
        if (isResizing) {
          isResizing = false;
          this.panelResizer.classList.remove("dragging");
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          try {
            localStorage.setItem("sv_sidebar_width", parseInt(this.inspectorPane.style.width));
          } catch (e) {}
        }
      });
    }

    if (this.btnTogglePanel && this.inspectorPane) {
      this.btnTogglePanel.addEventListener("click", () => {
        const isCollapsed = this.inspectorPane.classList.toggle("collapsed");
        if (this.panelResizer) {
          this.panelResizer.style.display = isCollapsed ? "none" : "flex";
        }
        this.btnTogglePanel.classList.toggle("active", !isCollapsed);
        setTimeout(() => this.fitToScreen(true), 120);
      });
    }
  }

  bindEvents() {
    if (!this.viewport) return;

    // Navigation Wheel & Mouse Drag
    this.viewport.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    this.viewport.addEventListener("mousedown", (e) => this.onMouseDown(e));
    window.addEventListener("mousemove", (e) => this.onMouseMove(e));
    window.addEventListener("mouseup", (e) => this.onMouseUp(e));

    // Touch & Multi-Touch
    this.viewport.addEventListener("touchstart", (e) => this.onTouchStart(e), { passive: false });
    this.viewport.addEventListener("touchmove", (e) => this.onTouchMove(e), { passive: false });
    this.viewport.addEventListener("touchend", (e) => this.onTouchEnd(e));
    this.viewport.addEventListener("touchcancel", (e) => this.onTouchEnd(e));

    // Double-click to Fit
    this.viewport.addEventListener("dblclick", (e) => {
      if (e.target.closest("#splitHandle") || e.target.closest(".zoom-hud") || e.target.closest(".canvas-overlay")) return;
      this.fitToScreen(true);
    });

    window.addEventListener("auxclick", (e) => {
      if (e.button === 1) e.preventDefault();
    });

    // Spacebar Pan & Peek Keys
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.code === "Space" && !this.isSpacePressed) {
        this.isSpacePressed = true;
        if (this.app.currentView === "editor") {
          this.viewport.style.cursor = "grab";
          // If in AI step or comparison, also trigger peek
          if (this.currentViewMode === "ai_cleaned") {
            this.peekOriginal(true);
          }
        }
      } else if (e.key === "c" || e.key === "C") {
        if (this.app.currentView === "editor" && this.app.generationsController) {
          this.app.generationsController.toggleQuickCompare();
        }
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.isSpacePressed = false;
        if (this.app.currentView === "editor" && !this.isDragging) {
          this.viewport.style.cursor = "";
          if (this.currentViewMode === "ai_cleaned") {
            this.peekOriginal(false);
          }
        }
      }
    });

    // Split Handle Interactive Dragging (Full Resolution Zero-Distortion Clip-Path Engine)
    if (this.splitWrapper) {
      let isDraggingSplit = false;

      const getPercentFromEvent = (e) => {
        const rect = this.splitWrapper.getBoundingClientRect();
        const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
        const offsetX = clientX - rect.left;
        return Math.min(100, Math.max(0, (offsetX / rect.width) * 100));
      };

      const onSplitDown = (e) => {
        if (this.isSpacePressed) return;
        e.stopPropagation();
        e.preventDefault();
        isDraggingSplit = true;
        this.splitHandle?.classList.add("dragging");
        document.body.style.cursor = "ew-resize";
        document.body.style.userSelect = "none";
        const pct = getPercentFromEvent(e);
        this.setSplitPosition(pct);
      };

      const onSplitMove = (e) => {
        if (!isDraggingSplit) return;
        const pct = getPercentFromEvent(e);
        this.setSplitPosition(pct);
      };

      const onSplitUp = () => {
        if (isDraggingSplit) {
          isDraggingSplit = false;
          this.splitHandle?.classList.remove("dragging");
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        }
      };

      this.splitHandle?.addEventListener("mousedown", onSplitDown);
      this.splitDivider?.addEventListener("mousedown", onSplitDown);
      this.splitWrapper.addEventListener("mousedown", (e) => {
        if (this.currentViewMode === "split_compare" && !this.isSpacePressed && !this.isDragging) {
          onSplitDown(e);
        }
      });

      window.addEventListener("mousemove", onSplitMove);
      window.addEventListener("mouseup", onSplitUp);

      this.splitHandle?.addEventListener("touchstart", onSplitDown, { passive: false });
      this.splitDivider?.addEventListener("touchstart", onSplitDown, { passive: false });
      this.splitWrapper.addEventListener("touchstart", (e) => {
        if (this.currentViewMode === "split_compare" && e.touches.length === 1 && !this.isSpacePressed) {
          onSplitDown(e);
        }
      }, { passive: false });

      window.addEventListener("touchmove", onSplitMove, { passive: false });
      window.addEventListener("touchend", onSplitUp);
      window.addEventListener("touchcancel", onSplitUp);
    }

    // Zoom Buttons
    if (this.btnZoomIn) this.btnZoomIn.addEventListener("click", () => this.zoomBy(1.25, null, null, true));
    if (this.btnZoomOut) this.btnZoomOut.addEventListener("click", () => this.zoomBy(0.8, null, null, true));
    if (this.btnZoom100) this.btnZoom100.addEventListener("click", () => this.zoom100(true));
    if (this.btnZoomFit) this.btnZoomFit.addEventListener("click", () => this.fitToScreen(true));

    window.addEventListener("resize", () => {
      if (this.app.currentView === "editor") {
        this.fitToScreen(false);
      }
    });

    // Image Load Dimensions Sync & Telemetry Refresh
    const onAnyImageLoaded = () => {
      const w = this.imgMain?.naturalWidth;
      const h = this.imgMain?.naturalHeight;
      if (w && h) {
        this.artboardWidth = w;
        this.artboardHeight = h;
        this.syncStageDimensions();
      }
      const resBadge = document.getElementById("editorResBadge");
      const p1MetricRes = document.getElementById("p1MetricRes");
      if (w && h) {
        const str = `${w} × ${h} px · Master`;
        if (resBadge) resBadge.textContent = str;
        if (p1MetricRes) p1MetricRes.textContent = `${w} × ${h}`;
      }
      this.updateTelemetryHUD();
    };

    if (this.imgMain) {
      this.imgMain.addEventListener("load", onAnyImageLoaded);
    }
    if (this.splitImgBefore) {
      this.splitImgBefore.addEventListener("load", onAnyImageLoaded);
    }
    if (this.splitImgAfter) {
      this.splitImgAfter.addEventListener("load", onAnyImageLoaded);
    }

    // Big Step Buttons Click
    this.stepPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        const step = parseInt(pill.getAttribute("data-step") || "1");
        const mode = pill.getAttribute("data-mode") || "original";
        this.goToStep(step, mode);
      });
    });

    // Forward/Backward Action Buttons
    this.gotoStepBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const step = parseInt(btn.getAttribute("data-goto-step") || "1");
        const modes = ["original", "ai_cleaned", "dtf_alpha", "vector_svg", "split_compare", "mockup"];
        const mode = modes[step - 1] || "original";
        this.goToStep(step, mode);
      });
    });

    // Garment Swatches
    this.swatches.forEach((s) => {
      s.addEventListener("click", () => {
        this.swatches.forEach((x) => x.classList.remove("active"));
        s.classList.add("active");
        const color = s.getAttribute("data-color");
        this.setGarmentColor(color);
        if (this.app.feedback) {
          this.app.feedback.showToast(`Boja majice promijenjena: ${color.toUpperCase()}`, "info", 1500);
        }
      });
    });

    if (this.customPicker) {
      this.customPicker.addEventListener("input", (e) => {
        this.setGarmentColor(e.target.value);
      });
    }

    if (this.chkTexture) {
      this.chkTexture.addEventListener("change", (e) => {
        this.isGarmentTexture = e.target.checked;
        this.updateStageBackground();
      });
    }

    // Compare Layer Selectors
    if (this.selectCompareBefore) {
      this.selectCompareBefore.addEventListener("change", () => this.updateCompareImages());
    }
    if (this.selectCompareAfter) {
      this.selectCompareAfter.addEventListener("change", () => this.updateCompareImages());
    }
  }

  // =========================================================================
  // SPATIAL CAMERA & PHYSICS MOMENTUM
  // =========================================================================

  updateTransform() {
    if (!this.stage) return;
    this.stage.style.transform = `translate3d(${this.panX}px, ${this.panY}px, 0) scale(${this.scale})`;
    const zoomText = `${Math.round(this.scale * 100)}%`;
    if (this.labelZoom) {
      this.labelZoom.textContent = zoomText;
    }
    if (this.hudDensityBadge) {
      this.hudDensityBadge.textContent = `${zoomText} Zoom`;
    }
  }

  stopPanInertia() {
    if (this.panInertiaAnim) {
      cancelAnimationFrame(this.panInertiaAnim);
      this.panInertiaAnim = null;
    }
  }

  startPanInertia() {
    this.stopPanInertia();
    const friction = 0.92;
    const minVelocity = 0.05;

    const loop = () => {
      this.panVx *= friction;
      this.panVy *= friction;
      this.panX += this.panVx;
      this.panY += this.panVy;
      this.updateTransform();

      if (Math.hypot(this.panVx, this.panVy) > minVelocity) {
        this.panInertiaAnim = requestAnimationFrame(loop);
      } else {
        this.panInertiaAnim = null;
      }
    };
    this.panInertiaAnim = requestAnimationFrame(loop);
  }

  onWheel(e) {
    e.preventDefault();
    this.stopPanInertia();

    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = Math.pow(0.992, e.deltaY);
      const rect = this.viewport.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      this.zoomBy(zoomFactor, cursorX, cursorY, false);
    } else {
      this.panX -= e.deltaX;
      this.panY -= e.deltaY;
      this.updateTransform();
    }
  }

  onMouseDown(e) {
    if (e.target.closest("#splitHandle") || e.target.closest(".zoom-hud") || e.target.closest(".canvas-overlay")) return;
    this.stopPanInertia();

    this.isDragging = true;
    const rect = this.viewport.getBoundingClientRect();
    this.startMouseX = e.clientX - rect.left - this.panX;
    this.startMouseY = e.clientY - rect.top - this.panY;
    this.lastPanMouseX = e.clientX;
    this.lastPanMouseY = e.clientY;
    this.lastPanTime = performance.now();
    this.panVx = 0;
    this.panVy = 0;
    this.viewport.classList.add("grabbing");
  }

  onMouseMove(e) {
    if (!this.isDragging) return;
    const rect = this.viewport.getBoundingClientRect();
    const curX = e.clientX - rect.left;
    const curY = e.clientY - rect.top;

    this.panX = curX - this.startMouseX;
    this.panY = curY - this.startMouseY;
    this.updateTransform();

    const now = performance.now();
    const dt = Math.max(1, now - this.lastPanTime);
    const dx = e.clientX - this.lastPanMouseX;
    const dy = e.clientY - this.lastPanMouseY;

    const instVx = dx / dt;
    const instVy = dy / dt;
    this.panVx = this.panVx * 0.3 + instVx * 0.7;
    this.panVy = this.panVy * 0.3 + instVy * 0.7;

    this.lastPanMouseX = e.clientX;
    this.lastPanMouseY = e.clientY;
    this.lastPanTime = now;
  }

  onMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.viewport.classList.remove("grabbing");
      const now = performance.now();
      if (now - this.lastPanTime > 60) {
        this.panVx = 0;
        this.panVy = 0;
      } else {
        this.startPanInertia();
      }
    }
  }

  onTouchStart(e) {
    this.stopPanInertia();
    if (e.touches.length === 2) {
      this.isPanning = false;
      const a = e.touches[0];
      const b = e.touches[1];
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const rect = this.viewport.getBoundingClientRect();
      const midX = (a.clientX + b.clientX) / 2 - rect.left;
      const midY = (a.clientY + b.clientY) / 2 - rect.top;

      this.pinchStart = {
        distance,
        scale: this.scale,
        worldX: (midX - this.panX) / this.scale,
        worldY: (midY - this.panY) / this.scale
      };
    } else if (e.touches.length === 1) {
      const point = e.touches[0];
      const rect = this.viewport.getBoundingClientRect();
      const vx = point.clientX - rect.left;
      const vy = point.clientY - rect.top;

      this.isPanning = true;
      this.startMouseX = vx - this.panX;
      this.startMouseY = vy - this.panY;
      this.lastPanMouseX = point.clientX;
      this.lastPanMouseY = point.clientY;
      this.lastPanTime = performance.now();
      this.panVx = 0;
      this.panVy = 0;
    }
  }

  onTouchMove(e) {
    if (this.pinchStart && e.touches.length === 2) {
      e.preventDefault();
      const a = e.touches[0];
      const b = e.touches[1];
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const rect = this.viewport.getBoundingClientRect();
      const midX = (a.clientX + b.clientX) / 2 - rect.left;
      const midY = (a.clientY + b.clientY) / 2 - rect.top;

      this.scale = Math.min(
        this.maxScale,
        Math.max(this.minScale, (this.pinchStart.scale * distance) / this.pinchStart.distance)
      );
      this.panX = midX - this.pinchStart.worldX * this.scale;
      this.panY = midY - this.pinchStart.worldY * this.scale;
      this.updateTransform();
      return;
    }

    if (this.isPanning && e.touches.length === 1) {
      e.preventDefault();
      const point = e.touches[0];
      const rect = this.viewport.getBoundingClientRect();
      const vx = point.clientX - rect.left;
      const vy = point.clientY - rect.top;

      this.panX = vx - this.startMouseX;
      this.panY = vy - this.startMouseY;
      this.updateTransform();

      const now = performance.now();
      const dt = Math.max(1, now - this.lastPanTime);
      const dx = point.clientX - this.lastPanMouseX;
      const dy = point.clientY - this.lastPanMouseY;

      const instVx = dx / dt;
      const instVy = dy / dt;
      this.panVx = this.panVx * 0.3 + instVx * 0.7;
      this.panVy = this.panVy * 0.3 + instVy * 0.7;

      this.lastPanMouseX = point.clientX;
      this.lastPanMouseY = point.clientY;
      this.lastPanTime = now;
    }
  }

  onTouchEnd() {
    if (this.pinchStart) this.pinchStart = null;
    if (this.isPanning) {
      this.isPanning = false;
      const now = performance.now();
      if (now - this.lastPanTime > 60) {
        this.panVx = 0;
        this.panVy = 0;
      } else {
        this.startPanInertia();
      }
    }
  }

  zoomBy(factor, cx = null, cy = null, animate = false) {
    const rect = this.viewport.getBoundingClientRect();
    const pivotX = cx !== null ? cx : rect.width / 2;
    const pivotY = cy !== null ? cy : rect.height / 2;

    const targetScale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    const targetPanX = pivotX - ((pivotX - this.panX) / this.scale) * targetScale;
    const targetPanY = pivotY - ((pivotY - this.panY) / this.scale) * targetScale;

    if (animate) {
      this.animateCameraTo(targetPanX, targetPanY, targetScale);
    } else {
      this.scale = targetScale;
      this.panX = targetPanX;
      this.panY = targetPanY;
      this.updateTransform();
    }
  }

  zoom100(animate = true) {
    const rect = this.viewport.getBoundingClientRect();
    const pivotX = rect.width / 2;
    const pivotY = rect.height / 2;
    const targetScale = 1.0;
    const targetPanX = pivotX - ((pivotX - this.panX) / this.scale) * targetScale;
    const targetPanY = pivotY - ((pivotY - this.panY) / this.scale) * targetScale;

    if (animate) {
      this.animateCameraTo(targetPanX, targetPanY, targetScale);
    } else {
      this.scale = targetScale;
      this.panX = targetPanX;
      this.panY = targetPanY;
      this.updateTransform();
    }
  }

  fitToScreen(animate = true) {
    if (!this.viewport) return;
    const rect = this.viewport.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      requestAnimationFrame(() => {
        if (this.viewport) {
          const retryRect = this.viewport.getBoundingClientRect();
          if (retryRect.width && retryRect.height) {
            this.fitToScreen(false);
          }
        }
      });
      return;
    }

    const padding = 40;
    const availW = Math.max(100, rect.width - padding * 2);
    const availH = Math.max(100, rect.height - padding * 2);

    const scaleX = availW / this.artboardWidth;
    const scaleY = availH / this.artboardHeight;
    const targetScale = Math.min(scaleX, scaleY, 1.8);

    const targetPanX = (rect.width - this.artboardWidth * targetScale) / 2;
    const targetPanY = (rect.height - this.artboardHeight * targetScale) / 2;

    if (animate) {
      this.animateCameraTo(targetPanX, targetPanY, targetScale);
    } else {
      this.scale = targetScale;
      this.panX = targetPanX;
      this.panY = targetPanY;
      this.updateTransform();
    }
  }

  animateCameraTo(targetPanX, targetPanY, targetScale, duration = 280) {
    if (this.cameraAnimRaf) cancelAnimationFrame(this.cameraAnimRaf);
    this.stopPanInertia();

    const startPanX = this.panX;
    const startPanY = this.panY;
    const startScale = this.scale;
    const startTime = performance.now();

    const easeOutCubic = (t) => --t * t * t + 1;

    const frame = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      const ease = easeOutCubic(progress);

      this.panX = startPanX + (targetPanX - startPanX) * ease;
      this.panY = startPanY + (targetPanY - startPanY) * ease;
      this.scale = startScale + (targetScale - startScale) * ease;
      this.updateTransform();

      if (progress < 1.0) {
        this.cameraAnimRaf = requestAnimationFrame(frame);
      } else {
        this.cameraAnimRaf = null;
      }
    };
    this.cameraAnimRaf = requestAnimationFrame(frame);
  }

  // =========================================================================
  // STEP-BY-STEP WORKFLOW & VIEW MODES
  // =========================================================================

  syncStageDimensions() {
    if (!this.stage) return;
    this.stage.style.width = `${this.artboardWidth}px`;
    this.stage.style.height = `${this.artboardHeight}px`;
  }

  setGarmentColor(color) {
    this.currentGarmentColor = color;
    this.updateStageBackground();
  }

  updateStageBackground() {
    if (!this.stage) return;
    if (this.currentGarmentColor === "checker") {
      this.stage.style.background = "transparent";
      this.stage.style.boxShadow = "0 10px 40px rgba(0,0,0,0.7)";
    } else {
      this.stage.style.background = this.currentGarmentColor;
      this.stage.style.boxShadow = `0 15px 50px rgba(0,0,0,0.85), inset 0 0 100px rgba(0,0,0,0.2)`;
    }
  }

  goToStep(stepNumber, mode = null) {
    this.currentStep = stepNumber;
    const modes = ["original", "ai_cleaned", "dtf_alpha", "layer_psd", "vector_svg", "split_compare", "mockup"];
    const viewMode = mode || modes[stepNumber - 1] || "original";

    // 1. Update Step Navigation Pills
    this.stepPills.forEach((p) => {
      const pStep = parseInt(p.getAttribute("data-step") || "1");
      p.classList.toggle("active", pStep === stepNumber);
    });

    // 2. Update Inspector Header Badge
    const stepLabels = [
      "KORAK 01 · IZVORNI PREDLOŽAK",
      "KORAK 02 · AI ČIŠĆENJE & UPSCALE",
      "KORAK 03 · ZERO-HALO DTF ALPHA",
      "KORAK 04 · MING PSD LAYER SEPARACIJA",
      "KORAK 05 · BÉZIER VEKTORSKI SLOJEVI",
      "KORAK 06 · A-B USPOREDBA FAZA",
      "KORAK 07 · MOCKUP & PROIZVODNJA"
    ];
    if (this.curStepBadge) {
      this.curStepBadge.textContent = stepLabels[stepNumber - 1] || `KORAK 0${stepNumber}`;
    }

    // 3. Show ONLY the active Step Settings Panel
    this.stepPanels.forEach((panel, idx) => {
      panel.classList.toggle("active", idx + 1 === stepNumber);
    });

    // 4. Update Canvas Artboard Rendering
    this.setViewMode(viewMode);
  }

  refreshActiveView() {
    this.setViewMode(this.currentViewMode || "original");
  }

  renderLayersMode() {
    if (!this.layersContainer) return;
    this.layersContainer.style.display = "block";

    const layers = this.app.layerControls?.currentLayers || [];
    const visibility = this.app.layerControls?.layerVisibility || {};
    const opacity = this.app.layerControls?.layerOpacity || {};

    if (layers.length === 0) {
      this.layersContainer.innerHTML = "";
      const active = this.app.activeImage;
      const preview = active?.state?.layer_result?.preview_url || active?.state?.dtf_result?.url || active?.url;
      if (preview && this.imgMain) {
        this.imgMain.style.display = "block";
        this.imgMain.src = preview;
      }
      if (this.app.layerControls?.floatingLayersPalette) {
        this.app.layerControls.floatingLayersPalette.style.display = "none";
      }
      return;
    }

    if (this.imgMain) this.imgMain.style.display = "none";

    // Show floating Photoshop layers palette on canvas
    if (this.app.layerControls?.floatingLayersPalette) {
      this.app.layerControls.floatingLayersPalette.style.display = "flex";
    }

    // Check if layers in DOM match currentLayers
    const existingImages = Array.from(this.layersContainer.querySelectorAll(".artboard-layer-slice"));
    const match = existingImages.length === layers.length && existingImages.every((img, i) => img.dataset.layerIndex === String(layers[i].index) && img.src.includes(layers[i].url));

    if (!match) {
      this.layersContainer.innerHTML = "";
      layers.forEach((layer, arrayIdx) => {
        const layerImg = document.createElement("img");
        layerImg.className = "artboard-layer-slice";
        layerImg.src = layer.url;
        layerImg.alt = layer.name;
        layerImg.dataset.layerIndex = layer.index;
        layerImg.style.position = "absolute";
        layerImg.style.top = "0";
        layerImg.style.left = "0";
        layerImg.style.width = "100%";
        layerImg.style.height = "100%";
        layerImg.style.objectFit = "contain";
        layerImg.style.pointerEvents = "none";
        layerImg.style.zIndex = arrayIdx + 1;
        this.layersContainer.appendChild(layerImg);
      });
    }

    // Fast visibility, opacity & z-index update for all layers (60 FPS)
    const slices = this.layersContainer.querySelectorAll(".artboard-layer-slice");
    slices.forEach((img) => {
      const idx = parseInt(img.dataset.layerIndex, 10);
      const isVis = visibility[idx] !== false;
      const op = opacity[idx] !== undefined ? opacity[idx] : 1.0;
      const arrayIdx = layers.findIndex(l => l.index === idx);

      img.style.display = isVis ? "block" : "none";
      img.style.opacity = op;
      if (arrayIdx !== -1) {
        img.style.zIndex = arrayIdx + 1;
      }
    });

    this.updateTelemetryHUD({
      filename: this.app.layerControls?.psdFilename || "Photoshop_Layers.psd",
      typeTag: "MING PSD SLOJEVI",
      rawInfo: `${layers.length} RGBA Slojeva`
    });
  }

  setViewMode(mode) {
    this.currentViewMode = mode;

    if (!this.imgMain || !this.svgContainer || !this.splitWrapper) return;

    this.imgMain.style.display = "none";
    if (this.liveCanvas) this.liveCanvas.style.display = "none";
    if (this.layersContainer) this.layersContainer.style.display = "none";
    this.svgContainer.style.display = "none";
    this.splitWrapper.style.display = "none";
    if (this.sideBySideContainer) this.sideBySideContainer.style.display = "none";
    if (this.onionOverlayImg) this.onionOverlayImg.style.display = "none";

    // Manage Floating Layers Palette HUD visibility
    if (this.app.layerControls?.floatingLayersPalette) {
      const hasLayers = this.app.layerControls.currentLayers && this.app.layerControls.currentLayers.length > 0;
      this.app.layerControls.floatingLayersPalette.style.display = (mode === "layer_psd" && hasLayers) ? "flex" : "none";
    }

    const item = this.app.currentDesign;
    if (!item) return;

    const active = this.app.activeImage || (this.app.generationsController?.generations ? this.app.generationsController.generations[0] : null);
    const origSrc = `/api/image-serve?path=${encodeURIComponent(item.hires_path || item.preview_path)}`;

    if (mode === "original") {
      this.imgMain.style.display = "block";
      this.imgMain.src = origSrc;
    } else if (mode === "ai_cleaned") {
      this.imgMain.style.display = "block";
      if (active && active.url) {
        this.imgMain.src = active.url;
      } else {
        this.imgMain.src = origSrc;
      }
    } else if (mode === "dtf_alpha") {
      if (this.liveCanvas && this.app.dtfControls && this.app.dtfControls.hasLiveRender) {
        this.liveCanvas.style.display = "block";
      } else if (active?.state?.dtf_result?.url) {
        this.imgMain.style.display = "block";
        this.imgMain.src = active.state.dtf_result.url;
      } else if (this.app.dtfData?.url) {
        this.imgMain.style.display = "block";
        this.imgMain.src = this.app.dtfData.url;
      } else {
        this.liveCanvas.style.display = "block";
        if (this.app.dtfControls) {
          this.app.dtfControls.renderLiveNow();
        }
      }
    } else if (mode === "layer_psd") {
      this.renderLayersMode();
    } else if (mode === "vector_svg") {
      this.svgContainer.style.display = "block";
      const svgUrl = active?.state?.vector_result?.svg_url || this.app.vectorData?.svg_url;
      if (svgUrl) {
        this.loadSVGToContainer(svgUrl);
      } else {
        this.app.vectorControls?.runVectorization(true);
      }
    } else if (mode === "split_compare") {
      this.updateStageBackground();
      this.renderComparisonMode();
    } else if (mode === "mockup") {
      this.imgMain.style.display = "block";
      if (this.stage) {
        this.stage.style.background = "transparent";
        this.stage.style.boxShadow = "none";
      }
      this.renderMockupMode();
    }

    if (mode !== "mockup") {
      this.updateStageBackground();
    }

    this.updateTelemetryHUD();
  }

  setCustomImage(url, width, height, customFilename = "") {
    if (!this.imgMain) return;
    this.imgMain.style.display = "block";
    this.imgMain.src = url;
    if (width && height) {
      this.artboardWidth = width;
      this.artboardHeight = height;
      this.syncStageDimensions();
    }
    this.updateTelemetryHUD({
      filename: customFilename || url.split("/").pop() || "Custom Image",
      width: width || this.artboardWidth,
      height: height || this.artboardHeight,
      typeTag: "UVEZENA SLIKA",
      rawInfo: "Custom Upload"
    });
  }

  peekOriginal(isPeeking) {
    const item = this.app.currentDesign;
    if (!item || !this.imgMain) return;

    const origSrc = `/api/image-serve?path=${encodeURIComponent(item.hires_path || item.preview_path)}`;

    if (isPeeking) {
      if (!this.savedBeforePeekSrc) {
        this.savedBeforePeekSrc = this.imgMain.src;
      }
      this.imgMain.src = origSrc;
      if (this.curStepBadge) this.curStepBadge.textContent = "👁️ PRIVREMENI PRIKAZ: IZVORNI MASTER";
      this.updateTelemetryHUD({
        typeTag: "PRIVREMENI ORIGINAL",
        rawInfo: "Spacebar Peek"
      });
    } else {
      if (this.savedBeforePeekSrc) {
        this.imgMain.src = this.savedBeforePeekSrc;
        this.savedBeforePeekSrc = null;
      }
      if (this.curStepBadge) {
        this.curStepBadge.textContent = "KORAK 02 · AI ČIŠĆENJE & UPSCALE";
      }
      this.updateTelemetryHUD();
    }
  }

  setSplitPosition(pct) {
    this.splitPositionPct = Math.min(100, Math.max(0, pct));
    if (this.splitWrapper) {
      this.splitWrapper.style.setProperty('--split-pos', `${this.splitPositionPct}%`);
    }
    if (this.splitBefore) {
      this.splitBefore.style.clipPath = `polygon(0 0, ${this.splitPositionPct}% 0, ${this.splitPositionPct}% 100%, 0 100%)`;
      this.splitBefore.style.webkitClipPath = `polygon(0 0, ${this.splitPositionPct}% 0, ${this.splitPositionPct}% 100%, 0 100%)`;
    }
    if (this.splitDivider) {
      this.splitDivider.style.left = `${this.splitPositionPct}%`;
    }
  }

  openDirectComparison(beforeUrl, afterUrl, labelA = "00 · ORIGINAL", labelB = "AI VERZIJA") {
    if (this.splitImgBefore) this.splitImgBefore.src = beforeUrl;
    if (this.splitImgAfter) this.splitImgAfter.src = afterUrl;

    if (this.splitTagA) this.splitTagA.textContent = labelA;
    if (this.splitTagB) this.splitTagB.textContent = labelB;

    if (this.imgSideLeft) this.imgSideLeft.src = beforeUrl;
    if (this.imgSideRight) this.imgSideRight.src = afterUrl;
    if (this.plateLeftTag) this.plateLeftTag.textContent = labelA;
    if (this.plateRightTag) this.plateRightTag.textContent = labelB;

    if (this.onionOverlayImg) this.onionOverlayImg.src = afterUrl;
    if (this.compareModeGroup) this.compareModeGroup.style.display = "flex";

    this.setSplitPosition(50);
    this.renderComparisonMode();
    this.updateTelemetryHUD({
      filename: `Usporedba: ${labelA} vs ${labelB}`,
      typeTag: "A/B USPOREDBA",
      rawInfo: "Dual Phase View"
    });
  }

  setComparisonVisualMode(mode) {
    this.comparisonVisualMode = mode;
    this.renderComparisonMode();
    this.updateTelemetryHUD();
  }

  setOnionSkinOpacity(opacity) {
    if (this.onionOverlayImg) {
      this.onionOverlayImg.style.opacity = opacity;
    }
  }

  renderComparisonMode() {
    if (!this.splitWrapper) return;

    const mode = this.comparisonVisualMode || "split";

    this.splitWrapper.style.display = "none";
    if (this.sideBySideContainer) this.sideBySideContainer.style.display = "none";
    if (this.onionOverlayImg) {
      this.onionOverlayImg.style.display = "none";
      this.onionOverlayImg.style.mixBlendMode = "normal";
      this.onionOverlayImg.style.filter = "none";
    }
    if (this.imgMain) this.imgMain.style.display = "none";

    const item = this.app.currentDesign;
    const origSrc = item ? `/api/image-serve?path=${encodeURIComponent(item.hires_path || item.preview_path)}` : '';
    const active = this.app.activeImage;
    const activeSrc = active?.url || this.app.aiCleanedData?.url || origSrc;

    if (mode === "split") {
      this.splitWrapper.style.display = "block";
      this.splitImgBefore.src = origSrc;
      this.splitImgAfter.src = activeSrc;
      this.setSplitPosition(this.splitPositionPct || 50);
    } else if (mode === "side_by_side" && this.sideBySideContainer) {
      this.sideBySideContainer.style.display = "flex";
      this.imgSideLeft.src = origSrc;
      this.imgSideRight.src = activeSrc;
    } else if (mode === "onion" && this.onionOverlayImg) {
      if (this.imgMain) {
        this.imgMain.style.display = "block";
        this.imgMain.src = origSrc;
      }
      this.onionOverlayImg.style.display = "block";
      this.onionOverlayImg.src = activeSrc;
      this.onionOverlayImg.style.opacity = (parseFloat(document.getElementById("sliderOnionSkin")?.value || 50)) / 100;
    } else if (mode === "diff" && this.onionOverlayImg) {
      if (this.imgMain) {
        this.imgMain.style.display = "block";
        this.imgMain.src = origSrc;
      }
      this.onionOverlayImg.style.display = "block";
      this.onionOverlayImg.src = activeSrc;
      this.onionOverlayImg.style.opacity = "1";
      this.onionOverlayImg.style.mixBlendMode = "difference";
    }

    this.updateTelemetryHUD();
  }

  updateCompareImages() {
    const item = this.app.currentDesign;
    if (!item || !this.splitImgBefore || !this.splitImgAfter) return;

    const beforeMode = this.selectCompareBefore?.value || "original";
    const afterMode = this.selectCompareAfter?.value || "vector_svg";

    const origSrc = `/api/image-serve?path=${encodeURIComponent(item.hires_path || item.preview_path)}`;
    const active = this.app.activeImage;
    const aiSrc = active?.url || this.app.aiCleanedData?.url || origSrc;
    const dtfSrc = active?.state?.dtf_result?.url || this.app.dtfData?.url || aiSrc;
    const layerSrc = active?.state?.layer_result?.preview_url || active?.state?.layer_preview_url || dtfSrc;

    let srcA = origSrc;
    let srcB = dtfSrc;

    // Resolve Layer A
    if (beforeMode === "original") srcA = origSrc;
    else if (beforeMode === "ai_cleaned") srcA = aiSrc;
    else if (beforeMode === "dtf_alpha") srcA = dtfSrc;
    else if (beforeMode === "layer_psd") srcA = layerSrc;

    // Resolve Layer B
    if (afterMode === "dtf_alpha") srcB = dtfSrc;
    else if (afterMode === "layer_psd") srcB = layerSrc;
    else if (afterMode === "vector_svg") {
      srcB = active?.state?.vector_result?.preview_url || this.app.vectorData?.preview_url || dtfSrc;
    } else if (afterMode === "mockup") {
      srcB = active?.state?.mockup_url || this.app.mockupUrl || dtfSrc;
    }

    this.openDirectComparison(srcA, srcB, beforeMode.toUpperCase(), afterMode.toUpperCase());
  }

  async loadSVGToContainer(svgUrl) {
    try {
      const res = await fetch(svgUrl);
      const svgText = await res.text();
      if (this.svgContainer) {
        this.svgContainer.innerHTML = svgText;
        const svgEl = this.svgContainer.querySelector("svg");
        if (svgEl) {
          svgEl.style.width = "100%";
          svgEl.style.height = "100%";
          svgEl.style.display = "block";

          // Tag and apply vector layer modifications (order, visibility, deletions, color overrides)
          if (this.app.vectorControls) {
            this.app.vectorControls.applySvgModifications();
          }
        }
      }
      this.updateTelemetryHUD({
        filename: svgUrl.split("/").pop() || "Vector.svg",
        typeTag: "BÉZIER VEKTOR",
        rawInfo: "SVG Scalable Master"
      });
    } catch (err) {
      console.error("[CanvasController] Failed to load SVG:", err);
    }
  }

  async renderMockupMode() {
    const item = this.app.currentDesign;
    const active = this.app.activeImage;
    if (!item || !active) return;
    
    // Artwork source: Always guarantee clean transparent DTF isolation
    let artSource = active.state?.dtf_result?.filepath || this.app.dtfData?.filepath;

    if (!artSource || !artSource.endsWith(".png")) {
      if (this.app.dtfControls) {
        this.app.feedback.showToast("Pripremam transparentnu podlogu za mockup...", "info", 1500);
        await this.app.dtfControls.runIsolation(false);
        artSource = this.app.activeImage?.state?.dtf_result?.filepath || this.app.dtfData?.filepath;
      }
    }

    if (!artSource) {
      artSource = active.filepath || item.hires_path || item.preview_path;
    }

    this.app.feedback.showToast(`Generiram realističan mockup za ${active.version_label}...`, "info", 2000);
    try {
      const res = await fetch("/api/mockup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artwork_path: artSource,
          image_id: active.id,
          design_id: item.id,
          bg_hex: this.currentGarmentColor === "checker" ? "#171E19" : this.currentGarmentColor,
          shirt_mode: "chest_center",
          scale_pct: 0.65
        })
      });
      const data = await res.json();
      if (data.success && this.imgMain) {
        this.app.mockupUrl = data.url;
        active.state = active.state || {};
        active.state.mockup_url = data.url;
        active.state.mockup_filepath = data.filepath;
        this.imgMain.src = data.url;
        this.app.feedback.showToast("✅ Mockup majice spreman!", "success", 2000);
        this.updateTelemetryHUD({
          filename: data.filename || `${item.slug}_Mockup.png`,
          typeTag: "MOCKUP MAJICE",
          rawInfo: "Apparel 3D Proof"
        });
      }
    } catch (err) {
      console.error("[CanvasController] Mockup render failed:", err);
      this.app.feedback.showToast(`❌ Greška generiranja mockupa: ${err.message}`, "error", 3000);
    }
  }

  /**
   * Updates the subtle image telemetry text in the bottom corner of the viewport in real time.
   */
  updateTelemetryHUD(customInfo = {}) {
    if (!this.hudElement) return;

    const item = this.app.currentDesign;
    const active = this.app.activeImage;
    let filename = customInfo.filename || "";
    let width = customInfo.width || 0;
    let height = customInfo.height || 0;

    const mode = this.currentViewMode || "original";

    if (!filename && item) {
      if (mode === "original") {
        const p = item.hires_path || item.preview_path || "";
        filename = p.split("/").pop() || `${item.slug || 'master'}.png`;
      } else if (mode === "ai_cleaned") {
        if (active) {
          filename = active.filename || "AI_Cleaned.png";
          width = active.width;
          height = active.height;
        } else {
          filename = `${item.slug || 'design'}.png`;
        }
      } else if (mode === "dtf_alpha") {
        filename = active?.state?.dtf_result?.filename || this.app.dtfData?.filename || `${item.slug || 'design'}_DTF.png`;
        if (active?.state?.dtf_result?.width || this.app.dtfData?.width) {
          width = active?.state?.dtf_result?.width || this.app.dtfData?.width;
          height = active?.state?.dtf_result?.height || this.app.dtfData?.height;
        }
      } else if (mode === "vector_svg") {
        const svgUrl = active?.state?.vector_result?.svg_url || this.app.vectorData?.svg_url;
        filename = svgUrl ? svgUrl.split("/").pop() : `${item.slug || 'design'}.svg`;
      } else if (mode === "split_compare") {
        filename = item.title || "Usporedba";
      } else if (mode === "mockup") {
        filename = `${item.slug || 'design'}_Mockup.png`;
      }
    }

    if ((!width || !height) && this.imgMain && this.imgMain.naturalWidth) {
      width = this.imgMain.naturalWidth;
      height = this.imgMain.naturalHeight;
    }

    if (!width || !height) {
      width = this.artboardWidth || 1664;
      height = this.artboardHeight || 2048;
    }

    if (this.hudFilenameText) {
      this.hudFilenameText.textContent = filename || item?.title || "Dizajn";
      this.hudFilenameText.title = filename;
    }
    if (this.hudResolutionBadge) {
      this.hudResolutionBadge.textContent = `${width} × ${height} px`;
    }
  }
}
