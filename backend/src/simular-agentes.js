require('dotenv').config();
const pool = require('./db');

const API_URL = (process.env.API_URL || 'http://localhost:3001').replace(/\/$/, '');
const INTERVAL = Number(process.env.AGENT_INTERVAL || 8000);
const OFFLINE = new Set(['laptop-sistemas-01', 'laptop-sistemas-02']);

let dispositivos = [];
let contador = 0;

async function leerDispositivos() {
  const [rows] = await pool.query(
    'SELECT device_id, hostname, ip_address, asset_code FROM devices ORDER BY id',
  );
  dispositivos = rows.filter((row) => !OFFLINE.has(row.device_id));
}

async function enviar() {
  contador += 1;
  for (const d of dispositivos) {
    const cpu = 14 + ((contador * 7 + d.device_id.length * 3) % 62);
    const ram = 38 + ((contador * 5 + d.device_id.length) % 48);
    const disco = 44 + ((contador + d.device_id.length * 2) % 40);
    const cuerpo = {
      deviceId: d.device_id,
      assetCode: d.asset_code,
      hostname: d.hostname,
      ipAddress: d.ip_address,
      networkInterfaces: [{ name: 'eth0', address: d.ip_address }],
      cpuUsage: cpu,
      cpuSpeedGhz: 2.4 + ((contador % 12) / 10),
      memoryUsage: ram,
      memoryTotal: 16 * 1024 * 1024 * 1024,
      diskUsage: disco,
      diskTotal: 512 * 1024 * 1024 * 1024,
    };
    try {
      await fetch(`${API_URL}/api/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
    } catch (err) {
      console.error(`No se pudo enviar ${d.device_id}:`, err.message);
    }
  }
}

async function main() {
  await leerDispositivos();
  await enviar();
  setInterval(enviar, INTERVAL);
  console.log(`Simulando ${dispositivos.length} agentes cada ${INTERVAL} ms`);
}

main().catch((err) => {
  console.error('No se pudo iniciar la simulación de agentes:', err.message);
  process.exit(1);
});
