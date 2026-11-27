import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { apiFetch } from './api.js';
import { useAuth } from './AuthContext.jsx';
import useDialog from './useDialog.js';
import usePageMeta from './usePageMeta.js';
import {
  codigo, etiqueta, normalizarCodigoSgl, normalizarEntrada,
  ESTADOS_MANTENIMIENTO, TIPOS_MANTENIMIENTO,
} from './normalizacion.js';

const ESTATUS = ESTADOS_MANTENIMIENTO;
const TIPOS = TIPOS_MANTENIMIENTO;
const META_SEMANAL = [10, 12];
const RONDAS_POR_ANIO = 3;
const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS = Array.from({ length: 5 }, (_, indice) => ANIO_ACTUAL - 2 + indice);
const CLASE_ESTATUS = {
  pendiente: 'offline',
  'en proceso': 'online',
  completado: 'online',
  cancelado: 'offline',
};

const formularioVacio = {
  actividad: '',
  codigo: '',
  tipo: 'logico',
  fecha_programada: '',
  estatus: 'pendiente',
  responsable: '',
  observaciones: '',
};

function aInputLocal(valor) {
  if (!valor) return '';
  const match = String(valor).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return match ? `${match[1]}T${match[2]}` : '';
}

function formatearFecha(valor) {
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

// Lunes de la semana de la fecha recibida, como clave YYYY-MM-DD en hora local.
function claveSemana(valor) {
  let fecha;
  if (valor instanceof Date) {
    fecha = new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
  } else {
    const match = String(valor || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return '';
    fecha = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  if (Number.isNaN(fecha.getTime())) return '';
  fecha.setDate(fecha.getDate() - ((fecha.getDay() + 6) % 7));
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

function numeroSemana(clave) {
  const [anio, mes, dia] = clave.split('-').map(Number);
  const lunes = new Date(anio, mes - 1, dia);
  const jueves = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 3);
  const anioIso = jueves.getFullYear();
  const inicio = new Date(anioIso, 0, 4);
  inicio.setDate(inicio.getDate() - ((inicio.getDay() + 6) % 7));
  const diaUtc = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return 1 + Math.round((diaUtc(jueves) - diaUtc(inicio)) / 604800000);
}

function rangoSemana(clave) {
  const [anio, mes, dia] = clave.split('-').map(Number);
  const lunes = new Date(anio, mes - 1, dia);
  const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
  const corto = (d) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  return `${corto(lunes)} – ${corto(domingo)} ${domingo.getFullYear()}`;
}

function EstadoBadge({ estatus }) {
  return (
    <span className={`badge ${CLASE_ESTATUS[estatus] || 'offline'}`}>
      {etiqueta(estatus)}
    </span>
  );
}

function TipoBadge({ tipo }) {
  return (
    <span className={`badge ${tipo === 'fisico' ? 'fisico' : 'logico'}`}>
      {etiqueta(tipo) || 'Lógico'}
    </span>
  );
}

function PlanBadge({ origen: origenFila, anio: anioPlan, ronda, semana: semanaPlan }) {
  if (origenFila !== 'anual') return <span>—</span>;
  return (
    <span>
      <strong className="code-badge">Anual {anioPlan}</strong>
      <small>Ronda {ronda} · Semana {semanaPlan}</small>
    </span>
  );
}

function PlanAnualModal({ esAdmin, guardando, onClose, onGenerar }) {
  const [form, setForm] = useState({
    anio: String(ANIO_ACTUAL),
    porSemana: '10',
    rondas: String(RONDAS_POR_ANIO),
    reemplazar: false,
  });
  const [error, setError] = useState('');
  const dialogRef = useDialog(() => { if (!guardando) onClose(); });
  const titleId = useId();

  const change = (event) => {
    const { name, type, checked, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await onGenerar({
        anio: Number(form.anio),
        porSemana: Number(form.porSemana),
        rondas: Number(form.rondas),
        reemplazar: esAdmin && form.reemplazar,
      });
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
      <div
        ref={dialogRef}
        className="modal modal-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar" disabled={guardando}>×</button>
        <h3 id={titleId}>Generar plan anual de mantenimiento</h3>
        <p className="modal-sub">
          Se toman los equipos del inventario, se reparten en rondas y se programan de lunes a viernes.
          Las rondas alternan limpieza lógica y física. Si ya existe un plan para el año, no se duplica.
        </p>

        <form className="asset-form" onSubmit={submit}>
          <label>
            Año
            <input
              autoFocus
              type="number"
              name="anio"
              value={form.anio}
              onChange={change}
              min={ANIO_ACTUAL - 1}
              max={ANIO_ACTUAL + 5}
              required
            />
          </label>
          <label>
            Equipos por semana
            <input
              type="number"
              name="porSemana"
              value={form.porSemana}
              onChange={change}
              min="1"
              max="20"
              required
            />
          </label>
          <label>
            Rondas al año
            <input
              type="number"
              name="rondas"
              value={form.rondas}
              onChange={change}
              min="1"
              max="6"
              required
            />
          </label>
          <label className="full">
            <input
              type="checkbox"
              name="reemplazar"
              checked={form.reemplazar}
              onChange={change}
              disabled={!esAdmin}
            />
            {' '}Reemplazar el plan existente de ese año (solo administrador)
          </label>

          {error && <p className="form-error full" role="alert">{error}</p>}

          <div className="modal-actions full">
            <button type="button" className="btn secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
            <button type="submit" className="btn primary" disabled={guardando}>
              {guardando ? 'Generando…' : 'Generar plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OrdenModal({ orden, guardando, setGuardando, onClose, onSaved }) {
  const [form, setForm] = useState(() => orden ? {
    actividad: orden.actividad || '',
    codigo: orden.codigo || '',
    tipo: TIPOS.includes(normalizarEntrada(orden.tipo)) ? normalizarEntrada(orden.tipo) : 'logico',
    fecha_programada: aInputLocal(orden.fecha_programada),
    estatus: ESTATUS.includes(normalizarEntrada(orden.estatus)) ? normalizarEntrada(orden.estatus) : 'pendiente',
    responsable: orden.responsable || '',
    observaciones: orden.observaciones || '',
  } : { ...formularioVacio });
  const [error, setError] = useState('');
  const dialogRef = useDialog(() => { if (!guardando) onClose(); });
  const titleId = useId();
  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function submit(event) {
    event.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const res = await apiFetch(orden ? `/api/maintenance/${orden.id}` : '/api/maintenance', {
        method: orden ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...form,
          codigo: normalizarCodigoSgl(form.codigo) || '',
          tipo: normalizarEntrada(form.tipo),
          estatus: normalizarEntrada(form.estatus),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la orden');
      onSaved(data, Boolean(orden));
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
      <div
        ref={dialogRef}
        className="modal modal-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar" disabled={guardando}>×</button>
        <h3 id={titleId}>{orden ? 'Editar orden de mantenimiento' : 'Nueva orden de mantenimiento'}</h3>
        <p className="modal-sub">
          Físico: sopleteado y limpieza con alcohol isopropílico. Lógico: limpieza de archivos temporales.
          La fecha programada se muestra en el dashboard cuando la orden está pendiente dentro de la semana actual.
        </p>

        <form className="asset-form" onSubmit={submit}>
          <label className="full">
            Actividad
            <input
              autoFocus
              name="actividad"
              value={form.actividad}
              onChange={change}
              maxLength={180}
              required
              placeholder="Ej. Revisión preventiva del equipo"
            />
          </label>
          <label>
            Código SGL
            <input
              name="codigo"
              value={form.codigo}
              onChange={change}
              maxLength={32}
              placeholder="sgl-0001 (opcional)"
            />
          </label>
          <label>
            Tipo
            <select name="tipo" value={form.tipo} onChange={change}>
              {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{etiqueta(tipo)}</option>)}
            </select>
          </label>
          <label>
            Fecha y hora programada
            <input
              type="datetime-local"
              name="fecha_programada"
              value={form.fecha_programada}
              onChange={change}
              required
            />
          </label>
          <label>
            Técnico que realizó el mantenimiento
            <input
              name="responsable"
              value={form.responsable}
              onChange={change}
              maxLength={128}
              placeholder="Nombre del técnico"
            />
          </label>
          <label>
            Estatus
            <select name="estatus" value={form.estatus} onChange={change}>
              {ESTATUS.map((estatus) => <option key={estatus} value={estatus}>{etiqueta(estatus)}</option>)}
            </select>
          </label>
          <label className="full">
            Observaciones
            <textarea
              name="observaciones"
              value={form.observaciones}
              onChange={change}
              rows={3}
              placeholder="Detalles de la actividad, hallazgos o instrucciones"
            />
          </label>

          {error && <p className="form-error full" role="alert">{error}</p>}

          <div className="modal-actions full">
            <button type="button" className="btn secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
            <button type="submit" className="btn primary" disabled={guardando}>
              {guardando ? 'Guardando…' : orden ? 'Guardar cambios' : 'Registrar orden'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Mantenimiento() {
  usePageMeta('Mantenimiento', 'Agenda de mantenimiento preventivo y correctivo por código SGL de Loganmex.');
  const { user } = useAuth();
  const esAdmin = user?.rol === 'admin';

  const semanaActual = claveSemana(new Date());
  const [semanaSeleccionada, setSemanaSeleccionada] = useState(semanaActual);
  const [origen, setOrigen] = useState('');
  const [anio, setAnio] = useState('');
  const [estatus, setEstatus] = useState('');
  const [tipo, setTipo] = useState('');
  const [mantenimientos, setMantenimientos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [procesandoId, setProcesandoId] = useState(null);
  const [error, setError] = useState('');
  const [accionError, setAccionError] = useState('');
  const [notice, setNotice] = useState('');
  const [formAbierta, setFormAbierta] = useState(null);
  const [planAbierto, setPlanAbierto] = useState(false);

  const load = useCallback(async (filtros = {}) => {
    const origenFiltro = filtros.origen ?? origen;
    const anioFiltro = filtros.anio ?? anio;

    setCargando(true);
    setError('');
    const parametros = new URLSearchParams();
    if (origenFiltro) parametros.set('origen', origenFiltro);
    if (anioFiltro) parametros.set('anio', anioFiltro);
    if (estatus) parametros.set('estatus', estatus);
    if (tipo) parametros.set('tipo', tipo);
    const query = parametros.toString();

    try {
      const res = await apiFetch(`/api/maintenance${query ? `?${query}` : ''}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los mantenimientos');
      setMantenimientos(Array.isArray(data.mantenimientos) ? data.mantenimientos : []);
    } catch (err) {
      setError(mensajeError(err));
      setMantenimientos([]);
    } finally {
      setCargando(false);
    }
  }, [origen, anio, estatus, tipo]);

  useEffect(() => { load(); }, [load]);

  async function generarPlan(datos) {
    setAccionError('');
    setGuardando(true);
    try {
      const res = await apiFetch('/api/maintenance/generar-anual', {
        method: 'POST',
        body: JSON.stringify(datos),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo generar el plan anual');

      setNotice(data.omitido
        ? data.mensaje
        : `${data.mensaje} ${(data.detalle || []).map((item) => `R${item.ronda}: semanas ${item.semanaInicio}–${item.semanaFin}`).join(' · ')}`);
      setPlanAbierto(false);

      if (!data.omitido) {
        setOrigen('anual');
        setAnio(String(data.anio));
        setSemanaSeleccionada(semanaActual);
        await load({ origen: 'anual', anio: String(data.anio) });
      }
    } catch (err) {
      setAccionError(mensajeError(err));
      throw err;
    } finally {
      setGuardando(false);
    }
  }

  const alGuardar = (data, esEdicion) => {
    const etiquetaOrden = codigo(data.codigo) || data.actividad;
    setNotice(esEdicion
      ? `${etiquetaOrden} actualizado correctamente`
      : `${etiquetaOrden} registrado correctamente`);
    setAccionError('');
    setFormAbierta(null);
    load();
  };

  async function cambiarEstatus(orden, nuevoEstatus) {
    if (normalizarEntrada(nuevoEstatus) === normalizarEntrada(orden.estatus)) return;
    setAccionError('');
    setProcesandoId(orden.id);
    const tecnico = normalizarEntrada(user?.nombre || '');
    const cambios = normalizarEntrada(nuevoEstatus) === 'completado' && tecnico
      ? { estatus: nuevoEstatus, responsable: tecnico }
      : { estatus: nuevoEstatus };
    try {
      const res = await apiFetch(`/api/maintenance/${orden.id}`, {
        method: 'PATCH',
        body: JSON.stringify(cambios),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo cambiar el estatus');
      setMantenimientos((prev) => prev.map((item) => (item.id === orden.id ? data : item)));
      setNotice(`Estatus actualizado a ${etiqueta(nuevoEstatus)}`);
    } catch (err) {
      setAccionError(mensajeError(err));
    } finally {
      setProcesandoId(null);
    }
  }

  async function eliminar(orden) {
    if (!window.confirm(`¿Eliminar la orden de mantenimiento «${orden.actividad}»?`)) return;
    setAccionError('');
    setProcesandoId(orden.id);
    try {
      const res = await apiFetch(`/api/maintenance/${orden.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar la orden');
      setMantenimientos((prev) => prev.filter((item) => item.id !== orden.id));
      setNotice('Orden de mantenimiento eliminada');
    } catch (err) {
      setAccionError(mensajeError(err));
    } finally {
      setProcesandoId(null);
    }
  }

  const semanas = useMemo(() => {
    const claves = new Set();
    mantenimientos.forEach((orden) => {
      const clave = claveSemana(orden.fecha_programada);
      if (clave) claves.add(clave);
    });
    claves.add(semanaActual);
    return Array.from(claves).sort();
  }, [mantenimientos, semanaActual]);

  const semanaActiva = semanas.includes(semanaSeleccionada) ? semanaSeleccionada : semanaActual;
  const indiceSemana = Math.max(0, semanas.indexOf(semanaActiva));
  const ordenesSemana = mantenimientos.filter(
    (orden) => claveSemana(orden.fecha_programada) === semanaActiva,
  );
  const pendientesSemana = ordenesSemana.filter(
    (orden) => normalizarEntrada(orden.estatus) === 'pendiente',
  ).length;
  const equiposSemana = new Set(ordenesSemana.map((orden) => orden.codigo).filter(Boolean)).size;
  const inicioVentana = Math.max(0, Math.min(indiceSemana - 2, semanas.length - 5));
  const semanasVisibles = semanas.slice(inicioVentana, inicioVentana + 5);

  const controlesSemanas = (
    <div className="pagination-buttons">
      <button
        type="button"
        className="page-btn"
        onClick={() => setSemanaSeleccionada(semanas[indiceSemana - 1])}
        disabled={indiceSemana === 0}
        aria-label="Semana anterior"
      >
        ‹
      </button>
      {semanasVisibles.map((clave) => {
        const numero = numeroSemana(clave);
        const anioClave = clave.slice(0, 4);
        return (
          <button
            key={clave}
            type="button"
            className={`page-btn${clave === semanaActiva ? ' active' : ''}`}
            onClick={() => setSemanaSeleccionada(clave)}
            aria-current={clave === semanaActiva ? 'page' : undefined}
            aria-label={`Semana ${numero} de ${anioClave}`}
          >
            {numero}
          </button>
        );
      })}
      <button
        type="button"
        className="page-btn"
        onClick={() => setSemanaSeleccionada(semanas[indiceSemana + 1])}
        disabled={indiceSemana === semanas.length - 1}
        aria-label="Semana siguiente"
      >
        ›
      </button>
    </div>
  );

  return (
    <main className="app">
      <header className="header">
        <div className="header-actions">
          <button className="btn secondary" onClick={() => load()} disabled={cargando || guardando}>Actualizar</button>
          <button className="btn secondary" onClick={() => setPlanAbierto(true)} disabled={cargando || guardando}>
            Generar plan anual
          </button>
          <button className="btn primary" onClick={() => setFormAbierta({ orden: null })} disabled={guardando}>
            Nueva orden
          </button>
        </div>
      </header>

      {error && (
        <p className="alerts critical" role="alert">
          {error} <button type="button" className="detail-btn" onClick={() => load()}>Reintentar</button>
        </p>
      )}
      {accionError && <p className="form-error" role="alert">{accionError}</p>}
      {notice && <p className="alerts ok" role="status">{notice}</p>}

      <section className="cards maintenance-meta" aria-label="Indicadores de la semana">
        <div className="card">
          <span>Equipos en la semana</span>
          <strong className={equiposSemana >= META_SEMANAL[0] && equiposSemana <= META_SEMANAL[1] ? 'green' : 'red'}>
            {equiposSemana}
          </strong>
          <small>Meta: {META_SEMANAL[0]}–{META_SEMANAL[1]} equipos</small>
        </div>
        <div className="card">
          <span>Pendientes</span>
          <strong className={pendientesSemana ? 'red' : 'green'}>{pendientesSemana}</strong>
          <small>Órdenes por realizar en la semana</small>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Órdenes de trabajo ({ordenesSemana.length})</h2>
          <div className="header-actions">
            <label>
              Origen
              <select value={origen} onChange={(e) => setOrigen(e.target.value)}>
                <option value="">Todos</option>
                <option value="manual">Manual</option>
                <option value="anual">Plan anual</option>
              </select>
            </label>
            <label>
              Año
              <select value={anio} onChange={(e) => setAnio(e.target.value)}>
                <option value="">Todos</option>
                {ANIOS.map((anioOption) => (
                  <option key={anioOption} value={anioOption}>{anioOption}</option>
                ))}
              </select>
            </label>
            <label>
              Estatus
              <select value={estatus} onChange={(e) => setEstatus(e.target.value)}>
                <option value="">Todos</option>
                {ESTATUS.map((estatusOption) => (
                  <option key={estatusOption} value={estatusOption}>{etiqueta(estatusOption)}</option>
                ))}
              </select>
            </label>
            <label>
              Tipo
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="">Todos</option>
                {TIPOS.map((tipoOption) => (
                  <option key={tipoOption} value={tipoOption}>{etiqueta(tipoOption)}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="pagination pagination-top">
          <span>
            Semana {numeroSemana(semanaActiva)} de {semanaActiva.slice(0, 4)} · {rangoSemana(semanaActiva)} · {ordenesSemana.length} órdenes
            {semanaActiva !== semanaActual && (
              <>
                {' · '}
                <button type="button" className="detail-btn" onClick={() => setSemanaSeleccionada(semanaActual)}>
                  Ir a la semana actual
                </button>
              </>
            )}
          </span>
          {controlesSemanas}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código SGL</th>
                <th>Actividad</th>
                <th>Tipo</th>
                <th>Fecha programada</th>
                <th>Estatus</th>
                <th>Plan</th>
                <th>Ronda / Semana</th>
                <th>Técnico</th>
                <th>Observaciones</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr><td colSpan="10" className="empty" role="status">Cargando mantenimientos…</td></tr>
              )}
              {!cargando && !ordenesSemana.length && (
                <tr>
                  <td colSpan="10" className="empty">
                    No hay órdenes en esta semana con estos filtros. Cambia de semana con las flechas o usa «Nueva orden».
                  </td>
                </tr>
              )}
              {!cargando && ordenesSemana.map((orden) => (
                <tr key={orden.id}>
                  <td><strong className="code-badge">{codigo(orden.codigo) || '—'}</strong></td>
                  <td>
                    <strong>{orden.actividad}</strong>
                  </td>
                  <td><TipoBadge tipo={orden.tipo} /></td>
                  <td>{formatearFecha(orden.fecha_programada)}</td>
                  <td>
                    <EstadoBadge estatus={orden.estatus} />
                    <select
                      value={orden.estatus}
                      onChange={(e) => cambiarEstatus(orden, e.target.value)}
                      disabled={guardando || procesandoId === orden.id}
                      aria-label={`Cambiar estatus de ${codigo(orden.codigo) || orden.actividad}`}
                    >
                      {ESTATUS.map((estatusOption) => (
                        <option key={estatusOption} value={estatusOption}>{etiqueta(estatusOption)}</option>
                      ))}
                    </select>
                  </td>
                  <td>{orden.origen === 'anual' ? 'Anual' : 'Manual'}</td>
                  <td>
                    <PlanBadge
                      origen={orden.origen}
                      anio={orden.anio_plan}
                      ronda={orden.ronda}
                      semana={orden.semana}
                    />
                  </td>
                  <td>{etiqueta(orden.responsable) || '—'}</td>
                  <td>{orden.observaciones || '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="detail-btn"
                        onClick={() => setFormAbierta({ orden })}
                        disabled={guardando || procesandoId === orden.id}
                      >
                        Editar
                      </button>
                      {esAdmin && (
                        <button
                          type="button"
                          className="detail-btn danger"
                          onClick={() => eliminar(orden)}
                          disabled={guardando || procesandoId === orden.id}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <span>Página {indiceSemana + 1} de {semanas.length} semanas</span>
          {controlesSemanas}
        </div>
      </section>

      {formAbierta && (
        <OrdenModal
          key={formAbierta.orden?.id || 'nueva'}
          orden={formAbierta.orden}
          guardando={guardando}
          setGuardando={setGuardando}
          onClose={() => setFormAbierta(null)}
          onSaved={alGuardar}
        />
      )}

      {planAbierto && (
        <PlanAnualModal
          esAdmin={esAdmin}
          guardando={guardando}
          onClose={() => setPlanAbierto(false)}
          onGenerar={generarPlan}
        />
      )}
    </main>
  );
}
