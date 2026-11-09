const TOKEN_KEY = 'loganmex_ticket_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Todas las vistas autenticadas usan esta función: centraliza el Bearer y el 401.
export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const isForm = options.body instanceof FormData;
  if (!isForm && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(path, { ...options, headers });
  if (response.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }
  return response;
}

export function socketOptions() {
  // El handshake debe usar el mismo formato que Authorization; parseToken del
  // backend exige el prefijo Bearer para unir el socket a la sala "tickets".
  const token = getToken();
  return { auth: { token: token ? `Bearer ${token}` : '' } };
}
