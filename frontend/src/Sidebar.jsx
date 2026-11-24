import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { etiqueta } from './normalizacion.js';

const icons = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  monitoreo: (
    <>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="M6 9h6M6 12h9" />
    </>
  ),
  inventario: (
    <>
      <path d="M4 4h16v16H4z" />
      <path d="M4 9h16M9 9v11" />
    </>
  ),
  tickets: (
    <>
      <path d="M3 8a2 2 0 0 0 0 4v5h18v-5a2 2 0 0 1 0-4V4H3z" />
      <path d="M12 4v3M12 10v2M12 16v3" strokeDasharray="2 2" />
    </>
  ),
  mantenimiento: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.1a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
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
  ayuda: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9a2.5 2.5 0 1 1 4.2 1.8c-1 .9-1.8 1.3-1.8 2.7" />
      <path d="M12 17h.01" />
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
    <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[nombre]}
    </svg>
  );
}

const links = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/monitoreo', label: 'Monitoreo', icon: 'monitoreo' },
  { to: '/inventario', label: 'Inventario QR', icon: 'inventario' },
  { to: '/tickets', label: 'Tickets', icon: 'tickets' },
  { to: '/mantenimiento', label: 'Mantenimiento', icon: 'mantenimiento' },
];

const configLinks = [
  { hash: '#cuenta', label: 'Mi cuenta', detalle: 'Datos de la sesión', icon: 'cuenta' },
  { hash: '#seguridad', label: 'Seguridad', detalle: 'Cambiar mi PIN', icon: 'seguridad' },
  { hash: '#notificaciones', label: 'Notificaciones', detalle: 'Sonido de avisos', icon: 'campana' },
  { hash: '#ayuda', label: 'Ayuda', detalle: 'Uso local y LAN', icon: 'ayuda' },
];

const ROLES = { usuario: 'Usuario', tecnico: 'Técnico', admin: 'Administrador' };

export default function Sidebar({ expandido, onToggle, abiertoMovil, onCerrarMovil }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const esUsuario = user.rol === 'usuario';
  const enlaces = esUsuario ? links.filter((link) => link.to === '/tickets') : links;
  const inicio = esUsuario ? '/tickets' : '/';

  function ir(hash) {
    onCerrarMovil();
    navigate(`/configuracion${hash}`);
  }

  async function salir() {
    onCerrarMovil();
    await logout();
    navigate('/', { replace: true });
  }

  return (
    <>
      {abiertoMovil && (
        <div className="sidebar-backdrop" onClick={onCerrarMovil} aria-hidden="true" />
      )}
      <aside
        className={`sidebar${expandido ? ' expandida' : ''}${abiertoMovil ? ' abierto-movil' : ''}`}
        aria-label="Navegación principal"
      >
        <div className="sidebar-top">
          <NavLink
            to={inicio}
            className="sidebar-brand"
            end
            title="Loganmex"
            onClick={onCerrarMovil}
          >
            <span className="brand-mark" aria-hidden="true">LM</span>
            <span className="sidebar-label brand-label">
              <strong>Loganmex</strong>
              <small>Monitoreo e inventario</small>
            </span>
          </NavLink>
        </div>

        <nav className="sidebar-nav" aria-label="Módulos">
          {enlaces.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              title={expandido ? undefined : label}
              onClick={onCerrarMovil}
            >
              <Icono nombre={icon} />
              <span className="sidebar-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div id="sidebar-config" className="sidebar-config" aria-hidden={!expandido}>
            <p className="sidebar-section-title">Cuenta y configuración</p>
            {configLinks.map(({ hash, label, detalle, icon }) => (
              <button
                key={hash}
                type="button"
                className="sidebar-link sidebar-config-link"
                tabIndex={expandido ? 0 : -1}
                onClick={() => ir(hash)}
              >
                <Icono nombre={icon} />
                <span className="sidebar-label">
                  <strong>{label}</strong>
                  <small>{detalle}</small>
                </span>
              </button>
            ))}
            {user.rol === 'admin' && (
              <button
                type="button"
                className="sidebar-link sidebar-config-link sidebar-link-admin"
                tabIndex={expandido ? 0 : -1}
                onClick={() => ir('#accesos')}
              >
                <Icono nombre="accesos" />
                <span className="sidebar-label">
                  <strong>Administración de accesos</strong>
                  <small>Cuentas y roles del sistema</small>
                </span>
              </button>
            )}
            <button
              type="button"
              className="sidebar-link sidebar-config-link"
              tabIndex={expandido ? 0 : -1}
              onClick={salir}
            >
              <Icono nombre="salir" />
              <span className="sidebar-label">
                <strong>Cerrar sesión</strong>
                <small>Salir de este dispositivo</small>
              </span>
            </button>
          </div>

          <button
            type="button"
            className="sidebar-user"
            onClick={onToggle}
            aria-expanded={expandido}
            aria-controls="sidebar-config"
            title={expandido ? 'Contraer menú' : 'Expandir cuenta y configuración'}
          >
            <span className="sidebar-label sidebar-user-label">
              <strong>{etiqueta(user.nombre)}</strong>
              <small>{ROLES[user.rol] || etiqueta(user.rol)}</small>
            </span>
            <svg className={`sidebar-chevron${expandido ? ' girado' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </aside>
    </>
  );
}
