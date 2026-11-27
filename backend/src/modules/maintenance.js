const express = require('express');
const pool = require('../db');
const { requireRole } = require('./auth');
const { normalizar, normalizarCodigoSgl } = require('../normalizacion');

const router = express.Router();
const STATUSES = ['pendiente', 'en proceso', 'completado', 'cancelado'];
const TIPOS = ['logico', 'fisico'];
const ORIGENES = ['manual', 'anual'];

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

function primerLunes(anio) {
  const fecha = new Date(anio, 0, 1);
  fecha.setDate(fecha.getDate() + ((8 - fecha.getDay()) % 7));
  fecha.setHours(0, 0, 0, 0);
  return fecha;
}

// Reparte las ordenes de una semana entre lunes y viernes, de 9 a 17 horas.
function fechaPlan(lunesAnio, indiceSemana, posicion, porSemana) {
  const fecha = new Date(lunesAnio);
  fecha.setDate(fecha.getDate() + indiceSemana * 7 + (posicion % 5));
  const turno = Math.floor(posicion / 5);
  const hora = Math.min(17, 9 + turno * 2);
  fecha.setHours(hora, 0, 0, 0);

  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')} ${String(hora).padStart(2, '0')}:00:00`;
}

function entero(value, defecto, minimo, maximo) {
  if (value === undefined || value === null || value === '') return defecto;
  const numero = Number.parseInt(value, 10);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) return null;
  return numero;
}

async function findMantenimiento(id) {
  const [rows] = await pool.execute('SELECT * FROM maintenance WHERE id = ?', [id]);
  return rows[0] || null;
}

async function generarPlanAnual({ anio, porSemana, rondas, reemplazar }) {
  const [existentesRows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM maintenance WHERE origen = ? AND anio_plan = ?',
    ['anual', anio],
  );
  const existentes = Number(existentesRows[0]?.total) || 0;

  if (existentes && !reemplazar) {
    return {
      anio,
      creados: 0,
      existentes,
      omitido: true,
      mensaje: `Ya existe un plan anual ${anio} con ${existentes} ordenes. Marca \"Reemplazar\" para generarlo de nuevo.`,
    };
  }

  const [assets] = await pool.execute(
    `SELECT codigo
       FROM assets
      WHERE codigo IS NOT NULL AND codigo <> ''
      ORDER BY codigo ASC`,
  );
  if (!assets.length) {
    const error = new Error('No hay equipos en el inventario para generar el plan');
    error.status = 400;
    throw error;
  }

  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    if (reemplazar && existentes) {
      await conexion.execute('DELETE FROM maintenance WHERE origen = ? AND anio_plan = ?', ['anual', anio]);
    }

    const lunesAnio = primerLunes(anio);
    const semanasPorRonda = Math.ceil(assets.length / porSemana);
    const ultimoInicio = Math.max(1, 52 - semanasPorRonda + 1);
    const detalle = [];
    let creados = 0;

    for (let r = 0; r < rondas; r += 1) {
      const ronda = r + 1;
      const tipo = ronda % 2 === 1 ? 'logico' : 'fisico';
      const actividad = tipo === 'logico'
        ? 'Limpieza lógica de archivos temporales'
        : 'Limpieza física: sopleteado y limpieza con alcohol isopropílico';
      const inicio = rondas === 1
        ? 1
        : 1 + Math.round((r * (ultimoInicio - 1)) / (rondas - 1));
      const fin = inicio + semanasPorRonda - 1;

      for (let indice = 0; indice < assets.length; indice += 1) {
        const semana = inicio + Math.floor(indice / porSemana);
        const posicion = indice % porSemana;
        const fecha = fechaPlan(lunesAnio, semana - 1, posicion, porSemana);
        const asset = assets[indice];

        await conexion.execute(
          `INSERT INTO maintenance
            (codigo, actividad, tipo, fecha_programada, estatus, responsable, observaciones,
             origen, anio_plan, ronda, semana)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            normalizarCodigoSgl(asset.codigo)?.slice(0, 32) || null,
            actividad,
            tipo,
            fecha,
            'pendiente',
            null,
            null,
            'anual',
            anio,
            ronda,
            semana,
          ],
        );
        creados += 1;
      }

      detalle.push({
        ronda,
        tipo,
        equipos: assets.length,
        semanaInicio: inicio,
        semanaFin: fin,
      });
    }

    await conexion.commit();

    return {
      anio,
      porSemana,
      rondas,
      equipos: assets.length,
      semanasPorRonda,
      creados,
      reemplazados: reemplazar ? existentes : 0,
      detalle,
      mensaje: `Plan ${anio} generado: ${creados} ordenes en ${rondas} rondas.`,
    };
  } catch (err) {
    await conexion.rollback();
    throw err;
  } finally {
    conexion.release();
  }
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
    if (req.query.anio !== undefined && req.query.anio !== '') {
      const anio = Number.parseInt(req.query.anio, 10);
      if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
        return res.status(400).json({ error: 'Año no válido' });
      }
      condiciones.push('YEAR(fecha_programada) = ?');
      params.push(anio);
    }
    if (req.query.origen !== undefined && req.query.origen !== '') {
      const origen = normalizar(req.query.origen);
      if (!ORIGENES.includes(origen)) {
        return res.status(400).json({ error: 'Origen no válido' });
      }
      condiciones.push('origen = ?');
      params.push(origen);
    }
    if (req.query.estatus !== undefined && req.query.estatus !== '') {
      const estatus = normalizar(req.query.estatus);
      if (!STATUSES.includes(estatus)) {
        return res.status(400).json({ error: 'Estatus no válido' });
      }
      condiciones.push('estatus = ?');
      params.push(estatus);
    }
    if (req.query.tipo !== undefined && req.query.tipo !== '') {
      const tipo = normalizar(req.query.tipo);
      if (!TIPOS.includes(tipo)) {
        return res.status(400).json({ error: 'Tipo no válido' });
      }
      condiciones.push('tipo = ?');
      params.push(tipo);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT id, codigo, actividad, tipo, fecha_programada, estatus, responsable, observaciones,
              origen, anio_plan, ronda, semana, created_at
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

router.get('/plan-anual', async (req, res) => {
  const anio = req.query.anio === undefined || req.query.anio === ''
    ? new Date().getFullYear()
    : Number.parseInt(req.query.anio, 10);

  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    return res.status(400).json({ error: 'Año no válido' });
  }

  try {
    const [totales] = await pool.execute(
      `SELECT COUNT(*) AS total, COUNT(DISTINCT codigo) AS equipos
         FROM maintenance
        WHERE origen = ? AND anio_plan = ?`,
      ['anual', anio],
    );
    const [rondas] = await pool.execute(
      `SELECT ronda, tipo, COUNT(*) AS total,
              MIN(semana) AS semanaInicio, MAX(semana) AS semanaFin,
              MIN(fecha_programada) AS primera, MAX(fecha_programada) AS ultima
         FROM maintenance
        WHERE origen = ? AND anio_plan = ?
        GROUP BY ronda, tipo
        ORDER BY ronda ASC`,
      ['anual', anio],
    );

    res.json({
      anio,
      total: Number(totales[0]?.total) || 0,
      equipos: Number(totales[0]?.equipos) || 0,
      rondas,
    });
  } catch (err) {
    console.error('GET /api/maintenance/plan-anual:', err.message);
    res.status(500).json({ error: 'Error al consultar el plan anual' });
  }
});

router.post('/generar-anual', requireRole('tecnico', 'admin'), async (req, res) => {
  const anioActual = new Date().getFullYear();
  const anio = entero(req.body?.anio, anioActual, anioActual - 1, anioActual + 5);
  const porSemana = entero(req.body?.porSemana, 10, 1, 20);
  const rondas = entero(req.body?.rondas, 3, 1, 6);
  const reemplazar = req.body?.reemplazar === true;

  if (anio === null) {
    return res.status(400).json({ error: 'Año no válido' });
  }
  if (porSemana === null) {
    return res.status(400).json({ error: 'La cantidad de equipos por semana debe estar entre 1 y 20' });
  }
  if (rondas === null) {
    return res.status(400).json({ error: 'El número de rondas debe estar entre 1 y 6' });
  }
  if (reemplazar && req.user?.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede reemplazar un plan existente' });
  }

  try {
    const resultado = await generarPlanAnual({ anio, porSemana, rondas, reemplazar });
    return res.status(resultado.omitido ? 200 : 201).json(resultado);
  } catch (err) {
    console.error('POST /api/maintenance/generar-anual:', err.message);
    return res.status(err.status || 500).json({ error: err.message || 'No se pudo generar el plan anual' });
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
    ? 'pendiente'
    : normalizar(req.body.estatus);
  const tipo = req.body?.tipo === undefined || req.body?.tipo === ''
    ? 'logico'
    : normalizar(req.body.tipo);

  if (!actividad) return res.status(400).json({ error: 'La actividad es obligatoria' });
  if (!fecha) return res.status(400).json({ error: 'La fecha programada no es válida' });
  if (!STATUSES.includes(estatus)) return res.status(400).json({ error: 'Estatus no válido' });
  if (!TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo no válido' });

  try {
    const [result] = await pool.execute(
      `INSERT INTO maintenance
        (codigo, actividad, tipo, fecha_programada, estatus, responsable, observaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizarCodigoSgl(req.body?.codigo)?.slice(0, 32) || null,
        actividad,
        tipo,
        fecha,
        estatus,
        normalizar(req.body?.responsable)?.slice(0, 128) || null,
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
  if (tiene('tipo')) {
    const tipo = normalizar(body.tipo);
    if (!TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo no válido' });
    asignar('tipo', tipo);
  }
  if (tiene('fecha_programada')) {
    const fecha = fechaProgramada(body.fecha_programada);
    if (!fecha) return res.status(400).json({ error: 'La fecha programada no es válida' });
    asignar('fecha_programada', fecha);
  }
  if (tiene('estatus')) {
    const estatus = normalizar(body.estatus);
    if (!STATUSES.includes(estatus)) return res.status(400).json({ error: 'Estatus no válido' });
    asignar('estatus', estatus);
  }
  if (tiene('codigo')) asignar('codigo', normalizarCodigoSgl(body.codigo)?.slice(0, 32) || null);
  if (tiene('responsable')) asignar('responsable', normalizar(body.responsable)?.slice(0, 128) || null);
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
