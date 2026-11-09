import { useEffect, useRef } from 'react';

const SELECTOR = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

// Diálogos pequeños: cierran con Escape, devuelven el foco al disparador y
// mantienen el tab inside del modal. No es una librería nueva ni un portal.
export default function useDialog(onClose, active = true) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!active) return undefined;
    const anterior = document.activeElement;
    const nodo = dialogRef.current;
    // React ya aplicó autoFocus antes del efecto: no lo pisamos si cayó dentro del modal.
    if (nodo && !nodo.contains(anterior)) nodo.querySelector(SELECTOR)?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !nodo) return;
      const items = [...nodo.querySelectorAll(SELECTOR)];
      if (!items.length) return;
      const primero = items[0];
      const ultimo = items[items.length - 1];
      if (event.shiftKey && document.activeElement === primero) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      anterior?.focus?.();
    };
  }, [active]);

  return dialogRef;
}
