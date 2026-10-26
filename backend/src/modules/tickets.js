const express = require('express');
const pool = require('../db');
const { requireRole } = require('./auth');

const router = express.Router();
const STATUSES = ['Abierto', 'En proceso', 'Resuelto', 'Cerrado'];
const PRIORITIES = ['Baja', 'Media', 'Alta'];

const TICKET_SELECT = `
  SELECT t.id, t.codigo, t.titulo, t.descripcion, t.estado, t.prioridad, t.categoria,
         t.responsable, t.solicitante_usuario_id, t.tecnico_usuario_id,
         t.tomado_en, t.resuelto_en, t.cerrado_en, t.created_at, t.updated_at,
         solicitante.nombre AS solicitante_nombre,
         tecnico.nombre AS tecnico_nombre,
         (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS mensajes_count
    FROM tickets t
    LEFT JOIN ticket_users solicitante ON solicitante.id = t.solicitante_usuario_id
    LEFT JOIN ticket_users tecnico ON tecnico.id = t.tecnico_usuario_id
`;

function emit(req, event, payload, { solicitante = false, tecnico = false, soloStaff = false } = {}) {
  const io = req.app.get('io');
  if (!io) return;
  io.to('tickets').emit(event, payload);
  if (soloStaff) return;
  if (solicitante && payload.solicitante_usuario_id) {
    io.to(`ticket-user:${payload.solicitante_usuario_id}`).emit(event, payload);
  }
  if (tecnico && payload.tecnico_usuario_id) {
    io.to(`ticket-user:${payload.tecnico_usuario_id}`).emit(event, payload);
  }
}

function resumenTicket(ticket) {
  return {
    ticketId: Number(ticket.id),
    codigo: ticket.codigo || null,
    titulo: ticket.titulo || null,
    solicitante_usuario_id: ticket.solicitante_usuario_id ? Number(ticket.solicitante_usuario_id) : null,
    tecnico_usuario_id: ticket.tecnico_usuario_id ? Number(ticket.tecnico_usuario_id) : null,
    solicitante_nombre: ticket.solicitante_nombre || null,
    tecnico_nombre: ticket.tecnico_nombre || null,
  };
}

function actor(req) {
  return { id: req.user.id, nombre: req.user.nombre, rol: req.user.rol };
}

async function logEvent(ticketId, usuarioId, accion, detalle) {
  await pool.execute(
    'INSERT INTO ticket_events (ticket_id, usuario_id, accion, detalle) VALUES (?, ?, ?, ?)',
    [ticketId, usuarioId, accion, detalle || null],
  );
}

function clean(value, max = 255) {
  return String(value ?? '').trim().slice(0, max);
}

// Mismo formato que DATETIME de MySQL (hora local), para que el evento del
// socket y la fila devuelta por la BD muestren la misma hora.
function ahoraLocal() {
  const ahora = new Date();
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

function canAccess(user, ticket) {
  if (user.rol === 'admin') return true;
  if (user.rol === 'usuario') return ticket.solicitante_usuario_id === user.id;
  return true; // Los técnicos pueden ver el acervo de tickets de la consola.
}

async function findTicket(id) {
  const [rows] = await pool.execute(`${TICKET_SELECT} WHERE t.id = ?`, [id]);
  return rows[0] || null;
}

function buildScope(user, requested) {
  if (user.rol === 'usuario') {
    return ['mine', 'mios-pendientes', 'mios-cerrados'].includes(requested)
      ? requested
      : 'mios-pendientes';
  }
  if (user.rol === 'tecnico') {
    return ['generales', 'tomados', 'cerrados', 'chat'].includes(requested) ? requested : 'generales';
  }
  return ['all', 'mine', 'generales', 'tomados', 'cerrados', 'chat'].includes(requested) ? requested : 'all';
}

function scopeSql(user, scope) {
  const params = [];
  let where = '';

  if (scope === 'mine' || scope === 'mios-pendientes' || scope === 'mios-cerrados') {
    where = 'WHERE t.solicitante_usuario_id = ?';
    params.push(user.id);
    if (scope === 'mios-pendientes') where += " AND t.estado <> 'Cerrado'";
    if (scope === 'mios-cerrados') where += " AND t.estado = 'Cerrado'";
  } else if (scope === 'generales') {
    where = "WHERE t.estado = 'Abierto' AND t.tecnico_usuario_id IS NULL";
  } else if (scope === 'tomados') {
    where = "WHERE t.tecnico_usuario_id = ? AND t.estado <> 'Cerrado'";
    params.push(user.id);
  } else if (scope === 'cerrados') {
    where = "WHERE t.estado = 'Cerrado'";
  } else if (scope === 'chat') {
    where = `WHERE EXISTS (
      SELECT 1 FROM ticket_messages m
       WHERE m.ticket_id = t.id AND (m.usuario_id = ? OR t.tecnico_usuario_id = ?)
    )`;
    params.push(user.id, user.id);
  }

  return { where, params };
}

router.get('/', async (req, res) => {
  const scope = buildScope(req.user, String(req.query.scope || ''));
  const { where, params } = scopeSql(req.user, scope);

  try {
    const [rows] = await pool.execute(
      `${TICKET_SELECT} ${where} ORDER BY
        FIELD(t.estado, 'Abierto', 'En proceso', 'Resuelto', 'Cerrado'),
        FIELD(t.prioridad, 'Alta', 'Media', 'Baja'),
        t.created_at DESC, t.id DESC
       LIMIT 300`,
      params,
    );
    res.json({ scope, tickets: rows });
  } catch (err) {
    console.error('GET /api/tickets:', err.message);
    res.status(500).json({ error: 'Error al consultar los tickets' });
  }
});

router.get('/stats', requireRole('tecnico', 'admin'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT COUNT(*) AS total,
             SUM(estado = 'Abierto' AND tecnico_usuario_id IS NULL) AS generales,
             SUM(estado <> 'Cerrado' AND tecnico_usuario_id IS NOT NULL) AS tomados,
             SUM(estado = 'Cerrado') AS cerrados
        FROM tickets
    `);
    const row = rows[0] || {};
    res.json({
      total: Number(row.total) || 0,
      generales: Number(row.generales) || 0,
      tomados: Number(row.tomados) || 0,
      cerrados: Number(row.cerrados) || 0,
    });
  } catch (err) {
    console.error('GET /api/tickets/stats:', err.message);
    res.status(500).json({ error: 'Error al consultar las estadísticas' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const ticket = await findTicket(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    if (!canAccess(req.user, ticket)) return res.status(403).json({ error: 'No tienes permiso para ver este ticket' });

    const [events] = await pool.execute(
      `SELECT e.id, e.accion, e.detalle, e.creado_en, u.nombre AS usuario_nombre
         FROM ticket_events e
         LEFT JOIN ticket_users u ON u.id = e.usuario_id
        WHERE e.ticket_id = ?
        ORDER BY e.creado_en ASC, e.id ASC`,
      [ticket.id],
    );
    res.json({ ...ticket, eventos: events });
  } catch (err) {
    console.error('GET /api/tickets/:id:', err.message);
    res.status(500).json({ error: 'Error al consultar el ticket' });
  }
});

router.post('/', async (req, res) => {
  const titulo = clean(req.body?.titulo, 180);
  const descripcion = clean(req.body?.descripcion, 5000);
  const prioridad = PRIORITIES.includes(req.body?.prioridad) ? req.body.prioridad : 'Media';
  const categoria = clean(req.body?.categoria, 60) || null;
  const codigo = clean(req.body?.codigo, 32) || null;

  if (titulo.length < 3) return res.status(400).json({ error: 'Escribe un título de al menos 3 caracteres' });

  try {
    const [result] = await pool.execute(
      `INSERT INTO tickets
        (codigo, categoria, titulo, descripcion, estado, prioridad, responsable, solicitante_usuario_id)
       VALUES (?, ?, ?, ?, 'Abierto', ?, ?, ?)`,
      [codigo, categoria, titulo, descripcion || null, prioridad, req.user.nombre, req.user.id],
    );

    const ticketCode = `TKT-${new Date().getFullYear()}-${String(result.insertId).padStart(5, '0')}`;
    await pool.execute('UPDATE tickets SET codigo = ? WHERE id = ? AND codigo IS NULL', [ticketCode, result.insertId]);
    await logEvent(result.insertId, req.user.id, 'creado', 'Ticket registrado desde la consola local');

    const ticket = await findTicket(result.insertId);
    emit(req, 'tickets:update', { ...resumenTicket(ticket), accion: 'creado', actor: actor(req) }, { soloStaff: true });
    return res.status(201).json(ticket);
  } catch (err) {
    console.error('POST /api/tickets:', err.message);
    return res.status(500).json({ error: 'Error al registrar el ticket' });
  }
});

router.patch('/:id/take', requireRole('tecnico', 'admin'), async (req, res) => {
  const tecnicoId = req.user.rol === 'admin' && req.body?.tecnicoId
    ? Number(req.body.tecnicoId)
    : req.user.id;

  try {
    const ticket = await findTicket(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    if (tecnicoId !== req.user.id && req.user.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo puedes tomar tickets para ti' });
    }
    if (ticket.estado === 'Cerrado') return res.status(409).json({ error: 'El ticket ya está cerrado' });
    if (ticket.tecnico_usuario_id && tecnicoId === ticket.tecnico_usuario_id) {
      return res.status(409).json({ error: 'Ya tienes tomado este ticket' });
    }
    if (ticket.tecnico_usuario_id && req.user.rol !== 'admin') {
      return res.status(409).json({ error: 'Este ticket ya fue tomado por otro técnico' });
    }

    const [techRows] = await pool.execute('SELECT nombre FROM ticket_users WHERE id = ? AND activo = 1', [tecnicoId]);
    if (!techRows.length) return res.status(400).json({ error: 'El técnico indicado no existe o está inactivo' });

    await pool.execute(
      `UPDATE tickets
          SET tecnico_usuario_id = ?, estado = 'En proceso', tomado_en = NOW(),
              resuelto_en = NULL, cerrado_en = NULL, responsable = ?
        WHERE id = ?`,
      [tecnicoId, techRows[0].nombre, ticket.id],
    );
    await logEvent(
      ticket.id,
      req.user.id,
      tecnicoId === req.user.id ? 'tomado' : 'asignado',
      `Atendido por ${techRows[0].nombre}`,
    );

    const updated = await findTicket(ticket.id);
    emit(req, 'tickets:update', {
      ...resumenTicket(updated),
      accion: 'tomado',
      tecnico_nombre: techRows[0].nombre,
      actor: actor(req),
    }, { solicitante: true });
    res.json(updated);
  } catch (err) {
    console.error('PATCH /api/tickets/:id/take:', err.message);
    res.status(500).json({ error: 'Error al tomar el ticket' });
  }
});

router.patch('/:id/status', requireRole('tecnico', 'admin'), async (req, res) => {
  const estado = String(req.body?.estado || '');
  if (!STATUSES.includes(estado)) return res.status(400).json({ error: 'Estado no válido' });

  try {
    const ticket = await findTicket(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });

    await pool.execute(
      `UPDATE tickets
          SET estado = ?,
              resuelto_en = IF(? IN ('Resuelto', 'Cerrado'), COALESCE(resuelto_en, NOW()), NULL),
              cerrado_en = IF(? = 'Cerrado', COALESCE(cerrado_en, NOW()), NULL)
        WHERE id = ?`,
      [estado, estado, estado, ticket.id],
    );
    await logEvent(ticket.id, req.user.id, 'estado', `Estado cambiado a ${estado}`);

    const updated = await findTicket(ticket.id);
    emit(req, 'tickets:update', { ...resumenTicket(updated), accion: 'estado', estado, actor: actor(req) }, { solicitante: true });
    res.json(updated);
  } catch (err) {
    console.error('PATCH /api/tickets/:id/status:', err.message);
    res.status(500).json({ error: 'Error al cambiar el estado' });
  }
});

router.get('/:id/messages', async (req, res) => {
  try {
    const ticket = await findTicket(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    if (!canAccess(req.user, ticket)) return res.status(403).json({ error: 'No tienes permiso para ver este chat' });

    await pool.execute(
      'UPDATE ticket_messages SET leido_en = NOW() WHERE ticket_id = ? AND usuario_id <> ? AND leido_en IS NULL',
      [ticket.id, req.user.id],
    );
    const [rows] = await pool.execute(
      `SELECT m.id, m.usuario_id, m.mensaje, m.creado_en, m.leido_en, u.nombre AS usuario_nombre, u.rol AS usuario_rol
         FROM ticket_messages m
         JOIN ticket_users u ON u.id = m.usuario_id
        WHERE m.ticket_id = ?
        ORDER BY m.creado_en ASC, m.id ASC`,
      [ticket.id],
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/tickets/:id/messages:', err.message);
    res.status(500).json({ error: 'Error al consultar el chat' });
  }
});

router.post('/:id/messages', async (req, res) => {
  const mensaje = clean(req.body?.mensaje, 2000);
  if (!mensaje) return res.status(400).json({ error: 'Escribe un mensaje' });

  try {
    const ticket = await findTicket(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    if (!canAccess(req.user, ticket)) return res.status(403).json({ error: 'No tienes permiso para escribir en este chat' });

    const [result] = await pool.execute(
      'INSERT INTO ticket_messages (ticket_id, usuario_id, mensaje) VALUES (?, ?, ?)',
      [ticket.id, req.user.id, mensaje],
    );
    await logEvent(ticket.id, req.user.id, 'mensaje', 'Mensaje enviado en el chat');

    const message = {
      id: result.insertId,
      ticket_id: Number(ticket.id),
      usuario_id: req.user.id,
      mensaje,
      creado_en: ahoraLocal(),
      usuario_nombre: req.user.nombre,
      usuario_rol: req.user.rol,
    };
    emit(req, 'tickets:message', { ...resumenTicket(ticket), message, actor: actor(req) }, { solicitante: true, tecnico: true });
    res.status(201).json(message);
  } catch (err) {
    console.error('POST /api/tickets/:id/messages:', err.message);
    res.status(500).json({ error: 'Error al enviar el mensaje' });
  }
});

router.patch('/:id', requireRole('admin'), async (req, res) => {
  const fields = [];
  const values = [];
  const allowed = {
    titulo: (v) => clean(v, 180),
    descripcion: (v) => clean(v, 5000),
    prioridad: (v) => (PRIORITIES.includes(v) ? v : null),
    categoria: (v) => clean(v, 60) || null,
    responsable: (v) => clean(v, 128) || null,
  };

  for (const [key, normalize] of Object.entries(allowed)) {
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, key)) continue;
    const value = normalize(req.body[key]);
    if (value === null) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (!fields.length) return res.status(400).json({ error: 'No se recibieron cambios válidos' });

  try {
    await pool.execute(`UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    await logEvent(req.params.id, req.user.id, 'editado', 'Ticket editado por administración');
    const updated = await findTicket(req.params.id);
    emit(req, 'tickets:update', { ...resumenTicket(updated), accion: 'editado', actor: actor(req) }, { solicitante: true });
    res.json(updated);
  } catch (err) {
    console.error('PATCH /api/tickets/:id:', err.message);
    res.status(500).json({ error: 'Error al editar el ticket' });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const ticket = await findTicket(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    const [result] = await pool.execute('DELETE FROM tickets WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Ticket no encontrado' });
    emit(req, 'tickets:update', { ...resumenTicket(ticket), accion: 'eliminado', actor: actor(req) }, { solicitante: true });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/tickets/:id:', err.message);
    res.status(500).json({ error: 'Error al eliminar el ticket' });
  }
});

module.exports = router;
