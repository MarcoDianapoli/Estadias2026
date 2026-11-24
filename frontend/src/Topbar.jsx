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
  '/': 'Loganmex · resumen de agentes, tickets y mantenimientos',
  '/monitoreo': 'Loganmex · agentes en campo · CPU, RAM, disco y estado en tiempo real',
  '/inventario': 'Equipos SGL-0001 en adelante · códigos QR · contraseñas visibles y editables',
  '/tickets': (rol) => (rol === 'tecnico'
    ? 'Toma incidencias, da seguimiento y cierra sus atenciones.'
    : rol === 'admin'
      ? 'Supervisa incidencias, accesos y el estado general del módulo.'
      : 'Registra incidencias y consulta tus pendientes y cerrados.'),
  '/mantenimiento': 'Agenda de mantenimiento preventivo y correctivo con código SGL, responsable y estatus.',
  '/configuracion': 'Tu cuenta, seguridad y preferencias de la sesión local.',
  '/ficha': 'Loganmex · inventario electrónico',
};

export default function Topbar({ onAbrirSidebar }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const titulo = TITULOS[pathname] || (pathname.startsWith('/ficha') ? 'Ficha' : 'Loganmex');
  const descripcion = SUBTITULOS[pathname];
  const subtitulo = typeof descripcion === 'function' ? descripcion(user?.rol) : descripcion;

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
