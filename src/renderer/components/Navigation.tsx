import React from 'react';

export type Page = 'dashboard' | 'list' | 'flow' | 'autopilot' | 'detail' | 'settings';

interface NavigationProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  collapsed?: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({ currentPage, onNavigate, collapsed }) => {
  const navItems: { label: string; page: Page }[] = [
    { label: 'Dashboard', page: 'dashboard' },
    { label: 'Applications', page: 'list' },
    { label: 'Flow', page: 'flow' },
    { label: 'Autopilot', page: 'autopilot' },
    { label: 'Settings', page: 'settings' },
  ];

  return (
    <div className="sidebar" style={{
      display: 'flex', flexDirection: 'column',
      width: collapsed ? 0 : 256, minWidth: collapsed ? 0 : 256,
      borderRight: collapsed ? 'none' : undefined, overflow: 'hidden',
      transition: 'width .18s ease, min-width .18s ease',
    }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--ink)' }}>
        <h1 style={{ fontSize: '21px', fontWeight: 700, letterSpacing: '-.02em', fontStyle: 'italic', margin: 0 }}>
          Job Tracker
        </h1>
      </div>

      <nav style={{ padding: '24px', flex: 1 }}>
        {navItems.map((item) => (
          <button
            key={item.page}
            onClick={() => onNavigate(item.page)}
            className={`navlink ${currentPage === item.page ? 'active' : ''}`}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              marginBottom: '16px',
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
};
