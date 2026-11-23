import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { apiFetch, socketOptions } from './api.js';
import { useAuth } from './AuthContext.jsx';
import { alternarSonido, estaSilenciado, reproducirSonido, resumirAudio } from './sounds.js';

const EMPTY = {
  unlinkedDevices: [],
  ipMismatch: [],
  codeNotFound: [],
  codeConflict: [],
  unlinkedAssets: 0,
};
const MAX_AVISOS = 30;

function cortar(texto, max = 110) {
  const valor = String(texto ?? '');
  return valor.length > max ? `${valor.slice(0, max)}…` : valor;
}

function hora(valor) {
  const fecha = valor ? new Date(String(valor).replace(' ', 'T')) : new Date();
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export default function NotificationBell() {
  const { user } = useAuth();
  const esStaff = user?.rol !== 'usuario';
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(EMPTY);
  const [avisos, setAvisos] = useState([]);
  const [leidos, setLeidos] = useState([]);
  const [silenciado, setSilenciado] = useState(estaSilenciado);
  const wrapRef = useRef(null);
  const avisosRef = useRef([]);

  useEffect(() => {
    if (!user) return undefined;
    let timer;

    if (esStaff) {
      const load = () => {
        apiFetch('/api/links/status')
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => { if (data) setStatus(data); })
          .catch(() => {});
      };
      load();
      timer = setInterval(load, 15000);
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
      const titulo = payload.titulo || payload.codigo || 'Ticket';
      const momento = hora();

      if (payload.accion === 'creado' && esStaff) {
        push({
          key: `creado-${payload.ticketId}`,
          level: 'info',
          title: 'Nuevo ticket recibido',
          text: `${cortar(titulo)}${payload.solicitante_nombre ? ` · ${payload.solicitante_nombre}` : ''}`,
          to: '/tickets',
          action: 'Ver tickets',
          time: momento,
        }, 'nuevo');
        return;
      }

      if (payload.accion === 'tomado'
        && (payload.solicitante_usuario_id === user.id || user.rol === 'admin')) {
        push({
          key: `tomado-${payload.ticketId}`,
          level: 'success',
          title: user.rol === 'usuario' ? 'Tu ticket fue tomado' : 'Ticket tomado',
          text: `${cortar(titulo)}${payload.tecnico_nombre ? ` · ${payload.tecnico_nombre}` : ''}`,
          to: '/tickets',
          action: 'Ver ticket',
          time: momento,
        }, 'tomado');
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
        title: `Mensaje en ${payload.codigo || 'ticket'}`,
        text: `${mensaje.usuario_nombre || 'Alguien'}: ${cortar(mensaje.mensaje)}`,
        to: '/tickets',
        action: 'Abrir chat',
        time: hora(mensaje.creado_en),
      }, 'chat');
    });

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('pointerdown', resumirAudio);
      socket.disconnect();
    };
  }, [user?.id, user?.rol, esStaff]);

  useEffect(() => {
    if (open) setLeidos(avisos.map((a) => a.key));
  }, [open, avisos]);

  useEffect(() => {
    avisosRef.current = avisos;
  }, [avisos]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      wrapRef.current?.querySelector('.bell-btn')?.focus();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const params = (values) => {
    const p = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      if (value) p.set(key, String(value));
    });
    return `/inventario?${p.toString()}`;
  };
  const toRegister = (device, codigo = '') => params({
    accion: 'registrar',
    codigo,
    deviceId: device.deviceId,
    hostname: device.hostname,
    ipAddress: device.ipAddress,
  });
  const toLink = (codigo, deviceId) => params({ accion: 'vincular', codigo, deviceId });
  const toEdit = (codigo, enfoque) => params({ accion: 'editar', codigo, enfoque });
  const codeNotFoundDevices = new Set((status.codeNotFound || []).map((c) => c.deviceId));

  const alerts = [];
  if (esStaff) {
    for (const d of status.unlinkedDevices || []) {
      const existeEnInventario = d.assetCode && !codeNotFoundDevices.has(d.deviceId);
      alerts.push(existeEnInventario ? {
        key: `u-${d.deviceId}`,
        level: 'warning',
        title: 'Agente sin vincular',
        text: `${d.hostname || d.deviceId} reporta ${d.assetCode}, que ya está en el inventario. Vínculalo para completar la ficha.`,
        to: toLink(d.assetCode, d.deviceId),
        action: 'Vincular',
      } : {
        key: `u-${d.deviceId}`,
        level: 'warning',
        title: 'Equipo sin registrar ni vincular',
        text: `${d.hostname || d.deviceId} (${d.ipAddress || 'sin IP'}) está detectado, pero no tiene registro ni código SGL. Regístralo y el agente se vinculará solo.`,
        to: toRegister(d, d.assetCode || ''),
        action: 'Registrar y vincular',
      });
    }
    for (const m of status.ipMismatch || []) {
      alerts.push({
        key: `i-${m.codigo}`,
        level: 'critical',
        title: 'La dirección IP no concuerda',
        text: `${m.codigo} tiene ${m.assetIp} en el inventario, pero su agente reporta ${m.deviceIp}. Corrige la IP del registro.`,
        to: toEdit(m.codigo, 'ip'),
        action: 'Corregir IP',
      });
    }
    for (const c of status.codeNotFound || []) {
      alerts.push({
        key: `n-${c.deviceId}`,
        level: 'critical',
        title: 'Código SGL no existe',
        text: `${c.hostname || c.deviceId} reporta ${c.assetCode}, que no está registrado. Crea la ficha con ese código y se vinculará.`,
        to: toRegister(c, c.assetCode),
        action: 'Registrar y vincular',
      });
    }
    for (const c of status.codeConflict || []) {
      alerts.push({
        key: `c-${c.deviceId}`,
        level: 'critical',
        title: 'Código reportado por dos equipos',
        text: `${c.assetCode} lo envía ${c.hostname || c.deviceId}, pero ya está vinculado a ${c.linkedTo}. Revisa la ficha.`,
        to: toEdit(c.assetCode),
        action: 'Revisar ficha',
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
      });
    }
  }

  const noLeidos = avisos.filter((a) => !leidos.includes(a.key));
  const total = alerts.length + noLeidos.length;
  const todas = [...avisos, ...alerts];

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="bell-btn"
        aria-label={`Notificaciones (${total})`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {total > 0 && (
          <span className="bell-badge">{total > 9 ? '9+' : total}</span>
        )}
      </button>

      {open && (
        <div className="bell-panel" role="region" aria-label="Notificaciones">
          <div className="bell-head">
            <strong>Notificaciones</strong>
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
              <span>{total} {total === 1 ? 'aviso' : 'avisos'}</span>
            </div>
          </div>
          <div className="bell-list">
            {!todas.length && (
              <p className="bell-empty" role="status">
                {esStaff
                  ? 'Sin avisos. Los agentes están vinculados y las IP del inventario concuerdan.'
                  : 'Sin notificaciones. Los avisos de tus tickets aparecerán aquí.'}
              </p>
            )}
            {todas.map((a) => (
              <Link
                key={a.key}
                className={`bell-item ${a.level}`}
                to={a.to}
                onClick={() => setOpen(false)}
              >
                <strong>{a.title}</strong>
                <p>{a.text}</p>
                {a.time && <small className="bell-time">{a.time}</small>}
                <span className="bell-go">{a.action} →</span>
              </Link>
            ))}
          </div>
          <Link
            className="bell-link"
            to={esStaff ? '/inventario' : '/tickets'}
            onClick={() => setOpen(false)}
          >
            {esStaff ? 'Abrir inventario →' : 'Abrir tickets →'}
          </Link>
        </div>
      )}
    </div>
  );
}
