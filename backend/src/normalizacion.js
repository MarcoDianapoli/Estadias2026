// Formato canónico guardado en la BD: minúsculas y sin acentos.
// Los textos libres (títulos, descripciones, mensajes, observaciones y
// comentarios) NO pasan por aquí: conservan mayúsculas y acentos.

const MARCAS_DIACRITICAS = /[\u0300-\u036f]/g;
const FAMILIAS = ['cpu', 'teclado', 'raton', 'monitor', 'laptop'];

function normalizar(valor) {
  if (valor === null || valor === undefined) return null;
  return String(valor)
    .trim()
    .normalize('NFD')
    .replace(MARCAS_DIACRITICAS, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizarCodigoSgl(valor) {
  const texto = normalizar(valor);
  if (!texto) return null;
  const coincidencia = texto.replace(/\s+/g, '').match(/^sgl-?0*(\d{1,6})$/);
  return coincidencia ? `sgl-${coincidencia[1].padStart(4, '0')}` : texto;
}

function normalizarCodigoTicket(valor) {
  const texto = normalizar(valor);
  if (!texto) return null;
  const coincidencia = texto.replace(/\s+/g, '').match(/^tkt-(\d{4})-0*(\d{1,6})$/);
  return coincidencia ? `tkt-${coincidencia[1]}-${coincidencia[2].padStart(5, '0')}` : texto;
}

// Guarda las familias como JSON con claves canónicas: {"cpu":1,"raton":2}.
function normalizarFamilias(valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  let origen = valor;
  if (typeof origen === 'string') {
    const texto = origen.trim();
    if (!texto) return null;
    if (texto.startsWith('{')) {
      try { origen = JSON.parse(texto); } catch { origen = texto; }
    }
  }

  const cantidades = new Map();
  const agregar = (clave, cantidad) => {
    const familia = normalizar(clave);
    if (!FAMILIAS.includes(familia)) return;
    const numero = Number.parseInt(cantidad, 10);
    cantidades.set(familia, Number.isFinite(numero) && numero > 0 ? Math.min(numero, 99) : 1);
  };

  if (Array.isArray(origen)) {
    origen.forEach((item) => agregar(item, 1));
  } else if (typeof origen === 'object') {
    Object.entries(origen).forEach(([clave, cantidad]) => agregar(clave, cantidad));
  } else {
    String(origen).split(/[,;|]+/).forEach((item) => agregar(item, 1));
  }

  const presentes = FAMILIAS.filter((familia) => cantidades.has(familia));
  return presentes.length
    ? JSON.stringify(Object.fromEntries(presentes.map((familia) => [familia, cantidades.get(familia)])))
    : null;
}

module.exports = {
  normalizar,
  normalizarCodigoSgl,
  normalizarCodigoTicket,
  normalizarFamilias,
  FAMILIAS,
};
