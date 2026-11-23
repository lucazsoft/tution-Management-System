import { AccountMenu } from './AccountMenu';
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export interface NavItem {
  label: string;
  icon: string;
  path: string;
  section?: 'MAIN' | 'ACADEMIC' | 'FINANCE' | 'OPERATIONS' | 'COMMUNICATION' | 'SETTINGS' | 'CALENDAR' | 'OVERVIEW' | 'CLASSROOM' | 'PERSONAL';
}

export interface PageShellProps {
  accountPath?: string;
  securityPath?: string;
  title: string;
  subtitle?: string;
  userRole: string;
  userName: string;
  userAvatar?: string;
  onLogout: () => void;
  navItems?: NavItem[];
  defaultSidebarCollapsed?: boolean;
  children: React.ReactNode;
}

export function PageShell({
  accountPath,
  securityPath,
  title,
  subtitle,
  userRole,
  userName,
  userAvatar,
  onLogout,
  navItems = [],
  defaultSidebarCollapsed = false,
  children
}: PageShellProps) {
  const location = useLocation();
  const navigate = useNavigate();

  // State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });
  const [isCollapsed, setIsCollapsed] = useState(defaultSidebarCollapsed);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('tms_theme', next);
  };

  const handleNavClick = (path: string) => {
    navigate(path);
    setIsMobileOpen(false);
  };

  const isNavItemActive = (path: string) => path.includes('#')
    ? `${location.pathname}${location.hash}` === path
    : location.pathname.startsWith(path);

  // Group nav items by section
  const groupedItems = React.useMemo(() => {
    const groups: Record<string, NavItem[]> = {};
    navItems.forEach((item) => {
      const sec = item.section || 'MAIN';
      if (!groups[sec]) groups[sec] = [];
      groups[sec].push(item);
    });
    return groups;
  }, [navItems]);


  // Construct simple breadcrumb from pathname
  const pathParts = location.pathname.split('/').filter(Boolean);
  const breadcrumbs = pathParts.map((part, idx) => {
    const label = part.charAt(0).toUpperCase() + part.slice(1).replace('-', ' ');
    const url = '/' + pathParts.slice(0, idx + 1).join('/');
    const isLast = idx === pathParts.length - 1;
    return (
      <React.Fragment key={url}>
        {idx > 0 && <span className="material-symbols-outlined breadcrumb-separator">chevron_right</span>}
        <span 
          className={`breadcrumb-item ${isLast ? 'breadcrumb-item--active' : ''}`}
          onClick={() => !isLast && navigate(url)}
        >
          {label}
        </span>
      </React.Fragment>
    );
  });

  return (
    <div className="tms-layout fade-in">
      {/* ── Top Bar ── */}
      <header className="tms-topbar">
        <div className="topbar-left">
          {/* Mobile hamburger menu toggle */}
          <button 
            className="topbar-toggle-btn mobile-only" 
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileOpen}
          >
            <span className="material-symbols-outlined">menu</span>
          </button>

          {/* Collapsible toggle for desktop sidebar */}
          <button 
            className="topbar-toggle-btn desktop-only" 
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!isCollapsed}
          >
            <span className="material-symbols-outlined">
              {isCollapsed ? 'menu_open' : 'menu'}
            </span>
          </button>

          {/* Logo brand */}
          <button type="button" className="topbar-logo" aria-label="Go to dashboard" onClick={() => navigate('/')}>
            <span className="material-symbols-outlined logo-icon">school</span>
            <div>
              <h1 className="logo-text">TMS</h1>
              <span className="logo-subtext">Tuition Management</span>
            </div>
          </button>

          {/* Breadcrumbs */}
          <div className="topbar-breadcrumbs desktop-only" aria-label="Breadcrumb">
            {breadcrumbs}
          </div>
        </div>

        <div className="topbar-right">
          {/* Theme switcher */}
          <button 
            className="topbar-action-btn" 
            onClick={toggleTheme} 
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            aria-label="Toggle theme"
          >
            <span className="material-symbols-outlined">
              {theme === 'light' ? 'dark_mode' : 'light_mode'}
            </span>
          </button>

          <AccountMenu name={userName} role={userRole.replaceAll('_', ' ')} avatar={userAvatar} accountPath={accountPath} securityPath={securityPath} onLogout={onLogout} />
        </div>
      </header>

      {/* ── Sidebar & Content Container ── */}
      <div className="tms-container">
        {/* Desktop Sidebar */}
        <aside className={`tms-sidebar ${isCollapsed ? 'tms-sidebar--collapsed' : ''} desktop-only`}>
          <div className="sidebar-header">
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>

          <nav className="sidebar-nav">
            {Object.entries(groupedItems).map(([section, items]) => (
              <div key={section} className="sidebar-section">
                <span className="sidebar-section-title">{section}</span>
                <ul className="sidebar-menu">
                  {items.map((item, idx) => {
                    const isActive = isNavItemActive(item.path);
                    return (
                      <li key={idx}>
                        <button
                          className={`sidebar-link ${isActive ? 'sidebar-link--active' : ''}`}
                          onClick={() => handleNavClick(item.path)}
                          title={isCollapsed ? item.label : undefined}
                        >
                          <span className="material-symbols-outlined">{item.icon}</span>
                          <span className="sidebar-link-label">{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Mobile Navigation Drawer Overlay */}
        {isMobileOpen && (
          <div 
            className="mobile-drawer-overlay" 
            onClick={() => setIsMobileOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Mobile Navigation Drawer */}
        <aside className={`tms-mobile-drawer ${isMobileOpen ? 'tms-mobile-drawer--open' : ''} mobile-only`}>
          <div className="drawer-header">
            <span className="material-symbols-outlined logo-icon">school</span>
            <div>
              <h3>{title}</h3>
              {subtitle && <p>{subtitle}</p>}
            </div>
            <button className="drawer-close" onClick={() => setIsMobileOpen(false)} aria-label="Close menu">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <nav className="sidebar-nav">
            {Object.entries(groupedItems).map(([section, items]) => (
              <div key={section} className="sidebar-section">
                <span className="sidebar-section-title">{section}</span>
                <ul className="sidebar-menu">
                  {items.map((item, idx) => {
                    const isActive = isNavItemActive(item.path);
                    return (
                      <li key={idx}>
                        <button
                          className={`sidebar-link ${isActive ? 'sidebar-link--active' : ''}`}
                          onClick={() => handleNavClick(item.path)}
                        >
                          <span className="material-symbols-outlined">{item.icon}</span>
                          <span className="sidebar-link-label">{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Viewport Content */}
        <main className="tms-content">
          <div className="content-container">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
