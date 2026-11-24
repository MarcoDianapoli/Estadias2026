require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const pool = require('./db');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');

function escapar(valor) {
  if (valor instanceof Date) {
    return `'${valor.toISOString().slice(0, 19).replace('T', ' ')}'`;
  }
  return mysql.escape(valor);
}

async function crearRespaldo() {
  const [tablas] = await pool.query(
    "SELECT TABLE_NAME AS nombre FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
  );
  const [db] = await pool.query('SELECT DATABASE() AS nombre');
  const nombreDb = db[0]?.nombre || 'monitoreo';
  const sello = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const archivo = path.join(BACKUP_DIR, `antes-normalizacion-${sello}.sql`);

  const lineas = [
    `-- Respaldo completo de ${nombreDb} antes de normalizar a minúsculas sin acentos.`,
    `-- Generado: ${new Date().toISOString()}`,
    'SET FOREIGN_KEY_CHECKS=0;',
    '',
  ];

  for (const { nombre } of tablas) {
    const [crear] = await pool.query(`SHOW CREATE TABLE \`${nombre}\``);
    const ddl = crear[0]?.['Create Table'] || crear[0]?.['Create View'];
    if (!ddl) continue;

    lineas.push(`DROP TABLE IF EXISTS \`${nombre}\`;`, `${ddl.replace(/;\s*$/, '')};`);

    const [filas] = await pool.query(`SELECT * FROM \`${nombre}\``);
    if (filas.length) {
      const columnas = Object.keys(filas[0]);
      const insert = `INSERT INTO \`${nombre}\` (${columnas.map((col) => `\`${col}\``).join(', ')}) VALUES`;
      const valores = filas.map((fila) => `(${columnas.map((col) => escapar(fila[col])).join(', ')})`);
      // Se agrupan filas para que el archivo sea manejable en equipos con muchas métricas.
      for (let i = 0; i < valores.length; i += 50) {
        lineas.push(`${insert} ${valores.slice(i, i + 50).join(', ')};`);
      }
    }
    lineas.push('');
  }

  lineas.push('SET FOREIGN_KEY_CHECKS=1;', '');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(archivo, lineas.join('\n'), 'utf8');
  return archivo;
}

if (require.main === module) {
  crearRespaldo()
    .then((archivo) => {
      console.log(`Respaldo creado: ${archivo}`);
      return pool.end();
    })
    .catch((err) => {
      console.error('No se pudo crear el respaldo:', err.message);
      process.exit(1);
    });
}

module.exports = { crearRespaldo, BACKUP_DIR };
