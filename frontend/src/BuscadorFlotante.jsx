import { useId, useState } from 'react';
import useDialog from './useDialog';

// Lupa flotante: sustituye el campo de búsqueda visible. En Tickets se coloca
// justo encima del botón «Nuevo ticket»; en los demás módulos ocupa ese lugar.
export default function BuscadorFlotante({
  value, onChange, placeholder = 'Buscar…', conTicket = false,
}) {
  const [abierto, setAbierto] = useState(false);
  const popoverId = useId();
  const cerrar = () => setAbierto(false);
  const dialogRef = useDialog(cerrar, abierto);
  const activo = Boolean(value.trim());

  return (
    <>
      <button
        type="button"
        className={`search-fab${conTicket ? ' con-ticket' : ''}${activo ? ' activo' : ''}`}
        onClick={() => setAbierto((prev) => !prev)}
        aria-label={activo ? `Buscar (búsqueda activa: ${value})` : 'Buscar'}
        aria-expanded={abierto}
        aria-controls={abierto ? popoverId : undefined}
        title="Buscar"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m16.5 16.5 4 4" />
        </svg>
      </button>

      {abierto && (
        <div
          id={popoverId}
          ref={dialogRef}
          className={`search-popover${conTicket ? ' con-ticket' : ''}`}
          role="search"
          aria-label="Buscar en esta sección"
        >
          <label>
            <span>Buscar</span>
            <input
              autoFocus
              type="search"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              maxLength={120}
            />
          </label>
          <div className="search-popover-actions">
            <button type="button" className="detail-btn" onClick={() => onChange('')} disabled={!activo}>
              Limpiar búsqueda
            </button>
            <button type="button" className="detail-btn" onClick={cerrar}>Cerrar</button>
          </div>
        </div>
      )}
    </>
  );
}
