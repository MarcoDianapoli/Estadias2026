import { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch, clearToken, getToken, setToken } from './api.js';
import { normalizarEntrada } from './normalizacion.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let activo = true;
    if (!getToken()) {
      setLoading(false);
      return undefined;
    }

    apiFetch('/api/auth/me')
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (activo) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => { if (activo) setLoading(false); });

    return () => { activo = false; };
  }, []);

  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  async function login(nombre, pin) {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ nombre: normalizarEntrada(nombre), pin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo iniciar sesión');
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // La sesión local se cierra aunque la API no esté disponible.
    }
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
