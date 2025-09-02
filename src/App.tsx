// src/App.tsx (solo cambian los elementos que renderizan páginas para envolver con AppLayout)
import { JSX, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './store/auth';
import Login from './pages/Login';
import Home from './pages/Home';
import AdminLayout from './components/admin/AdminLayout';
import AdminMovements from './components/admin/Movements';
import AdminClients from './components/admin/Clients';
import AdminProviders from './components/admin/Providers';
import AdminCuentasLp from './components/admin/CuentasLpAdmin';
import AdminFacturas from './components/admin/Invoices';
import AppLayout from './Layoutss/AppLayout';
import Liq from './pages/Liquidaciones';
import Cuentas from './pages/Cuentas';
import FacturasPage from './pages/Facturas';
import PaymentsPage from './pages/Payments';
import PaymentsAdmin from './components/admin/PaymentsAdmin';
import Loader from './components/ui/Loader';

function Protected({ children }: { children: JSX.Element }) {
  const { user, meLoading, meLoaded, fetchMe } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setReady(true); return; }
    if (user || meLoaded) { setReady(true); return; }
    fetchMe().finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!ready || meLoading) return <Loader/>;
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function isAdminUser(user: any): boolean {
  const raw = (Array.isArray(user?.roles) ? user.roles : [user?.role]).filter(Boolean);
  const roles = raw.map((r: any) => String(r).toLowerCase());
  return roles.includes('admin') || roles.includes('owner');
}

function AdminProtected({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdminUser(user)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Público */}
        <Route path="/login" element={<Login />} />

        {/* Privado */}
        <Route
          path="/"
          element={
            <Protected>
              <AppLayout>
                <Home />
              </AppLayout>
            </Protected>
          }
        />
        <Route
          path="/cuentas"
          element={
            <Protected>
              <AppLayout>
                <Cuentas />
              </AppLayout>
            </Protected>
          }
        />


        <Route
          path="/Liquidaciones"
          element={
            <Protected>
              <AppLayout>
                <Liq />
              </AppLayout>
            </Protected>
          }
        />
        <Route
          path="/Facturas"
          element={
            <Protected>
              <AppLayout>
                <FacturasPage />
              </AppLayout>
            </Protected>
          }
        />
        <Route
          path="/Pagos"
          element={
            <Protected>
              <AppLayout>
                <PaymentsPage />
              </AppLayout>
            </Protected>
          }
        />
        {/* Admin */}
        <Route
          path="/admin"
          element={
            <Protected>
              <AdminProtected>
                <AdminLayout />
              </AdminProtected>
            </Protected>
          }
        >
          <Route index element={<Navigate to="movimientos" replace />} />
          <Route path="movimientos" element={<AdminMovements />} />
          <Route path="proveedores" element={<AdminProviders />} />
          <Route path="cuentasLp" element={<AdminCuentasLp />} />
          <Route path="clients" element={<AdminClients />} />
          <Route path="invoices" element ={<AdminFacturas />} />
          
          <Route path="Payments" element ={<PaymentsAdmin />} />
          <Route path="usuarios" element={<div>Usuarios — (pendiente)</div>} />
          <Route path="cuentas" element={<div>Cuentas — (pendiente)</div>} />
          <Route path="categorias" element={<div>Categorías — (pendiente)</div>} />
          <Route path="importar" element={<div>Importar extractos — (pendiente)</div>} />
          <Route path="conciliar" element={<div>Conciliación — (pendiente)</div>} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
