import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Chart from 'chart.js/auto';
import { io } from 'socket.io-client';
import { apiFetch, socketOptions } from './api.js';
import { ESTADOS_MANTENIMIENTO, codigo, etiqueta } from './normalizacion.js';
import usePageMeta from './usePageMeta';

const EMPTY_LINKS = {
  unlinkedDevices: [],
  ipMismatch: [],
  codeNotFound: [],
  codeConflict: [],
  unlinkedAssets: 0,
  counts: {},
};

const EMPTY_SUMMARY = {
  devices: { total: 0, online: 0 },
  tickets: { total: 0, abiertos: 0, enProceso: 0 },
  mantenimientos: { pendientesSemana: 0, semana: null },
};

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const SERIE_VACIA = () => Array(7).fill(0);
const EMPTY_WEEKLY = {
  etiquetas: DIAS_SEMANA,
  dias: [],
  series: {
    tickets: {
      creados: SERIE_VACIA(), tomados: SERIE_VACIA(),
      resueltos: SERIE_VACIA(), cerrados: SERIE_VACIA(),
    },
    mantenimientos: {
      pendiente: SERIE_VACIA(), enProceso: SERIE_VACIA(),
      completado: SERIE_VACIA(), cancelado: SERIE_VACIA(),
    },
    agentes: {
      detectados: SERIE_VACIA(), lecturas: SERIE_VACIA(),
    },
  },
};

const GRAFICAS = [
  {
    clave: 'tickets',
    titulo: 'Tickets de la semana',
    hint: 'Altas, tomas, resoluciones y cierres por día',
    datasets: [
      { clave: 'creados', etiqueta: 'Creados', color: '#3b82f6' },
      { clave: 'tomados', etiqueta: 'Tomados', color: '#f59e0b' },
      { clave: 'resueltos', etiqueta: 'Resueltos', color: '#22c55e' },
      { clave: 'cerrados', etiqueta: 'Cerrados', color: '#94a3b8' },
    ],
  },
  {
    clave: 'mantenimientos',
    titulo: 'Mantenimientos de la semana',
    hint: 'Programados por día según su estatus',
    datasets: [
      { clave: 'pendiente', etiqueta: 'Pendientes', color: '#f59e0b' },
      { clave: 'enProceso', etiqueta: 'En proceso', color: '#3b82f6' },
      { clave: 'completado', etiqueta: 'Completados', color: '#22c55e' },
      { clave: 'cancelado', etiqueta: 'Cancelados', color: '#94a3b8' },
    ],
  },
  {
    clave: 'agentes',
    titulo: 'Agentes de la semana',
    hint: 'Equipos detectados y lecturas enviadas por día',
    datasets: [
      { clave: 'detectados', etiqueta: 'Detectados', color: '#129858' },
      { clave: 'lecturas', etiqueta: 'Lecturas', color: '#0c7a45' },
    ],
  },
];

const COLORES_ESTATUS_MANTENIMIENTO = {
  pendiente: '#f59e0b',
  'en proceso': '#3b82f6',
  completado: '#22c55e',
  cancelado: '#94a3b8',
};

function fechaCorta(valor) {
  if (!valor) return 'Sin fecha';
  const fecha = new Date(String(valor).replace(' ', 'T'));
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function countOf(links, key) {
  const fromCounts = Number(links?.counts?.[key]);
  if (Number.isFinite(fromCounts)) return fromCounts;
  return Array.isArray(links?.[key]) ? links[key].length : 0;
}

async function fetchJson(url) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`Error al consultar ${url}`);
  return res.json();
}

function WeekChart({ titulo, hint, etiquetas, valores = {}, datasets, anchoCompleto = false }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const series = Object.fromEntries(
    datasets.map((d) => [d.clave, Array.isArray(valores[d.clave]) ? valores[d.clave] : SERIE_VACIA()])
  );

  const data = useMemo(() => ({
    labels: etiquetas?.length ? etiquetas : DIAS_SEMANA,
    datasets: datasets.map((d) => ({
      label: d.etiqueta,
      data: series[d.clave],
      backgroundColor: d.color,
      borderRadius: 5,
      maxBarThickness: 22,
    })),
  }), [etiquetas, series, datasets]);

  useEffect(() => {
    if (!canvasRef.current) {
      chartRef.current?.destroy();
      chartRef.current = null;
      return;
    }
    if (chartRef.current) {
      chartRef.current.data = data;
      chartRef.current.update('none');
    } else {
      chartRef.current = new Chart(canvasRef.current, {
        type: 'bar',
        data,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0 } },
            x: { grid: { display: false } },
          },
          plugins: { legend: { position: 'bottom' } },
        },
      });
    }
  }, [data]);

  useEffect(() => () => { chartRef.current?.destroy(); chartRef.current = null; }, []);

  const aria = datasets
    .map((d) => `${d.etiqueta}: ${series[d.clave].join(', ')}`)
    .join('; ');

  return (
    <section className={`panel weekly-panel${anchoCompleto ? ' weekly-panel-full' : ''}`}>
      <div className="panel-title">
        <h2>{titulo}</h2>
        <span className="hint">{hint}</span>
      </div>
      <div className="week-totals" aria-label={`Totales de ${titulo}`}>
        {datasets.map((d) => (
          <span key={d.clave}>
            <i style={{ backgroundColor: d.color }} aria-hidden="true" />
            {d.etiqueta} <strong>{series[d.clave].reduce((sum, n) => sum + (Number(n) || 0), 0)}</strong>
          </span>
        ))}
      </div>
      <div className="chart-wrap">
        <canvas ref={canvasRef} role="img" aria-label={`${titulo}. ${aria}`}>
          {titulo}: {aria}
        </canvas>
      </div>
    </section>
  );
}

export default function Dashboard() {
  usePageMeta('Panel general', 'Resumen de agentes, tickets y mantenimientos del parque tecnológico de Loganmex.');

  const [assets, setAssets] = useState([]);
  const [links, setLinks] = useState(EMPTY_LINKS);
  const [resumen, setResumen] = useState(EMPTY_SUMMARY);
  const [weekly, setWeekly] = useState(EMPTY_WEEKLY);
  const [mantenimientosSemana, setMantenimientosSemana] = useState([]);
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(false);
  const [connected, setConnected] = useState(false);
  const actividadCanvasRef = useRef(null);
  const actividadChartRef = useRef(null);

  const loadLinks = useCallback(() => {
    fetchJson('/api/links/status').then(setLinks).catch(() => {});
  }, []);

  const loadResumen = useCallback(() => {
    fetchJson('/api/dashboard/summary').then(setResumen).catch(() => {});
  }, []);

  const loadWeekly = useCallback(() => {
    fetchJson('/api/dashboard/weekly').then(setWeekly).catch(() => {});
  }, []);

  const loadMantenimientos = useCallback(() => {
    fetchJson('/api/maintenance?semana=actual')
      .then((data) => setMantenimientosSemana(Array.isArray(data?.mantenimientos) ? data.mantenimientos : []))
      .catch(() => {});
  }, []);

  const loadHealth = useCallback(() => {
    fetchJson('/api/health')
      .then((data) => { setHealth(data); setHealthError(false); })
      .catch(() => { setHealth(null); setHealthError(true); });
  }, []);

  const load = useCallback(async () => {
    await Promise.allSettled([
      fetchJson('/api/assets').then(setAssets),
      loadLinks(),
      loadResumen(),
      loadWeekly(),
      loadMantenimientos(),
      loadHealth(),
    ]);
  }, [loadLinks, loadResumen, loadWeekly, loadMantenimientos, loadHealth]);

  useEffect(() => {
    load();
    const socket = io(socketOptions());
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('server:ready', () => { setConnected(true); load(); });
    socket.on('devices:status', loadResumen);
    socket.on('links:update', setLinks);
    socket.on('tickets:update', loadWeekly);
    socket.on('metrics:update', () => { loadResumen(); loadWeekly(); });
    const timer = setInterval(() => { loadResumen(); loadWeekly(); loadMantenimientos(); loadHealth(); }, 30000);
    return () => {
      clearInterval(timer);
      socket.disconnect();
    };
  }, [load, loadResumen, loadWeekly, loadMantenimientos, loadHealth]);

  const agentes = resumen.devices || EMPTY_SUMMARY.devices;
  const tickets = resumen.tickets || EMPTY_SUMMARY.tickets;
  const mantenimientos = resumen.mantenimientos || EMPTY_SUMMARY.mantenimientos;
  const pendingAssets = Number(links?.unlinkedAssets) || 0;

  const verificandoSistema = !health && !healthError;
  const apiOk = health !== null;
  const dbOk = Boolean(health?.db?.ok);
  const agentesActivos = Number(agentes.online) > 0;
  const estadoSistema = verificandoSistema
    ? { texto: 'Verificando', nivel: 'info' }
    : !apiOk || !dbOk
      ? { texto: 'Sin conexión', nivel: 'critical' }
      : !agentesActivos || !connected
        ? { texto: 'Atención', nivel: 'warning' }
        : { texto: 'Operativo', nivel: 'ok' };

  const issueLink = (key) => {
    const item = links?.[key]?.[0];
    if (!item) return '/inventario';
    const codeNotFoundDevices = new Set((links?.codeNotFound || []).map((c) => c.deviceId));
    const query = new URLSearchParams();
    if (key === 'ipMismatch') {
      query.set('accion', 'editar');
      query.set('codigo', item.codigo || '');
      query.set('enfoque', 'ip');
    } else if (key === 'codeNotFound') {
      query.set('accion', 'registrar');
      query.set('codigo', item.assetCode || '');
      query.set('deviceId', item.deviceId || '');
      query.set('hostname', item.hostname || '');
    } else if (key === 'unlinkedDevices') {
      if (item.assetCode && !codeNotFoundDevices.has(item.deviceId)) {
        query.set('accion', 'vincular');
        query.set('codigo', item.assetCode);
        query.set('deviceId', item.deviceId || '');
      } else {
        query.set('accion', 'registrar');
        query.set('codigo', item.assetCode || '');
        query.set('deviceId', item.deviceId || '');
        query.set('hostname', item.hostname || '');
        query.set('ipAddress', item.ipAddress || '');
      }
    }
    return query.toString() ? `/inventario?${query}` : '/inventario';
  };

  const statusItems = [
    { key: 'unlinkedDevices', label: 'Agentes sin vincular', value: countOf(links, 'unlinkedDevices'), level: 'warning' },
    { key: 'ipMismatch', label: 'IP divergente', value: countOf(links, 'ipMismatch'), level: 'critical' },
    { key: 'codeNotFound', label: 'Código SGL inexistente', value: countOf(links, 'codeNotFound'), level: 'critical' },
    { key: 'codeConflict', label: 'Código duplicado', value: countOf(links, 'codeConflict'), level: 'critical' },
    { key: 'unlinkedAssets', label: 'Inventario sin agente', value: pendingAssets, level: 'info' },
  ];

  const quickLinks = [
    { to: '/monitoreo', title: 'Monitoreo remoto', text: 'CPU, RAM, disco, IP y alertas de los agentes activos.' },
    { to: '/inventario', title: 'Inventario QR', text: 'Altas, edición, importación y exportación de equipos SGL.' },
    { to: '/tickets', title: 'Tickets', text: 'Conteo en el panel; captura y seguimiento en instalación.' },
    { to: '/mantenimiento', title: 'Mantenimiento', text: 'Pendientes de la semana; calendario en instalación.' },
  ];

  const actividadData = useMemo(() => {
    const items = mantenimientosSemana.filter((m) => m?.actividad);
    const labels = [...new Set(items.map((m) => etiqueta(m.actividad)))].sort((a, b) => a.localeCompare(b, 'es'));
    const datasets = ESTADOS_MANTENIMIENTO.map((estatus) => ({
      label: etiqueta(estatus),
      data: labels.map((actividad) => items.filter(
        (m) => etiqueta(m.actividad) === actividad && m.estatus === estatus
      ).length),
      backgroundColor: COLORES_ESTATUS_MANTENIMIENTO[estatus],
      borderRadius: 4,
      maxBarThickness: 44,
    }));
    return { labels, datasets, items };
  }, [mantenimientosSemana]);

  useEffect(() => {
    if (!actividadCanvasRef.current) {
      actividadChartRef.current?.destroy();
      actividadChartRef.current = null;
      return;
    }
    const config = {
      type: 'bar',
      data: { labels: actividadData.labels, datasets: actividadData.datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}`,
              afterBody: (tooltipItems) => {
                const punto = tooltipItems[0];
                if (!punto) return [];
                const actividad = actividadData.labels[punto.dataIndex];
                const estatus = ESTADOS_MANTENIMIENTO.find((e) => etiqueta(e) === punto.dataset.label);
                const detalles = actividadData.items.filter(
                  (m) => etiqueta(m.actividad) === actividad && m.estatus === estatus
                );
                const lineas = detalles.slice(0, 4).map((m) => [
                  codigo(m.codigo),
                  fechaCorta(m.fecha_programada),
                  etiqueta(m.tipo),
                  m.responsable ? etiqueta(m.responsable) : 'Sin responsable',
                ].join(' · '));
                if (detalles.length > 4) lineas.push(`+ ${detalles.length - 4} más`);
                return lineas;
              },
            },
          },
        },
      },
    };
    if (actividadChartRef.current) {
      actividadChartRef.current.data = config.data;
      actividadChartRef.current.options = config.options;
      actividadChartRef.current.update('none');
    } else {
      actividadChartRef.current = new Chart(actividadCanvasRef.current, config);
    }
  }, [actividadData]);

  useEffect(() => () => {
    actividadChartRef.current?.destroy();
    actividadChartRef.current = null;
  }, []);

  return (
    <div className="app dashboard-page">
      <section className="panel system-panel" aria-label="Estado del sistema">
        <div className="panel-title">
          <h2>Estado del sistema</h2>
          <span className={`system-badge ${estadoSistema.nivel}`}>{estadoSistema.texto}</span>
        </div>
        <div className="system-grid">
          <div>
            <span>API / local</span>
            <strong className={apiOk ? 'ok-text' : 'warn-text'}>
              {verificandoSistema ? 'Verificando…' : apiOk ? 'Operativa' : 'Sin respuesta'}
            </strong>
            <small> Servicio web de la app</small>
          </div>
          <div>
            <span>Base de datos</span>
            <strong className={dbOk ? 'ok-text' : 'warn-text'}>
              {verificandoSistema ? 'Verificando…' : dbOk ? 'Operativa' : 'Sin respuesta'}
            </strong>
            <small> Consulta de estado real</small>
          </div>
          <div>
            <span>Agente</span>
            <strong className={agentesActivos ? 'ok-text' : 'warn-text'}>
              {verificandoSistema ? 'Verificando…' : agentesActivos ? 'Operativo' : 'Sin agentes activos'}
            </strong>
            <small> {agentes.online} de {agentes.total} en línea</small>
          </div>
          <div>
            <span>Socket.IO</span>
            <strong className={connected ? 'ok-text' : 'warn-text'}>
              {connected ? 'Conectado' : 'Desconectado'}
            </strong>
            <small> Avisos en tiempo real</small>
          </div>
        </div>
        <p className="system-foot">
          Última verificación: {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString('es-MX') : '—'}
        </p>
      </section>

      <div className="weekly-grid">
        {GRAFICAS.map((grafica, indice) => (
          <WeekChart
            key={grafica.clave}
            titulo={grafica.titulo}
            hint={grafica.hint}
            etiquetas={weekly?.etiquetas}
            valores={weekly?.series?.[grafica.clave]}
            datasets={grafica.datasets}
            anchoCompleto={indice === GRAFICAS.length - 1}
          />
        ))}
      </div>

      <section className="panel actividad-panel">
        <div className="panel-title">
          <h2>Mantenimientos por actividad</h2>
          <span className="hint">Cursor o toque en una barra: código, fecha, tipo y responsable</span>
        </div>
        {actividadData.labels.length ? (
          <div className="chart-wrap">
            <canvas
              ref={actividadCanvasRef}
              role="img"
              aria-label={`Mantenimientos por actividad: ${actividadData.labels.map((actividad, i) => `${actividad}: ${actividadData.datasets.map((d) => `${d.label} ${d.data[i]}`).join(', ')}`).join('; ')}`}
            >
              Mantenimientos de la semana agrupados por actividad y estatus.
            </canvas>
          </div>
        ) : (
          <p className="chart-empty">Sin mantenimientos registrados en la semana.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-title"><h2>Accesos rápidos</h2></div>
        <div className="quick-grid">
          {quickLinks.map((item) => (
            <Link className="quick-card" key={item.to} to={item.to}>
              <strong>{item.title}</strong>
              <span>{item.text}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="cards">
        <div className="card">
          <span>Agentes detectados</span>
          <strong className="green">{agentes.total}</strong>
          <small>{agentes.online} en línea</small>
        </div>
        <div className="card">
          <span>Tickets</span>
          <strong>{tickets.total}</strong>
          <small>
            {tickets.abiertos} {tickets.abiertos === 1 ? 'abierto' : 'abiertos'} · {tickets.enProceso} en proceso
          </small>
        </div>
        <div className="card">
          <span>Mantenimientos pendientes esta semana</span>
          <strong className={mantenimientos.pendientesSemana ? 'red' : ''}>
            {mantenimientos.pendientesSemana}
          </strong>
          <small>
            {mantenimientos.semana
              ? `Semana del ${new Date(mantenimientos.semana.inicio.replace(' ', 'T')).toLocaleDateString('es-MX')} al ${new Date(mantenimientos.semana.fin.replace(' ', 'T')).toLocaleDateString('es-MX')}`
              : 'Sin rango disponible'}
          </small>
        </div>
        <div className="card">
          <span>Equipos en inventario</span>
          <strong>{assets.length}</strong>
          <small>Registros SGL</small>
        </div>
      </section>

      <main className="layout dashboard-layout">
        <section className="panel">
          <div className="panel-title">
            <h2>Estado de vinculación</h2>
            <span className="hint">Cada aviso lleva a su corrección</span>
          </div>
          <div className="status-list">
            {statusItems.map((item) => (
              <Link
                key={item.key}
                className={`status-item ${item.level}`}
                to={item.key === 'unlinkedAssets' ? '/inventario' : issueLink(item.key)}
              >
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>Revisar →</small>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
