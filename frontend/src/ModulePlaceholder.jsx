import { Link } from 'react-router-dom';
import usePageMeta from './usePageMeta';

export default function ModulePlaceholder({ title, description, modules }) {
  usePageMeta(title, description);

  return (
    <main className="app placeholder-page">
      <header className="header">
        <div>
          <h1>{title}</h1>
          <p>Loganmex · módulo en instalación</p>
        </div>
        <Link className="detail-btn" to="/">Ir al panel general</Link>
      </header>

      <section className="panel placeholder-card">
        <h2>En instalación</h2>
        <p>{description}</p>
        <div className="placeholder-list">
          {modules.map((item) => (
            <div key={item.title}>
              <strong>{item.title}</strong>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
        <p className="hint">
          Los conteos ya se muestran en el panel general. Mientras tanto, consulta los agentes en Monitoreo y los equipos en Inventario QR.
        </p>
      </section>
    </main>
  );
}
