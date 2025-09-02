import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../store/auth';
import './styles/AdminLayout.css';

const isAdminUser = (roles?: string[]) => {
  const r = (roles ?? []).map((x) => String(x).toLowerCase());
  return r.includes('admin') || r.includes('owner');
};

interface NavigationItem {
  path: string;
  title: string;
  description: string;
  icon: string;
  badge?: string;
}

interface NavigationSection {
  title: string;
  items: NavigationItem[];
}

export default function AdminLayout() {
  const { user } = useAuth();
  const isAdmin = isAdminUser(user?.roles);

  const navigationSections: NavigationSection[] = [
    {
      title: 'Gestión Principal',
      items: [
        {
          path: 'movimientos',
          title: 'Movimientos',
          description: 'Registro y seguimiento de transacciones',
          icon: '📊'
        },
        {
          path: 'proveedores',
          title: 'Proveedores',
          description: 'Administración de proveedores',
          icon: '🏢'
        },
        {
          path: 'clients',
          title: 'Clientes',
          description: 'Gestión de base de clientes',
          icon: '👥'
        },
        {
          path: 'usuarios',
          title: 'Usuarios',
          description: 'Control de accesos y permisos',
          icon: '👤'
        }
      ]
    },
    {
      title: 'Finanzas & Contabilidad',
      items: [
        {
          path: 'cuentasLp',
          title: 'Resumen de Cuentas LP',
          description: 'Estados financieros largo plazo',
          icon: '💰'
        },
        {
          path: 'invoices',
          title: 'Facturas',
          description: 'Gestión de facturación emitida',
          icon: '🧾'
        },
                {
          path: 'Payments',
          title: 'Pagos',
          description: 'Gestión de pagos',
          icon: '🧾'
        },
        {
          path: 'cuentas',
          title: 'Cuentas Bancarias',
          description: 'Administración de cuentas',
          icon: '🏦'
        },
        {
          path: 'categorias',
          title: 'Categorías',
          description: 'Clasificación de transacciones',
          icon: '🏷️'
        }
      ]
    },
    {
      title: 'Herramientas Avanzadas',
      items: [
        {
          path: 'importar',
          title: 'Importar Extractos',
          description: 'Carga masiva de datos bancarios',
          icon: '📥',
          badge: 'Beta'
        },
        {
          path: 'conciliar',
          title: 'Conciliación',
          description: 'Reconciliación automática',
          icon: '🔄',
          badge: 'Pro'
        }
      ]
    }
  ];

  if (!isAdmin) {
    return (
      <div className="admin-access-denied">
        <div className="admin-access-denied__icon">🚫</div>
        <h1 className="admin-access-denied__title">
          Acceso Denegado
        </h1>
        <p className="admin-access-denied__message">
          No tienes permisos de administrador para acceder a este panel.
          <br />
          Contacta con <span className="admin-access-denied__contact">Jordi Van Norden</span> para solicitar acceso.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__header">
          <h2 className="admin-sidebar__title">Admin Panel</h2>
          <p className="admin-sidebar__subtitle">
            Herramientas de gestión avanzada
          </p>
          <a href="/" className="admin-sidebar__back-link">
            Volver al inicio
          </a>
        </div>

        <nav className="admin-sidebar__nav">
          {navigationSections.map((section) => (
            <div key={section.title} className="admin-nav-section">
              <h3 className="admin-nav-section__title">{section.title}</h3>
              <div className="admin-nav-section__items">
                {section.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `admin-nav-link ${isActive ? 'active' : ''}`
                    }
                  >
                    <span className="admin-nav-link__icon">{item.icon}</span>
                    <div className="admin-nav-link__content">
                      <div className="admin-nav-link__title">{item.title}</div>
                      <div className="admin-nav-link__description">
                        {item.description}
                      </div>
                    </div>
                    {item.badge && (
                      <span className="admin-nav-link__badge">{item.badge}</span>
                    )}
                  </NavLink>
                ))}
              </div>
              {section !== navigationSections[navigationSections.length - 1] && (
                <div className="admin-spacer--large" />
              )}
            </div>
          ))}
        </nav>
      </aside>

      <main className="admin-main">
        <div className="admin-main__content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}