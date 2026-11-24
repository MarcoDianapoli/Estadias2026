import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { etiqueta } from './normalizacion.js';

const ROLES = { usuario: 'Usuario', tecnico: 'Técnico', admin: 'Administrador' };

const iconos = {
  cuenta: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  seguridad: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  campana: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  accesos: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 4v6M13 7h6" />
    </>
  ),
  salir: (
    <>
      <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />
      <path d="M14 16l4-4-4-4M18 12H9" />
    </>
  ),
};

function Icono({ nombre }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconos[nombre]}
    </svg>
  );
}

export default function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
      if (event.key === 'Tab') {
        const focusables = [...panelRef.current.querySelectorAll('button, a[href]')]
          .filter((el) => !el.disabled);
        if (!focusables.length) return;
        const primero = focusables[0];
        const ultimo = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === primero) {
          event.preventDefault();
          ultimo.focus();
        } else if (!event.shiftKey && document.activeElement === ultimo) {
          event.preventDefault();
          primero.focus();
        }
      }
    };
    const onPointerDown = (event) => {
      if (
        !panelRef.current?.contains(event.target)
        && !triggerRef.current?.contains(event.target)
      ) setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  function ir(destino) {
    setOpen(false);
    navigate(destino);
  }

  async function salir() {
    setOpen(false);
    await logout();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="session-chip session-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="user-drawer"
        title="Abrir configuración de usuario"
      >
        <span className="session-avatar" aria-hidden="true">
          {etiqueta(user.nombre).slice(0, 1).toUpperCase()}
        </span>
        <span className="session-info">
          <strong>{etiqueta(user.nombre)}</strong>
          <small>{ROLES[user.rol] || etiqueta(user.rol)}</small>
        </span>
        <svg className="session-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      {open && (
        <div className="drawer-root">
          <div
            className="drawer-backdrop"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside
            ref={panelRef}
            id="user-drawer"
            className="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-drawer-title"
          >
            <div className="drawer-head">
              <div className="drawer-user">
                <span className="session-avatar" aria-hidden="true">
                  {etiqueta(user.nombre).slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <strong id="user-drawer-title">{etiqueta(user.nombre)}</strong>
                  <small>{ROLES[user.rol] || etiqueta(user.rol)}</small>
                </span>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="drawer-close"
                onClick={() => { setOpen(false); triggerRef.current?.focus(); }}
                aria-label="Cerrar menú"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <nav className="drawer-nav" aria-label="Configuración de usuario">
              <button type="button" className="drawer-link" onClick={() => ir('/configuracion#cuenta')}>
                <Icono nombre="cuenta" />
                <span><strong>Mi cuenta</strong><small>Datos de la sesión actual</small></span>
              </button>
              <button type="button" className="drawer-link" onClick={() => ir('/configuracion#seguridad')}>
                <Icono nombre="seguridad" />
                <span><strong>Seguridad</strong><small>Cambiar mi PIN</small></span>
              </button>
              <button type="button" className="drawer-link" onClick={() => ir('/configuracion#notificaciones')}>
                <Icono nombre="campana" />
                <span><strong>Notificaciones</strong><small>Sonido de avisos en vivo</small></span>
              </button>
              <button type="button" className="drawer-link" onClick={() => ir('/configuracion#sesion')}>
                <Icono nombre="salir" />
                <span><strong>Sesión</strong><small>Cerrar sesión local</small></span>
              </button>
              {user.rol === 'admin' && (
                <button type="button" className="drawer-link drawer-link-admin" onClick={() => ir('/configuracion#accesos')}>
                  <Icono nombre="accesos" />
                  <span><strong>Administración de accesos</strong><small>Cuentas y roles del sistema</small></span>
                </button>
              )}
            </nav>

            <div className="drawer-foot">
              <Link className="drawer-config-link" to="/configuracion" onClick={() => setOpen(false)}>
                Ver toda la configuración
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
