require('dotenv').config();
const mysql = require('mysql2');
const pool = require('./db');
const { crearRespaldo } = require('./backup-normalizacion');
const {
  normalizar,
  normalizarCodigoSgl,
  normalizarCodigoTicket,
  normalizarFamilias,
} = require('./normalizacion');

// Enums canónicos. Se convierten a VARCHAR, se normalizan las filas y se
// vuelven a ENUM; así la migración se puede repetir sin cambiar los datos.
const ENUMS = [
  {
    tabla: 'tickets', columna: 'estado',
    valores: ['abierto', 'en proceso', 'resuelto', 'cerrado'], defecto: 'abierto',
  },
  {
    tabla: 'tickets', columna: 'prioridad',
    valores: ['baja', 'media', 'alta'], defecto: 'media',
  },
  {
    tabla: 'maintenance', columna: 'tipo',
    valores: ['logico', 'fisico'], defecto: 'logico',
  },
  {
    tabla: 'maintenance', columna: 'estatus',
    valores: ['pendiente', 'en proceso', 'completado', 'cancelado'], defecto: 'pendiente',
  },
];

// Texto de control y nombres. Quedan FUERA: títulos, descripciones, mensajes,
// observaciones, comentarios y notas (texto libre del usuario).
const TEXTOS = {
  ticket_users: [{ columna: 'nombre' }],
  tickets: [
    { columna: 'codigo', convertir: normalizarCodigoTicket },
    { columna: 'categoria' },
    { columna: 'responsable' },
  ],
  ticket_events: [{ columna: 'accion' }],
  maintenance: [
    { columna: 'codigo', convertir: normalizarCodigoSgl },
    { columna: 'responsable' },
  ],
  assets: [
    { columna: 'codigo', convertir: normalizarCodigoSgl },
    { columna: 'device_id' },
    { columna: 'tipo' },
    { columna: 'familias', convertir: normalizarFamilias },
    { columna: 'marca' },
    { columna: 'modelo' },
    { columna: 'numero_serie' },
    { columna: 'hostname' },
    { columna: 'correo' },
    { columna: 'vnc' },
    { columna: 'ubicacion' },
    { columna: 'responsable' },
  ],
  devices: [
    { columna: 'device_id' },
    { columna: 'hostname' },
    { columna: 'asset_code', convertir: normalizarCodigoSgl },
  ],
  metrics: [{ columna: 'device_id' }],
};

async function existeColumna(tabla, columna) {
  const [filas] = await pool.query(
    `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabla, columna],
  );
  return filas[0].total > 0;
}

async function normalizarEnum({ tabla, columna, valores, defecto }) {
  if (!(await existeColumna(tabla, columna))) return 0;

  const [definicion] = await pool.query(
    `SELECT COLUMN_TYPE AS tipo FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabla, columna],
  );
  const valoresActuales = definicion[0]?.tipo?.match(/'([^']*)'/g)?.map((valor) => valor.slice(1, -1)) || [];
  if (valoresActuales.length === valores.length
      && valoresActuales.every((valor, indice) => valor === valores[indice])) return 0;

  const lista = valores.map((valor) => mysql.escape(valor)).join(', ');
  await pool.query(`ALTER TABLE ${tabla} MODIFY ${columna} VARCHAR(64) NOT NULL DEFAULT ${mysql.escape(defecto)}`);

  const [filas] = await pool.query(`SELECT id, ${columna} AS valor FROM ${tabla}`);
  let cambiados = 0;
  for (const fila of filas) {
    const destino = valores.includes(normalizar(fila.valor)) ? normalizar(fila.valor) : defecto;
    if (destino === fila.valor) continue;
    await pool.query(`UPDATE ${tabla} SET ${columna} = ? WHERE id = ?`, [destino, fila.id]);
    cambiados += 1;
  }

  await pool.query(
    `ALTER TABLE ${tabla} MODIFY ${columna} ENUM(${lista}) NOT NULL DEFAULT ${mysql.escape(defecto)}`,
  );
  return cambiados;
}

async function normalizarTextos(conn, tabla, columnas) {
  const presentes = [];
  for (const spec of columnas) {
    if (await existeColumna(tabla, spec.columna)) presentes.push(spec);
  }
  if (!presentes.length) return 0;

  const nombres = presentes.map((spec) => spec.columna);
  const [filas] = await conn.query(`SELECT id, ${nombres.join(', ')} FROM ${tabla}`);
  let cambiados = 0;

  for (const fila of filas) {
    const sets = [];
    const valores = [];
    for (const spec of presentes) {
      const actual = fila[spec.columna];
      const destino = spec.convertir ? spec.convertir(actual) : normalizar(actual);
      if (destino === actual) continue;
      sets.push(`${spec.columna} = ?`);
      valores.push(destino);
    }
    if (!sets.length) continue;
    await conn.query(`UPDATE ${tabla} SET ${sets.join(', ')} WHERE id = ?`, [...valores, fila.id]);
    cambiados += 1;
  }
  return cambiados;
}

async function main() {
  const respaldo = await crearRespaldo();
  console.log(`Respaldo previo: ${respaldo}`);

  let enums = 0;
  for (const config of ENUMS) {
    const cambiados = await normalizarEnum(config);
    enums += cambiados;
    console.log(`  ${config.tabla}.${config.columna}: ${cambiados} filas`);
  }

  // devices.device_id es referenciado por metrics y assets con ON UPDATE
  // RESTRICT. Se normalizan padres e hijos en una sola transacción con la
  // comprobación de llaves foráneas pausada; al terminar todos quedan
  // apuntando al mismo identificador en minúsculas.
  const conn = await pool.getConnection();
  let textos = 0;
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.beginTransaction();
    for (const [tabla, columnas] of Object.entries(TEXTOS)) {
      const cambiados = await normalizarTextos(conn, tabla, columnas);
      textos += cambiados;
      console.log(`  ${tabla}: ${cambiados} filas`);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    conn.release();
  }

  console.log(`Normalización aplicada: ${enums} cambios de enum, ${textos} filas de texto.`);
  console.log('Títulos, descripciones, mensajes, observaciones, comentarios y notas sin cambios.');
  await pool.end();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error en la normalización de la BD:', err.message);
    process.exit(1);
  });
}

module.exports = { main, ENUMS, TEXTOS };
