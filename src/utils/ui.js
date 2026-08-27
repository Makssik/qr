/**
 * UI Utilities — toast notifications, modals, helpers.
 */

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration - ms
 */
export function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('leaving');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

/**
 * Show a confirmation modal.
 * @param {string} title
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function showConfirmModal(title, message) {
  return new Promise((resolve) => {
    if (document.querySelector('.modal-backdrop')) {
      resolve(false);
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <h3 class="modal-title">${title}</h3>
        <p class="modal-body">${message}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="modalCancel">Скасувати</button>
          <button class="btn btn-primary" id="modalConfirm" style="background:var(--error);">Підтвердити</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    let closed = false;
    const close = (result) => {
      if (closed) return;
      closed = true;
      backdrop.remove();
      resolve(result);
    };

    backdrop.querySelector('#modalCancel').addEventListener('click', () => close(false));
    backdrop.querySelector('#modalConfirm').addEventListener('click', () => close(true));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });
  });
}

/**
 * Format a timestamp to readable date/time string.
 * @param {string|number|Date} timestamp
 * @returns {string}
 */
export function formatDateTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Format time only.
 */
export function formatTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Debounce utility.
 */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Create an element with optional class, attributes, and innerHTML.
 */
export function el(tag, opts = {}) {
  const element = document.createElement(tag);
  if (opts.className) element.className = opts.className;
  if (opts.id) element.id = opts.id;
  if (opts.innerHTML) element.innerHTML = opts.innerHTML;
  if (opts.textContent) element.textContent = opts.textContent;
  if (opts.attrs) {
    Object.entries(opts.attrs).forEach(([k, v]) => element.setAttribute(k, v));
  }
  return element;
}
