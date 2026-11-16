// Familias que aparecen en la hoja "Familias" del Excel de Loganmex.
export const FAMILIES = [
  { key: 'cpu', label: 'CPU' },
  { key: 'teclado', label: 'Teclado' },
  { key: 'raton', label: 'Ratón' },
  { key: 'monitor', label: 'Monitor' },
  { key: 'laptop', label: 'Laptop' },
];

const LABEL_BY_KEY = Object.fromEntries(FAMILIES.map((f) => [f.key, f.label]));
const LABELS = FAMILIES.map((f) => f.label);

export function familyKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Devuelve { Monitor: 2, Laptop: 1 }. Acepta el JSON actual, el texto
// separado por comas usado antes y arreglos de etiquetas.
export function parseFamilias(value) {
  if (!value) return {};
  let source = value;
  if (typeof source === 'string') {
    const text = source.trim();
    if (!text) return {};
    if (text.startsWith('{')) {
      try { source = JSON.parse(text); } catch { source = text; }
    }
  }

  const counts = new Map();
  const add = (key, quantity) => {
    const label = LABEL_BY_KEY[familyKey(key)];
    if (!label) return;
    const number = Number.parseInt(quantity, 10);
    counts.set(label, Number.isFinite(number) && number > 0 ? Math.min(number, 99) : 1);
  };

  if (Array.isArray(source)) {
    source.forEach((item) => add(item, 1));
  } else if (typeof source === 'object') {
    Object.entries(source).forEach(([key, quantity]) => add(key, quantity));
  } else {
    String(source).split(/[,;|]+/).forEach((item) => add(item, 1));
  }

  return Object.fromEntries(LABELS.filter((label) => counts.has(label))
    .map((label) => [label, counts.get(label)]));
}

export function familiaCantidad(value, key) {
  const label = LABEL_BY_KEY[familyKey(key)];
  return label ? (parseFamilias(value)[label] || 0) : 0;
}

export function hasFamilia(asset, key) {
  return familiaCantidad(asset?.familias, key) > 0;
}

export function familiasText(value) {
  const data = parseFamilias(value);
  return LABELS
    .filter((label) => data[label])
    .map((label) => `${label}${data[label] > 1 ? ` ×${data[label]}` : ''}`)
    .join(', ');
}
