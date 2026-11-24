const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const pool = require('../db');
const { parseToken, getUserFromToken } = require('./auth');

const router = express.Router();
const publicRouter = express.Router();

const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const rawKey = process.env.ENCRYPTION_KEY;
if (!rawKey || rawKey.length < 16 || rawKey === 'cambia-esta-llave') {
  throw new Error('ENCRYPTION_KEY inválida: define una clave secreta de al menos 16 caracteres');
}
// Se mantiene la derivación original para no invalidar credenciales ya cifradas.
const CIPHER_KEY = crypto.createHash('sha256').update(rawKey).digest();

const COLUMNS = [
  'codigo', 'device_id', 'tipo', 'familias', 'marca', 'modelo', 'numero_serie',
  'hostname', 'ip_address', 'correo', 'vnc',
  'password_cifrado', 'admin_password_cifrado', 'rustdesk_password_cifrado',
  'ubicacion', 'responsable', 'notas',
];

// Claves que usa el frontend (camelCase) para cada columna de la BD.
const BODY_KEY = {
  codigo: 'codigo',
  device_id: 'deviceId',
  tipo: 'tipo',
  familias: 'familias',
  marca: 'marca',
  modelo: 'modelo',
  numero_serie: 'numeroSerie',
  hostname: 'hostname',
  ip_address: 'ipAddress',
  correo: 'correo',
  vnc: 'vnc',
  password_cifrado: 'password',
  admin_password_cifrado: 'adminPassword',
  rustdesk_password_cifrado: 'rustdeskPassword',
  ubicacion: 'ubicacion',
  responsable: 'responsable',
  notas: 'notas',
};

function fichaUrl(token) {
  return `${PUBLIC_BASE_URL}/ficha?ficha=${encodeURIComponent(token)}`;
}

function fichaPath(token) {
  return `/ficha?ficha=${encodeURIComponent(token)}`;
}

function withFicha(row) {
  const { password_cifrado, admin_password_cifrado, rustdesk_password_cifrado, ...safe } = row;
  return {
    ...safe,
    // El usuario pidió ver las credenciales directamente en el frontend.
    password: decrypt(password_cifrado),
    adminPassword: decrypt(admin_password_cifrado),
    rustdeskPassword: decrypt(rustdesk_password_cifrado),
    tienePassword: Boolean(password_cifrado),
    tieneAdminPassword: Boolean(admin_password_cifrado),
    tieneRustdeskPassword: Boolean(rustdesk_password_cifrado),
    fichaUrl: fichaUrl(row.qr_token),
    fichaPath: fichaPath(row.qr_token),
  };
}

// La ficha pública del QR no debe revelar credenciales; solo la sesión interna las descifra.
function publicFicha(row) {
  const { password_cifrado, admin_password_cifrado, rustdesk_password_cifrado, ...safe } = row;
  return {
    ...safe,
    fichaUrl: fichaUrl(row.qr_token),
    fichaPath: fichaPath(row.qr_token),
  };
}

function clean(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text || /^n\s*\/?\s*a$|^-+$|^ninguno$/i.test(text)) return null;
  return text;
}

function normalizeCodigo(value) {
  const text = clean(value);
  if (!text) return null;
  const compact = text.toUpperCase().replace(/\s+/g, '');
  const match = compact.match(/^SGL-?0*(\d{1,6})$/);
  return match ? `SGL-${match[1].padStart(4, '0')}` : compact;
}

function encrypt(value) {
  const text = clean(value);
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', CIPHER_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

function decrypt(value) {
  if (!value || !value.startsWith('v1:')) return value || '';
  try {
    const [, iv, tag, data] = value.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', CIPHER_KEY, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

const FAMILY_LABELS = {
  cpu: 'CPU',
  teclado: 'Teclado',
  raton: 'Ratón',
  monitor: 'Monitor',
  laptop: 'Laptop',
};

function familyKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const FAMILY_ORDER = Object.keys(FAMILY_LABELS).map((key) => FAMILY_LABELS[key]);

// Acepta { Monitor: 2 }, ["Monitor"] o "Monitor,Laptop" (formato anterior)
// y guarda siempre JSON con cantidades: {"Monitor":2,"Laptop":1}.
function normalizeFamilias(value) {
  if (value === undefined || value === null) return null;
  let source = value;
  if (typeof source === 'string') {
    const text = source.trim();
    if (!text) return null;
    if (text.startsWith('{')) {
      try { source = JSON.parse(text); } catch { source = text; }
    }
  }

  const counts = new Map();
  const add = (key, quantity) => {
    const label = FAMILY_LABELS[familyKey(key)];
    if (!label) return;
    const number = Number.parseInt(quantity, 10);
    counts.set(label, Number.isFinite(number) && number > 0 ? Math.min(number, 99) : 1);
  };

  if (Array.isArray(source)) {
    source.forEach((item) => add(item, 1));
  } else if (typeof source === 'object') {
    Object.entries(source).forEach(([key, quantity]) => add(key, quantity));
  } else {
    String(source).split(/[,;|]+/).forEach((item) => add(item, 1));
  }

  const labels = FAMILY_ORDER.filter((label) => counts.has(label));
  return labels.length
    ? JSON.stringify(Object.fromEntries(labels.map((label) => [label, counts.get(label)])))
    : null;
}

function mapBody(body = {}) {
  return {
    codigo: normalizeCodigo(body.codigo),
    device_id: clean(body.deviceId),
    tipo: clean(body.tipo) || 'Equipo',
    familias: normalizeFamilias(body.familias),
    marca: clean(body.marca),
    modelo: clean(body.modelo),
    numero_serie: clean(body.numeroSerie),
    hostname: clean(body.hostname),
    ip_address: clean(body.ipAddress),
    correo: clean(body.correo),
    vnc: clean(body.vnc),
    password_cifrado: encrypt(body.password),
    admin_password_cifrado: encrypt(body.adminPassword),
    rustdesk_password_cifrado: encrypt(body.rustdeskPassword),
    ubicacion: clean(body.ubicacion),
    responsable: clean(body.responsable),
    notas: clean(body.notas),
  };
}

async function reserveCodigo(connection) {
  await connection.query(`
    INSERT INTO asset_sequence (id, next_value) VALUES (1, 1)
    ON DUPLICATE KEY UPDATE id = id
  `);
  const [rows] = await connection.query('SELECT next_value FROM asset_sequence WHERE id = 1 FOR UPDATE');
  const next = rows[0].next_value;
  await connection.query('UPDATE asset_sequence SET next_value = next_value + 1 WHERE id = 1');
  return `SGL-${String(next).padStart(4, '0')}`;
}

async function syncSequence(connection) {
  await connection.query(`
    UPDATE asset_sequence
    SET next_value = GREATEST(next_value,
      (SELECT IFNULL(MAX(CAST(SUBSTRING(codigo, 5) AS UNSIGNED)), 0) + 1
       FROM assets WHERE codigo REGEXP '^SGL-[0-9]+$'))
    WHERE id = 1
  `);
}

// Normaliza el código que envía el agente: "sgl1", "SGL-0001" y "SGL-1" son el mismo.
function normalizeAssetCode(value) {
  const text = clean(value);
  if (!text) return null;
  const match = text.toUpperCase().replace(/\s+/g, '').match(/^SGL-?0*(\d{1,6})$/);
  return match ? `SGL-${match[1].padStart(4, '0')}` : null;
}

// Estado usado por la campana de notificaciones.
async function getLinksStatus() {
  const [devices] = await pool.query(`
    SELECT d.device_id, d.hostname, d.ip_address, d.asset_code, d.last_seen
    FROM devices d
    ORDER BY d.last_seen DESC, d.hostname ASC
  `);
  const [assets] = await pool.query(`
    SELECT a.id, a.codigo, a.ip_address, a.device_id,
           d.hostname AS device_hostname, d.ip_address AS device_ip,
           d.asset_code AS device_asset_code
    FROM assets a
    LEFT JOIN devices d ON d.device_id = a.device_id
    ORDER BY a.codigo ASC
  `);

  const linked = new Set(assets.filter((a) => a.device_id).map((a) => a.device_id));
  const byCode = new Map(assets.map((a) => [a.codigo, a]));

  const unlinkedDevices = devices
    .filter((d) => !linked.has(d.device_id))
    .map((d) => ({
      deviceId: d.device_id,
      hostname: d.hostname,
      ipAddress: d.ip_address,
      assetCode: d.asset_code || null,
      lastSeen: d.last_seen,
    }));

  const ipMismatch = assets
    .filter((a) => a.device_id && a.ip_address && a.device_ip
      && String(a.ip_address).trim() !== String(a.device_ip).trim())
    .map((a) => ({
      codigo: a.codigo,
      deviceId: a.device_id,
      hostname: a.device_hostname,
      assetIp: a.ip_address,
      deviceIp: a.device_ip,
    }));

  const codeNotFound = devices
    .filter((d) => d.asset_code && !byCode.has(d.asset_code))
    .map((d) => ({ deviceId: d.device_id, hostname: d.hostname, assetCode: d.asset_code }));

  const codeConflict = devices
    .filter((d) => {
      const asset = d.asset_code ? byCode.get(d.asset_code) : null;
      return asset && asset.device_id && asset.device_id !== d.device_id;
    })
    .map((d) => ({
      deviceId: d.device_id,
      hostname: d.hostname,
      assetCode: d.asset_code,
      linkedTo: byCode.get(d.asset_code).device_id,
    }));

  const unlinkedAssets = assets.filter((a) => !a.device_id).length;

  return {
    unlinkedDevices,
    ipMismatch,
    codeNotFound,
    codeConflict,
    unlinkedAssets,
    counts: {
      unlinkedDevices: unlinkedDevices.length,
      ipMismatch: ipMismatch.length,
      codeNotFound: codeNotFound.length,
      codeConflict: codeConflict.length,
      unlinkedAssets,
    },
    generatedAt: new Date().toISOString(),
  };
}

function emitLinksUpdate(req) {
  const io = req.app.get('io');
  if (!io) return;
  getLinksStatus()
    .then((status) => io.emit('links:update', status))
    .catch((err) => console.error('links:update:', err.message));
}

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.*, d.hostname AS device_hostname
      FROM assets a
      LEFT JOIN devices d ON d.device_id = a.device_id
      ORDER BY a.codigo ASC, a.id ASC
    `);
    res.json(rows.map(withFicha));
  } catch (err) {
    console.error('GET /api/assets:', err.message);
    res.status(500).json({ error: 'Error al consultar el inventario' });
  }
});

router.post('/', async (req, res) => {
  let connection;
  try {
    const data = mapBody(req.body);
    connection = await pool.getConnection();
    await connection.beginTransaction();

    if (data.codigo) {
      const [existing] = await connection.execute('SELECT id FROM assets WHERE codigo = ?', [data.codigo]);
      if (existing.length) {
        await connection.rollback();
        return res.status(409).json({ error: `El código ${data.codigo} ya está registrado` });
      }
    } else {
      data.codigo = await reserveCodigo(connection);
    }

    const qrToken = crypto.randomUUID();
    await connection.execute(
      `INSERT INTO assets (qr_token, ${COLUMNS.join(', ')})
       VALUES (?, ${COLUMNS.map(() => '?').join(', ')})`,
      [qrToken, ...COLUMNS.map((col) => data[col])]
    );

    await syncSequence(connection);
    await connection.commit();

    const [created] = await pool.execute('SELECT * FROM assets WHERE codigo = ?', [data.codigo]);
    return res.status(201).json(withFicha(created[0]));
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('POST /api/assets:', err.message);
    return res.status(500).json({ error: 'Error al registrar el equipo' });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/import', async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) {
    return res.status(400).json({ error: 'No se recibieron filas para importar' });
  }

  let connection;
  const result = { importados: 0, actualizados: 0, errores: [] };

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    for (const row of rows) {
      const data = mapBody(row);
      if (!data.codigo) {
        result.errores.push('Fila sin código SGL');
        continue;
      }
      try {
        const [existing] = await connection.execute('SELECT * FROM assets WHERE codigo = ?', [data.codigo]);
        if (existing.length) {
          const merged = { ...data };
          for (const col of ['password_cifrado', 'admin_password_cifrado', 'rustdesk_password_cifrado', 'familias']) {
            if (merged[col] === null && existing[0][col] !== undefined) {
              merged[col] = existing[0][col];
            }
          }
          await connection.execute(
            `UPDATE assets SET ${COLUMNS.map((col) => `${col} = ?`).join(', ')} WHERE id = ?`,
            [...COLUMNS.map((col) => merged[col]), existing[0].id]
          );
          result.actualizados += 1;
        } else {
          await connection.execute(
            `INSERT INTO assets (qr_token, ${COLUMNS.join(', ')})
             VALUES (?, ${COLUMNS.map(() => '?').join(', ')})`,
            [crypto.randomUUID(), ...COLUMNS.map((col) => data[col])]
          );
          result.importados += 1;
        }
      } catch (err) {
        result.errores.push(`${data.codigo}: ${err.message}`);
      }
    }

    await syncSequence(connection);
    await connection.commit();
    return res.json(result);
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('POST /api/assets/import:', err.message);
    return res.status(500).json({ error: 'Error al importar el inventario' });
  } finally {
    if (connection) connection.release();
  }
});

// Editar un equipo existente. Solo se actualizan los campos enviados.
router.put('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM assets WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Equipo no encontrado' });

    const body = req.body || {};
    const data = mapBody(body);
    const sets = [];
    const values = [];
    for (const col of COLUMNS) {
      const key = BODY_KEY[col];
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      if (col === 'codigo' && !data.codigo) continue; // el código nunca queda vacío
      sets.push(`${col} = ?`);
      values.push(data[col]);
    }

    if (sets.length) {
      values.push(req.params.id);
      await pool.execute(`UPDATE assets SET ${sets.join(', ')} WHERE id = ?`, values);
      await syncSequence(pool);
    }

    const [updated] = await pool.execute(
      `SELECT a.*, d.hostname AS device_hostname
       FROM assets a LEFT JOIN devices d ON d.device_id = a.device_id
       WHERE a.id = ?`,
      [req.params.id]
    );
    emitLinksUpdate(req);
    return res.json(withFicha(updated[0]));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese código SGL ya está registrado' });
    }
    console.error('PUT /api/assets/:id:', err.message);
    return res.status(500).json({ error: 'Error al actualizar el equipo' });
  }
});

// Vinculación manual con un agente detectado.
router.post('/:id/link', async (req, res) => {
  try {
    const deviceId = clean(req.body?.deviceId);
    if (!deviceId) return res.status(400).json({ error: 'Selecciona un agente' });

    const [devices] = await pool.execute('SELECT device_id FROM devices WHERE device_id = ?', [deviceId]);
    if (!devices.length) return res.status(404).json({ error: 'Agente no encontrado' });

    const [assets] = await pool.execute('SELECT id FROM assets WHERE id = ?', [req.params.id]);
    if (!assets.length) return res.status(404).json({ error: 'Equipo no encontrado' });

    await pool.execute('UPDATE assets SET device_id = ? WHERE id = ?', [deviceId, req.params.id]);
    emitLinksUpdate(req);
    return res.json({ ok: true, deviceId });
  } catch (err) {
    console.error('POST /api/assets/:id/link:', err.message);
    return res.status(500).json({ error: 'Error al vincular el equipo' });
  }
});

router.post('/:id/unlink', async (req, res) => {
  try {
    const [result] = await pool.execute(
      'UPDATE assets SET device_id = NULL WHERE id = ? AND device_id IS NOT NULL',
      [req.params.id]
    );
    emitLinksUpdate(req);
    return res.json({ ok: true, changes: result.affectedRows });
  } catch (err) {
    console.error('POST /api/assets/:id/unlink:', err.message);
    return res.status(500).json({ error: 'Error al desvincular el equipo' });
  }
});

publicRouter.get('/token/:token', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT a.*, d.hostname AS device_hostname
       FROM assets a
       LEFT JOIN devices d ON d.device_id = a.device_id
       WHERE a.qr_token = ?`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Equipo no encontrado' });

    const sessionUser = await getUserFromToken(parseToken(req.headers.authorization));
    const esStaff = sessionUser && ['tecnico', 'admin'].includes(sessionUser.rol);
    return res.json(esStaff ? withFicha(rows[0]) : publicFicha(rows[0]));
  } catch (err) {
    console.error('GET /api/assets/token/:token:', err.message);
    return res.status(500).json({ error: 'Error al consultar la ficha' });
  }
});

router.get('/:id/comments', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, autor, comentario, created_at
       FROM asset_comments
       WHERE asset_id = ?
       ORDER BY created_at ASC, id ASC`,
      [req.params.id]
    );
    return res.json(rows);
  } catch (err) {
    console.error('GET /api/assets/:id/comments:', err.message);
    return res.status(500).json({ error: 'Error al consultar los comentarios' });
  }
});

router.post('/:id/comments', async (req, res) => {
  const comentario = clean(req.body?.comentario);
  if (!comentario) {
    return res.status(400).json({ error: 'Escribe un comentario' });
  }
  if (comentario.length > 2000) {
    return res.status(400).json({ error: 'El comentario es demasiado largo' });
  }
  const autor = (clean(req.body?.autor) || 'Anónimo').slice(0, 128);

  try {
    const [asset] = await pool.execute('SELECT id FROM assets WHERE id = ?', [req.params.id]);
    if (!asset.length) return res.status(404).json({ error: 'Equipo no encontrado' });

    const [result] = await pool.execute(
      'INSERT INTO asset_comments (asset_id, autor, comentario) VALUES (?, ?, ?)',
      [req.params.id, autor, comentario]
    );
    return res.status(201).json({
      id: result.insertId,
      autor,
      comentario,
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });
  } catch (err) {
    console.error('POST /api/assets/:id/comments:', err.message);
    return res.status(500).json({ error: 'Error al guardar el comentario' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM assets WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Equipo no encontrado' });
    return res.json(withFicha(rows[0]));
  } catch (err) {
    console.error('GET /api/assets/:id:', err.message);
    return res.status(500).json({ error: 'Error al consultar el equipo' });
  }
});

router.get('/:id/credentials', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT codigo, password_cifrado, admin_password_cifrado, rustdesk_password_cifrado
       FROM assets WHERE id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Equipo no encontrado' });
    return res.json({
      password: decrypt(rows[0].password_cifrado),
      adminPassword: decrypt(rows[0].admin_password_cifrado),
      rustdeskPassword: decrypt(rows[0].rustdesk_password_cifrado),
    });
  } catch (err) {
    console.error('GET /api/assets/:id/credentials:', err.message);
    return res.status(500).json({ error: 'Error al consultar las credenciales' });
  }
});

publicRouter.get('/:id/qr', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT qr_token FROM assets WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Equipo no encontrado' });

    const png = await QRCode.toBuffer(fichaUrl(rows[0].qr_token), {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    return res.type('image/png').send(png);
  } catch (err) {
    console.error('GET /api/assets/:id/qr:', err.message);
    return res.status(500).json({ error: 'Error al generar el QR' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM assets WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Equipo no encontrado' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/assets/:id:', err.message);
    return res.status(500).json({ error: 'Error al eliminar el equipo' });
  }
});

module.exports = router;
module.exports.publicRouter = publicRouter;
module.exports.getLinksStatus = getLinksStatus;
module.exports.normalizeAssetCode = normalizeAssetCode;
