import React, { useState } from 'react';
import { Navigation, Page } from './components/Navigation';
import { DashboardPage } from './pages/DashboardPage';
import { ListPage } from './pages/ListPage';
import { DetailPage } from './pages/DetailPage';
import { SettingsPage } from './pages/SettingsPage';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);

  const handleSelectApplication = (id: string) => {
    setSelectedApplicationId(id);
    setCurrentPage('detail');
  };

  const handleBack = () => {
    setCurrentPage('list');
    setSelectedApplicationId(null);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage />;
      case 'list':
        return <ListPage onSelectApplication={handleSelectApplication} />;
      case 'detail':
        return <DetailPage applicationId={selectedApplicationId} onBack={handleBack} />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <div className="screen-main">
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />
      <div className="main-content">
        <header className="header">
          <h1 className="wordmark">Job Tracker</h1>
          <div className="spacer"></div>
        </header>
        <div className="content">
          {renderPage()}
        </div>
      </div>
    </div>
  );
};

export default App;
