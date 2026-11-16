import { useCallback, useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import AssetFormModal from './AssetFormModal';
import { apiFetch } from './api.js';
import { familiasText } from './families';
import usePageMeta from './usePageMeta';
import useDialog from './useDialog';

const str = (value) => {
  if (value === undefined || value === null) return '';
  const text = String(value).trim();
  return /^n\s*\/?\s*a$|^-+$|^ninguno$/i.test(text) ? '' : text;
};

const findCol = (headers, ...terms) => headers.findIndex((h) => terms.some((t) => h.includes(t)));

function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const rows = [];
  const tipos = {};
  const familias = {};

  wb.SheetNames.forEach((sheet) => {
    if (!/equipos/i.test(sheet) && !/famili/i.test(sheet)) return;
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheet], {
      header: 1, defval: '', blankrows: false,
    });
    const headerIndex = grid.findIndex((r) =>
      /^\s*(numero|n[uú]mero)\s+de\s+equipo\s*$/i.test(String(r[0] ?? '')) ||
      /^\s*(codigo|c[oó]digo)\s*$/i.test(String(r[0] ?? ''))
    );
    if (headerIndex < 0) return;

    const headers = grid[headerIndex].map((h) => String(h).trim().toLowerCase());
    const col = {
      codigo: findCol(headers, 'numero de equipo', 'número de equipo', 'codigo', 'código', 'code'),
      usuario: findCol(headers, 'usuario', 'responsable'),
      departamento: findCol(headers, 'departamento', 'ubicacion', 'ubicación'),
      ip: headers.findIndex((h) => /^(direcci[oó]n\s+)?ip$/i.test(h.trim())),
      correo: findCol(headers, 'correo', 'email'),
      vnc: findCol(headers, 'vnc'),
      password: findCol(headers, 'contraseña', 'contrasena', 'password'),
      admin: findCol(headers, 'contraseña de administrador', 'contrasena de administrador', 'admin'),
      hostname: findCol(headers, 'nombre del equipo', 'hostname'),
    };

    if (/famili/i.test(sheet)) {
      const typeCol = {
        cpu: findCol(headers, 'cpu'),
        laptop: findCol(headers, 'laptop'),
        monitor: findCol(headers, 'monitor'),
        teclado: findCol(headers, 'teclado'),
        raton: findCol(headers, 'raton', 'ratón'),
      };
      grid.slice(headerIndex + 1).forEach((r) => {
        const codigo = str(r[col.codigo]).toUpperCase();
        if (!/^SGL-\d+$/.test(codigo)) return;
        const cell = (i) => (i >= 0 ? str(r[i]).toLowerCase() : '');
        // El Excel usa 1, 2 (dos pantallas), etc. Guardamos la cantidad real.
        const cantidad = (i) => {
          const value = cell(i);
          return /^\d+$/.test(value) ? Number(value) : 0;
        };
        const detected = {
          CPU: cantidad(typeCol.cpu),
          Teclado: cantidad(typeCol.teclado),
          Ratón: cantidad(typeCol.raton),
          Monitor: cantidad(typeCol.monitor),
          Laptop: cantidad(typeCol.laptop),
        };
        const counted = Object.fromEntries(
          Object.entries(detected).filter(([, qty]) => qty > 0)
        );

        familias[codigo] = counted;
        tipos[codigo] = detected.Laptop ? 'Laptop'
          : detected.CPU ? 'Computadora'
          : detected.Monitor ? 'Monitor'
          : detected.Teclado ? 'Teclado'
          : detected.Ratón ? 'Ratón'
          : 'Equipo';
      });
      return;
    }

    grid.slice(headerIndex + 1).forEach((r) => {
      const codigo = str(r[col.codigo]).toUpperCase();
      if (!/^SGL-\d+$/.test(codigo)) return;
      rows.push({
        codigo,
        tipo: tipos[codigo] || 'Equipo',
        familias: familias[codigo] || {},
        responsable: str(r[col.usuario]),
        ubicacion: str(r[col.departamento]),
        ipAddress: str(r[col.ip]),
        correo: str(r[col.correo]),
        vnc: str(r[col.vnc]),
        password: str(r[col.password]),
        adminPassword: str(r[col.admin]),
        hostname: str(r[col.hostname]),
      });
    });
  });

  rows.forEach((r) => {
    r.tipo = tipos[r.codigo] || r.tipo || 'Equipo';
    r.familias = familias[r.codigo] || r.familias || {};
  });
  return rows;
}

function Paginacion({
  total, paginaActual, porPagina, inicio, fin, totalPaginas,
  onPagina, onPorPagina, arriba = false,
}) {
  return (
    <div className={`pagination${arriba ? ' pagination-top' : ''}`}>
      <span>
        Mostrando {total ? inicio + 1 : 0}–{fin} de {total}
      </span>
      <label>
        Filas por página
        <select value={porPagina} onChange={(e) => onPorPagina(Number(e.target.value))}>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </label>
      <div className="pagination-buttons">
        <button
          className="detail-btn"
          type="button"
          disabled={paginaActual === 1}
          onClick={() => onPagina(paginaActual - 1)}
        >
          Anterior
        </button>
        {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={`page-btn ${n === paginaActual ? 'active' : ''}`}
            aria-label={`Página ${n} de ${totalPaginas}`}
            aria-current={n === paginaActual ? 'page' : undefined}
            onClick={() => onPagina(n)}
          >
            {n}
          </button>
        ))}
        <button
          className="detail-btn"
          type="button"
          disabled={paginaActual === totalPaginas}
          onClick={() => onPagina(paginaActual + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

export default function Inventario() {
  usePageMeta('Inventario QR', 'Equipos SGL de Loganmex con código QR, credenciales y agente vinculado.');

  const [assets, setAssets] = useState([]);
  const [devices, setDevices] = useState([]);
  const [formInitial, setFormInitial] = useState(null);
  const [linkAsset, setLinkAsset] = useState(null);
  const [linkDeviceId, setLinkDeviceId] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cargando, setCargando] = useState(true);
  const [importing, setImporting] = useState(false);
  const [params, setParams] = useSearchParams();

  const clearParams = () => setParams({}, { replace: true });
  const cerrarForm = () => {
    setFormInitial(null);
    clearParams();
  };
  const cerrarLink = () => {
    setLinkAsset(null);
    clearParams();
  };
  const linkDialogRef = useDialog(cerrarLink, Boolean(linkAsset));
  const linkTitleId = useId();
  const abrirNuevo = () => {
    clearParams();
    setFormInitial({ prefill: {} });
  };
  const abrirEditar = (asset) => {
    clearParams();
    setFormInitial({ asset });
  };

  const load = useCallback(async () => {
    setCargando(true);
    try {
      const [assetsRes, devicesRes] = await Promise.all([
        apiFetch('/api/assets'),
        apiFetch('/api/devices'),
      ]);
      if (!assetsRes.ok || !devicesRes.ok) throw new Error('La API no respondió');
      setAssets(await assetsRes.json());
      setDevices(await devicesRes.json());
      setError('');
    } catch {
      setError('No se pudo cargar el inventario. Revisa que la API esté activa.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Las notificaciones abren directamente el alta, la vinculación o la edición.
  useEffect(() => {
    const accion = params.get('accion');
    if (!accion || !assets.length) return;

    if (accion === 'registrar') {
      setFormInitial({
        prefill: {
          codigo: params.get('codigo') || '',
          deviceId: params.get('deviceId') || '',
          ipAddress: params.get('ipAddress') || '',
          hostname: params.get('hostname') || '',
          familias: {},
        },
      });
    } else if (accion === 'editar') {
      const encontrado = assets.find((a) => a.codigo === params.get('codigo'));
      if (encontrado) setFormInitial({ asset: encontrado });
    } else if (accion === 'vincular') {
      const encontrado = assets.find((a) => a.codigo === params.get('codigo'));
      if (encontrado) {
        setLinkAsset(encontrado);
        setLinkDeviceId(params.get('deviceId') || encontrado.device_id || '');
      }
    } else {
      clearParams();
    }
  }, [params, assets]);

  const alGuardar = (data, esEdicion) => {
    setNotice(esEdicion
      ? `${data.codigo} actualizado correctamente`
      : `${data.codigo} registrado y QR generado`);
    cerrarForm();
    load();
  };

  const importar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setNotice('');
    setImporting(true);
    try {
      const rows = parseExcel(await file.arrayBuffer());
      if (!rows.length) throw new Error('No se encontraron filas con códigos SGL-0000');
      const res = await apiFetch('/api/assets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al importar');
      setNotice(`Importación terminada: ${data.importados} nuevos, ${data.actualizados} actualizados${data.errores.length ? ` · ${data.errores.length} errores` : ''}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const exportar = () => {
    const data = assets.map((a) => ({
      Código: a.codigo,
      Tipo: a.tipo,
      Familias: familiasText(a.familias),
      Marca: a.marca || '',
      Modelo: a.modelo || '',
      'N.º de serie': a.numero_serie || '',
      Usuario: a.responsable || '',
      Departamento: a.ubicacion || '',
      'Direccion IP': a.ip_address || '',
      Correo: a.correo || '',
      VNC: a.vnc || '',
      'nombre del equipo': a.hostname || '',
      'Agente vinculado': a.device_id || '',
      Ficha: a.fichaUrl || '',
      Registrado: a.created_at || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Equipos');
    XLSX.writeFile(wb, `inventario_loganmex_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const vincular = async (e) => {
    e.preventDefault();
    if (!linkAsset || !linkDeviceId) return;
    setError('');
    try {
      const res = await apiFetch(`/api/assets/${linkAsset.id}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: linkDeviceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al vincular');
      setNotice(`${linkAsset.codigo} vinculado al agente ${linkDeviceId}`);
      cerrarLink();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const desvincular = async (asset) => {
    setError('');
    try {
      const res = await apiFetch(`/api/assets/${asset.id}/unlink`, { method: 'POST' });
      if (!res.ok) throw new Error('Error al desvincular');
      setNotice(`${asset.codigo} desvinculado`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const eliminar = async (asset) => {
    if (!window.confirm(`¿Eliminar el equipo ${asset.codigo} del inventario?`)) return;
    try {
      const res = await apiFetch(`/api/assets/${asset.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo eliminar el equipo');
      setNotice(`${asset.codigo} eliminado`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const totalPaginas = Math.max(1, Math.ceil(assets.length / porPagina));
  const paginaActual = Math.min(pagina, totalPaginas);
  const inicio = (paginaActual - 1) * porPagina;
  const visibles = assets.slice(inicio, inicio + porPagina);
  const fin = Math.min(inicio + porPagina, assets.length);
  const cambiarPorPagina = (valor) => {
    setPorPagina(valor);
    setPagina(1);
  };

  return (
    <main className="app">
      <header className="header">
        <div>
          <h1>Inventario electrónico</h1>
          <p>Equipos SGL-0001 en adelante · códigos QR · contraseñas visibles y editables</p>
        </div>
        <div className="header-actions">
          <label className="btn secondary">
            {importing ? 'Importando…' : 'Importar Excel'}
            <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={importar} disabled={importing} />
          </label>
          <button className="btn secondary" onClick={exportar} disabled={!assets.length}>Exportar Excel</button>
          <button className="btn primary" onClick={abrirNuevo}>+ Registrar equipo</button>
        </div>
      </header>

      <details className="help-panel">
        <summary>¿Cómo se vinculan los equipos con el inventario?</summary>
        <ol>
          <li>Copia <code>backend/agent.config.example.json</code> como <code>agent.config.json</code> y escribe el código SGL del equipo en <code>assetCode</code>.</li>
          <li>El agente envía ese código junto con sus métricas cada 5 segundos.</li>
          <li>El servidor busca el <code>codigo</code> en <code>assets</code> y guarda <code>assets.device_id</code>. No usa la IP ni el hostname porque no coinciden con el Excel.</li>
          <li>Si el agente aparece sin código, o su IP difiere de la del inventario, la campana de notificaciones lo advierte. También puedes vincular o corregir manualmente desde la tabla.</li>
        </ol>
      </details>

      {error && (
        <p className="alerts critical" role="alert">
          {error} <button type="button" className="detail-btn" onClick={load}>Reintentar</button>
        </p>
      )}
      {notice && <p className="alerts ok" role="status">{notice}</p>}

      <section className="panel">
        <div className="panel-title">
          <h2>Equipos registrados ({assets.length})</h2>
          <span className="hint">Las contraseñas se guardan cifradas en MySQL y se muestran aquí para su edición</span>
        </div>

        <Paginacion
          arriba
          total={assets.length}
          paginaActual={paginaActual}
          porPagina={porPagina}
          inicio={inicio}
          fin={fin}
          totalPaginas={totalPaginas}
          onPagina={setPagina}
          onPorPagina={cambiarPorPagina}
        />

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th><th>Tipo</th><th>Usuario</th><th>IP inventario</th>
                <th>Agente detectado</th><th>Contraseña</th><th>Contraseña admin</th>
                <th>QR</th><th>Ficha</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr><td colSpan="10" className="empty">Cargando inventario…</td></tr>
              )}
              {!cargando && !visibles.length && (
                <tr>
                  <td colSpan="10" className="empty">
                    No hay equipos registrados. Usa «Registrar equipo» o «Importar Excel».
                  </td>
                </tr>
              )}
              {visibles.map((a) => (
                <tr key={a.id}>
                  <td><strong className="code-badge">{a.codigo}</strong></td>
                  <td>{a.tipo}</td>
                  <td>{a.responsable || '—'}</td>
                  <td>{a.ip_address || '—'}</td>
                  <td>
                    {a.device_id ? (
                      <>
                        <strong>{a.device_hostname || a.device_id}</strong>
                        <small>{a.device_hostname ? a.device_id : ''}</small>
                      </>
                    ) : <span className="warn-text">Sin vincular</span>}
                  </td>
                  <td><code className="cred-text">{a.password || '—'}</code></td>
                  <td><code className="cred-text">{a.adminPassword || '—'}</code></td>
                  <td><img className="qr-img" src={`/api/assets/${a.id}/qr`} alt={`QR de ${a.codigo}`} /></td>
                  <td><a className="detail-btn" href={a.fichaPath || a.fichaUrl} target="_blank" rel="noreferrer">Ver ficha</a></td>
                  <td>
                    <div className="row-actions">
                      <button className="detail-btn" onClick={() => abrirEditar(a)}>Editar</button>
                      <button className="detail-btn" onClick={() => { setLinkAsset(a); setLinkDeviceId(a.device_id || devices[0]?.device_id || ''); }}>
                        Vincular
                      </button>
                      {a.device_id && (
                        <button className="detail-btn" onClick={() => desvincular(a)}>Desvincular</button>
                      )}
                      <button className="detail-btn danger" onClick={() => eliminar(a)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Paginacion
          total={assets.length}
          paginaActual={paginaActual}
          porPagina={porPagina}
          inicio={inicio}
          fin={fin}
          totalPaginas={totalPaginas}
          onPagina={setPagina}
          onPorPagina={cambiarPorPagina}
        />
      </section>

      {formInitial && (
        <AssetFormModal
          initial={formInitial}
          devices={devices}
          autoFocusIp={params.get('enfoque') === 'ip'}
          onClose={cerrarForm}
          onSaved={alGuardar}
        />
      )}

      {linkAsset && (
        <div className="modal-backdrop" onClick={cerrarLink}>
          <form
            ref={linkDialogRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={linkTitleId}
            onClick={(e) => e.stopPropagation()}
            onSubmit={vincular}
          >
            <button type="button" className="modal-close" onClick={cerrarLink} aria-label="Cerrar">×</button>
            <h3 id={linkTitleId}>Vincular {linkAsset.codigo}</h3>
            <p className="modal-sub">Se guardará la relación por código de agente, sin depender de la IP.</p>
            <label className="link-field">
              Agente detectado
              <select value={linkDeviceId} onChange={(e) => setLinkDeviceId(e.target.value)}>
                <option value="">Selecciona un agente</option>
                {devices.map((d) => (
                  <option key={d.device_id} value={d.device_id}>
                    {d.hostname || d.device_id} · {d.ip_address || 'sin IP'}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={cerrarLink}>Cancelar</button>
              <button type="submit" className="btn primary" disabled={!linkDeviceId}>Vincular</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
