import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { apiFetch, socketOptions } from './api.js';
import { useAuth } from './AuthContext.jsx';
import { codigo, etiqueta, identificador } from './normalizacion.js';
import { alternarSonido, estaSilenciado, reproducirSonido, resumirAudio } from './sounds.js';

const EMPTY = {
  unlinkedDevices: [],
  ipMismatch: [],
  codeNotFound: [],
  codeConflict: [],
  unlinkedAssets: 0,
};
const MAX_AVISOS = 30;
const LEIDAS_KEY = 'loganmex_notificaciones_leidas';

function leerLeidas() {
  try {
    const valor = JSON.parse(localStorage.getItem(LEIDAS_KEY) || '[]');
    return Array.isArray(valor) ? valor.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function guardarLeidas(keys) {
  try { localStorage.setItem(LEIDAS_KEY, JSON.stringify(keys)); } catch { /* Sin localStorage: solo esta sesión. */ }
}

function cortar(texto, max = 110) {
  const valor = String(texto ?? '');
  return valor.length > max ? `${valor.slice(0, max)}…` : valor;
}

function hora(valor) {
  const fecha = valor ? new Date(String(valor).replace(' ', 'T')) : new Date();
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function fechaISO(valor) {
  if (!valor) return new Date().toISOString();
  const fecha = new Date(String(valor).replace(' ', 'T'));
  return Number.isNaN(fecha.getTime()) ? new Date().toISOString() : fecha.toISOString();
}

function etiquetaDia(iso) {
  if (!iso) return 'Alertas de inventario';
  const fecha = new Date(iso);
  const hoy = new Date();
  if (fecha.toDateString() === hoy.toDateString()) return 'Hoy';
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (fecha.toDateString() === ayer.toDateString()) return 'Ayer';
  return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

export default function NotificationBell() {
  const { user } = useAuth();
  const esStaff = user?.rol !== 'usuario';
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(EMPTY);
  const [avisos, setAvisos] = useState([]);
  const [leidas, setLeidas] = useState(leerLeidas);
  const [cargando, setCargando] = useState(esStaff);
  const [error, setError] = useState(false);
  const [silenciado, setSilenciado] = useState(estaSilenciado);
  const bellRef = useRef(null);
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  const avisosRef = useRef([]);

  const cargarEstado = () => {
    if (!esStaff) {
      setCargando(false);
      setError(false);
      return;
    }
    setCargando(true);
    setError(false);
    apiFetch('/api/links/status')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Error al cargar'))))
      .then((data) => { setStatus(data); setCargando(false); })
      .catch(() => { setError(true); setCargando(false); });
  };

  useEffect(() => {
    if (!user) return undefined;
    let timer;

    if (esStaff) {
      cargarEstado();
      timer = setInterval(() => {
        apiFetch('/api/links/status')
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => { if (data) { setStatus(data); setError(false); } })
          .catch(() => {});
      }, 15000);
    }

    const socket = io(socketOptions());
    if (esStaff) socket.on('links:update', setStatus);

    document.addEventListener('pointerdown', resumirAudio, { once: true });

    const push = (aviso, sonido) => {
      if (!aviso || avisosRef.current.some((a) => a.key === aviso.key)) return;
      avisosRef.current = [aviso, ...avisosRef.current].slice(0, MAX_AVISOS);
      setAvisos(avisosRef.current);
      if (sonido) reproducirSonido(sonido);
    };

    socket.on('tickets:update', (payload) => {
      if (!payload?.ticketId || payload.actor?.id === user.id) return;
      const titulo = payload.titulo || codigo(payload.codigo) || 'Ticket';
      const momento = hora();

      if (payload.accion === 'creado' && esStaff) {
        push({
          key: `creado-${payload.ticketId}`,
          level: 'info',
          title: 'Nuevo ticket recibido',
          text: `${cortar(titulo)}${payload.solicitante_nombre ? ` · ${etiqueta(payload.solicitante_nombre)}` : ''}`,
          to: '/tickets',
          action: 'Ver tickets',
          time: momento,
          fecha: fechaISO(),
        }, 'nuevo');
        return;
      }

      if (payload.accion === 'tomado'
        && (payload.solicitante_usuario_id === user.id || user.rol === 'admin')) {
        push({
          key: `tomado-${payload.ticketId}`,
          level: 'success',
          title: user.rol === 'usuario' ? 'Tu ticket fue tomado' : 'Ticket tomado',
          text: `${cortar(titulo)}${payload.tecnico_nombre ? ` · ${etiqueta(payload.tecnico_nombre)}` : ''}`,
          to: '/tickets',
          action: 'Ver ticket',
          time: momento,
          fecha: fechaISO(),
        }, 'tomado');
      }

      if (payload.accion === 'estado' && payload.solicitante_usuario_id === user.id) {
        const TITULOS_ESTADO = {
          abierto: 'Tu ticket volvió a abrir',
          'en proceso': 'Tu ticket está en proceso',
          resuelto: 'Tu ticket fue resuelto',
          cerrado: 'Tu ticket fue cerrado',
        };
        push({
          key: `estado-${payload.ticketId}-${payload.estado}-${Date.now()}`,
          level: payload.estado === 'resuelto' || payload.estado === 'cerrado' ? 'success' : 'info',
          title: TITULOS_ESTADO[payload.estado] || 'Tu ticket cambió de estado',
          text: `${cortar(titulo)} · Ahora: ${etiqueta(payload.estado || 'estado actualizado')}`,
          to: '/tickets',
          action: 'Ver ticket',
          time: momento,
          fecha: fechaISO(),
        }, 'estado');
      }
    });

    socket.on('tickets:message', (payload) => {
      const mensaje = payload?.message;
      if (!mensaje || !payload?.ticketId) return;
      const autor = Number(mensaje.usuario_id ?? payload.actor?.id);
      if (autor === user.id) return;
      const participante = [payload.solicitante_usuario_id, payload.tecnico_usuario_id]
        .some((id) => Number(id) === user.id);
      if (!participante && user.rol !== 'admin') return;

      push({
        key: `mensaje-${mensaje.id || `${payload.ticketId}-${mensaje.creado_en}`}`,
        level: 'chat',
        title: `Mensaje en ${codigo(payload.codigo) || 'ticket'}`,
        text: `${etiqueta(mensaje.usuario_nombre) || 'Alguien'}: ${cortar(mensaje.mensaje)}`,
        to: '/tickets',
        action: 'Abrir chat',
        time: hora(mensaje.creado_en),
        fecha: fechaISO(mensaje.creado_en),
      }, 'chat');
    });

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('pointerdown', resumirAudio);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.rol, esStaff]);

  useEffect(() => { avisosRef.current = avisos; }, [avisos]);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        bellRef.current?.focus();
      }
      if (e.key === 'Tab') {
        const focusables = [...(panelRef.current?.querySelectorAll('button, a[href]') || [])];
        if (!focusables.length) return;
        const primero = focusables[0];
        const ultimo = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function marcar(keys) {
    const siguiente = [...new Set([...leidas, ...keys])];
    setLeidas(siguiente);
    guardarLeidas(siguiente);
  }

  function cerrar() {
    setOpen(false);
    bellRef.current?.focus();
  }

  const params = (values) => {
    const p = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      if (value) p.set(key, String(value));
    });
    return `/inventario?${p.toString()}`;
  };
  const toRegister = (device, codigoSgl = '') => params({
    accion: 'registrar',
    codigo: codigoSgl,
    deviceId: device.deviceId,
    hostname: device.hostname,
    ipAddress: device.ipAddress,
  });
  const toLink = (codigoSgl, deviceId) => params({ accion: 'vincular', codigo: codigoSgl, deviceId });
  const toEdit = (codigoSgl, enfoque) => params({ accion: 'editar', codigo: codigoSgl, enfoque });
  const codeNotFoundDevices = new Set((status.codeNotFound || []).map((c) => c.deviceId));

  const alerts = [];
  if (esStaff) {
    for (const d of status.unlinkedDevices || []) {
      const existeEnInventario = d.assetCode && !codeNotFoundDevices.has(d.deviceId);
      alerts.push(existeEnInventario ? {
        key: `u-${d.deviceId}`,
        level: 'warning',
        title: 'Agente sin vincular',
        text: `${identificador(d.hostname || d.deviceId)} reporta ${codigo(d.assetCode)}, que ya está en el inventario. Vínculalo para completar la ficha.`,
        to: toLink(d.assetCode, d.deviceId),
        action: 'Vincular',
        fecha: null,
      } : {
        key: `u-${d.deviceId}`,
        level: 'warning',
        title: 'Equipo sin registrar ni vincular',
        text: `${identificador(d.hostname || d.deviceId)} (${d.ipAddress || 'sin IP'}) está detectado, pero no tiene registro ni código SGL. Regístralo y el agente se vinculará solo.`,
        to: toRegister(d, d.assetCode || ''),
        action: 'Registrar y vincular',
        fecha: null,
      });
    }
    for (const m of status.ipMismatch || []) {
      alerts.push({
        key: `i-${m.codigo}`,
        level: 'critical',
        title: 'La dirección IP no concuerda',
        text: `${codigo(m.codigo)} tiene ${m.assetIp} en el inventario, pero su agente reporta ${m.deviceIp}. Corrige la IP del registro.`,
        to: toEdit(m.codigo, 'ip'),
        action: 'Corregir IP',
        fecha: null,
      });
    }
    for (const c of status.codeNotFound || []) {
      alerts.push({
        key: `n-${c.deviceId}`,
        level: 'critical',
        title: 'Código SGL no existe',
        text: `${identificador(c.hostname || c.deviceId)} reporta ${codigo(c.assetCode)}, que no está registrado. Crea la ficha con ese código y se vinculará.`,
        to: toRegister(c, c.assetCode),
        action: 'Registrar y vincular',
        fecha: null,
      });
    }
    for (const c of status.codeConflict || []) {
      alerts.push({
        key: `c-${c.deviceId}`,
        level: 'critical',
        title: 'Código reportado por dos equipos',
        text: `${codigo(c.assetCode)} lo envía ${identificador(c.hostname || c.deviceId)}, pero ya está vinculado a ${identificador(c.linkedTo)}. Revisa la ficha.`,
        to: toEdit(c.assetCode),
        action: 'Revisar ficha',
        fecha: null,
      });
    }
    if (status.unlinkedAssets) {
      alerts.push({
        key: 'inventario-sin-agente',
        level: 'info',
        title: 'Inventario pendiente',
        text: `${status.unlinkedAssets} equipos del inventario todavía no tienen agente vinculado.`,
        to: '/inventario',
        action: 'Ver inventario',
        fecha: null,
      });
    }
  }

  const todas = [...avisos, ...alerts];
  const sinLeer = todas.filter((a) => !leidas.includes(a.key));
  const conteo = sinLeer.length;
  const badge = conteo > 99 ? '99+' : conteo > 9 ? '9+' : String(conteo);
  const ariaLabel = conteo
    ? `Notificaciones, ${conteo} sin leer`
    : 'Notificaciones, sin notificaciones sin leer';

  const grupos = new Map();
  todas.forEach((aviso) => {
    const nombre = etiquetaDia(aviso.fecha);
    if (!grupos.has(nombre)) grupos.set(nombre, []);
    grupos.get(nombre).push(aviso);
  });

  return (
    <div className="bell-wrap">
      <button
        ref={bellRef}
        type="button"
        className="bell-btn"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls="panel-notificaciones"
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {conteo > 0 && <span className="bell-badge" aria-hidden="true">{badge}</span>}
      </button>

      {open && (
        <div className="bell-root">
          <div className="bell-backdrop" onClick={cerrar} aria-hidden="true" />
          <aside
            ref={panelRef}
            id="panel-notificaciones"
            className="bell-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bell-titulo"
          >
            <div className="bell-head">
              <div>
                <strong id="bell-titulo">Notificaciones</strong>
                <span className="bell-count">{conteo ? `${conteo} sin leer` : 'Todas leídas'}</span>
              </div>
              <div className="bell-head-actions">
                <button
                  type="button"
                  className="bell-sound"
                  aria-label={silenciado ? 'Activar sonido de notificaciones' : 'Silenciar notificaciones'}
                  aria-pressed={!silenciado}
                  title={silenciado ? 'Activar sonido' : 'Silenciar sonido'}
                  onClick={() => setSilenciado(alternarSonido())}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 9v6h4l5 4V5L9 9H5z" />
                    {silenciado
                      ? <path d="M17 9l4 6M21 9l-4 6" />
                      : <path d="M17 8a5 5 0 0 1 0 8" />}
                  </svg>
                </button>
                <button ref={closeRef} type="button" className="bell-close" onClick={cerrar} aria-label="Cerrar notificaciones">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="bell-actions">
              <button
                type="button"
                className="bell-action-btn"
                onClick={() => marcar(todas.map((a) => a.key))}
                disabled={!conteo}
              >
                Ver todas y marcar leídas
              </button>
              <Link className="bell-action-btn bell-action-link" to="/configuracion#notificaciones" onClick={cerrar}>
                Preferencias
              </Link>
            </div>

            <div className="bell-list">
              {cargando ? (
                <p className="bell-empty" role="status">Cargando notificaciones…</p>
              ) : error ? (
                <div className="bell-empty" role="alert">
                  <p>No se pudieron cargar las notificaciones.</p>
                  <button type="button" className="bell-action-btn" onClick={cargarEstado}>Reintentar</button>
                </div>
              ) : !todas.length ? (
                <p className="bell-empty" role="status">No tienes notificaciones</p>
              ) : (
                [...grupos.entries()].map(([nombre, items]) => (
                  <section key={nombre} className="bell-group" aria-labelledby={`grupo-${nombre.replace(/\s+/g, '-')}`}>
                    <h2 id={`grupo-${nombre.replace(/\s+/g, '-')}`} className="bell-group-title">{nombre}</h2>
                    {items.map((a) => {
                      const noLeida = !leidas.includes(a.key);
                      return (
                        <Link
                          key={a.key}
                          className={`bell-item ${a.level}${noLeida ? ' bell-item-unread' : ''}`}
                          to={a.to}
                          onClick={() => { marcar([a.key]); cerrar(); }}
                        >
                          <span className="bell-item-head">
                            <span className="bell-estado" aria-hidden="true">{noLeida ? '●' : '✓'}</span>
                            <strong>{a.title}</strong>
                          </span>
                          <span className="sr-only">{noLeida ? 'Sin leer' : 'Leída'}</span>
                          <p>{a.text}</p>
                          {a.time && <small className="bell-time">{a.time}</small>}
                          <span className="bell-go">{a.action} →</span>
                        </Link>
                      );
                    })}
                  </section>
                ))
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
