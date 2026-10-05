require('dotenv').config();
const os = require('os');
const path = require('path');
const fs = require('fs');
const si = require('systeminformation');

// Configurable sin tocar código: agent.config.json junto al proyecto (o AGENT_CONFIG).
const CONFIG_PATH = process.env.AGENT_CONFIG
  ? path.resolve(process.env.AGENT_CONFIG)
  : path.join(__dirname, '..', 'agent.config.json');

let config = {};
try {
  if (fs.existsSync(CONFIG_PATH)) {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }
} catch (err) {
  console.error(`No se pudo leer ${CONFIG_PATH}:`, err.message);
}

const DEVICE_ID = process.env.AGENT_DEVICE_ID || config.deviceId || 'PC-01';
const ASSET_CODE = process.env.AGENT_ASSET_CODE || config.assetCode || '';
const INTERVAL = Number(process.env.AGENT_INTERVAL || config.intervalMs) || 5000;
const API_URL = (process.env.API_URL || config.apiUrl || 'http://localhost:3001').replace(/\/$/, '');

function networkInterfaces() {
  const found = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      found.push({
        name,
        address: iface.address,
        cidr: iface.cidr || null,
      });
    }
  }
  return found;
}

function isPrivateLan(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  if (p[0] === 10) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  return false;
}

function isTailscale(ip) {
  const p = ip.split('.').map(Number);
  return p.length === 4 && p[0] === 100 && p[1] >= 64 && p[1] <= 127;
}

function isLoganmexLan(ip) {
  return ip.startsWith('148.202.3.');
}

function isVirtualAdapter(name) {
  return /tailscale|zerotier|vpn|virtual|vmware|virtualbox|hyper-v|docker|wsl|loopback/i.test(name);
}

function primaryLanIp(interfaces) {
  const physical = interfaces.filter((i) => !isVirtualAdapter(i.name));
  return physical.find((i) => isLoganmexLan(i.address))?.address
      || physical.find((i) => isPrivateLan(i.address))?.address
      || physical[0]?.address
      || interfaces.find((i) => isLoganmexLan(i.address))?.address
      || interfaces.find((i) => isPrivateLan(i.address))?.address
      || interfaces.find((i) => !isTailscale(i.address))?.address
      || interfaces[0]?.address
      || '127.0.0.1';
}

async function collect() {
  const [load, mem, fs, speed] = await Promise.all([
    si.currentLoad(), si.mem(), si.fsSize(), si.cpuCurrentSpeed(),
  ]);
  const interfaces = networkInterfaces();

  const memoryTotal = mem.total;
  const memoryUsedReal = memoryTotal - mem.available;
  const memoryUsage = memoryTotal ? (memoryUsedReal / memoryTotal) * 100 : 0;
  const disk = fs.filter((d) => d.size > 0).sort((a, b) => b.size - a.size)[0];

  return {
    deviceId: DEVICE_ID,
    assetCode: ASSET_CODE,
    hostname: os.hostname(),
    ipAddress: primaryLanIp(interfaces),
    networkInterfaces: interfaces,
    cpuUsage: Number((load.currentLoad || 0).toFixed(2)) || 0,
    cpuSpeedGhz: Number((speed?.avg || 0).toFixed(2)) || 0,
    memoryUsage: Number(memoryUsage.toFixed(2)) || 0,
    memoryTotal: memoryTotal || 0,
    diskUsage: disk ? Number((disk.use || 0).toFixed(2)) : 0,
    diskTotal: disk ? (disk.size || 0) : 0,
  };
}

async function send(metrics) {
  const res = await fetch(`${API_URL}/api/metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metrics),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function loop() {
  try {
    const metrics = await collect();
    await send(metrics);
    console.log(
      `[${new Date().toLocaleTimeString('es-MX', { hour12: false })}] ${DEVICE_ID} ` +
      `(${ASSET_CODE || 'sin código SGL'}) ` +
      `CPU ${metrics.cpuUsage}% @ ${metrics.cpuSpeedGhz} GHz · RAM ${metrics.memoryUsage}% · Disco ${metrics.diskUsage}%`
    );
  } catch (err) {
    console.error('Error al enviar métricas:', err.message);
  }
  setTimeout(loop, INTERVAL);
}

console.log(
  `Agente ${DEVICE_ID} → ${API_URL} cada ${INTERVAL} ms · ` +
  `código SGL: ${ASSET_CODE || '(sin definir, se mostrará en las notificaciones)'}`
);
loop();