import { NavLink } from 'react-router-dom';
import NotificationBell from './NotificationBell.jsx';
import { useAuth } from './AuthContext.jsx';

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
};

const links = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/monitoreo', label: 'Monitoreo', icon: 'monitoreo' },
  { to: '/inventario', label: 'Inventario QR', icon: 'inventario' },
  { to: '/tickets', label: 'Tickets', icon: 'tickets' },
  { to: '/mantenimiento', label: 'Mantenimiento', icon: 'mantenimiento' },
];

const ROLES = { usuario: 'Usuario', tecnico: 'Técnico', admin: 'Administrador' };

export default function Navbar() {
  const { user, logout } = useAuth();
  const esUsuario = user.rol === 'usuario';
  const enlaces = esUsuario ? links.filter((link) => link.to === '/tickets') : links;
  const inicio = esUsuario ? '/tickets' : '/';

  return (
    <nav className="navbar" aria-label="Navegación principal">
      <div className="navbar-inner">
        <NavLink to={inicio} className="navbar-brand" end>
          <span className="brand-mark">LM</span>
          <span className="brand-text">
            Loganmex
            <small>Monitoreo e inventario</small>
          </span>
        </NavLink>

        <div className="navbar-right">
          <div className="navbar-links">
            {enlaces.map(({ to, label, icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {icons[icon]}
                </svg>
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
          <NotificationBell />
          <div className="session-chip" aria-label={`Sesión de ${user.nombre}`}>
            <span className="session-avatar" aria-hidden="true">
              {user.nombre.slice(0, 1).toUpperCase()}
            </span>
            <span className="session-info">
              <strong>{user.nombre}</strong>
              <small>{ROLES[user.rol] || user.rol}</small>
            </span>
            <button type="button" className="session-logout" onClick={logout} title="Cerrar sesión">
              Salir
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
