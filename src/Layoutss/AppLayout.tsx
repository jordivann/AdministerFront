// src/layouts/AppLayout.tsx
import { PropsWithChildren, useMemo, useEffect, useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import './Layout.css';

function isAdminUser(user: any): boolean {
  const raw = (Array.isArray(user?.roles) ? user.roles : [user?.role]).filter(Boolean);
  const roles = raw.map((r: any) => String(r).toLowerCase());
  return roles.includes('admin') || roles.includes('owner');
}

export default function AppLayout({ children }: PropsWithChildren) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const greeting = useMemo(() => {
    const name = user?.full_name || user?.email || 'Usuario';
    return String(name).split(' ')[0];
  }, [user]);

  const userInitials = useMemo(() => {
    const name = user?.full_name || user?.email || 'U';
    const words = String(name).split(' ');
    if (words.length >= 2) {
      return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }
    return String(name).charAt(0).toUpperCase();
  }, [user]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isDropdownOpen]);

  const isActiveLink = (path: string) => location.pathname === path;

  const handleLogout = () => {
    logout();
  };

  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleDropdownItemClick = () => {
    setIsDropdownOpen(false);
  };

  const navigationItems = [
    {
      path: '/Liquidaciones',
      title: 'Liquidaciones',
      description: 'Gestión de liquidaciones de empleados',
      icon: '📊'
    },
    {
      path: '/Cuentas',
      title: 'Resumen de Cuentas',
      description: 'Estado financiero y balances',
      icon: '💰'
    },
    {
      path: '/Facturas',
      title: 'Facturas',
      description: 'Administración de facturas emitidas',
      icon: '🧾'
    },
    {
      path: '/Pagos',
      title: 'Pagos',
      description: 'Administración de Pagos',
      icon: '🧾'
    }
  ];

  const hasActiveItems = navigationItems.some(item => isActiveLink(item.path));

  return (
    <div className="app">
      {/* Overlay para cerrar dropdown */}
      <div 
        className={`navbar__overlay ${isDropdownOpen ? 'active' : ''}`}
        onClick={() => setIsDropdownOpen(false)}
      />

      <header className={`navbar ${isScrolled ? 'scrolled' : ''}`} role="banner">
        <div className="navbar__brand" aria-label="Marca">
          <div className="navbar__logo" role="img" aria-label="Herramienta Laboral">
            💼
          </div>
          <h1 className="navbar__title">Herramienta Laboral</h1>
        </div>

        <nav className="navbar__actions" role="navigation" aria-label="Navegación principal">
          <button
            className="navbar__mobile-menu"
            onClick={toggleMobileMenu}
            aria-label="Abrir menú de navegación"
            aria-expanded={showMobileMenu}
            type="button"
          >
            ☰
          </button>

          {/* Dropdown Navigation */}
          <div className={`navbar__dropdown ${isDropdownOpen ? 'open' : ''}`} ref={dropdownRef}>
            <button
              className={`navbar__dropdown-trigger ${hasActiveItems ? 'active' : ''}`}
              onClick={toggleDropdown}
              aria-label="Abrir menú de navegación"
              aria-expanded={isDropdownOpen}
              aria-haspopup="true"
              type="button"
            >
              <span>Navegación</span>
              <span className="navbar__dropdown-icon">▼</span>
            </button>

            <div 
              className="navbar__dropdown-menu"
              role="menu"
              aria-label="Opciones de navegación"
            >
              {navigationItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`navbar__dropdown-item ${isActiveLink(item.path) ? 'active' : ''}`}
                  onClick={handleDropdownItemClick}
                  role="menuitem"
                  aria-current={isActiveLink(item.path) ? 'page' : undefined}
                >
                  <span className="navbar__dropdown-item-icon">{item.icon}</span>
                  <div className="navbar__dropdown-item-content">
                    <div className="navbar__dropdown-item-title">{item.title}</div>
                    <div className="navbar__dropdown-item-desc">{item.description}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Greeting mejorado */}
          <div className="navbar__greeting">
            <div className="navbar__greeting-avatar" aria-hidden="true">
              {userInitials}
            </div>
            <div className="navbar__greeting-text">
              <span className="navbar__greeting-welcome">Bienvenido</span>
              <span className="navbar__greeting-name">{greeting}</span>
            </div>
          </div>

          {/* Botón Admin con icono */}
          {isAdminUser(user) && (
            <Link
              to="/admin"
              className="navbar-admin-link"
              aria-label="Acceder al panel de administración"
            >
              Panel Admin
            </Link>
          )}

          {/* Botón Logout con icono */}
          <button
            className="navbar-logout-button"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            type="button"
          >
            Salir
          </button>
        </nav>
      </header>

      <main className="app-main" role="main">
        <div className="container app-main__container">
          {children}
        </div>
      </main>

      <footer className="app-footer" role="contentinfo">
        <small>© {new Date().getFullYear()} Proyecto Herramienta Laboral</small>
      </footer>
    </div>
  );
}