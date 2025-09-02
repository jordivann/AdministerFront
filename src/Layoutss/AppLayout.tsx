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
  const firstMobileLinkRef = useRef<HTMLAnchorElement>(null);

  const greeting = useMemo(() => {
    const name = user?.full_name || user?.email || 'Usuario';
    return String(name).split(' ')[0];
  }, [user]);

  const userInitials = useMemo(() => {
    const name = user?.full_name || user?.email || 'U';
    const words = String(name).trim().split(/\s+/);
    if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
    return String(name).charAt(0).toUpperCase();
  }, [user]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Cerrar dropdown al hacer click fuera o con Esc
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
        setShowMobileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // Bloquear scroll cuando el drawer móvil está abierto
  useEffect(() => {
    const body = document.body;
    if (showMobileMenu) {
      body.style.overflow = 'hidden';
      // foco en el primer link del drawer
      setTimeout(() => firstMobileLinkRef.current?.focus(), 0);
    } else {
      body.style.overflow = '';
    }
    return () => { body.style.overflow = ''; };
  }, [showMobileMenu]);

  // Cerrar menús al navegar
  useEffect(() => {
    setIsDropdownOpen(false);
    setShowMobileMenu(false);
  }, [location.pathname]);

  const isActiveLink = (path: string) => location.pathname === path;

  const handleLogout = () => { logout(); };

  const navigationItems = [
    { path: '/Liquidaciones', title: 'Liquidaciones', description: 'Gestión de liquidaciones', icon: '📊' },
    { path: '/Cuentas',       title: 'Resumen de Cuentas', description: 'Balances y estado', icon: '💰' },
    { path: '/Facturas',      title: 'Facturas', description: 'Administración de facturas', icon: '🧾' },
    { path: '/Pagos',         title: 'Pagos', description: 'Administración de Pagos', icon: '💳' }
  ];

  const hasActiveItems = navigationItems.some(item => isActiveLink(item.path));

  const toggleMobileMenu = () => setShowMobileMenu(v => !v);
  const toggleDropdown = () => setIsDropdownOpen(v => !v);

  return (
    <div className="app">
      {/* Overlay para cerrar dropdown o drawer */}
      <div
        className={`navbar__overlay ${(isDropdownOpen || showMobileMenu) ? 'active' : ''}`}
        onClick={() => { setIsDropdownOpen(false); setShowMobileMenu(false); }}
      />

      <header className={`navbar ${isScrolled ? 'scrolled' : ''}`} role="banner">
        <div className="navbar__brand" aria-label="Marca">
          <Link to="/" className="navbar__title">Herramienta Laboral</Link>
        </div>

        <nav className="navbar__actions" role="navigation" aria-label="Navegación principal">
          {/* Menú hamburguesa solo móvil */}
          <button
            className="navbar__mobile-menu"
            onClick={toggleMobileMenu}
            aria-label={showMobileMenu ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={showMobileMenu}
            aria-controls="mobile-drawer"
            type="button"
          >
            {showMobileMenu ? '✕' : '☰'}
          </button>

          {/* Dropdown desktop */}
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

            <div className="navbar__dropdown-menu" role="menu" aria-label="Opciones de navegación">
              {navigationItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`navbar__dropdown-item ${isActiveLink(item.path) ? 'active' : ''}`}
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

          {/* Greeting desktop */}
          <div className="navbar__greeting">
            <div className="navbar__greeting-avatar" aria-hidden="true">{userInitials}</div>
            <div className="navbar__greeting-text">
              <span className="navbar__greeting-welcome">Bienvenido</span>
              <span className="navbar__greeting-name">{greeting}</span>
            </div>
          </div>

          {isAdminUser(user) && (
            <Link to="/admin" className="navbar-admin-link" aria-label="Acceder al panel de administración">
              Panel Admin
            </Link>
          )}

          <button className="navbar-logout-button" onClick={handleLogout} aria-label="Cerrar sesión" type="button">
            Salir
          </button>
        </nav>
      </header>

      {/* Drawer móvil */}
      <aside
        id="mobile-drawer"
        className={`mobile-drawer ${showMobileMenu ? 'open' : ''}`}
        aria-hidden={!showMobileMenu}
      >
        <div className="mobile-drawer__header">
          <div className="mobile-drawer__avatar">{userInitials}</div>
          <div className="mobile-drawer__user">
            <div className="mobile-drawer__hello">Hola</div>
            <div className="mobile-drawer__name">{greeting}</div>
          </div>
          <button
            className="mobile-drawer__close"
            onClick={() => setShowMobileMenu(false)}
            aria-label="Cerrar menú"
            type="button"
          >
            ✕
          </button>
        </div>

        <nav className="mobile-drawer__nav" aria-label="Navegación móvil">
          {navigationItems.map((item, idx) => (
            <Link
              key={item.path}
              to={item.path}
              ref={idx === 0 ? firstMobileLinkRef : undefined}
              className={`mobile-drawer__link ${isActiveLink(item.path) ? 'active' : ''}`}
            >
              <span className="mobile-drawer__icon">{item.icon}</span>
              <span className="mobile-drawer__text">
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
            </Link>
          ))}

          {isAdminUser(user) && (
            <Link to="/admin" className="mobile-drawer__link">
              <span className="mobile-drawer__icon">⚙️</span>
              <span className="mobile-drawer__text">
                <strong>Panel Admin</strong>
                <small>Gestión avanzada</small>
              </span>
            </Link>
          )}
        </nav>

        <div className="mobile-drawer__footer">
          <button className="mobile-drawer__logout" onClick={handleLogout} type="button">
            <span>Salir</span> <span aria-hidden>👋</span>
          </button>
        </div>
      </aside>

      <main className="app-main" role="main">
        <div className="container app-main__container">{children}</div>
      </main>

      <footer className="app-footer" role="contentinfo">
        <small>© {new Date().getFullYear()} Proyecto Herramienta Laboral</small>
      </footer>
    </div>
  );
}
