import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import Chart from 'chart.js/auto';
import { apiFetch, socketOptions } from './api.js';
import BuscadorFlotante from './BuscadorFlotante.jsx';
import { identificador, normalizarEntrada } from './normalizacion.js';
import usePageMeta from './usePageMeta';
import useDialog from './useDialog';

const WARNING = 70;
const CRITICAL = 85;
const MAX_POINTS = 1000;
const CHART_POINTS = 40;

const value = (m, camel, snake) => Number(m?.[camel] ?? m?.[snake] ?? 0);
const idOf = (m) => m?.deviceId ?? m?.device_id;
const timeOf = (m) => m?.recordedAt ?? m?.recorded_at;
const nombreEquipo = (d) => identificador(d?.hostname || d?.device_id) || 'equipo';

function Bar({ value: v, label = 'Uso' }) {
  const level = v >= CRITICAL ? 'critical' : v >= WARNING ? 'warning' : '';
  return (
    <div
      className="bar"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Number(v.toFixed(1))}
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div className={`bar-fill ${level}`} style={{ width: `${Math.max(0, Math.min(v, 100))}%` }} />
      <span>{v.toFixed(1)}%</span>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = Number(bytes);
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(1)} ${units[i]}`;
}

function usageLabel(total, percent) {
  const used = (Number(total) || 0) * (Number(percent) || 0) / 100;
  return `${formatBytes(used)} de ${formatBytes(total)}`;
}

function tiempoSinLectura(segundos) {
  const total = Number(segundos);
  if (!Number.isFinite(total)) return '—';
  const n = Math.max(0, Math.floor(total));
  if (n < 60) return `hace ${n} s`;
  if (n < 3600) return `hace ${Math.floor(n / 60)} min`;
  return `hace ${Math.floor(n / 3600)} h`;
}

export default function Monitoreo() {
  usePageMeta('Monitoreo remoto', 'Agentes de Loganmex en campo: CPU, RAM, disco, IP y alertas en tiempo real.');

  const [devices, setDevices] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroAlerta, setFiltroAlerta] = useState('');
  const [detailId, setDetailId] = useState('');
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const loadDevices = useCallback(async () => {
    try {
      const res = await apiFetch('/api/devices');
      if (!res.ok) throw new Error('La API no respondió');
      setDevices(await res.json());
      setError('');
    } catch {
      setError('No se pudo consultar el estado de los agentes. Revisa que la API esté activa.');
    }
  }, []);

  const loadMetrics = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/metrics?limit=${MAX_POINTS}`);
      if (!res.ok) throw new Error('La API no respondió');
      setMetrics(await res.json());
      setError('');
    } catch {
      setError('No se pudo consultar el estado de los agentes. Revisa que la API esté activa.');
    }
  }, []);

  const recargar = useCallback(() => {
    loadDevices();
    loadMetrics();
  }, [loadDevices, loadMetrics]);

  useEffect(() => {
    loadDevices();
    loadMetrics();
    const socket = io(socketOptions());
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('server:ready', () => { setConnected(true); loadDevices(); });
    socket.on('devices:status', (list) => setDevices(list));
    socket.on('metrics:update', (metric) => {
      setMetrics((prev) => [...prev, metric].slice(-MAX_POINTS));
      loadDevices();
    });
    return () => socket.disconnect();
  }, [loadDevices, loadMetrics]);

  const latest = useMemo(() => {
    const map = new Map();
    metrics.forEach((m) => map.set(idOf(m), m));
    return map;
  }, [metrics]);

  const alerts = useMemo(() => {
    const list = [];
    devices.forEach((d) => {
      if (!d.online) {
        list.push({
          id: d.device_id,
          text: `${nombreEquipo(d)}: sin conexión (más de 20 s sin datos)`,
          level: 'critical',
        });
        return;
      }
      const m = latest.get(d.device_id);
      if (!m) return;
      [
        ['cpuUsage', 'cpu_usage', 'CPU'],
        ['memoryUsage', 'memory_usage', 'RAM'],
        ['diskUsage', 'disk_usage', 'Almacenamiento'],
      ].forEach(([camel, snake, label]) => {
        const v = value(m, camel, snake);
        if (v >= CRITICAL) {
          list.push({ id: d.device_id, text: `${nombreEquipo(d)}: ${label} al ${v.toFixed(1)}% (crítico)`, level: 'critical' });
        } else if (v >= WARNING) {
          list.push({ id: d.device_id, text: `${nombreEquipo(d)}: ${label} al ${v.toFixed(1)}% (aviso)`, level: 'warning' });
        }
      });
    });
    return list;
  }, [devices, latest]);

  const nivelPorEquipo = useMemo(() => {
    const map = new Map();
    alerts.forEach((alerta) => {
      if (!map.has(alerta.id) || alerta.level === 'critical') map.set(alerta.id, alerta.level);
    });
    return map;
  }, [alerts]);

  const filtrosActivos = Boolean(busqueda.trim() || filtroEstado || filtroAlerta);
  const dispositivosFiltrados = useMemo(() => {
    const q = normalizarEntrada(busqueda);
    return devices.filter((d) => {
      if (filtroEstado === 'online' && !d.online) return false;
      if (filtroEstado === 'offline' && d.online) return false;
      const nivel = nivelPorEquipo.get(d.device_id) || 'none';
      if (filtroAlerta === 'sin-alertas' && nivel !== 'none') return false;
      if ((filtroAlerta === 'critical' || filtroAlerta === 'warning') && nivel !== filtroAlerta) return false;
      if (!q) return true;
      return [
        d.device_id, d.hostname, d.ip_address,
        latest.get(d.device_id)?.ipAddress,
        ...(d.networkInterfaces || []).map((iface) => iface.address),
      ].some((campo) => normalizarEntrada(campo).includes(q));
    });
  }, [devices, busqueda, filtroEstado, filtroAlerta, nivelPorEquipo, latest]);

  const idsVisibles = useMemo(
    () => new Set(dispositivosFiltrados.map((d) => d.device_id)),
    [dispositivosFiltrados]
  );

  const alertasVisibles = useMemo(() => {
    if (filtroAlerta === 'sin-alertas') return [];
    return alerts.filter((alerta) => idsVisibles.has(alerta.id)
      && (filtroAlerta === 'todas' || filtroAlerta === '' || alerta.level === filtroAlerta));
  }, [alerts, idsVisibles, filtroAlerta]);

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroEstado('');
    setFiltroAlerta('');
  };

  const detailDevice = devices.find((d) => d.device_id === detailId) || null;
  const detailMetric = detailDevice ? latest.get(detailDevice.device_id) : null;
  const points = useMemo(
    () => (detailId ? metrics.filter((m) => idOf(m) === detailId).slice(-CHART_POINTS) : []),
    [metrics, detailId]
  );

  useEffect(() => {
    if (!canvasRef.current) {
      chartRef.current?.destroy();
      chartRef.current = null;
      return;
    }
    const data = {
      labels: points.map((m) => {
        const t = timeOf(m);
        return t ? new Date(t).toLocaleTimeString('es-MX', { hour12: false }) : '';
      }),
      datasets: [
        {
          label: 'CPU %',
          data: points.map((m) => value(m, 'cpuUsage', 'cpu_usage')),
          borderColor: '#129858',
          backgroundColor: 'rgba(38,205,125,.12)',
          tension: 0.35, fill: true, pointRadius: 0,
        },
        {
          label: 'RAM %',
          data: points.map((m) => value(m, 'memoryUsage', 'memory_usage')),
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124,58,237,.10)',
          tension: 0.35, fill: true, pointRadius: 0,
        },
      ],
    };
    if (chartRef.current) {
      chartRef.current.data = data;
      chartRef.current.update('none');
    } else {
      chartRef.current = new Chart(canvasRef.current, {
        type: 'line',
        data,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
            x: { ticks: { maxTicksLimit: 8 } },
          },
          plugins: { legend: { position: 'bottom' } },
        },
      });
    }
  }, [points]);

  useEffect(() => () => { chartRef.current?.destroy(); chartRef.current = null; }, []);

  const onlineCount = dispositivosFiltrados.filter((d) => d.online).length;
  const avgCpu = dispositivosFiltrados.length
    ? Math.round(dispositivosFiltrados.reduce(
      (sum, d) => sum + value(latest.get(d.device_id), 'cpuUsage', 'cpu_usage'), 0
    ) / dispositivosFiltrados.length)
    : 0;
  const criticalCount = alertasVisibles.filter((a) => a.level === 'critical').length;
  const cerrarDetalle = () => setDetailId('');
  const detailDialogRef = useDialog(cerrarDetalle, Boolean(detailDevice));
  const detailTitleId = useId();

  return (
    <main className="app con-busqueda">
      <header className="header">
        <Link className="detail-btn" to="/">Ir al panel general</Link>
      </header>

      {error && (
        <p className="alerts critical" role="alert">
          {error} <button type="button" className="detail-btn" onClick={recargar}>Reintentar</button>
        </p>
      )}

      <section className="panel filter-panel" aria-label="Filtros de agentes">
        <div className="filter-bar" role="group" aria-label="Filtros de monitoreo">
          <label>
            <span>Estado</span>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="">Todos</option>
              <option value="online">En línea</option>
              <option value="offline">Desconectado</option>
            </select>
          </label>
          <label>
            <span>Alerta</span>
            <select value={filtroAlerta} onChange={(e) => setFiltroAlerta(e.target.value)}>
              <option value="">Todas</option>
              <option value="critical">Crítica</option>
              <option value="warning">Aviso</option>
              <option value="sin-alertas">Sin alertas</option>
            </select>
          </label>
          <button type="button" className="detail-btn" onClick={limpiarFiltros} disabled={!filtrosActivos}>
            Limpiar filtros
          </button>
          <span className="filter-count">
            {dispositivosFiltrados.length} de {devices.length} agentes
          </span>
        </div>
      </section>

      <section className="cards">
        <div className="card">
          <span>Equipos registrados</span><strong>{devices.length}</strong>
          <small>{filtrosActivos ? `${dispositivosFiltrados.length} con filtros` : 'Total en la red'}</small>
        </div>
        <div className="card">
          <span>En línea</span><strong className="green">{onlineCount}</strong>
          <small>{filtrosActivos ? 'Según filtros' : 'Agentes activos'}</small>
        </div>
        <div className="card">
          <span>Alertas críticas</span><strong className="red">{criticalCount}</strong>
          <small>{filtrosActivos ? 'Según filtros' : 'Activas'}</small>
        </div>
        <div className="card">
          <span>CPU promedio</span><strong>{avgCpu}%</strong>
          <small>{filtrosActivos ? 'Según filtros' : 'De todos los agentes'}</small>
        </div>
      </section>

      <section className="layout">
        <section className="panel">
          <div className="panel-title">
            <h2>
              Equipos ({filtrosActivos ? `${dispositivosFiltrados.length} de ${devices.length}` : devices.length})
            </h2>
            <span className="hint">Abre «Ver detalle» para consultar el historial de CPU y RAM</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Equipo</th><th>IP</th><th>CPU</th><th>RAM</th><th>Disco</th><th>Última lectura</th><th>Estado</th><th>Detalle</th></tr>
              </thead>
              <tbody>
                {devices.length === 0 && (
                  <tr><td colSpan="8" className="empty">Todavía no hay agentes registrados. La tabla se actualizará cuando un agente envíe métricas.</td></tr>
                )}
                {devices.length > 0 && dispositivosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan="8" className="empty">
                      No hay agentes que coincidan con los filtros.{' '}
                      <button type="button" className="detail-btn" onClick={limpiarFiltros}>
                        Limpiar filtros
                      </button>
                    </td>
                  </tr>
                )}
                {dispositivosFiltrados.map((d) => {
                  const m = latest.get(d.device_id);
                  const memTotal = value(m, 'memoryTotal', 'memory_total');
                  const diskTotal = value(m, 'diskTotal', 'disk_total');
                  const cpuUsage = value(m, 'cpuUsage', 'cpu_usage');
                  const cpuSpeed = value(m, 'cpuSpeedGhz', 'cpu_speed_ghz');
                  const memUsage = value(m, 'memoryUsage', 'memory_usage');
                  const diskUsage = value(m, 'diskUsage', 'disk_usage');
                  return (
                    <tr key={d.device_id}>
                      <td><strong>{nombreEquipo(d)}</strong><small>{identificador(d.device_id)}</small></td>
                      <td>{d.ip_address || m?.ipAddress || '—'}</td>
                      <td>
                        <Bar value={cpuUsage} label={`CPU de ${nombreEquipo(d)}`} />
                        {cpuSpeed > 0 && <small>{cpuSpeed.toFixed(2)} GHz</small>}
                      </td>
                      <td>
                        <Bar value={memUsage} label={`RAM de ${nombreEquipo(d)}`} />
                        {memTotal > 0 && <small>{usageLabel(memTotal, memUsage)}</small>}
                      </td>
                      <td>
                        <Bar value={diskUsage} label={`Disco de ${nombreEquipo(d)}`} />
                        {diskTotal > 0 && <small>{usageLabel(diskTotal, diskUsage)}</small>}
                      </td>
                      <td>{tiempoSinLectura(d.seconds_ago)}</td>
                      <td>
                        <span className={`badge ${d.online ? 'online' : 'offline'}`}>
                          {d.online ? 'En línea' : 'Desconectado'}
                        </span>
                      </td>
                      <td><button type="button" className="detail-btn" onClick={() => setDetailId(d.device_id)}>Ver detalle</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">
            <h2>Alertas ({alertasVisibles.length})</h2>
            <span className="hint">Aviso ≥ 70% · Crítico ≥ 85% · Offline &gt; 20 s · {connected ? 'En vivo' : 'Reconectando…'}</span>
          </div>
          {alertasVisibles.length === 0 ? (
            <p className="empty">Sin alertas activas.</p>
          ) : (
            <ul className="alerts">
              {alertasVisibles.map((a, i) => <li key={`${a.id}-${i}`} className={a.level}>{a.text}</li>)}
            </ul>
          )}
        </section>
      </section>

      <BuscadorFlotante
        value={busqueda}
        onChange={setBusqueda}
        placeholder="Hostname, IP o device_id"
      />

      {detailDevice && (
        <div className="modal-backdrop" onClick={cerrarDetalle}>
          <div
            ref={detailDialogRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={detailTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="modal-close" onClick={cerrarDetalle} aria-label="Cerrar">×</button>
            <h3 id={detailTitleId}>{nombreEquipo(detailDevice)}</h3>
            <p className="modal-sub">{identificador(detailDevice.device_id)}</p>

            <div className="detail-grid">
              <span>IP principal (LAN)</span>
              <strong>{detailDevice.ip_address || '—'}</strong>
              <span>Estado</span>
              <strong>{detailDevice.online ? 'En línea' : 'Desconectado'}</strong>
              <span>Última lectura</span>
              <strong>{tiempoSinLectura(detailDevice.seconds_ago)}</strong>
            </div>

            <h4>Interfaces de red</h4>
            {(detailDevice.networkInterfaces || []).length ? (
              <ul className="interfaces">
                {detailDevice.networkInterfaces.map((iface, i) => (
                  <li key={i}>
                    <strong>{iface.name}</strong>
                    <span>{iface.address}{iface.cidr ? ` · ${iface.cidr}` : ''}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">Sin interfaces registradas.</p>
            )}

            <h4>Métricas actuales</h4>
            <div className="detail-grid">
              <span>CPU</span>
              <strong>
                {value(detailMetric, 'cpuUsage', 'cpu_usage').toFixed(1)}% @{' '}
                {value(detailMetric, 'cpuSpeedGhz', 'cpu_speed_ghz').toFixed(2)} GHz
              </strong>
              <span>RAM</span>
              <strong>{usageLabel(value(detailMetric, 'memoryTotal', 'memory_total'), value(detailMetric, 'memoryUsage', 'memory_usage'))}</strong>
              <span>Disco</span>
              <strong>{usageLabel(value(detailMetric, 'diskTotal', 'disk_total'), value(detailMetric, 'diskUsage', 'disk_usage'))}</strong>
            </div>

            <h4>Historial de CPU y RAM</h4>
            {points.length ? (
              <div className="chart-wrap">
                <canvas
                  ref={canvasRef}
                  role="img"
                  aria-label={`Gráfica de CPU y RAM de ${nombreEquipo(detailDevice)} en las últimas ${CHART_POINTS} lecturas`}
                />
              </div>
            ) : (
              <p className="chart-empty">Sin lecturas para este equipo. El agente envía datos cada 5 segundos.</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}