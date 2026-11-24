import { useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { normalizarEntrada } from './normalizacion.js';
import usePageMeta from './usePageMeta.js';

export default function Login() {
  const { login } = useAuth();
  const [nombre, setNombre] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  usePageMeta('Acceso local', 'Acceso por usuario y PIN a la consola local de Loganmex.');

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await login(normalizarEntrada(nombre), pin.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand" aria-hidden="true">LM</div>
        <h1>Acceso local</h1>
        <p className="login-lead">
          Consola interna de Loganmex. Usa tu usuario y PIN para continuar.
        </p>

        <form onSubmit={onSubmit} className="login-form">
          <label>
            Usuario
            <input
              autoFocus
              autoComplete="username"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </label>
          <label>
            PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <button className="btn primary" type="submit" disabled={enviando}>
            {enviando ? 'Verificando…' : 'Entrar'}
          </button>
        </form>

      </div>
    </main>
  );
}
