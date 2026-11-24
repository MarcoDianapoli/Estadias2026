// La BD guarda minúsculas y sin acentos. Aquí se capitaliza solo al mostrar.

export const ESTADOS_TICKET = ['abierto', 'en proceso', 'resuelto', 'cerrado'];
export const PRIORIDADES = ['baja', 'media', 'alta'];
export const ESTADOS_MANTENIMIENTO = ['pendiente', 'en proceso', 'completado', 'cancelado'];
export const TIPOS_MANTENIMIENTO = ['logico', 'fisico'];

const ETIQUETAS = {
  abierto: 'Abierto',
  'en proceso': 'En proceso',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  pendiente: 'Pendiente',
  completado: 'Completado',
  cancelado: 'Cancelado',
  logico: 'Lógico',
  fisico: 'Físico',
  usuario: 'Usuario',
  tecnico: 'Técnico',
  admin: 'Administrador',
};

// Palabras conocidas a las que se les puede devolver el acento al mostrar.
const PALABRAS = {
  tecnico: 'Técnico',
  logico: 'Lógico',
  fisico: 'Físico',
  raton: 'Ratón',
  almacen: 'Almacén',
  electrica: 'Eléctrica',
  mecanica: 'Mecánica',
  telefonos: 'Teléfonos',
};

const MARCAS_DIACRITICAS = /[\u0300-\u036f]/g;

export function normalizarEntrada(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .trim()
    .normalize('NFD')
    .replace(MARCAS_DIACRITICAS, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizarCodigoSgl(valor) {
  const texto = normalizarEntrada(valor);
  if (!texto) return '';
  const coincidencia = texto.replace(/\s+/g, '').match(/^sgl-?0*(\d{1,6})$/);
  return coincidencia ? `sgl-${coincidencia[1].padStart(4, '0')}` : texto;
}

// Texto legible para estatus, prioridades, roles, tipos, nombres y lugares.
export function etiqueta(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  const texto = String(valor);
  if (ETIQUETAS[texto]) return ETIQUETAS[texto];
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) return texto;
  return texto
    .split(/\s+/)
    .map((palabra) => PALABRAS[palabra] || `${palabra.charAt(0).toUpperCase()}${palabra.slice(1)}`)
    .join(' ');
}

// Códigos SGL/TKT se muestran con el prefijo en mayúsculas.
export function codigo(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  const texto = String(valor);
  return /^(sgl|tkt)-/i.test(texto) ? texto.toUpperCase() : etiqueta(texto);
}

// Hostname e identificadores de agente se muestran en mayúsculas.
export function identificador(valor) {
  return valor === null || valor === undefined || valor === '' ? '' : String(valor).toUpperCase();
}
