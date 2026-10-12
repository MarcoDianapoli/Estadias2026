require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('./db');

const ROLES = ['usuario', 'tecnico', 'admin'];

// Cuentas de arranque para probar el módulo en LAN. El PIN se sustituye en el primer login.
const BOOTSTRAP_USERS = [
  { nombre: 'Usuario demo', pin: '1111', rol: 'usuario' },
  { nombre: 'Técnico demo', pin: '2222', rol: 'tecnico' },
  { nombre: 'Admin demo', pin: '3333', rol: 'admin' },
];

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  return {
    salt,
    hash: crypto.scryptSync(String(pin), salt, 32).toString('hex'),
  };
}

async function columnExists(table, column) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column],
  );
  return rows[0].total > 0;
}

async function addColumn(table, name, definition) {
  if (!(await columnExists(table, name))) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'migration_tickets.sql'), 'utf8');

  // execute() acepta varios statements; ADD COLUMN IF NOT EXISTS no es soportado por MariaDB 10.11.
  const statements = sql
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^ALTER TABLE tickets\b/i.test(part));

  for (const statement of statements) {
    await pool.query(statement);
  }

  await addColumn('tickets', 'solicitante_usuario_id', 'INT NULL AFTER responsable');
  await addColumn('tickets', 'tecnico_usuario_id', 'INT NULL AFTER solicitante_usuario_id');
  await addColumn('tickets', 'categoria', 'VARCHAR(60) NULL AFTER codigo');
  await addColumn('tickets', 'tomado_en', 'TIMESTAMP NULL DEFAULT NULL AFTER updated_at');
  await addColumn('tickets', 'resuelto_en', 'TIMESTAMP NULL DEFAULT NULL AFTER tomado_en');
  await addColumn('tickets', 'cerrado_en', 'TIMESTAMP NULL DEFAULT NULL AFTER resuelto_en');

  for (const user of BOOTSTRAP_USERS) {
    const [existing] = await pool.query('SELECT id FROM ticket_users WHERE nombre = ?', [user.nombre]);
    if (!existing.length) {
      const pin = hashPin(user.pin);
      await pool.query(
        'INSERT INTO ticket_users (nombre, pin_salt, pin_hash, rol) VALUES (?, ?, ?, ?)',
        [user.nombre, pin.salt, pin.hash, user.rol],
      );
      console.log(`Cuenta de arranque creada: ${user.nombre} (${user.rol})`);
    }
  }

  console.log('Migración de tickets aplicada.');
  await pool.end();
}

main().catch((err) => {
  console.error('Error en migración de tickets:', err.message);
  process.exit(1);
});
