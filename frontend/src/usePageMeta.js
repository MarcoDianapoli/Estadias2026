import { useEffect } from 'react';

const MARCA = 'Loganmex';

// Cada vista debe identificar qué está viendo el técnico; el título del navegador
// es parte de la Señal de confianza cuando se alterna entre pestañas.
export default function usePageMeta(title, description) {
  useEffect(() => {
    document.title = title ? `${title} · ${MARCA}` : `${MARCA} · monitoreo e inventario`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta && description) meta.setAttribute('content', description);
  }, [title, description]);
}
