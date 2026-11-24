const express = require('express');
const pool = require('../db');
const { requireRole } = require('./auth');

const router = express.Router();
const STATUSES = ['Pendiente', 'En proceso', 'Completado', 'Cancelado'];

function clean(value, max = 255) {
  return String(value ?? '').trim().slice(0, max);
}

// Acepta el formato de datetime-local del frontend y lo convierte a DATETIME
// de MySQL sin desplazar la zona horaria (hora local del servidor).
function fechaProgramada(value) {
  const texto = String(value ?? '').trim();
  const match = texto.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;

  const [anio, mes, dia] = match[1].split('-').map(Number);
  const hora = Number(match[2]?.slice(0, 2) || 0);
  const minuto = Number(match[2]?.slice(3, 5) || 0);
  const segundo = Number(match[3] || 0);
  const fecha = new Date(anio, mes - 1, dia, hora, minuto, segundo);

  if (
    fecha.getFullYear() !== anio || fecha.getMonth() !== mes - 1 ||
    fecha.getDate() !== dia || fecha.getHours() !== hora ||
    fecha.getMinutes() !== minuto || fecha.getSeconds() !== segundo
  ) return null;

  return `${match[1]} ${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:${String(segundo).padStart(2, '0')}`;
}

// Lunes 00:00:00 .. siguiente lunes 00:00:00, en hora local del servidor.
function rangoSemanaActual() {
  const hoy = new Date();
  const inicio = new Date(hoy);
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(inicio.getDate() - ((inicio.getDay() + 6) % 7));
  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 7);

  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 00:00:00`;
  return [fmt(inicio), fmt(fin)];
}

async function findMantenimiento(id) {
  const [rows] = await pool.execute('SELECT * FROM maintenance WHERE id = ?', [id]);
  return rows[0] || null;
}

router.get('/', async (req, res) => {
  const condiciones = [];
  const params = [];

  try {
    if (String(req.query.semana || '') === 'actual') {
      const [inicio, fin] = rangoSemanaActual();
      condiciones.push('fecha_programada >= ? AND fecha_programada < ?');
      params.push(inicio, fin);
    }
    if (req.query.estatus !== undefined && req.query.estatus !== '') {
      const estatus = String(req.query.estatus);
      if (!STATUSES.includes(estatus)) {
        return res.status(400).json({ error: 'Estatus no válido' });
      }
      condiciones.push('estatus = ?');
      params.push(estatus);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT id, codigo, actividad, fecha_programada, estatus, responsable, observaciones, created_at
         FROM maintenance
         ${where}
        ORDER BY fecha_programada ASC, id ASC`,
      params,
    );
    res.json({ mantenimientos: rows });
  } catch (err) {
    console.error('GET /api/maintenance:', err.message);
    res.status(500).json({ error: 'Error al consultar los mantenimientos' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const mantenimiento = await findMantenimiento(req.params.id);
    if (!mantenimiento) return res.status(404).json({ error: 'Mantenimiento no encontrado' });
    res.json(mantenimiento);
  } catch (err) {
    console.error('GET /api/maintenance/:id:', err.message);
    res.status(500).json({ error: 'Error al consultar el mantenimiento' });
  }
});

router.post('/', requireRole('tecnico', 'admin'), async (req, res) => {
  const actividad = clean(req.body?.actividad, 180);
  const fecha = fechaProgramada(req.body?.fecha_programada);
  const estatus = req.body?.estatus === undefined || req.body?.estatus === ''
    ? 'Pendiente'
    : String(req.body.estatus);

  if (!actividad) return res.status(400).json({ error: 'La actividad es obligatoria' });
  if (!fecha) return res.status(400).json({ error: 'La fecha programada no es válida' });
  if (!STATUSES.includes(estatus)) return res.status(400).json({ error: 'Estatus no válido' });

  try {
    const [result] = await pool.execute(
      `INSERT INTO maintenance
        (codigo, actividad, fecha_programada, estatus, responsable, observaciones)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        clean(req.body?.codigo, 32) || null,
        actividad,
        fecha,
        estatus,
        clean(req.body?.responsable, 128) || null,
        clean(req.body?.observaciones, 5000) || null,
      ],
    );
    const mantenimiento = await findMantenimiento(result.insertId);
    return res.status(201).json(mantenimiento);
  } catch (err) {
    console.error('POST /api/maintenance:', err.message);
    return res.status(500).json({ error: 'Error al registrar el mantenimiento' });
  }
});

router.patch('/:id', requireRole('tecnico', 'admin'), async (req, res) => {
  const body = req.body || {};
  const campos = [];
  const valores = [];
  const tiene = (clave) => Object.prototype.hasOwnProperty.call(body, clave);
  const asignar = (columna, valor) => {
    campos.push(`${columna} = ?`);
    valores.push(valor);
  };

  if (tiene('actividad')) {
    const actividad = clean(body.actividad, 180);
    if (!actividad) return res.status(400).json({ error: 'La actividad es obligatoria' });
    asignar('actividad', actividad);
  }
  if (tiene('fecha_programada')) {
    const fecha = fechaProgramada(body.fecha_programada);
    if (!fecha) return res.status(400).json({ error: 'La fecha programada no es válida' });
    asignar('fecha_programada', fecha);
  }
  if (tiene('estatus')) {
    const estatus = String(body.estatus);
    if (!STATUSES.includes(estatus)) return res.status(400).json({ error: 'Estatus no válido' });
    asignar('estatus', estatus);
  }
  if (tiene('codigo')) asignar('codigo', clean(body.codigo, 32) || null);
  if (tiene('responsable')) asignar('responsable', clean(body.responsable, 128) || null);
  if (tiene('observaciones')) asignar('observaciones', clean(body.observaciones, 5000) || null);

  if (!campos.length) return res.status(400).json({ error: 'No se recibieron cambios válidos' });

  try {
    const actual = await findMantenimiento(req.params.id);
    if (!actual) return res.status(404).json({ error: 'Mantenimiento no encontrado' });

    await pool.execute(
      `UPDATE maintenance SET ${campos.join(', ')} WHERE id = ?`,
      [...valores, req.params.id],
    );
    const mantenimiento = await findMantenimiento(req.params.id);
    res.json(mantenimiento);
  } catch (err) {
    console.error('PATCH /api/maintenance/:id:', err.message);
    res.status(500).json({ error: 'Error al editar el mantenimiento' });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const mantenimiento = await findMantenimiento(req.params.id);
    if (!mantenimiento) return res.status(404).json({ error: 'Mantenimiento no encontrado' });

    const [result] = await pool.execute('DELETE FROM maintenance WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Mantenimiento no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/maintenance/:id:', err.message);
    res.status(500).json({ error: 'Error al eliminar el mantenimiento' });
  }
});

module.exports = router;
