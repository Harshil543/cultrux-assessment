import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import WalletPage from './pages/WalletPage';
import CampaignsPage from './pages/CampaignsPage';

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="layout">
      <header className="header">
        <Link to="/wallet" className="brand">
          Cultrux Credits
        </Link>
        {user && (
          <nav className="nav">
            <Link to="/wallet">Wallet</Link>
            <Link to="/campaigns">Campaigns</Link>
            <span className="muted">{user.email}</span>
            <button type="button" onClick={logout}>
              Logout
            </button>
          </nav>
        )}
      </header>
      <main className="main">{children}</main>
    </div>
  );
}

function Private({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, authReady } = useAuth();
  if (!authReady) return <div className="main muted">Loading…</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/wallet"
        element={
          <Private>
            <WalletPage />
          </Private>
        }
      />
      <Route
        path="/campaigns"
        element={
          <Private>
            <CampaignsPage />
          </Private>
        }
      />
      <Route path="*" element={<Navigate to="/wallet" replace />} />
    </Routes>
  );
}
