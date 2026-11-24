import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import Navbar from './Navbar.jsx';
import Login from './Login.jsx';
import Dashboard from './Dashboard.jsx';
import Monitoreo from './Monitoreo.jsx';
import Inventario from './Inventario.jsx';
import Ficha from './Ficha.jsx';
import Mantenimiento from './Mantenimiento.jsx';
import Tickets from './tickets/Tickets.jsx';
import Configuracion from './Configuracion.jsx';

function LegacyFicha() {
  const [params] = useSearchParams();
  const token = params.get('ficha');
  return (
    <Navigate
      to={token ? `/ficha?ficha=${encodeURIComponent(token)}` : '/inventario'}
      replace
    />
  );
}

function AppShell() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="auth-loading" role="status" aria-live="polite">
        <div className="login-brand" aria-hidden="true">LM</div>
        <p>Verificando sesión local…</p>
      </main>
    );
  }

  if (!user) return <Login />;

  // El rol usuario solo entra al módulo de tickets; el resto se redirige sin avisos.
  const inicio = user.rol === 'usuario' ? '/tickets' : '/';
  const soloStaff = (element) => (
    user.rol === 'usuario' ? <Navigate to="/tickets" replace /> : element
  );

  return (
    <>
      <Navbar />

      <Routes>
        <Route path="/" element={soloStaff(<Dashboard />)} />
        <Route path="/monitoreo" element={soloStaff(<Monitoreo />)} />
        <Route path="/inventario" element={soloStaff(<Inventario />)} />
        <Route path="/ficha" element={soloStaff(<Ficha />)} />
        <Route path="/inventario.html" element={soloStaff(<LegacyFicha />)} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/configuracion" element={<Configuracion />} />

        <Route path="/mantenimiento" element={soloStaff(<Mantenimiento />)} />

        <Route path="*" element={<Navigate to={inicio} replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
