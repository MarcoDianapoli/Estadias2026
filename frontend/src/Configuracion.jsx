import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiFetch } from './api.js';
import { useAuth } from './AuthContext.jsx';
import AdminPanel from './tickets/AdminPanel.jsx';
import { etiqueta } from './normalizacion.js';
import { alternarSonido, estaSilenciado, resumirAudio } from './sounds.js';

const ROLES = { usuario: 'Usuario', tecnico: 'Técnico', admin: 'Administrador' };

function irASeccion(hash) {
  if (!hash || hash === '#') return;
  const destino = document.getElementById(hash.slice(1));
  if (destino) destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function Configuracion() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [pinActual, setPinActual] = useState('');
  const [pinNuevo, setPinNuevo] = useState('');
  const [pinConfirmar, setPinConfirmar] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [silenciado, setSilenciado] = useState(estaSilenciado);

  useEffect(() => { irASeccion(location.hash); }, [location.hash]);

  async function onSubmitPin(event) {
    event.preventDefault();
    setError('');
    setAviso('');
    if (pinNuevo.length < 4) {
      setError('El PIN nuevo debe tener al menos 4 caracteres.');
      return;
    }
    if (pinNuevo !== pinConfirmar) {
      setError('La confirmación del PIN no coincide.');
      return;
    }
    setProcesando(true);
    try {
      const res = await apiFetch('/api/auth/me/pin', {
        method: 'POST',
        body: JSON.stringify({ pinActual, pin: pinNuevo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el PIN');
      setPinActual('');
      setPinNuevo('');
      setPinConfirmar('');
      setAviso('Tu PIN se actualizó correctamente.');
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  function alternarNotificaciones() {
    const siguiente = alternarSonido();
    setSilenciado(siguiente);
    if (!siguiente) resumirAudio();
  }

  async function salir() {
    await logout();
    navigate('/', { replace: true });
  }

  return (
    <main className="app configuracion-page">
      <header className="header">
        <div>
          <h1>Configuración</h1>
          <p>Tu cuenta, seguridad y preferencias de la sesión local.</p>
        </div>
      </header>

      <div className="config-layout">
        <section id="cuenta" className="panel config-panel" aria-labelledby="config-cuenta-title">
          <div className="panel-title">
            <div>
              <h2 id="config-cuenta-title">Mi cuenta</h2>
              <p className="hint">Datos de la sesión activa.</p>
            </div>
          </div>
          <dl className="config-detalles">
            <div><dt>Usuario</dt><dd>{etiqueta(user.nombre)}</dd></div>
            <div><dt>Rol</dt><dd>{ROLES[user.rol] || etiqueta(user.rol)}</dd></div>
          </dl>
        </section>

        <section id="seguridad" className="panel config-panel" aria-labelledby="config-seguridad-title">
          <div className="panel-title">
            <div>
              <h2 id="config-seguridad-title">Seguridad</h2>
              <p className="hint">Cambia tu PIN. Se guarda como hash scrypt, nunca en texto.</p>
            </div>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {aviso && <p className="form-ok" role="status">{aviso}</p>}
          <form className="config-form" onSubmit={onSubmitPin}>
            <label>
              PIN actual
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={pinActual}
                onChange={(e) => setPinActual(e.target.value)}
                required
              />
            </label>
            <label>
              PIN nuevo
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                minLength={4}
                value={pinNuevo}
                onChange={(e) => setPinNuevo(e.target.value)}
                required
              />
            </label>
            <label>
              Confirmar PIN nuevo
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                minLength={4}
                value={pinConfirmar}
                onChange={(e) => setPinConfirmar(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="btn primary" disabled={procesando}>
              {procesando ? 'Actualizando…' : 'Actualizar PIN'}
            </button>
          </form>
        </section>

        <section id="notificaciones" className="panel config-panel" aria-labelledby="config-notificaciones-title">
          <div className="panel-title">
            <div>
              <h2 id="config-notificaciones-title">Notificaciones</h2>
              <p className="hint">Avisos en vivo de tickets y chat.</p>
            </div>
          </div>
          <div className="config-toggle-row">
            <div>
              <strong>Sonido de avisos</strong>
              <p className="hint">Reproduce un tono cuando llegan nuevos avisos.</p>
            </div>
            <button
              type="button"
              className="btn secondary config-toggle"
              onClick={alternarNotificaciones}
              aria-pressed={!silenciado}
            >
              {silenciado ? 'Activar sonido' : 'Silenciar sonido'}
            </button>
          </div>
        </section>

        <section id="sesion" className="panel config-panel" aria-labelledby="config-sesion-title">
          <div className="panel-title">
            <div>
              <h2 id="config-sesion-title">Sesión</h2>
              <p className="hint">Cierra la sesión local en este dispositivo.</p>
            </div>
          </div>
          <button type="button" className="btn secondary" onClick={salir}>Cerrar sesión</button>
        </section>

        {user.rol === 'admin' && (
          <div id="accesos" className="config-admin">
            <AdminPanel />
          </div>
        )}
      </div>
    </main>
  );
}
