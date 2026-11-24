import { useCallback, useEffect, useId, useState } from 'react';
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
const VISITAS_POR_ANIO = 3;
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
            Responsable
            <input
              name="responsable"
              value={form.responsable}
              onChange={change}
              maxLength={128}
              placeholder="Nombre del responsable"
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

  const [semana, setSemana] = useState('todos');
  const [estatus, setEstatus] = useState('');
  const [tipo, setTipo] = useState('');
  const [equiposSemana, setEquiposSemana] = useState(0);
  const [mantenimientos, setMantenimientos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [procesandoId, setProcesandoId] = useState(null);
  const [error, setError] = useState('');
  const [accionError, setAccionError] = useState('');
  const [notice, setNotice] = useState('');
  const [formAbierta, setFormAbierta] = useState(null);

  const loadMeta = useCallback(async () => {
    try {
      const res = await apiFetch('/api/maintenance?semana=actual');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar la meta semanal');
      const items = Array.isArray(data.mantenimientos) ? data.mantenimientos : [];
      const codigos = new Set(items.map((item) => item.codigo).filter(Boolean));
      setEquiposSemana(codigos.size);
    } catch {
      setEquiposSemana(0);
    }
  }, []);

  const load = useCallback(async () => {
    setCargando(true);
    setError('');
    const parametros = new URLSearchParams();
    if (semana === 'actual') parametros.set('semana', 'actual');
    if (estatus) parametros.set('estatus', estatus);
    if (tipo) parametros.set('tipo', tipo);
    const query = parametros.toString();

    try {
      const res = await apiFetch(`/api/maintenance${query ? `?${query}` : ''}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los mantenimientos');
      setMantenimientos(Array.isArray(data.mantenimientos) ? data.mantenimientos : []);
      await loadMeta();
    } catch (err) {
      setError(mensajeError(err));
      setMantenimientos([]);
    } finally {
      setCargando(false);
    }
  }, [semana, estatus, tipo, loadMeta]);

  useEffect(() => { load(); }, [load]);

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
    try {
      const res = await apiFetch(`/api/maintenance/${orden.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ estatus: nuevoEstatus }),
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
      await loadMeta();
      setNotice('Orden de mantenimiento eliminada');
    } catch (err) {
      setAccionError(mensajeError(err));
    } finally {
      setProcesandoId(null);
    }
  }

  return (
    <main className="app">
      <header className="header">
        <div className="header-actions">
          <button className="btn secondary" onClick={load} disabled={cargando || guardando}>Actualizar</button>
          <button className="btn primary" onClick={() => setFormAbierta({ orden: null })} disabled={guardando}>
            Nueva orden
          </button>
        </div>
      </header>

      {error && (
        <p className="alerts critical" role="alert">
          {error} <button type="button" className="detail-btn" onClick={load}>Reintentar</button>
        </p>
      )}
      {accionError && <p className="form-error" role="alert">{accionError}</p>}
      {notice && <p className="alerts ok" role="status">{notice}</p>}

      <section className="cards maintenance-meta" aria-label="Meta de mantenimiento">
        <div className="card">
          <span>Equipos esta semana</span>
          <strong className={equiposSemana >= META_SEMANAL[0] && equiposSemana <= META_SEMANAL[1] ? 'green' : 'red'}>
            {equiposSemana}
          </strong>
          <small>Meta: {META_SEMANAL[0]}–{META_SEMANAL[1]} equipos</small>
        </div>
        <div className="card">
          <span>Visitas por equipo</span>
          <strong>{VISITAS_POR_ANIO}</strong>
          <small>Por año</small>
        </div>
        <div className="card">
          <span>Equipos por ronda</span>
          <strong>~{META_SEMANAL[1] * VISITAS_POR_ANIO}</strong>
          <small>{VISITAS_POR_ANIO} rondas al año</small>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Órdenes de trabajo ({mantenimientos.length})</h2>
          <div className="header-actions">
            <label>
              Periodo
              <select value={semana} onChange={(e) => setSemana(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="actual">Semana actual</option>
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

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código SGL</th>
                <th>Actividad</th>
                <th>Tipo</th>
                <th>Fecha programada</th>
                <th>Estatus</th>
                <th>Responsable</th>
                <th>Observaciones</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr><td colSpan="8" className="empty" role="status">Cargando mantenimientos…</td></tr>
              )}
              {!cargando && !mantenimientos.length && (
                <tr>
                  <td colSpan="8" className="empty">
                    No hay órdenes de mantenimiento con estos filtros. Usa «Nueva orden» para registrar una.
                  </td>
                </tr>
              )}
              {!cargando && mantenimientos.map((orden) => (
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
    </main>
  );
}
