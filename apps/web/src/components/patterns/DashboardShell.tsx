import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { NepalDateTime } from '../NepalDateTime';
import {
  findNavigationItem,
  getDashboardNavigation,
  getDashboardRoleLabel,
  type DashboardNavItem,
  type DashboardRole,
} from './dashboardNavigation';

interface DashboardShellProps {
  role: DashboardRole;
  children: ReactNode;
}

function getInitials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase())
      .join('')
      .slice(0, 2) || 'TM'
  );
}

function groupNavigation(items: DashboardNavItem[]): Array<[string, DashboardNavItem[]]> {
  const groups = new Map<string, DashboardNavItem[]>();

  items.forEach((item) => {
    const sectionItems = groups.get(item.section) ?? [];
    sectionItems.push(item);
    groups.set(item.section, sectionItems);
  });

  return Array.from(groups.entries());
}

function formatFallbackTitle(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const lastSegment = segments.at(-1) ?? 'dashboard';

  return lastSegment
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function DashboardShell({ role, children }: DashboardShellProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const navItems = useMemo(() => getDashboardNavigation(role), [role]);
  const groupedNav = useMemo(() => groupNavigation(navItems), [navItems]);
  const roleLabel = useMemo(() => getDashboardRoleLabel(role), [role]);
  const activeItem = useMemo(() => findNavigationItem(role, location.pathname), [location.pathname, role]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(() => window.innerWidth < 1280);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const active = document.documentElement.getAttribute('data-theme');
    return active === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem('tms_theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleResize = () => {
      const compact = window.innerWidth < 1280;
      setIsCompactViewport(compact);
      if (!compact) {
        setIsDrawerOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isCompactViewport) {
      setIsDrawerOpen(false);
    }
  }, [isCompactViewport, location.pathname]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setLastUpdated(Date.now());
    }, 300000);

    return () => window.clearInterval(intervalId);
  }, []);

  const sidebarWidth = isCollapsed ? 64 : 240;
  const pageTitle = activeItem?.label ?? formatFallbackTitle(location.pathname);
  const userName = user?.name ?? roleLabel;
  const userInitials = getInitials(userName);
  const updatedLabel = lastUpdated ? 'Updated just now' : 'Updated just now';

  const renderNavSection = (section: string, items: DashboardNavItem[]) => (
    <div key={section} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {!isCollapsed ? (
        <span
          style={{
            padding: '0 14px',
            color: 'rgba(255, 255, 255, 0.66)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {section}
        </span>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {items.map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
          const isDisabled = Boolean(item.phase);

          return (
            <button
              key={item.path}
              type="button"
              disabled={isDisabled}
              onClick={() => {
                if (!isDisabled) {
                  navigate(item.path);
                  setIsDrawerOpen(false);
                }
              }}
              title={isCollapsed ? item.label : undefined}
              style={{
                width: '100%',
                minHeight: '46px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: isCollapsed ? 'center' : 'space-between',
                gap: '10px',
                padding: isCollapsed ? '0' : '0 14px 0 10px',
                borderRadius: '12px',
                border: 'none',
                borderLeft: isActive ? '4px solid var(--color-accent)' : '4px solid transparent',
                background: isActive ? 'rgba(255, 188, 59, 0.14)' : 'transparent',
                color: isDisabled ? 'rgba(255, 255, 255, 0.46)' : '#FFFFFF',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.82 : 1,
                transition: 'background-color 180ms ease, transform 180ms ease, opacity 180ms ease',
                textAlign: 'left',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px', flexShrink: 0 }}>
                  {item.icon}
                </span>
                {!isCollapsed ? (
                  <span style={{ fontSize: '14px', fontWeight: isActive ? 700 : 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.label}
                  </span>
                ) : null}
              </span>
              {!isCollapsed && isDisabled ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '3px 8px',
                    borderRadius: '999px',
                    background: 'rgba(255, 188, 59, 0.18)',
                    color: 'var(--color-accent-hover)',
                    fontSize: '10px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Soon
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  const sidebarContent = (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-primary)',
        color: '#FFFFFF',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: isCollapsed ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          gap: isCollapsed ? '10px' : '12px',
          padding: isCollapsed ? '16px 8px 14px' : '18px 18px 12px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.12)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              school
            </span>
          </div>
          {!isCollapsed ? (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 600 }}>TMS</div>
              <div style={{ color: 'rgba(255, 255, 255, 0.74)', fontSize: '12px', fontWeight: 600 }}>{roleLabel}</div>
            </div>
          ) : null}
        </div>
        {!isCompactViewport ? (
          <button
            type="button"
            onClick={() => setIsCollapsed((current) => !current)}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#FFFFFF',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              {isCollapsed ? 'menu_open' : 'menu'}
            </span>
          </button>
        ) : null}
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', padding: '18px 10px 22px' }}>
        {groupedNav.map(([section, items]) => renderNavSection(section, items))}
      </nav>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-surface)' }}>
      {!isCompactViewport ? (
        <aside
          style={{
            position: 'fixed',
            inset: '0 auto 0 0',
            width: `${sidebarWidth}px`,
            zIndex: 20,
            boxShadow: '0 18px 38px -28px rgba(21, 96, 189, 0.65)',
          }}
        >
          {sidebarContent}
        </aside>
      ) : null}

      {isCompactViewport ? (
        <>
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setIsDrawerOpen(true)}
            style={{
              position: 'fixed',
              top: '18px',
              left: '18px',
              zIndex: 25,
              width: '44px',
              height: '44px',
              borderRadius: '14px',
              border: '1px solid rgba(21, 96, 189, 0.12)',
            background: 'var(--bg-card)',
              color: 'var(--color-primary)',
              boxShadow: 'var(--shadow-card)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
          {isDrawerOpen ? (
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setIsDrawerOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                border: 'none',
                background: 'rgba(10, 24, 44, 0.36)',
                zIndex: 24,
                cursor: 'pointer',
              }}
            />
          ) : null}
          <aside
            style={{
              position: 'fixed',
              inset: '0 auto 0 0',
              width: '240px',
              transform: isDrawerOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 220ms ease',
              zIndex: 26,
              boxShadow: '0 18px 38px -28px rgba(21, 96, 189, 0.65)',
            }}
          >
            {sidebarContent}
          </aside>
        </>
      ) : null}

      <div
        style={{
          marginLeft: isCompactViewport ? 0 : `${sidebarWidth}px`,
          minHeight: '100vh',
          transition: 'margin-left 220ms ease',
        }}
      >
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'color-mix(in srgb, var(--color-surface) 92%, transparent)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(21, 96, 189, 0.08)',
            padding: isCompactViewport ? '18px 24px 18px 76px' : '22px 28px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 600, color: 'var(--color-text)' }}>{pageTitle}</h1>
              <p style={{ marginTop: '4px', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500 }}>
                {roleLabel} workspace
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginLeft: 'auto' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--color-primary-light)', fontSize: '12px', fontWeight: 700 }}>{updatedLabel}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>{role === 'student' ? 'Refreshes when a section opens' : 'Auto-refresh every 5 min'}</div>
              </div>
              <button
                type="button"
                onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--color-primary)',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                  {theme === 'light' ? 'dark_mode' : 'light_mode'}
                </span>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '999px', background: 'var(--bg-card)', boxShadow: '0 8px 20px -18px rgba(21, 96, 189, 0.8)' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: 'rgba(21, 96, 189, 0.1)',
                    color: 'var(--color-primary)',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 700,
                  }}
                >
                  {role === 'tenant-admin' ? <button type="button" aria-label="Open my account" onClick={() => navigate('/tenant/account')} style={{ color: 'inherit', background: 'transparent', border: 0, minWidth: 44, minHeight: 44, font: 'inherit', cursor: 'pointer' }}>{userInitials}</button> : userInitials}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--color-text)', fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap' }}>{userName}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>{roleLabel}</div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  aria-label="Sign out"
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(21, 96, 189, 0.08)',
                    color: 'var(--color-primary)',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    logout
                  </span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main style={{ padding: isCompactViewport ? '24px' : '28px', overflowX: 'hidden' }}>
          {activeItem && ['dashboard', 'home'].includes(activeItem.icon) && <div style={{ marginBottom: 'var(--sp-5)' }}><NepalDateTime /></div>}
          {children}
        </main>
      </div>
    </div>
  );
}
