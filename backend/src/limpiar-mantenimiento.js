require('dotenv').config();
const pool = require('./db');

const conteo = `SELECT
  COUNT(*) AS total,
  SUM(responsable IS NOT NULL AND responsable <> '') AS con_tecnico,
  SUM(observaciones IS NOT NULL AND observaciones <> '') AS con_observaciones
FROM maintenance`;

async function limpiar() {
  const [antes] = await pool.query(conteo);
  const [resultado] = await pool.query(
    'UPDATE maintenance SET responsable = NULL, observaciones = NULL',
  );
  const [despues] = await pool.query(conteo);
  return {
    antes: antes[0],
    filasActualizadas: resultado.affectedRows,
    despues: despues[0],
  };
}

if (require.main === module) {
  limpiar()
    .then((resumen) => {
      console.log(JSON.stringify(resumen, null, 2));
      return pool.end();
    })
    .catch((err) => {
      console.error('No se pudo limpiar mantenimiento:', err.message);
      process.exit(1);
    });
}

module.exports = { limpiar };
