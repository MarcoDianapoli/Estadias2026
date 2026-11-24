require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const pool = require('./db');
const assetsRouter = require('./modules/assets');
const authRouter = require('./modules/auth');
const ticketsRouter = require('./modules/tickets');
const maintenanceRouter = require('./modules/maintenance');
const { requireAuth, requireRole, parseToken, getUserFromToken } = require('./modules/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
const PORT = Number(process.env.PORT) || 3001;
const OFFLINE_AFTER = 20;
const soloStaff = requireRole('tecnico', 'admin');

app.set('io', io);
app.use(cors());
app.use(express.json());

async function getDevices() {
    const [rows] = await pool.query(`
    SELECT d.device_id, d.hostname, d.ip_address, d.network_interfaces,
           d.created_at, d.last_seen,
            TIMESTAMPDIFF(SECOND, d.last_seen, NOW()) AS seconds_ago,
            (d.last_seen IS NOT NULL AND
            TIMESTAMPDIFF(SECOND, d.last_seen, NOW()) <= ${OFFLINE_AFTER}) AS online
        FROM devices d
        ORDER BY d.last_seen DESC, d.hostname ASC
    `);
    return rows.map((r) => ({
        ...r,
        seconds_ago: r.seconds_ago == null ? null : Number(r.seconds_ago),
        online: Boolean(r.online),
        networkInterfaces: (() => {
          try { return JSON.parse(r.network_interfaces || '[]'); }
          catch { return []; }
        })(),
    }));
}

function currentWeekRange() {
    const hoy = new Date();
    const inicio = new Date(hoy);
    inicio.setHours(0, 0, 0, 0);
    inicio.setDate(inicio.getDate() - ((hoy.getDay() + 6) % 7)); // lunes
    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + 7);
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 00:00:00`;
    return { inicio: fmt(inicio), fin: fmt(fin) };
}

// Rutas públicas: estado del servicio, agente de métricas, login y ficha/QR.
app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.post('/api/metrics', async (req, res) => {
  try {
    const {
      deviceId, hostname, ipAddress, networkInterfaces, assetCode,
      cpuUsage, cpuSpeedGhz, memoryUsage, memoryTotal, diskUsage, diskTotal,
    } = req.body || {};

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId es obligatorio' });
    }

    // Convierte vacíos a null para que MySQL nunca reciba "undefined"
    const num = (v) => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number(v);
      return Number.isNaN(n) ? null : n;
    };

    await pool.execute(
      `INSERT INTO devices (device_id, hostname, ip_address, network_interfaces, last_seen)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         hostname = VALUES(hostname),
         ip_address = VALUES(ip_address),
         network_interfaces = VALUES(network_interfaces),
         last_seen = NOW()`,
      [deviceId, hostname || deviceId, ipAddress || null, JSON.stringify(networkInterfaces || [])]
    );

    // El agente lee su código SGL desde agent.config.json y lo envía con las métricas.
    // La vinculación se hace por código, NO por IP ni por hostname (no coinciden).
    const codigo = assetsRouter.normalizeAssetCode(assetCode);
    await pool.execute(
      'UPDATE devices SET asset_code = ? WHERE device_id = ?',
      [codigo, deviceId]
    );

    let linkedAsset = null;
    if (codigo) {
      const [found] = await pool.execute(
        'SELECT id, device_id FROM assets WHERE codigo = ?',
        [codigo]
      );
      if (found.length && (!found[0].device_id || found[0].device_id === deviceId)) {
        await pool.execute('UPDATE assets SET device_id = ? WHERE id = ?', [deviceId, found[0].id]);
        linkedAsset = codigo;
      }
    }

    const [result] = await pool.execute(
      `INSERT INTO metrics
         (device_id, cpu_usage, cpu_speed_ghz, memory_usage, memory_total,
          disk_usage, disk_total, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        deviceId,
        num(cpuUsage),
        num(cpuSpeedGhz),
        num(memoryUsage),
        num(memoryTotal),
        num(diskUsage),
        num(diskTotal),
        ipAddress || null,
      ]
    );

    const metric = {
      id: result.insertId,
      deviceId, hostname, ipAddress,
      assetCode: codigo, linkedAsset,
      cpuUsage, cpuSpeedGhz, memoryUsage, memoryTotal, diskUsage, diskTotal,
      recordedAt: new Date().toISOString(),
    };

    io.emit('metrics:update', metric);
    try {
      io.emit('links:update', await assetsRouter.getLinksStatus());
    } catch (e) {
      console.error('links:update:', e.message);
    }
    return res.status(201).json({ ok: true, metric });
  } catch (err) {
    console.error('POST /api/metrics:', err.message);
    return res.status(500).json({ error: 'Error al guardar la métrica' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/assets', assetsRouter.publicRouter);

// El resto de la API solo se usa desde la app local con sesión de usuario + PIN.
app.use('/api', requireAuth);
// Inventario y monitoreo son módulos de staff; el usuario normal solo usa /api/tickets.
app.use('/api/assets', soloStaff);
app.use('/api/assets', assetsRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/maintenance', soloStaff, maintenanceRouter);

app.get('/api/links/status', soloStaff, async (_req, res) => {
    try {
        res.json(await assetsRouter.getLinksStatus());
    } catch (err) {
        console.error('GET /api/links/status:', err.message);
        res.status(500).json({ error: 'Error al consultar las vinculaciones' });
    }
});

app.get('/api/dashboard/summary', soloStaff, async (_req, res) => {
    try {
        const devices = await getDevices();
        const [ticketRows] = await pool.query(`
            SELECT
                COUNT(*) AS total,
                SUM(estado = 'Abierto') AS abiertos,
                SUM(estado = 'En proceso') AS enProceso
            FROM tickets
        `);
        const { inicio, fin } = currentWeekRange();
        const [maintRows] = await pool.execute(
            `SELECT COUNT(*) AS pendientes
             FROM maintenance
             WHERE estatus = 'Pendiente'
               AND fecha_programada >= ? AND fecha_programada < ?`,
            [inicio, fin]
        );
        const t = ticketRows[0] || {};
        res.json({
            devices: {
                total: devices.length,
                online: devices.filter((d) => d.online).length,
            },
            tickets: {
                total: Number(t.total) || 0,
                abiertos: Number(t.abiertos) || 0,
                enProceso: Number(t.enProceso) || 0,
            },
            mantenimientos: {
                pendientesSemana: Number(maintRows[0]?.pendientes) || 0,
                semana: { inicio, fin },
            },
        });
    } catch (err) {
        console.error('GET /api/dashboard/summary:', err.message);
        res.status(500).json({ error: 'Error al consultar el resumen' });
    }
});

app.get('/api/devices', soloStaff, async (_req, res) => {
    try {
        res.json(await getDevices());
    } catch (err) {
        console.error('GET /api/devices:', err.message);
        res.status(500).json({ error: 'Error al consultar equipos' });
    }
});

app.get('/api/metrics', soloStaff, async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 1000);
        const deviceId = req.query.deviceId;
        const select = `
            SELECT id, device_id, cpu_usage, cpu_speed_ghz, memory_usage, memory_total,
                disk_usage, disk_total, ip_address, recorded_at
            FROM(
                SELECT * FROM metrics
                ${deviceId ? 'WHERE device_id = ?' : ''}
                ORDER BY recorded_at DESC, id DESC
                LIMIT ${limit}
            ) t
             ORDER BY recorded_at ASC, id ASC
        `;
        const [rows] = deviceId
            ? await pool.execute(select, [deviceId])
            : await pool.execute(select);
        res.json(rows);
    } catch (err) {
        console.error('GET /api/metrics:', err.message);
        res.status(500).json({ error: 'Error al consultar métricas' });
    }
});

io.on('connection', async (socket) => {
    console.log('Cliente conectado a Socket.IO:', socket.id);
    const token = parseToken(socket.handshake.auth?.token) || parseToken(socket.handshake.query?.token);
    try {
        const user = await getUserFromToken(token);
        if (user) {
            socket.data.user = { id: user.id, nombre: user.nombre, rol: user.rol };
            // Staff ve todas las incidencias; un usuario normal solo su sala personal.
            if (user.rol === 'usuario') socket.join(`ticket-user:${user.id}`);
            else socket.join('tickets');
        }
    } catch (err) {
        console.error('Socket auth:', err.message);
    }
    socket.emit('server:ready', { ok: true });
});

setInterval(async () => {
    try {
        io.emit('devices:status', await getDevices());
    } catch (err) {
        console.error('devices:status:', err.message);
    }
    try {
        io.emit('links:update', await assetsRouter.getLinksStatus());
    } catch (err) {
        console.error('links:update:', err.message);
    }
}, 10000);

server.listen(PORT, () => {
    console.log(`API y Socket.io en http://localhost:${PORT}`);
});
