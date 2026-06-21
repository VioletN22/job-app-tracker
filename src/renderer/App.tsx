import React, { useState, useEffect } from 'react';
import { Navigation, Page } from './components/Navigation';
import { DashboardPage } from './pages/DashboardPage';
import { ListPage } from './pages/ListPage';
import { FlowPage } from './pages/FlowPage';
import { AutopilotPage } from './pages/AutopilotPage';
import { DetailPage } from './pages/DetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { ActivationScreen } from './components/ActivationScreen';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  // purpl hq license gate: null = checking, false = needs activation, true = unlocked
  const [licensed, setLicensed] = useState<boolean | null>(null);

  useEffect(() => {
    window.electronAPI.license
      .status()
      .then((s) => setLicensed(s.licensed))
      .catch(() => setLicensed(false));
  }, []);

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
        return <DashboardPage onNavigate={setCurrentPage} />;
      case 'list':
        return <ListPage onSelectApplication={handleSelectApplication} />;
      case 'flow':
        return <FlowPage />;
      case 'autopilot':
        return <AutopilotPage />;
      case 'detail':
        return <DetailPage applicationId={selectedApplicationId} onBack={handleBack} />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  // License gate — block the app until activated (one key unlocks the bundle).
  if (licensed === null) {
    return <div style={{ height: '100vh', backgroundColor: 'var(--bg)' }} />;
  }
  if (!licensed) {
    return <ActivationScreen onActivated={() => setLicensed(true)} />;
  }

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
