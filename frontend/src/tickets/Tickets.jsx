import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { apiFetch, socketOptions } from '../api.js';
import BuscadorFlotante from '../BuscadorFlotante.jsx';
import { useAuth } from '../AuthContext.jsx';
import useDialog from '../useDialog.js';
import usePageMeta from '../usePageMeta.js';
import {
  codigo, etiqueta, normalizarCodigoSgl, normalizarEntrada,
  ESTADOS_TICKET, PRIORIDADES,
} from '../normalizacion.js';

const USER_TABS = [
  { scope: 'mios-pendientes', label: 'Pendientes', hint: 'Tus tickets abiertos, en proceso o resueltos' },
  { scope: 'mios-cerrados', label: 'Cerrados', hint: 'Tus incidencias finalizadas' },
];

const TECH_TABS = [
  { scope: 'generales', label: 'Generales', hint: 'Todos los pendientes sin tomar' },
  { scope: 'tomados', label: 'Tomados', hint: 'Los que tomaste y aún no cierras' },
  { scope: 'cerrados', label: 'Cerrados', hint: 'Atenciones finalizadas' },
  { scope: 'chat', label: 'Chat', hint: 'Tickets con conversación' },
];

const ADMIN_TABS = [
  { scope: 'all', label: 'Todos', hint: 'Control total del módulo' },
  ...TECH_TABS,
];

const ROLES = { usuario: 'Usuario', tecnico: 'Técnico', admin: 'Administrador' };

function nombre(valor, porDefecto = 'sin nombre') {
  return etiqueta(valor) || porDefecto;
}

function fecha(valor) {
  if (!valor) return '—';
  const fecha = new Date(String(valor).replace(' ', 'T'));
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return fecha.toLocaleString('es-MX', {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function mensajeError(err) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'Sin conexión con el servidor local. Revisa la red y vuelve a intentar.';
  }
  return err?.message || 'Ocurrió un error inesperado';
}

const ESTADOS = {
  abierto: { badge: 'estado-abierto', item: 'estado-item-abierto' },
  'en proceso': { badge: 'estado-proceso', item: 'estado-item-proceso' },
  resuelto: { badge: 'estado-resuelto', item: 'estado-item-resuelto' },
  cerrado: { badge: 'estado-cerrado', item: 'estado-item-cerrado' },
};

function EstadoBadge({ estado }) {
  const clase = ESTADOS[estado]?.badge || 'estado-abierto';
  return <span className={`ticket-badge ${clase}`}>{etiqueta(estado)}</span>;
}

function PrioridadBadge({ prioridad }) {
  const clase = {
    alta: 'prioridad-alta',
    media: 'prioridad-media',
    baja: 'prioridad-baja',
  }[prioridad] || 'prioridad-media';
  return <span className={`ticket-badge ${clase}`}>{etiqueta(prioridad)}</span>;
}

function NewTicketModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    titulo: '', descripcion: '', prioridad: 'media', categoria: '', codigo: '',
  });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const dialogRef = useDialog(onClose);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const res = await apiFetch('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({ ...form, codigo: normalizarCodigoSgl(form.codigo) || '' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar el ticket');
      onCreated(data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="nuevo-ticket-title">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        <h3 id="nuevo-ticket-title">Nuevo ticket</h3>
        <p className="modal-sub">Se asocia a tu usuario y queda en estatus Abierto.</p>

        <form onSubmit={onSubmit} className="asset-form">
          <label className="full">
            Título
            <input
              autoFocus
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              minLength={3}
              maxLength={180}
              required
            />
          </label>
          <label className="full">
            Descripción
            <textarea
              rows={4}
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="¿Qué falló, desde cuándo y en qué equipo?"
              maxLength={5000}
            />
          </label>
          <label>
            Prioridad
            <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}>
              {PRIORIDADES.map((valor) => <option key={valor} value={valor}>{etiqueta(valor)}</option>)}
            </select>
          </label>
          <label>
            Categoría
            <input
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              placeholder="Equipo, red, sistema…"
              maxLength={60}
            />
          </label>
          <label className="full">
            Código SGL (opcional)
            <input
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value })}
              placeholder="SGL-0001"
              maxLength={32}
            />
          </label>

          {error && <p className="form-error full" role="alert">{error}</p>}

          <div className="modal-actions full">
            <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn primary" disabled={enviando}>
              {enviando ? 'Registrando…' : 'Registrar ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Tickets() {
  const { user } = useAuth();
  const esAdmin = user.rol === 'admin';
  const esTecnico = user.rol === 'tecnico';
  const esStaff = esAdmin || esTecnico;
  const tabs = esAdmin ? ADMIN_TABS : esTecnico ? TECH_TABS : USER_TABS;

  const [scope, setScope] = useState(tabs[0].scope);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState('');
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [prioridadEdicion, setPrioridadEdicion] = useState('media');
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(true);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [detalleError, setDetalleError] = useState('');
  const [accionError, setAccionError] = useState('');
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const selectedIdRef = useRef(null);
  const ticketIgnoradoRef = useRef(null);

  usePageMeta('Tickets', 'Registro, atención y chat de incidencias de la consola local de Loganmex.');

  const loadTickets = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await apiFetch(`/api/tickets?scope=${scope}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los tickets');
      setTickets(data.tickets || []);
    } catch (err) {
      setError(mensajeError(err));
      setTickets([]);
    } finally {
      setCargando(false);
    }
  }, [scope]);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null);
      setMessages([]);
      return;
    }
    setCargandoDetalle(true);
    setDetalleError('');
    try {
      const [detalleRes, mensajesRes] = await Promise.all([
        apiFetch(`/api/tickets/${id}`),
        apiFetch(`/api/tickets/${id}/messages`),
      ]);
      const [detalleData, mensajesData] = await Promise.all([
        detalleRes.json(), mensajesRes.json(),
      ]);
      if (!detalleRes.ok) throw new Error(detalleData.error || 'No se pudo cargar el ticket');
      if (!mensajesRes.ok) throw new Error(mensajesData.error || 'No se pudo cargar el chat');
      setDetail(detalleData);
      setMessages(mensajesData);
    } catch (err) {
      setDetalleError(mensajeError(err));
      setDetail(null);
      setMessages([]);
    } finally {
      setCargandoDetalle(false);
    }
  }, []);

  const filtrosActivos = Boolean(busqueda.trim() || filtroEstado || filtroPrioridad);
  const filtrados = useMemo(() => {
    const q = normalizarEntrada(busqueda);
    return tickets.filter((ticket) => {
      if (filtroEstado && normalizarEntrada(ticket.estado) !== filtroEstado) return false;
      if (filtroPrioridad && normalizarEntrada(ticket.prioridad) !== filtroPrioridad) return false;
      if (!q) return true;
      return [
        ticket.id, ticket.titulo, ticket.descripcion, ticket.codigo,
        ticket.categoria, ticket.solicitante_nombre, ticket.tecnico_nombre,
      ].some((campo) => normalizarEntrada(campo).includes(q));
    });
  }, [tickets, busqueda, filtroEstado, filtroPrioridad]);

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroEstado('');
    setFiltroPrioridad('');
  };

  useEffect(() => { loadTickets(); }, [loadTickets]);
  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  useEffect(() => {
    setPrioridadEdicion(detail?.prioridad || 'media');
  }, [detail?.id, detail?.prioridad]);

  useEffect(() => {
    if (cargando) return;
    if (!filtrados.length) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!filtrados.some((ticket) => Number(ticket.id) === Number(selectedId))) {
      setSelectedId(Number(filtrados[0].id));
    }
  }, [filtrados, cargando, selectedId]);

  useEffect(() => {
    const onLine = () => setOnline(true);
    const offLine = () => setOnline(false);
    window.addEventListener('online', onLine);
    window.addEventListener('offline', offLine);
    return () => {
      window.removeEventListener('online', onLine);
      window.removeEventListener('offline', offLine);
    };
  }, []);

  useEffect(() => {
    if (!online) return undefined;
    const socket = io(socketOptions());
    const refrescar = (payload) => {
      loadTickets();
      // El borrado llega por socket antes de que el state local deje de apuntar al ticket.
      if (payload?.accion === 'eliminado') return;
      const id = selectedIdRef.current;
      if (id && payload?.ticketId !== ticketIgnoradoRef.current) loadDetail(id);
    };
    socket.on('tickets:update', refrescar);
    socket.on('tickets:message', (payload) => {
      const id = selectedIdRef.current;
      if (payload?.ticketId === id && payload?.ticketId !== ticketIgnoradoRef.current) loadDetail(id);
      else loadTickets();
    });
    return () => socket.disconnect();
  }, [online, loadTickets, loadDetail]);

  function seleccionarTab(nuevoScope) {
    if (nuevoScope === scope) return;
    setScope(nuevoScope);
    setTickets([]);
    setSelectedId(null);
    setAccionError('');
  }

  async function ejecutarAccion(accion, { borrarSeleccion = false } = {}) {
    setAccionError('');
    setProcesando(true);
    try {
      await accion();
      if (borrarSeleccion) {
        selectedIdRef.current = null;
        setSelectedId(null);
        // Sin esto, el efecto de autoselección recupera el ticket borrado de la lista anterior.
        setTickets([]);
        setDetail(null);
        setMessages([]);
        setDetalleError('');
        await loadTickets();
        ticketIgnoradoRef.current = null;
      } else {
        await Promise.all([
          loadTickets(),
          selectedId ? loadDetail(selectedId) : Promise.resolve(),
        ]);
      }
    } catch (err) {
      setAccionError(mensajeError(err));
    } finally {
      setProcesando(false);
    }
  }

  function tomarTicket() {
    ejecutarAccion(async () => {
      const res = await apiFetch(`/api/tickets/${selectedId}/take`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo tomar el ticket');
    });
  }

  function cambiarEstado(estado) {
    ejecutarAccion(async () => {
      const res = await apiFetch(`/api/tickets/${selectedId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ estado }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cambiar el estado');
    });
  }

  function guardarPrioridad() {
    ejecutarAccion(async () => {
      const res = await apiFetch(`/api/tickets/${selectedId}`, {
        method: 'PATCH',
        body: JSON.stringify({ prioridad: prioridadEdicion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la prioridad');
    });
  }

  function eliminarTicket() {
    if (!window.confirm(`¿Eliminar el ticket ${codigo(detail?.codigo) || selectedId}? Esta acción no se puede deshacer.`)) return;
    ticketIgnoradoRef.current = Number(selectedId);
    ejecutarAccion(async () => {
      const res = await apiFetch(`/api/tickets/${selectedId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar el ticket');
    }, { borrarSeleccion: true });
  }

  async function enviarMensaje(event) {
    event.preventDefault();
    const texto = mensaje.trim();
    if (!texto || !selectedId) return;
    setEnviandoMensaje(true);
    setAccionError('');
    try {
      const res = await apiFetch(`/api/tickets/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ mensaje: texto }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar el mensaje');
      setMensaje('');
      await Promise.all([loadDetail(selectedId), loadTickets()]);
    } catch (err) {
      setAccionError(mensajeError(err));
    } finally {
      setEnviandoMensaje(false);
    }
  }

  function alCrear(ticket) {
    setNuevoAbierto(false);
    limpiarFiltros();
    const destino = user.rol === 'usuario' ? 'mios-pendientes' : esAdmin ? 'all' : 'generales';
    setScope(destino);
    setTickets((prev) => [ticket, ...prev.filter((t) => Number(t.id) !== Number(ticket.id))]);
    setSelectedId(Number(ticket.id));
  }

  const tabActiva = tabs.find((tab) => tab.scope === scope) || tabs[0];

  return (
    <main className="app tickets-page con-busqueda">
      {!online && (
        <p className="alerts critical" role="status">
          Sin conexión con el servidor local. Los cambios se reanudan al volver la red.
        </p>
      )}

      <div className="tickets-tabs" role="tablist" aria-label="Secciones de tickets">
        {tabs.map((tab) => (
          <button
            key={tab.scope}
            id={`tab-${tab.scope}`}
            type="button"
            role="tab"
            aria-selected={scope === tab.scope}
            aria-controls="panel-tickets"
            className={`tickets-tab${scope === tab.scope ? ' active' : ''}`}
            onClick={() => seleccionarTab(tab.scope)}
          >
            <strong>{tab.label}</strong>
            <small>{tab.hint}</small>
          </button>
        ))}
      </div>

      <div
        id="panel-tickets"
        role="tabpanel"
        aria-labelledby={`tab-${scope}`}
        className="tickets-grid"
      >
        <section className="panel ticket-list-panel" aria-labelledby="lista-tickets-title">
          <div className="panel-title">
            <div>
              <h2 id="lista-tickets-title">
                {tabActiva.label} ({filtrosActivos ? `${filtrados.length} de ${tickets.length}` : tickets.length})
              </h2>
              <p className="hint">{tabActiva.hint}</p>
            </div>
            <button type="button" className="detail-btn" onClick={loadTickets} disabled={cargando}>
              Actualizar
            </button>
          </div>

          <div className="filter-bar" role="group" aria-label="Filtros de tickets">
            <label>
              <span>Estatus</span>
              <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                <option value="">Todos</option>
                {ESTADOS_TICKET.map((estado) => (
                  <option key={estado} value={estado}>{etiqueta(estado)}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Prioridad</span>
              <select value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value)}>
                <option value="">Todas</option>
                {PRIORIDADES.map((prioridad) => (
                  <option key={prioridad} value={prioridad}>{etiqueta(prioridad)}</option>
                ))}
              </select>
            </label>
            <button type="button" className="detail-btn" onClick={limpiarFiltros} disabled={!filtrosActivos}>
              Limpiar filtros
            </button>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          {cargando ? (
            <p role="status" className="ticket-loading">Cargando tickets…</p>
          ) : tickets.length === 0 ? (
            <div className="ticket-empty">
              <strong>No hay tickets en esta sección</strong>
              <p>
                {scope === 'generales'
                  ? 'Cuando registres una incidencia aparecerá aquí para que un técnico la tome.'
                  : scope === 'tomados'
                    ? 'Toma un ticket de Generales para verlo aquí.'
                    : scope === 'mios-pendientes'
                      ? 'Registra una incidencia y aparecerá aquí hasta que se cierre.'
                      : scope === 'mios-cerrados'
                        ? 'Aquí verás tus incidencias finalizadas.'
                        : 'Registra un nuevo ticket para comenzar.'}
              </p>
            </div>
          ) : filtrados.length === 0 ? (
            <div className="ticket-empty">
              <strong>No hay tickets que coincidan con los filtros</strong>
              <p>Ajusta la búsqueda, el estatus o la prioridad para volver a ver los tickets de esta sección.</p>
              <button type="button" className="detail-btn" onClick={limpiarFiltros}>
                Limpiar filtros
              </button>
            </div>
          ) : (
            <ul className="ticket-list">
              {filtrados.map((ticket) => (
                <li key={ticket.id}>
                  <button
                    type="button"
                    className={`ticket-item ${ESTADOS[ticket.estado]?.item || 'estado-item-abierto'}${Number(selectedId) === Number(ticket.id) ? ' active' : ''}`}
                    onClick={() => setSelectedId(Number(ticket.id))}
                    aria-current={Number(selectedId) === Number(ticket.id) ? 'true' : undefined}
                  >
                    <span className="ticket-item-top">
                      <strong>{ticket.titulo}</strong>
                      <EstadoBadge estado={ticket.estado} />
                    </span>
                    <span className="ticket-item-meta">
                      <code>{codigo(ticket.codigo)}</code>
                      <PrioridadBadge prioridad={ticket.prioridad} />
                      {ticket.mensajes_count > 0 && <span className="ticket-msg-count">{ticket.mensajes_count} mensajes</span>}
                    </span>
                    <span className="ticket-item-foot">
                      {ticket.solicitante_nombre ? nombre(ticket.solicitante_nombre) : 'Sin solicitante'} · {fecha(ticket.created_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel ticket-detail" aria-labelledby="ticket-detail-title">
          {detalleError && <p className="form-error" role="alert">{detalleError}</p>}
          {accionError && <p className="form-error" role="alert">{accionError}</p>}

          {cargandoDetalle && !detail ? (
            <p role="status">Cargando detalle…</p>
          ) : !detail ? (
            <div className="ticket-empty">
              <strong>Selecciona un ticket</strong>
              <p>El detalle, la bitácora y el chat aparecen aquí.</p>
            </div>
          ) : (
            <>
              <div className="ticket-detail-head">
                <div>
                  <p className="ticket-code"><code>{codigo(detail.codigo)}</code></p>
                  <h2 id="ticket-detail-title">{detail.titulo}</h2>
                  <p className="hint">Registrado por {nombre(detail.solicitante_nombre, 'sin solicitante')} · {fecha(detail.created_at)}</p>
                </div>
                <div className="ticket-detail-badges">
                  <EstadoBadge estado={detail.estado} />
                  <PrioridadBadge prioridad={detail.prioridad} />
                </div>
              </div>

              <p className="ticket-description">{detail.descripcion || 'Sin descripción.'}</p>

              <dl className="ticket-meta">
                <div><dt>Categoría</dt><dd>{etiqueta(detail.categoria) || 'General'}</dd></div>
                <div><dt>Técnico</dt><dd>{nombre(detail.tecnico_nombre, 'Sin asignar')}</dd></div>
                <div><dt>Tomado</dt><dd>{fecha(detail.tomado_en)}</dd></div>
                <div><dt>Cerrado</dt><dd>{fecha(detail.cerrado_en)}</dd></div>
              </dl>

              {esStaff && detail.estado !== 'cerrado' && (
                <div className="ticket-actions">
                  {!detail.tecnico_usuario_id && (
                    <button type="button" className="btn primary" onClick={tomarTicket} disabled={procesando}>
                      Tomar ticket
                    </button>
                  )}
                  {detail.estado !== 'resuelto' && (
                    <button type="button" className="btn secondary" onClick={() => cambiarEstado('resuelto')} disabled={procesando}>
                      Marcar resuelto
                    </button>
                  )}
                  <button type="button" className="btn secondary" onClick={() => cambiarEstado('cerrado')} disabled={procesando}>
                    Cerrar ticket
                  </button>
                </div>
              )}

              {esAdmin && (
                <div className="ticket-admin-actions">
                  <label>
                    Prioridad
                    <select value={prioridadEdicion} onChange={(e) => setPrioridadEdicion(e.target.value)}>
                      {PRIORIDADES.map((valor) => <option key={valor} value={valor}>{etiqueta(valor)}</option>)}
                    </select>
                  </label>
                  <button type="button" className="detail-btn" onClick={guardarPrioridad} disabled={procesando}>
                    Guardar
                  </button>
                  <button type="button" className="detail-btn danger" onClick={eliminarTicket} disabled={procesando}>
                    Eliminar
                  </button>
                </div>
              )}

              <div className="ticket-detail-sections">
                <section aria-labelledby="bitacora-title">
                  <h3 id="bitacora-title">Bitácora</h3>
                  {detail.eventos?.length ? (
                    <ol className="timeline">
                      {detail.eventos.map((evento) => (
                        <li key={evento.id}>
                          <strong>{etiqueta(evento.accion)}</strong>
                          <span>{evento.usuario_nombre ? ` · ${nombre(evento.usuario_nombre)}` : ''}</span>
                          <small>{evento.detalle ? `${evento.detalle} · ` : ''}{fecha(evento.creado_en)}</small>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="hint">Sin eventos registrados.</p>
                  )}
                </section>

                <section className="ticket-chat" aria-labelledby="chat-title">
                  <h3 id="chat-title">Chat</h3>
                  <div className="chat-list" role="log" aria-label="Mensajes del ticket">
                    {messages.length === 0 ? (
                      <p className="hint">Sin mensajes. Escribe el primero para coordinar la atención.</p>
                    ) : messages.map((item) => (
                      <article key={item.id} className={`chat-bubble${item.usuario_id === user.id ? ' propio' : ''}`}>
                        <header>
                          <strong>{nombre(item.usuario_nombre)}</strong>
                          <small>{ROLES[item.usuario_rol] || etiqueta(item.usuario_rol)} · {fecha(item.creado_en)}</small>
                        </header>
                        <p>{item.mensaje}</p>
                      </article>
                    ))}
                  </div>

                  {detail.estado !== 'cerrado' && (
                    <form className="chat-form" onSubmit={enviarMensaje}>
                      <label className="sr-only" htmlFor="mensaje-ticket">Mensaje</label>
                      <textarea
                        id="mensaje-ticket"
                        rows={2}
                        value={mensaje}
                        onChange={(e) => setMensaje(e.target.value)}
                        placeholder="Escribe un mensaje…"
                        maxLength={2000}
                      />
                      <button type="submit" className="btn primary" disabled={enviandoMensaje || !mensaje.trim()}>
                        {enviandoMensaje ? 'Enviando…' : 'Enviar'}
                      </button>
                    </form>
                  )}
                </section>
              </div>
            </>
          )}
        </section>
      </div>

      <BuscadorFlotante
        value={busqueda}
        onChange={setBusqueda}
        placeholder="Título, código, categoría o persona"
        conTicket
      />

      <button
        type="button"
        className="ticket-fab"
        onClick={() => setNuevoAbierto(true)}
        aria-label="Nuevo ticket"
        title="Nuevo ticket"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>Nuevo ticket</span>
      </button>

      {nuevoAbierto && <NewTicketModal onClose={() => setNuevoAbierto(false)} onCreated={alCrear} />}
    </main>
  );
}
