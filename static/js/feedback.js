/**
 * Studio Varaždin — Feedback, Progress & Request Lock System
 * Provides:
 * 1. Global Request Lock (Prevents duplicate requests)
 * 2. Multi-Stage Progress Bars (Top Bar & Canvas Overlay)
 * 3. Stacked Toast Notifications (Success, Info, Error, Warning)
 * 4. Animated Button Loading States with Live Elapsed Timers
 */

export class FeedbackManager {
  constructor() {
    this.activeLocks = new Set();
    this.toastContainer = null;
    this.topProgressBar = null;
    this.canvasOverlay = null;
    this.timerInterval = null;
    this.startTime = 0;

    this.initDOM();
  }

  initDOM() {
    // 1. Toast Container
    this.toastContainer = document.getElementById("toastContainer");
    if (!this.toastContainer) {
      this.toastContainer = document.createElement("div");
      this.toastContainer.id = "toastContainer";
      this.toastContainer.className = "toast-container";
      document.body.appendChild(this.toastContainer);
    }

    // 2. Top Progress Bar
    this.topProgressBar = document.getElementById("topProgressBar");
    if (!this.topProgressBar) {
      this.topProgressBar = document.createElement("div");
      this.topProgressBar.id = "topProgressBar";
      this.topProgressBar.className = "top-progress-bar";
      document.body.appendChild(this.topProgressBar);
    }

    // 3. Canvas Loading Overlay
    this.canvasOverlay = document.getElementById("canvasLoadingOverlay");
  }

  // =========================================================================
  // REQUEST LOCKING (Anti-Duplicate Protection)
  // =========================================================================

  isLocked(lockKey) {
    return this.activeLocks.has(lockKey);
  }

  acquireLock(lockKey, buttonEl, loadingText = "Obrada...") {
    if (this.activeLocks.has(lockKey)) {
      this.showToast("Zahtjev je već u tijeku. Molimo pričekajte...", "warning");
      return false;
    }
    this.activeLocks.add(lockKey);

    // Disable all primary action buttons to prevent conflicting actions
    document.querySelectorAll(".btn-primary-action, .btn-secondary-action").forEach(btn => {
      if (btn !== buttonEl) {
        btn.classList.add("locked-disabled");
      }
    });

    if (buttonEl) {
      buttonEl.dataset.origHtml = buttonEl.innerHTML;
      buttonEl.classList.add("btn-loading");
      buttonEl.disabled = true;
      buttonEl.innerHTML = `
        <span class="btn-spinner"></span>
        <span class="btn-timer-text">${loadingText} <strong class="elapsed-sec">0.0s</strong></span>
      `;

      this.startTime = performance.now();
      clearInterval(this.timerInterval);
      this.timerInterval = setInterval(() => {
        const elapsed = ((performance.now() - this.startTime) / 1000).toFixed(1);
        const timerEl = buttonEl.querySelector(".elapsed-sec");
        if (timerEl) timerEl.textContent = `${elapsed}s`;
        
        const overlayTimer = document.getElementById("overlayTimerText");
        if (overlayTimer) overlayTimer.textContent = `${elapsed}s`;
      }, 100);
    }

    this.startTopProgress();
    return true;
  }

  releaseLock(lockKey, buttonEl) {
    this.activeLocks.delete(lockKey);
    clearInterval(this.timerInterval);

    document.querySelectorAll(".btn-primary-action, .btn-secondary-action").forEach(btn => {
      btn.classList.remove("locked-disabled");
    });

    if (buttonEl && buttonEl.dataset.origHtml) {
      buttonEl.classList.remove("btn-loading");
      buttonEl.disabled = false;
      buttonEl.innerHTML = buttonEl.dataset.origHtml;
    }

    this.finishTopProgress();
    this.hideCanvasOverlay();
  }

  // =========================================================================
  // TOP PROGRESS BAR
  // =========================================================================

  startTopProgress() {
    if (!this.topProgressBar) return;
    this.topProgressBar.style.width = "0%";
    this.topProgressBar.style.display = "block";
    this.topProgressBar.className = "top-progress-bar active";

    setTimeout(() => { if (this.topProgressBar) this.topProgressBar.style.width = "25%"; }, 100);
    setTimeout(() => { if (this.topProgressBar && this.activeLocks.size > 0) this.topProgressBar.style.width = "60%"; }, 2500);
    setTimeout(() => { if (this.topProgressBar && this.activeLocks.size > 0) this.topProgressBar.style.width = "85%"; }, 8000);
  }

  finishTopProgress() {
    if (!this.topProgressBar) return;
    this.topProgressBar.style.width = "100%";
    setTimeout(() => {
      if (this.topProgressBar) {
        this.topProgressBar.classList.remove("active");
        this.topProgressBar.style.display = "none";
        this.topProgressBar.style.width = "0%";
      }
    }, 400);
  }

  // =========================================================================
  // CANVAS LOADING OVERLAY
  // =========================================================================

  showCanvasOverlay(title, subtitle, step = "1/3") {
    if (!this.canvasOverlay) return;
    this.canvasOverlay.style.display = "flex";
    this.canvasOverlay.className = "canvas-overlay active";

    const titleEl = document.getElementById("overlayTitle");
    const subEl = document.getElementById("overlaySubtitle");
    const stepEl = document.getElementById("overlayStepBadge");

    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = subtitle;
    if (stepEl) stepEl.textContent = step;
  }

  hideCanvasOverlay() {
    if (this.canvasOverlay) {
      this.canvasOverlay.classList.remove("active");
      this.canvasOverlay.style.display = "none";
    }
  }

  // =========================================================================
  // TOAST NOTIFICATIONS
  // =========================================================================

  showToast(message, type = "info", duration = 4000) {
    if (!this.toastContainer) return;

    const toast = document.createElement("div");
    toast.className = `toast-item toast-${type}`;

    const icons = {
      success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
      error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
      warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
      info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
    };

    toast.innerHTML = `
      <div class="toast-icon">${icons[type] || icons.info}</div>
      <div class="toast-content">
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close" title="Zatvori">&times;</button>
      <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
    `;

    const closeBtn = toast.querySelector(".toast-close");
    closeBtn.addEventListener("click", () => {
      toast.classList.add("toast-hiding");
      setTimeout(() => toast.remove(), 250);
    });

    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add("toast-hiding");
        setTimeout(() => toast.remove(), 250);
      }
    }, duration);
  }
}
