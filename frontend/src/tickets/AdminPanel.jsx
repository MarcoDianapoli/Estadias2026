import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api.js';
import { etiqueta, normalizarEntrada } from '../normalizacion.js';

const ROLES = [
  { value: 'usuario', label: 'Usuario' },
  { value: 'tecnico', label: 'Técnico' },
  { value: 'admin', label: 'Administrador' },
];

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [nuevo, setNuevo] = useState({ nombre: '', pin: '', rol: 'usuario' });
  const [cambioPin, setCambioPin] = useState({ id: '', pin: '' });
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);

  const load = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await apiFetch('/api/auth/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los usuarios');
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onSubmitNuevo(event) {
    event.preventDefault();
    setError('');
    setAviso('');
    setProcesando(true);
    try {
      const res = await apiFetch('/api/auth/users', {
        method: 'POST',
        body: JSON.stringify({ ...nuevo, nombre: normalizarEntrada(nuevo.nombre) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el usuario');
      setNuevo({ nombre: '', pin: '', rol: 'usuario' });
      setAviso(`Usuario ${etiqueta(data.nombre)} creado.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  async function onSubmitPin(event) {
    event.preventDefault();
    setError('');
    setAviso('');
    if (!cambioPin.id || cambioPin.pin.length < 4) {
      setError('Selecciona un usuario y escribe un PIN de al menos 4 caracteres.');
      return;
    }
    setProcesando(true);
    try {
      const res = await apiFetch(`/api/auth/users/${cambioPin.id}/pin`, {
        method: 'POST',
        body: JSON.stringify({ pin: cambioPin.pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el PIN');
      setCambioPin({ id: '', pin: '' });
      setAviso('PIN actualizado.');
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  async function cambiarEstado(usuario) {
    setError('');
    setAviso('');
    try {
      const res = await apiFetch(`/api/auth/users/${usuario.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nombre: normalizarEntrada(usuario.nombre),
          rol: usuario.rol,
          activo: usuario.activo ? 0 : 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el usuario');
      setAviso(`${etiqueta(usuario.nombre)} ${usuario.activo ? 'desactivado' : 'activado'}.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function cambiarRol(usuario, rol) {
    setError('');
    setAviso('');
    try {
      const res = await apiFetch(`/api/auth/users/${usuario.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ nombre: normalizarEntrada(usuario.nombre), rol, activo: usuario.activo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el rol');
      setAviso(`Rol de ${etiqueta(usuario.nombre)} actualizado.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="panel admin-panel" aria-labelledby="admin-title">
      <div className="panel-title">
        <div>
          <h2 id="admin-title">Administración de accesos</h2>
          <p className="hint">Cuentas locales del módulo de tickets. Los PIN se guardan cifrados.</p>
        </div>
        <button type="button" className="btn secondary" onClick={load} disabled={cargando}>
          {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {aviso && <p className="form-ok" role="status">{aviso}</p>}

      <div className="admin-grid">
        <form className="admin-form" onSubmit={onSubmitNuevo}>
          <h3>Nuevo usuario</h3>
          <label>
            Nombre
            <input
              value={nuevo.nombre}
              onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              required
            />
          </label>
          <label>
            PIN inicial
            <input
              type="password"
              inputMode="numeric"
              value={nuevo.pin}
              onChange={(e) => setNuevo({ ...nuevo, pin: e.target.value })}
              minLength={4}
              required
            />
          </label>
          <label>
            Rol
            <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}>
              {ROLES.map((rol) => <option key={rol.value} value={rol.value}>{rol.label}</option>)}
            </select>
          </label>
          <button type="submit" className="btn primary" disabled={procesando}>Crear usuario</button>
        </form>

        <form className="admin-form" onSubmit={onSubmitPin}>
          <h3>Cambiar PIN</h3>
          <label>
            Usuario
            <select value={cambioPin.id} onChange={(e) => setCambioPin({ ...cambioPin, id: e.target.value })} required>
              <option value="">Selecciona…</option>
              {users.map((usuario) => (
                <option key={usuario.id} value={usuario.id}>{etiqueta(usuario.nombre)}</option>
              ))}
            </select>
          </label>
          <label>
            PIN nuevo
            <input
              type="password"
              inputMode="numeric"
              value={cambioPin.pin}
              onChange={(e) => setCambioPin({ ...cambioPin, pin: e.target.value })}
              minLength={4}
              required
            />
          </label>
          <button type="submit" className="btn secondary" disabled={procesando}>Actualizar PIN</button>
        </form>
      </div>

      {cargando ? (
        <p role="status">Cargando usuarios…</p>
      ) : users.length === 0 ? (
        <p className="empty">Todavía no hay cuentas registradas.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((usuario) => (
                <tr key={usuario.id}>
                  <td><strong>{etiqueta(usuario.nombre)}</strong></td>
                  <td>
                    <select
                      aria-label={`Rol de ${etiqueta(usuario.nombre)}`}
                      value={usuario.rol}
                      onChange={(e) => cambiarRol(usuario, e.target.value)}
                    >
                      {ROLES.map((rol) => <option key={rol.value} value={rol.value}>{rol.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <span className={`badge ${usuario.activo ? 'online' : 'offline'}`}>
                      {usuario.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="detail-btn" onClick={() => cambiarEstado(usuario)}>
                      {usuario.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
