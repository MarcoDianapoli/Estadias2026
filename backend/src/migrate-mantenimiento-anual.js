require('dotenv').config();
const pool = require('./db');

const COLUMNAS = [
  {
    nombre: 'origen',
    definicion: "ENUM('manual', 'anual') NOT NULL DEFAULT 'manual' AFTER observaciones",
  },
  { nombre: 'anio_plan', definicion: 'INT NULL AFTER origen' },
  { nombre: 'ronda', definicion: 'TINYINT NULL AFTER anio_plan' },
  { nombre: 'semana', definicion: 'TINYINT NULL AFTER ronda' },
];

const INDICES = [
  { nombre: 'idx_maintenance_plan', definicion: '(`origen`, `anio_plan`)' },
  { nombre: 'idx_maintenance_ronda', definicion: '(`anio_plan`, `ronda`, `semana`)' },
];

async function existeColumna(connection, nombre) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maintenance' AND COLUMN_NAME = ?`,
    [nombre],
  );
  return Number(rows[0]?.total) > 0;
}

async function existeIndice(connection, nombre) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maintenance' AND INDEX_NAME = ?`,
    [nombre],
  );
  return Number(rows[0]?.total) > 0;
}

(async () => {
  const connection = await pool.getConnection();
  try {
    for (const columna of COLUMNAS) {
      if (await existeColumna(connection, columna.nombre)) {
        console.log(`Columna ${columna.nombre}: ya existe`);
        continue;
      }
      await connection.execute(`ALTER TABLE maintenance ADD COLUMN ${columna.nombre} ${columna.definicion}`);
      console.log(`Columna ${columna.nombre}: agregada`);
    }

    for (const indice of INDICES) {
      if (await existeIndice(connection, indice.nombre)) {
        console.log(`Índice ${indice.nombre}: ya existe`);
        continue;
      }
      await connection.execute(`ALTER TABLE maintenance ADD KEY ${indice.nombre} ${indice.definicion}`);
      console.log(`Índice ${indice.nombre}: agregado`);
    }

    console.log('Migración del plan anual de mantenimiento completada');
  } finally {
    connection.release();
    await pool.end();
  }
})().catch(async (err) => {
  console.error('Error en la migración del plan anual:', err.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
