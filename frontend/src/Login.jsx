import { useState } from 'react';
import { useAuth } from './AuthContext.jsx';
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
      await login(nombre.trim(), pin.trim());
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

        <div className="login-hint" role="note">
          <strong>Cuentas de arranque</strong>
          <p>Solo para poner en marcha el módulo en la LAN:</p>
          <ul>
            <li>Usuario demo · PIN 1111</li>
            <li>Técnico demo · PIN 2222</li>
            <li>Admin demo · PIN 3333</li>
          </ul>
          <small>Cámbialas desde la consola de administración.</small>
        </div>
      </div>
    </main>
  );
}
