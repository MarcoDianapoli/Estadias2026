const express = require('express');
const crypto = require('crypto');
const pool = require('../db');

const router = express.Router();
const SESSION_HOURS = Number(process.env.TICKET_SESSION_HOURS) || 12;
const ROLES = ['usuario', 'tecnico', 'admin'];

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  return {
    salt,
    hash: crypto.scryptSync(String(pin), salt, 32).toString('hex'),
  };
}

function safeUser(user) {
  return { id: user.id, nombre: user.nombre, rol: user.rol };
}

function parseToken(header) {
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return /^[\w-]{20,200}$/.test(token) ? token : null;
}

async function getUserFromToken(token) {
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const [rows] = await pool.query(
    `SELECT u.id, u.nombre, u.rol, s.id AS session_id, s.expira_en
       FROM ticket_sessions s
       JOIN ticket_users u ON u.id = s.usuario_id
      WHERE s.token_hash = ? AND u.activo = 1 AND s.expira_en > NOW()`,
    [tokenHash],
  );
  return rows[0] || null;
}

async function requireAuth(req, res, next) {
  const token = parseToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar' });

  try {
    const user = await getUserFromToken(token);
    if (!user) return res.status(401).json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión' });
    req.user = user;
    req.sessionToken = token;
    next();
  } catch (err) {
    console.error('requireAuth:', err.message);
    res.status(500).json({ error: 'Error al validar la sesión' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.rol)) return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    next();
  };
}

router.post('/login', async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim();
  const pin = String(req.body?.pin || '').trim();
  if (!nombre || !pin) return res.status(400).json({ error: 'Escribe tu usuario y PIN' });

  try {
    const [rows] = await pool.query(
      'SELECT id, nombre, pin_salt, pin_hash, rol, activo FROM ticket_users WHERE nombre = ?',
      [nombre],
    );
    const user = rows[0];
    const candidate = user ? crypto.scryptSync(pin, user.pin_salt, 32).toString('hex') : '';
    const valid = user && user.activo && crypto.timingSafeEqual(
      Buffer.from(candidate, 'hex'),
      Buffer.from(user.pin_hash, 'hex'),
    );
    if (!valid) return res.status(401).json({ error: 'Usuario o PIN incorrectos' });

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query(
      'INSERT INTO ticket_sessions (usuario_id, token_hash, expira_en) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))',
      [user.id, tokenHash, SESSION_HOURS],
    );

    res.json({ token, user: safeUser(user) });
  } catch (err) {
    console.error('POST /api/auth/login:', err.message);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  const tokenHash = crypto.createHash('sha256').update(req.sessionToken).digest('hex');
  try {
    await pool.query('DELETE FROM ticket_sessions WHERE token_hash = ?', [tokenHash]);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/auth/logout:', err.message);
    res.status(500).json({ error: 'Error al cerrar sesión' });
  }
});

router.get('/me', requireAuth, (req, res) => res.json({ user: safeUser(req.user) }));

router.get('/users', requireAuth, requireRole('admin'), async (_req, res) => {
  const [rows] = await pool.query('SELECT id, nombre, rol, activo, creado_en FROM ticket_users ORDER BY nombre');
  res.json(rows);
});

router.post('/users', requireAuth, requireRole('admin'), async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim();
  const pin = String(req.body?.pin || '').trim();
  const rol = String(req.body?.rol || 'usuario');
  if (!nombre || pin.length < 4 || !ROLES.includes(rol)) {
    return res.status(400).json({ error: 'Datos inválidos: nombre, PIN de 4+ dígitos y rol válido' });
  }
  const pinData = hashPin(pin);
  try {
    const [result] = await pool.query(
      'INSERT INTO ticket_users (nombre, pin_salt, pin_hash, rol) VALUES (?, ?, ?, ?)',
      [nombre, pinData.salt, pinData.hash, rol],
    );
    res.status(201).json({ id: result.insertId, nombre, rol, activo: 1 });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un usuario con ese nombre' });
    console.error('POST /api/auth/users:', err.message);
    res.status(500).json({ error: 'Error al crear el usuario' });
  }
});

router.patch('/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const nombre = String(req.body?.nombre || '').trim();
  const rol = String(req.body?.rol || '');
  const activo = req.body?.activo === undefined ? undefined : Number(Boolean(req.body.activo));
  if (!id || !nombre || !ROLES.includes(rol) || (activo !== undefined && ![0, 1].includes(activo))) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }
  try {
    await pool.query('UPDATE ticket_users SET nombre = ?, rol = ?, activo = COALESCE(?, activo) WHERE id = ?', [nombre, rol, activo, id]);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un usuario con ese nombre' });
    console.error('PATCH /api/auth/users/:id:', err.message);
    res.status(500).json({ error: 'Error al actualizar el usuario' });
  }
});

router.post('/users/:id/pin', requireAuth, requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const pin = String(req.body?.pin || '').trim();
  if (!id || pin.length < 4) return res.status(400).json({ error: 'PIN de al menos 4 caracteres' });
  const pinData = hashPin(pin);
  await pool.query('UPDATE ticket_users SET pin_salt = ?, pin_hash = ? WHERE id = ?', [pinData.salt, pinData.hash, id]);
  res.json({ ok: true });
});

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.requireRole = requireRole;
module.exports.hashPin = hashPin;
module.exports.parseToken = parseToken;
module.exports.getUserFromToken = getUserFromToken;
