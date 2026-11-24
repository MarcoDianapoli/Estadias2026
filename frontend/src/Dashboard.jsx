import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { apiFetch, socketOptions } from './api.js';
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

export default function Dashboard() {
  usePageMeta('Panel general', 'Resumen de agentes, tickets y mantenimientos del parque tecnológico de Loganmex.');

  const [assets, setAssets] = useState([]);
  const [links, setLinks] = useState(EMPTY_LINKS);
  const [resumen, setResumen] = useState(EMPTY_SUMMARY);
  const [health, setHealth] = useState(null);
  const [connected, setConnected] = useState(false);

  const loadLinks = useCallback(() => {
    fetchJson('/api/links/status').then(setLinks).catch(() => {});
  }, []);

  const loadResumen = useCallback(() => {
    fetchJson('/api/dashboard/summary').then(setResumen).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    await Promise.allSettled([
      fetchJson('/api/assets').then(setAssets),
      loadLinks(),
      loadResumen(),
      fetchJson('/api/health').then(setHealth),
    ]);
  }, [loadLinks, loadResumen]);

  useEffect(() => {
    load();
    const socket = io(socketOptions());
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('server:ready', () => { setConnected(true); load(); });
    socket.on('devices:status', loadResumen);
    socket.on('links:update', setLinks);
    socket.on('metrics:update', loadResumen);
    const timer = setInterval(loadResumen, 30000);
    return () => {
      clearInterval(timer);
      socket.disconnect();
    };
  }, [load, loadResumen]);

  const agentes = resumen.devices || EMPTY_SUMMARY.devices;
  const tickets = resumen.tickets || EMPTY_SUMMARY.tickets;
  const mantenimientos = resumen.mantenimientos || EMPTY_SUMMARY.mantenimientos;
  const pendingAssets = Number(links?.unlinkedAssets) || 0;

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

  return (
    <div className="app dashboard-page">
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

        <section className="panel">
          <div className="panel-title"><h2>Estado del sistema</h2></div>
          <div className="detail-grid">
            <span>API</span>
            <strong className={health?.ok ? 'ok-text' : 'warn-text'}>
              {health?.ok ? 'Operativa' : 'Sin respuesta'}
            </strong>
            <span>Socket.IO</span>
            <strong className={connected ? 'ok-text' : 'warn-text'}>
              {connected ? 'Conectado' : 'Desconectado'}
            </strong>
            <span>Última verificación</span>
            <strong>
              {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString('es-MX') : '—'}
            </strong>
            <span>Ámbito</span>
            <strong>Uso interno · red Loganmex · credenciales visibles solo en LAN</strong>
          </div>
        </section>
      </main>
    </div>
  );
}
