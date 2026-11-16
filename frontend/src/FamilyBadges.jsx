import { FAMILIES, parseFamilias } from './families';

// Muestra las familias de un equipo con su cantidad.
// solo="monitor" limita la salida a esa familia (útil en el filtro del inventario).
export default function FamilyBadges({ value, solo = '', showCounts = true }) {
  const data = parseFamilias(value);
  const items = FAMILIES
    .filter((f) => (!solo || f.key === solo) && data[f.label])
    .map((f) => ({ label: f.label, quantity: data[f.label] }));

  if (!items.length) return <span>—</span>;

  return (
    <div className="family-badges">
      {items.map(({ label, quantity }) => (
        <span key={label} className="family-badge">
          {label}
          {showCounts && <strong> ×{quantity}</strong>}
        </span>
      ))}
    </div>
  );
}
