import { AccountMenu } from './AccountMenu';
import React, { useState, useEffect, useRef } from 'react';
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
  const [showNotifications, setShowNotifications] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);

  // Close menus on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

          {/* Notifications Dropdown */}
          <div className="topbar-dropdown-wrap" ref={notifRef}>
            <button 
              className="topbar-action-btn notification-badge-container" 
              onClick={() => setShowNotifications(!showNotifications)}
              aria-label="Notifications"
            >
              <span className="material-symbols-outlined">notifications</span>
              <span className="notification-badge">3</span>
            </button>

            {showNotifications && (
              <div className="topbar-dropdown notification-dropdown">
                <div className="dropdown-header">
                  <h3>Notifications</h3>
                  <button className="auth-link" style={{ fontSize: '12px' }}>Mark all read</button>
                </div>
                <div className="dropdown-items">
                  <div className="notification-item">
                    <span className="material-symbols-outlined notif-icon text-warning">receipt_long</span>
                    <div>
                      <p className="notif-text">New petty cash request pending approval</p>
                      <span className="notif-time">5 mins ago</span>
                    </div>
                  </div>
                  <div className="notification-item">
                    <span className="material-symbols-outlined notif-icon text-success">domain</span>
                    <div>
                      <p className="notif-text">Branch 'Lalitpur Academy' approved</p>
                      <span className="notif-time">2 hours ago</span>
                    </div>
                  </div>
                  <div className="notification-item">
                    <span className="material-symbols-outlined notif-icon text-primary">groups</span>
                    <div>
                      <p className="notif-text">2 new student enrollments registered</p>
                      <span className="notif-time">1 day ago</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

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
