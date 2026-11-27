import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Link, useSearchParams } from 'react-router-dom';
import AssetFormModal from './AssetFormModal';
import FamilyBadges from './FamilyBadges';
import { apiFetch } from './api.js';
import { createAsset as createLaptop } from './laptop-e775ba.mjs';
import { createAsset as createCpu } from './cpu-e775ba.mjs';
import { familiaCantidad } from './families';
import {
  codigo, etiqueta, identificador, normalizarEntrada,
} from './normalizacion.js';
import usePageMeta from './usePageMeta';

const CLASE_MANTENIMIENTO = {
  pendiente: 'offline',
  'en proceso': 'online',
  completado: 'online',
  cancelado: 'offline',
  'sin mantenimiento': 'neutro',
};

function etiquetaMantenimiento(valor) {
  if (valor === 'sin mantenimiento') return 'Sin mantenimiento';
  return etiqueta(valor);
}

function fechaMantenimiento(valor) {
  if (!valor) return '';
  const fecha = new Date(String(valor).replace(' ', 'T'));
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return fecha.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function detalleMantenimiento(info) {
  if (!info || info.estatus === 'sin mantenimiento') {
    return 'Sin visitas programadas para este equipo.';
  }
  const orden = info.activa || info.ultima;
  if (!orden) return 'Sin visitas registradas.';

  const cuando = fechaMantenimiento(orden.fecha_programada);
  const tipo = etiqueta(orden.tipo) || 'Lógico';
  const plan = orden.origen === 'anual'
    ? ` · ronda ${orden.ronda}, semana ${orden.semana} (${orden.anio_plan})`
    : '';
  const prefijo = info.activa ? 'Orden activa' : 'Última orden';
  return `${prefijo}: ${cuando} · ${tipo}${plan}`;
}

function Modelo({ fabrica, codigo }) {
  const obj = useMemo(
    () => fabrica({ colorway: 'gray-2025', codigo }),
    [fabrica, codigo],
  );

  useEffect(() => () => {
    obj.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (!mat) return;
        if (mat.map) mat.map.dispose();
        mat.dispose();
      });
    });
  }, [obj]);

  return <primitive object={obj} />;
}

function ModeloEquipo({ asset, esCpu }) {
  return (
    <aside className="ficha-modelo" data-modelo={esCpu ? 'cpu' : 'laptop'}>
      <div className="modelo-canvas" role="img" aria-label={`Modelo 3D representativo de ${codigo(asset.codigo)}`}>
        <Canvas camera={{ position: [3, 3, 4] }} shadows dpr={[1, 2]}>
          <hemisphereLight args={[0xffffff, 0x998877, 1.2]} />
          <directionalLight position={[4, 7, 5]} intensity={2} castShadow />
          <Modelo fabrica={esCpu ? createCpu : createLaptop} codigo={codigo(asset.codigo)} />
        </Canvas>
      </div>
      <img
        className="modelo-qr"
        src={`/api/assets/${asset.id}/qr`}
        alt={`QR de ${codigo(asset.codigo)}`}
      />
    </aside>
  );
}

export default function Ficha({ token: tokenProp }) {
  const [params] = useSearchParams();
  const token = tokenProp || params.get('ficha') || '';
  const [asset, setAsset] = useState(null);
  const [devices, setDevices] = useState([]);
  const [mantenimiento, setMantenimiento] = useState(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [commentAuthor, setCommentAuthor] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentError, setCommentError] = useState('');

  usePageMeta(
    asset ? `Ficha ${codigo(asset.codigo)}` : 'Ficha del equipo',
    'Datos, estatus de mantenimiento, credenciales, QR y comentarios de un equipo del inventario Loganmex.',
  );
  const cerrarEdicion = () => setEditing(false);

  useEffect(() => {
    if (!token) {
      setError('No se especificó el equipo');
      return undefined;
    }
    setError('');
    Promise.all([
      apiFetch(`/api/assets/token/${encodeURIComponent(token)}`),
      apiFetch('/api/devices'),
    ])
      .then(async ([res, devicesRes]) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se encontró el equipo');
        setAsset(data);
        setMantenimiento(data.mantenimiento || null);
        if (devicesRes.ok) {
          const lista = await devicesRes.json();
          setDevices(Array.isArray(lista) ? lista : []);
        }
      })
      .catch((err) => setError(err.message));
    return undefined;
  }, [token]);

  useEffect(() => {
    if (!asset?.id) return undefined;
    let cancelado = false;
    apiFetch(`/api/assets/${asset.id}/comments`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { if (!cancelado) setComments(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelado) setComments([]); });
    return () => { cancelado = true; };
  }, [asset?.id]);

  const guardado = (data) => {
    setAsset(data);
    setEditing(false);
    setNotice(`${codigo(data.codigo)} actualizado correctamente`);
  };

  const enviarComentario = async (event) => {
    event.preventDefault();
    const texto = commentText.trim();
    if (!texto || commentSaving) return;

    setCommentSaving(true);
    setCommentError('');
    try {
      const res = await apiFetch(`/api/assets/${asset.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autor: normalizarEntrada(commentAuthor), comentario: texto }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el comentario');
      setComments((prev) => [...prev, data]);
      setCommentText('');
    } catch (err) {
      setCommentError(err.message);
    } finally {
      setCommentSaving(false);
    }
  };

  const fechaComentario = (value) => (value
    ? new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
    : '');

  if (error) {
    return (
      <main className="app ficha-page">
        <section className="panel ficha">
          <p className="alerts critical" role="alert">{error}</p>
          <Link className="detail-btn" to="/inventario">Volver al inventario</Link>
        </section>
      </main>
    );
  }

  if (!asset) {
    return <main className="app ficha-page"><p className="empty">Cargando ficha del equipo…</p></main>;
  }

  const tipo = String(asset.tipo || '');
  const esLaptop = /laptop|notebook/i.test(tipo)
    || familiaCantidad(asset.familias, 'laptop') > 0;
  const esCpu = !esLaptop && (/computadora|desktop|torre|\bpc\b|\bcpu\b/i.test(tipo)
    || familiaCantidad(asset.familias, 'cpu') > 0);
  const conModelo = esLaptop || esCpu;

  const rows = [
    ['Código', codigo(asset.codigo)],
    ['Tipo', etiqueta(asset.tipo)],
    ['Familias', ''],
    ['Marca', etiqueta(asset.marca)],
    ['Modelo', etiqueta(asset.modelo)],
    ['N.º de serie', identificador(asset.numero_serie)],
    ['Usuario', etiqueta(asset.responsable)],
    ['Departamento', etiqueta(asset.ubicacion)],
    ['Dirección IP', asset.ip_address],
    ['Correo', etiqueta(asset.correo)],
    ['VNC', identificador(asset.vnc)],
    ['Hostname', identificador(asset.hostname || asset.device_hostname)],
    ['Agente vinculado', identificador(asset.device_id) || 'Sin vincular'],
    ['Contraseña', asset.password],
    ['Contraseña de administrador', asset.adminPassword],
    ['Contraseña RustDesk', asset.rustdeskPassword],
    ['Registrado', asset.created_at ? new Date(asset.created_at).toLocaleString('es-MX') : ''],
  ];

  return (
    <main className="app ficha-page">
      <section className={`panel ficha ${conModelo ? 'con-modelo' : ''}`}>
        <header className="header">
          <div className="header-actions">
            <button className="btn secondary" onClick={() => window.print()}>Imprimir código y QR</button>
            <button className="btn primary" onClick={() => setEditing(true)}>Editar equipo</button>
            <Link className="detail-btn" to="/inventario">Inventario</Link>
          </div>
        </header>

        {notice && <p className="alerts ok" role="status">{notice}</p>}

        <div className="ficha-print" aria-hidden="true">
          <strong className="print-code">{codigo(asset.codigo)}</strong>
          <img src={`/api/assets/${asset.id}/qr`} alt={`QR de ${codigo(asset.codigo)}`} />
          <p className="print-mantenimiento">
            Mantenimiento: {etiquetaMantenimiento(mantenimiento?.estatus)}
          </p>
        </div>

        <h2>{codigo(asset.codigo)} · {[etiqueta(asset.marca), etiqueta(asset.modelo)].filter(Boolean).join(' ') || etiqueta(asset.tipo)}</h2>

        <section className="ficha-mantenimiento" aria-label="Estado del mantenimiento">
          <div>
            <span>Estatus de mantenimiento</span>
            <strong className={`badge ${CLASE_MANTENIMIENTO[mantenimiento?.estatus] || 'neutro'}`}>
              {etiquetaMantenimiento(mantenimiento?.estatus)}
            </strong>
          </div>
          <p>{detalleMantenimiento(mantenimiento)}</p>
        </section>

        <div className="ficha-body">
          <div className="detail-grid ficha-grid">
            {rows.map(([label, value]) => (
              <div key={label} className={/Contraseña/.test(label) ? 'cred-row' : ''}>
                <span>{label}</span>
                {label === 'Familias'
                  ? <FamilyBadges value={asset.familias} />
                  : <strong className={/Contraseña/.test(label) ? 'cred-text' : ''}>{value || '—'}</strong>}
              </div>
            ))}
            {asset.notas && (
              <div className="ficha-notas">
                <span>Observaciones</span>
                <strong>{asset.notas}</strong>
              </div>
            )}
          </div>

          {conModelo && <ModeloEquipo asset={asset} esCpu={esCpu} />}
        </div>

        <section className="ficha-comentarios">
          <h3>Comentarios <span>{comments.length}</span></h3>

          {comments.length ? (
            <div className="comentarios-lista">
              {comments.map((c) => (
                <article key={c.id} className="comentario">
                  <header>
                    <strong>{etiqueta(c.autor) || 'Anónimo'}</strong>
                    <time>{fechaComentario(c.created_at)}</time>
                  </header>
                  <p>{c.comentario}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty">Sin comentarios todavía. Registra la primera nota de seguimiento.</p>
          )}

          <form className="comentario-form" onSubmit={enviarComentario}>
            <input
              type="text"
              value={commentAuthor}
              onChange={(e) => setCommentAuthor(e.target.value)}
              placeholder="Nombre (opcional)"
              maxLength={128}
              aria-label="Nombre del autor"
            />
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Escribe un comentario..."
              rows={2}
              maxLength={2000}
              aria-label="Comentario"
              required
            />
            <button className="btn primary" type="submit" disabled={commentSaving || !commentText.trim()}>
              {commentSaving ? 'Guardando…' : 'Agregar comentario'}
            </button>
          </form>

          {commentError && <p className="comentario-error" role="alert">{commentError}</p>}
        </section>
      </section>

      {editing && (
        <AssetFormModal
          initial={{ asset }}
          devices={devices}
          onClose={cerrarEdicion}
          onSaved={guardado}
        />
      )}
    </main>
  );
}
