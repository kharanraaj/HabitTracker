/**
 * Habit Tracker - Shared Interface Helpers (ui.js)
 * Toast notifications, accessible modals, date/number formatting, SVG icon registry
 */

// SVG Icon Definitions
const ICONS = {
  water: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
  walking: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 4 1 2-2 3 2 4-3 5"/><path d="m8 10 3-1 2 2 4-1"/><circle cx="14" cy="3" r="1.5"/></svg>`,
  workout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1a2 2 0 0 0-2.83 0l-1.17 1.17a2 2 0 0 1-2.83 0L4.34 14.34a2 2 0 0 1 0-2.83l1.17-1.17a2 2 0 0 0 0-2.83L4.5 6.5"/><path d="m3 3 1 1a2 2 0 0 0 2.83 0l1.17-1.17a2 2 0 0 1 2.83 0l8.83 8.83a2 2 0 0 1 0 2.83l-1.17 1.17a2 2 0 0 0 0 2.83L19.5 17.5"/></svg>`,
  reading: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  studying: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>`,
  sugar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/></svg>`,
  sleep: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  meditation: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><path d="M12 9a4 4 0 0 0-4 4v3h8v-3a4 4 0 0 0-4-4Z"/><path d="M6 18h12a2 2 0 0 1 2 2H4a2 2 0 0 1 2-2Z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  minus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  flame: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2c-.5 2-2 4-3.5 5.5C6.5 9.5 5 12 5 15a7 7 0 0 0 14 0c0-3.5-2.5-6.5-4.5-8.5-.5 1.5-1.5 2.5-2.5 3C12 7 12.5 4 12 2z"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`,
  archive: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>`,
  restore: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
  arrowLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  arrowRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  checkCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`
};

/**
 * Returns inlined SVG icon string with applied class names and attributes
 */
export function getIconSvg(name, className = '', attributes = '') {
  const rawSvg = ICONS[name] || ICONS.sparkles;
  if (!className && !attributes) return rawSvg;
  return rawSvg.replace('<svg', `<svg class="${className}" ${attributes}`);
}

/**
 * Show a toast notification
 * @param {string} message - Display message
 * @param {'info'|'success'|'warning'|'error'} type - Toast type
 * @param {Object} [options] - Options
 * @param {string} [options.actionLabel] - Label for action button (e.g. "Undo")
 * @param {Function} [options.onAction] - Callback for action button
 * @param {number} [options.duration=4000] - Duration in ms
 */
export function showToast(message, type = 'info', options = {}) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const { actionLabel, onAction, duration = 4000 } = options;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');

  const iconName = type === 'success' ? 'checkCircle' : type === 'error' ? 'x' : type === 'warning' ? 'info' : 'sparkles';
  
  let actionBtnHtml = '';
  if (actionLabel && typeof onAction === 'function') {
    actionBtnHtml = `<button class="toast-action-btn" type="button">${escapeHtml(actionLabel)}</button>`;
  }

  toast.innerHTML = `
    <div class="toast-content">
      <span class="toast-icon">${getIconSvg(iconName)}</span>
      <span class="toast-msg">${escapeHtml(message)}</span>
    </div>
    ${actionBtnHtml}
  `;

  if (actionBtnHtml) {
    const btn = toast.querySelector('.toast-action-btn');
    btn.addEventListener('click', () => {
      onAction();
      dismissToast(toast);
    });
  }

  container.appendChild(toast);

  const timeoutId = setTimeout(() => {
    dismissToast(toast);
  }, duration);

  toast.addEventListener('mouseenter', () => clearTimeout(timeoutId));
  toast.addEventListener('mouseleave', () => {
    setTimeout(() => dismissToast(toast), 2000);
  });
}

function dismissToast(toast) {
  if (!toast || toast.classList.contains('toast-exit')) return;
  toast.classList.add('toast-exit');
  setTimeout(() => {
    toast.remove();
  }, 250);
}

/**
 * Accessible Modal Controller
 */
let activeModalCloseHandler = null;

export function openModal(title, contentElementOrHtml, options = {}) {
  const backdrop = document.getElementById('modal-backdrop');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');

  if (!backdrop || !modalTitle || !modalBody) return;

  modalTitle.textContent = title;

  if (typeof contentElementOrHtml === 'string') {
    modalBody.innerHTML = contentElementOrHtml;
  } else if (contentElementOrHtml instanceof HTMLElement) {
    modalBody.innerHTML = '';
    modalBody.appendChild(contentElementOrHtml);
  }

  if (modalFooter) {
    if (options.footerHtml) {
      modalFooter.innerHTML = options.footerHtml;
      modalFooter.style.display = 'flex';
    } else {
      modalFooter.innerHTML = '';
      modalFooter.style.display = 'none';
    }
  }

  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');

  // Focus trap and escape handling
  const closeBtn = document.getElementById('modal-close-btn');
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  };

  if (activeModalCloseHandler) {
    window.removeEventListener('keydown', activeModalCloseHandler);
  }
  activeModalCloseHandler = handleKeyDown;
  window.addEventListener('keydown', handleKeyDown);

  const onOverlayClick = (e) => {
    if (e.target === backdrop) closeModal();
  };
  backdrop.onclick = onOverlayClick;

  if (closeBtn) {
    closeBtn.onclick = () => closeModal();
  }

  // Focus first input or close button
  setTimeout(() => {
    const focusable = modalBody.querySelector('input, select, textarea, button');
    if (focusable) focusable.focus();
    else if (closeBtn) closeBtn.focus();
  }, 50);

  if (options.onOpen) options.onOpen(modalBody);
}

export function closeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (!backdrop) return;
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden', 'true');
  if (activeModalCloseHandler) {
    window.removeEventListener('keydown', activeModalCloseHandler);
    activeModalCloseHandler = null;
  }
}

/**
 * Two-step confirmation dialog
 */
export function confirmDialog({ title = 'Confirm Action', message, confirmText = 'Confirm', cancelText = 'Cancel', isDanger = false }) {
  return new Promise((resolve) => {
    const content = document.createElement('div');
    content.innerHTML = `<p style="font-size: var(--text-base); color: var(--text-secondary); line-height: 1.5;">${escapeHtml(message)}</p>`;

    const footer = `
      <button class="btn btn-secondary" id="confirm-cancel-btn">${escapeHtml(cancelText)}</button>
      <button class="btn ${isDanger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok-btn">${escapeHtml(confirmText)}</button>
    `;

    openModal(title, content, {
      footerHtml: footer,
      onOpen: () => {
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        okBtn?.addEventListener('click', () => {
          closeModal();
          resolve(true);
        });
        cancelBtn?.addEventListener('click', () => {
          closeModal();
          resolve(false);
        });
      }
    });
  });
}

/**
 * Format local calendar date YYYY-MM-DD
 */
export function formatDate(dateStr, format = 'YYYY-MM-DD') {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;

  const dateObj = new Date(y, m - 1, d);
  const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthNamesFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (format === 'MMM D, YYYY') {
    return `${monthNamesShort[m - 1]} ${d}, ${y}`;
  }
  if (format === 'MMMM D, YYYY') {
    return `${monthNamesFull[m - 1]} ${d}, ${y}`;
  }
  if (format === 'ddd, MMM D') {
    return `${dayNamesShort[dateObj.getDay()]}, ${monthNamesShort[m - 1]} ${d}`;
  }
  if (format === 'DD/MM/YYYY') {
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }
  return dateStr;
}

/**
 * Format minutes into hours and minutes
 * e.g. 120 -> "2h 0m", 45 -> "45m", 75 -> "1h 15m"
 */
export function formatDuration(minutes) {
  const m = Math.round(Number(minutes) || 0);
  if (m < 60) return `${m}m`;
  const hrs = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

/**
 * Format number with localized separators
 */
export function formatNumber(num, locale = 'en-US') {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return new Intl.NumberFormat(locale).format(num);
}

/**
 * HTML escaper helper
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
