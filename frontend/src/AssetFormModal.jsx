import { useId, useState } from 'react';
import { FAMILIES, parseFamilias } from './families';
import { apiFetch } from './api.js';
import {
  codigo, etiqueta, identificador, normalizarCodigoSgl, normalizarEntrada,
} from './normalizacion.js';
import useDialog from './useDialog';

export const emptyAssetForm = {
  codigo: '',
  deviceId: '',
  tipo: '',
  familias: {},
  marca: '',
  modelo: '',
  numeroSerie: '',
  hostname: '',
  ipAddress: '',
  correo: '',
  vnc: '',
  password: '',
  adminPassword: '',
  rustdeskPassword: '',
  ubicacion: '',
  responsable: '',
  notas: '',
};

export function assetToForm(asset) {
  return {
    codigo: codigo(asset.codigo),
    deviceId: asset.device_id || '',
    tipo: etiqueta(asset.tipo),
    familias: parseFamilias(asset.familias),
    marca: etiqueta(asset.marca),
    modelo: etiqueta(asset.modelo),
    numeroSerie: identificador(asset.numero_serie),
    hostname: identificador(asset.hostname),
    ipAddress: asset.ip_address || '',
    correo: etiqueta(asset.correo),
    vnc: identificador(asset.vnc),
    password: asset.password || '',
    adminPassword: asset.adminPassword || '',
    rustdeskPassword: asset.rustdeskPassword || '',
    ubicacion: etiqueta(asset.ubicacion),
    responsable: etiqueta(asset.responsable),
    notas: asset.notas || '',
  };
}

// Modal compartido por el inventario y la ficha QR.
// initial = { asset } para editar, o { prefill } para registrar con datos del agente.
export default function AssetFormModal({
  initial = {},
  devices = [],
  autoFocusIp = false,
  onClose,
  onSaved,
}) {
  const asset = initial.asset || null;
  const [form, setForm] = useState(() => asset
    ? assetToForm(asset)
    : { ...emptyAssetForm, familias: {}, ...(initial.prefill || {}) });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dialogRef = useDialog(onClose);
  const titleId = useId();

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const toggleFamilia = (label) => {
    const familias = { ...form.familias };
    if (familias[label]) delete familias[label];
    else familias[label] = 1;
    setForm({ ...form, familias });
  };

  const changeCantidad = (label, value) => {
    const cantidad = Math.max(1, Math.min(99, Number.parseInt(value, 10) || 1));
    setForm({ ...form, familias: { ...form.familias, [label]: cantidad } });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await apiFetch(asset ? `/api/assets/${asset.id}` : '/api/assets', {
        method: asset ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...form,
          codigo: normalizarCodigoSgl(form.codigo) || '',
          deviceId: normalizarEntrada(form.deviceId),
          tipo: normalizarEntrada(form.tipo) || 'equipo',
          marca: normalizarEntrada(form.marca),
          modelo: normalizarEntrada(form.modelo),
          numeroSerie: normalizarEntrada(form.numeroSerie),
          hostname: normalizarEntrada(form.hostname),
          correo: normalizarEntrada(form.correo),
          vnc: normalizarEntrada(form.vnc),
          ubicacion: normalizarEntrada(form.ubicacion),
          responsable: normalizarEntrada(form.responsable),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      onSaved(data, Boolean(asset));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const opciones = [...devices];
  if (form.deviceId && !opciones.some((d) => d.device_id === form.deviceId)) {
    opciones.unshift({
      device_id: form.deviceId,
      hostname: asset?.device_hostname || form.deviceId,
      ip_address: '',
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal modal-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        <h3 id={titleId}>{asset ? 'Editar equipo' : 'Registrar equipo'}</h3>
        <p className="modal-sub">
          {asset
            ? `Modificando ${codigo(form.codigo)}. Las contraseñas se vuelven a cifrar al guardar.`
            : 'Si dejas el código vacío se asigna el siguiente sgl-0000 disponible.'}
        </p>
        {!asset && form.deviceId && (
          <p className="modal-hint">
            Al guardar, el agente <strong>{identificador(form.deviceId)}</strong> quedará vinculado automáticamente a este equipo.
          </p>
        )}
        {error && <p className="alerts critical" role="alert">{error}</p>}
        <form className="asset-form" onSubmit={submit}>
          <label>Código SGL<input name="codigo" value={form.codigo} onChange={change} placeholder="sgl-0123 (opcional)" /></label>
          <label>Tipo<input name="tipo" value={form.tipo} onChange={change} placeholder="Laptop, Computadora…" /></label>
          <label>Equipo monitoreado
            <select name="deviceId" value={form.deviceId} onChange={change}>
              <option value="">Sin vincular</option>
              {opciones.map((d) => (
                <option key={d.device_id} value={d.device_id}>
                  {identificador(d.hostname || d.device_id)} · {d.ip_address || 'sin IP'}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="full family-field">
            <legend>Familias del equipo</legend>
            <div className="family-options">
              {FAMILIES.map((f) => (
                <div key={f.key} className="family-option">
                  <label className="family-check">
                    <input
                      type="checkbox"
                      checked={Boolean(form.familias[f.label])}
                      onChange={() => toggleFamilia(f.label)}
                    />
                    <span>{f.label}</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={form.familias[f.label] || 1}
                    disabled={!form.familias[f.label]}
                    onChange={(e) => changeCantidad(f.label, e.target.value)}
                    aria-label={`Cantidad de ${f.label}`}
                  />
                </div>
              ))}
            </div>
          </fieldset>
          <label>Marca<input name="marca" value={form.marca} onChange={change} /></label>
          <label>Modelo<input name="modelo" value={form.modelo} onChange={change} /></label>
          <label>N.º de serie<input name="numeroSerie" value={form.numeroSerie} onChange={change} /></label>
          <label>Usuario / responsable<input name="responsable" value={form.responsable} onChange={change} /></label>
          <label>Departamento<input name="ubicacion" value={form.ubicacion} onChange={change} /></label>
          <label>Dirección IP<input name="ipAddress" value={form.ipAddress} onChange={change} autoFocus={autoFocusIp} /></label>
          <label>Correo<input name="correo" value={form.correo} onChange={change} /></label>
          <label>VNC<input name="vnc" value={form.vnc} onChange={change} /></label>
          <label>Hostname<input name="hostname" value={form.hostname} onChange={change} /></label>
          <label>Contraseña<input name="password" value={form.password} onChange={change} autoComplete="off" /></label>
          <label>Contraseña de administrador<input name="adminPassword" value={form.adminPassword} onChange={change} autoComplete="off" /></label>
          <label>Contraseña RustDesk<input name="rustdeskPassword" value={form.rustdeskPassword} onChange={change} autoComplete="off" /></label>
          <label className="full">Observaciones<textarea name="notas" value={form.notas} onChange={change} rows="2" /></label>
          <div className="modal-actions full">
            <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? 'Guardando…' : asset ? 'Guardar cambios' : 'Registrar y generar QR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
