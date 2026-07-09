const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('emperator_token');
}

function setToken(token) {
  localStorage.setItem('emperator_token', token);
}

function clearToken() {
  localStorage.removeItem('emperator_token');
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Ошибка запроса (${res.status})`);
  }
  return data;
}

function requireLoginOrRedirect() {
  if (!getToken()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

function logout() {
  clearToken();
  window.location.href = '/index.html';
}
