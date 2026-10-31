/**
 * Exam Platform - Core Utilities (app.js)
 * Shared API Client, Toast, Modals, Loading Spinner, Auth Check
 */

// Toast notification helper
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };

  toast.innerHTML = `
    <span>${iconMap[type] || '🔔'}</span>
    <span style="flex: 1">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(15px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, duration);
}

// Global Loading Overlay
function showLoading(message = 'جاري التحميل...') {
  let overlay = document.getElementById('loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
      <div class="spinner"></div>
      <div id="loading-msg" style="font-weight: 700; color: var(--gray-700)">${message}</div>
    `;
    document.body.appendChild(overlay);
  } else {
    const msgEl = document.getElementById('loading-msg');
    if (msgEl) msgEl.textContent = message;
  }
  overlay.classList.add('active');
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

// Global Modal Helpers
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Universal API fetch client
async function api(endpoint, options = {}) {
  const url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  const defaultHeaders = {
    'Accept': 'application/json',
  };

  // If body is NOT FormData, default to application/json
  if (options.body && !(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {}),
    },
  };

  try {
    const res = await fetch(url, config);
    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'حدث خطأ في استجابة الخادم');
      }
      return data;
    } else {
      if (!res.ok) {
        throw new Error(`خطأ في الخادم (${res.status})`);
      }
      return res;
    }
  } catch (error) {
    console.error(`API Error on ${url}:`, error);
    throw error;
  }
}

// Auth Verification
async function getAuthUser() {
  try {
    const res = await api('/api/auth/me');
    return res.user;
  } catch {
    return null;
  }
}

async function requireAuth(expectedRole = null) {
  showLoading('جاري التحقق من الهوية...');
  const user = await getAuthUser();
  hideLoading();

  if (!user) {
    window.location.href = '/login.html';
    return null;
  }

  if (expectedRole && user.role !== expectedRole) {
    if (user.role === 'admin') {
      window.location.href = '/admin.html';
    } else {
      window.location.href = '/student.html';
    }
    return null;
  }

  return user;
}

async function handleLogout() {
  try {
    showLoading('جاري تسجيل الخروج...');
    await api('/api/auth/logout', { method: 'POST' });
  } catch (e) {
    console.error(e);
  } finally {
    hideLoading();
    window.location.href = '/login.html';
  }
}

// Time Formatting Helpers
function formatSecondsToHMS(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds)) return '00:00';
  totalSeconds = Math.max(0, Math.floor(totalSeconds));

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

function formatDate(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

// Sidebar Mobile Toggle Init
function initSidebarToggle() {
  const toggleBtn = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== toggleBtn) {
        sidebar.classList.remove('open');
      }
    });
  }
}
