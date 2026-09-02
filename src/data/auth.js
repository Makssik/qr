/**
 * Authentication & Session Management Module
 */

const AUTH_STORAGE_KEY = 'qr_auth_session';

/**
 * Get current session object from storage.
 * @returns {{ token: string, role: 'admin'|'scanner', expiresAt: number } | null}
 */
export function getSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || !session.token) return null;
    if (session.expiresAt && Date.now() > session.expiresAt) {
      logout();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/**
 * Get auth token string.
 */
export function getToken() {
  const session = getSession();
  return session ? session.token : null;
}

/**
 * Get user role: 'admin' | 'scanner' | null
 */
export function getRole() {
  const session = getSession();
  return session ? session.role : null;
}

/**
 * Check if user is currently logged in.
 */
export function isAuthenticated() {
  return Boolean(getToken());
}

/**
 * Check if current user has admin privileges.
 */
export function isAdmin() {
  return getRole() === 'admin';
}

/**
 * Check if current user is a scanner/controller.
 */
export function isScanner() {
  return getRole() === 'scanner';
}

/**
 * Authenticate with password (Admin) or PIN (Scanner).
 * @param {{ password?: string, pin?: string }} credentials
 * @returns {Promise<{ success: boolean, role?: string, error?: string }>}
 */
export async function login(credentials = {}) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    const data = await res.json();

    if (!res.ok) {
      return { success: false, error: data.error || 'Помилка авторизації' };
    }

    const session = {
      token: data.token,
      role: data.role,
      expiresAt: data.expiresAt
    };

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent('auth-changed', { detail: session }));

    return { success: true, role: data.role };
  } catch (err) {
    return { success: false, error: err.message || 'Не вдалося підключитися до сервера' };
  }
}

/**
 * End current session and redirect to login.
 */
export function logout() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('auth-changed', { detail: null }));
  window.location.hash = '#login';
}

/**
 * Verify active session with backend.
 */
export async function checkServerSession() {
  const token = getToken();
  if (!token) return false;

  try {
    const res = await fetch('/api/auth/check', {
      headers: { 'X-Auth-Token': token }
    });
    if (!res.ok) {
      logout();
      return false;
    }
    const data = await res.json();
    return Boolean(data.authenticated);
  } catch {
    // Offline / network issue: trust local token if not expired
    return isAuthenticated();
  }
}

/**
 * Update Admin Password or Scanner PIN.
 * @param {{ newAdminPassword?: string, newScannerPin?: string }} passwords
 */
export async function updatePasswords(passwords) {
  const token = getToken();
  if (!token) throw new Error('Потрібна авторизація');

  const res = await fetch('/api/auth/update-passwords', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': token
    },
    body: JSON.stringify(passwords)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Помилка оновлення паролів');
  }
  return data;
}

/**
 * Wrapper around fetch that automatically includes X-Auth-Token.
 */
export async function fetchWithAuth(url, options = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('X-Auth-Token', token);
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    // Session invalidated on server
    logout();
  }

  return res;
}
