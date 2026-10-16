/**
 * Studio Varaždin — Brutalist Custom Dropdown Select Engine (custom-select.js)
 * Replaces default OS select popups with dark luxury brutalist styled menus.
 * Exact design alignment with Swiper Kustoski Suite (varazdin.studio/swiper).
 */

export class BrutalistSelect {
  constructor(selectEl, options = {}) {
    if (!selectEl) return;
    this.selectEl = selectEl;
    this.options = options;
    this.isOpen = false;
    this.audioHaptics = options.audioHaptics || null;
    this.wrapper = null;
    this.trigger = null;
    this.dropdown = null;
    this.optionsList = [];
    this.focusedIndex = -1;

    this.init();
  }

  init() {
    // Hide native select visually while keeping accessible for DOM queries
    this.selectEl.style.display = 'none';
    this.selectEl.setAttribute('tabindex', '-1');
    this.selectEl.setAttribute('aria-hidden', 'true');

    // Create wrapper
    this.wrapper = document.createElement('div');
    this.wrapper.className = `brutalist-select-wrap ${this.options.className || ''}`;
    if (this.selectEl.id) this.wrapper.dataset.for = this.selectEl.id;

    // Create trigger button
    this.trigger = document.createElement('button');
    this.trigger.type = 'button';
    this.trigger.className = 'brutalist-select-trigger';
    this.trigger.setAttribute('aria-haspopup', 'listbox');
    this.trigger.setAttribute('aria-expanded', 'false');

    this.updateTriggerText();

    // Create dropdown container
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'brutalist-select-menu';
    this.dropdown.setAttribute('role', 'listbox');
    this.dropdown.setAttribute('tabindex', '-1');

    this.renderOptions();

    this.wrapper.appendChild(this.trigger);
    this.wrapper.appendChild(this.dropdown);

    // Insert wrapper into DOM directly next to the select element
    this.selectEl.parentNode.insertBefore(this.wrapper, this.selectEl.nextSibling);

    // Bind interaction events
    this.bindEvents();

    // Sync if select value is changed programmatically
    this.selectEl.addEventListener('change', () => {
      this.updateTriggerText();
      this.renderOptions();
    });

    // Observer to re-render if options are updated dynamically
    this.observer = new MutationObserver(() => {
      this.updateTriggerText();
      this.renderOptions();
    });
    this.observer.observe(this.selectEl, { childList: true, subtree: true, characterData: true });
  }

  updateTriggerText() {
    const selectedOption = this.selectEl.options[this.selectEl.selectedIndex] || this.selectEl.options[0];
    const text = selectedOption ? selectedOption.text : 'Odaberi...';

    this.trigger.innerHTML = `
      <span class="select-label-text">${text}</span>
      <svg class="select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    `;
  }

  renderOptions() {
    this.dropdown.innerHTML = '';
    this.optionsList = [];

    Array.from(this.selectEl.options).forEach((opt, idx) => {
      const isSelected = opt.value === this.selectEl.value;
      const optEl = document.createElement('div');
      optEl.className = `brutalist-option ${isSelected ? 'is-selected' : ''}`;
      optEl.setAttribute('role', 'option');
      optEl.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      optEl.dataset.value = opt.value;
      optEl.dataset.index = idx;

      optEl.innerHTML = `
        <span class="option-text">${opt.text}</span>
        ${isSelected ? '<span class="option-check">✓</span>' : ''}
      `;

      optEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectValue(opt.value);
      });

      this.dropdown.appendChild(optEl);
      this.optionsList.push(optEl);
    });
  }

  selectValue(val) {
    if (this.selectEl.value !== val) {
      this.selectEl.value = val;
      this.selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      this.selectEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    this.updateTriggerText();
    this.renderOptions();
    this.close();

    try {
      if (this.audioHaptics && typeof this.audioHaptics.playClick === 'function') {
        this.audioHaptics.playClick();
      }
    } catch (e) {}
  }

  open() {
    if (this.isOpen) return;
    // Close any other open brutalist selects on the page
    document.querySelectorAll('.brutalist-select-wrap.is-open').forEach(el => {
      el.classList.remove('is-open');
      const tr = el.querySelector('.brutalist-select-trigger');
      if (tr) tr.setAttribute('aria-expanded', 'false');
    });

    this.isOpen = true;
    this.wrapper.classList.add('is-open');
    this.trigger.setAttribute('aria-expanded', 'true');
    this.focusedIndex = this.selectEl.selectedIndex;
    this.highlightOption(this.focusedIndex);

    // Smart viewport repositioning: flip upwards if near screen bottom
    const rect = this.wrapper.getBoundingClientRect();
    const dropdownHeight = 280;
    if (rect.bottom + dropdownHeight > window.innerHeight && rect.top > dropdownHeight) {
      this.dropdown.classList.add('open-upwards');
    } else {
      this.dropdown.classList.remove('open-upwards');
    }
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.wrapper.classList.remove('is-open');
    this.trigger.setAttribute('aria-expanded', 'false');
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  highlightOption(index) {
    this.optionsList.forEach((el, idx) => {
      el.classList.toggle('is-highlighted', idx === index);
      if (idx === index) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  bindEvents() {
    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // Keyboard navigation on trigger button
    this.trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!this.isOpen) {
          this.open();
        } else {
          if (e.key === 'ArrowDown') {
            this.focusedIndex = Math.min(this.focusedIndex + 1, this.optionsList.length - 1);
            this.highlightOption(this.focusedIndex);
          } else if (e.key === 'ArrowUp') {
            this.focusedIndex = Math.max(this.focusedIndex - 1, 0);
            this.highlightOption(this.focusedIndex);
          } else if (e.key === 'Enter' || e.key === ' ') {
            if (this.focusedIndex >= 0 && this.focusedIndex < this.optionsList.length) {
              const val = this.optionsList[this.focusedIndex].dataset.value;
              this.selectValue(val);
            }
          }
        }
      } else if (e.key === 'Escape' && this.isOpen) {
        e.preventDefault();
        this.close();
        this.trigger.focus();
      } else if (e.key === 'Tab' && this.isOpen) {
        this.close();
      }
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.wrapper.contains(e.target)) {
        this.close();
      }
    });

    // Close on Escape key anywhere on page
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  destroy() {
    if (this.observer) this.observer.disconnect();
    if (this.wrapper && this.wrapper.parentNode) {
      this.wrapper.parentNode.removeChild(this.wrapper);
    }
    this.selectEl.style.display = '';
    this.selectEl.removeAttribute('tabindex');
    this.selectEl.removeAttribute('aria-hidden');
  }
}

/**
 * Initializes all select elements on page with Brutalist styling
 */
export function initAllBrutalistSelects(container = document, audioHaptics = null) {
  const selects = container.querySelectorAll('select:not([data-no-brutalist])');
  const instances = [];
  selects.forEach(sel => {
    if (!sel.dataset.brutalistInit) {
      sel.dataset.brutalistInit = 'true';
      instances.push(new BrutalistSelect(sel, { audioHaptics }));
    }
  });
  return instances;
}
