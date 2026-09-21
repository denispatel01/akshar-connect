import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DevoteesPage from './pages/DevoteesPage';
import SabhasPage from './pages/SabhasPage';
import QrScannerPage from './pages/QrScannerPage';
import ReportsPage from './pages/ReportsPage';
import AdminPage from './pages/AdminPage';
import { dataService } from './services/dataService';

export default function App() {
  const [user, setUser] = useState(null);
  const [activePage, setActivePage] = useState('dashboard');

  useEffect(() => {
    const sessionUser = dataService.getCurrentSession();
    if (sessionUser) {
      setUser(sessionUser);
    }
  }, []);

  const handleLoginSuccess = (userObj) => {
    setUser(userObj);
    setActivePage('dashboard');
  };

  const handleLogout = () => {
    dataService.logout();
    setUser(null);
  };

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col font-sans">
      <Navbar
        activePage={activePage}
        setActivePage={setActivePage}
        user={user}
        onLogout={handleLogout}
      />

      <main className="flex-1 pb-12">
        {activePage === 'dashboard' && <DashboardPage setActivePage={setActivePage} user={user} />}
        {activePage === 'devotees' && <DevoteesPage user={user} />}
        {activePage === 'sabhas' && <SabhasPage user={user} />}
        {activePage === 'qr-scanner' && <QrScannerPage />}
        {activePage === 'reports' && <ReportsPage />}
        {activePage === 'admin' && <AdminPage user={user} />}
      </main>
    </div>
  );
}
