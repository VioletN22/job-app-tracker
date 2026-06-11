import React from 'react';
import { LayoutDashboard, List, Settings } from 'lucide-react';

export type Page = 'dashboard' | 'list' | 'detail' | 'settings';

interface NavigationProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentPage, onNavigate }) => {
  const navItems: { label: string; page: Page; icon: React.ReactNode }[] = [
    { label: 'Dashboard', page: 'dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: 'Applications', page: 'list', icon: <List className="w-5 h-5" /> },
    { label: 'Settings', page: 'settings', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <div className="w-64 bg-white border-r border-gray-200 p-6 flex flex-col">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Job Tracker</h1>

      <nav className="flex flex-col gap-3">
        {navItems.map((item) => (
          <button
            key={item.page}
            onClick={() => onNavigate(item.page)}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              currentPage === item.page
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {item.icon}
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};
