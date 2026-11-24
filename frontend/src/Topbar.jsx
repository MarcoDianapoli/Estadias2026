import { Link, useLocation } from 'react-router-dom';
import NotificationBell from './NotificationBell.jsx';
import { useAuth } from './AuthContext.jsx';
import { etiqueta } from './normalizacion.js';

const TITULOS = {
  '/': 'Panel general',
  '/monitoreo': 'Monitoreo',
  '/inventario': 'Inventario QR',
  '/tickets': 'Tickets',
  '/mantenimiento': 'Mantenimiento',
  '/configuracion': 'Configuración',
};

const SUBTITULOS = {
  '/configuracion': 'Tu cuenta, seguridad y preferencias de la sesión local.',
};

export default function Topbar({ onAbrirSidebar }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const titulo = TITULOS[pathname] || (pathname.startsWith('/ficha') ? 'Ficha' : 'Loganmex');
  const subtitulo = SUBTITULOS[pathname];

  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar-menu"
        onClick={onAbrirSidebar}
        aria-label="Abrir menú de navegación"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <div className="topbar-titulo">
        <h1 className="topbar-title">{titulo}</h1>
        {subtitulo && <p className="topbar-subtitulo">{subtitulo}</p>}
      </div>
      <div className="topbar-actions">
        <NotificationBell />
        <Link
          className="topbar-avatar"
          to="/configuracion"
          aria-label={`Mi cuenta: ${etiqueta(user.nombre)}`}
          title="Mi configuración"
        >
          <span className="session-avatar" aria-hidden="true">
            {etiqueta(user.nombre).slice(0, 1).toUpperCase()}
          </span>
        </Link>
      </div>
    </header>
  );
}
