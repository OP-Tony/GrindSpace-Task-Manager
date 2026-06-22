// ==========================================================================
// GrindSpace Frontend Utilities (ES Module)
// ==========================================================================

export function getClientId() {
  let clientId = localStorage.getItem('grindspace_client_id');
  if (!clientId) {
    clientId = 'client_' + Math.random().toString(36).substring(2, 11);
    localStorage.setItem('grindspace_client_id', clientId);
  }
  return clientId;
}

export function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Client-ID': getClientId()
  };
}

export function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-message">${escapeHTML(message)}</span>
    <button class="toast-close" aria-label="Close message">&times;</button>
  `;

  container.appendChild(toast);

  // Trigger transition
  setTimeout(() => toast.classList.add('visible'), 10);

  const autoRemove = setTimeout(() => {
    dismissToast(toast);
  }, 4000);

  toast.querySelector('.toast-close').addEventListener('click', () => {
    clearTimeout(autoRemove);
    dismissToast(toast);
  });
}

export function dismissToast(toast) {
  toast.classList.remove('visible');
  toast.addEventListener('transitionend', () => {
    toast.remove();
  });
}
