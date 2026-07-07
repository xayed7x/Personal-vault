'use client';

import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import UploadZone from '@/components/UploadZone';
import VaultGrid from '@/components/VaultGrid';
import SessionManager from '@/components/SessionManager';

export default function Home() {
  const { status, user, login, unlock, logout, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    try {
      await login(username, password);
      setPassword('');
    } catch (err) {
      // Error handled by AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setSubmitting(true);
    try {
      await unlock(password);
      setPassword('');
    } catch (err) {
      // Error handled by AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  // 1. Loading State
  if (status === 'loading') {
    return (
      <div className="full-center">
        <style jsx>{`
          .full-center {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background-color: var(--bg-primary);
          }
          .spinner {
            width: 36px;
            height: 36px;
            border: 3px solid rgba(255, 255, 255, 0.05);
            border-radius: 50%;
            border-top-color: var(--accent-primary);
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
        <div className="spinner"></div>
      </div>
    );
  }

  // 2. Unauthenticated State (Login Card)
  if (status === 'unauthenticated') {
    return (
      <div className="auth-container">
        <style jsx>{`
          .auth-container {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
            background: radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.03) 0%, var(--bg-primary) 100%);
          }
          .auth-card {
            max-width: 400px;
            width: 100%;
            padding: 40px 32px;
          }
          .auth-header {
            text-align: center;
            margin-bottom: 30px;
          }
          .auth-header h1 {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 6px;
            letter-spacing: -0.5px;
          }
          .auth-header p {
            font-size: 13px;
            color: var(--text-secondary);
          }
          .logo-mark {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 16px auto;
            font-size: 20px;
            box-shadow: 0 0 20px rgba(99, 102, 241, 0.2);
          }
          .error-banner {
            background: rgba(239, 68, 68, 0.08);
            border: 1px solid rgba(239, 68, 68, 0.15);
            color: #fca5a5;
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 13px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
          }
        `}</style>

        <div className="auth-card glass-panel animate-fade-in">
          <div className="auth-header">
            <div className="logo-mark">🛡️</div>
            <h1>Secure Vault</h1>
            <p>Access your private zero-knowledge vault</p>
          </div>

          {error && <div className="error-banner">⚠️ {error}</div>}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-input"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                disabled={submitting}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={submitting}
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', marginTop: '10px' }}
              disabled={submitting || !username.trim() || !password}
            >
              {submitting ? 'Deriving keys & authenticating...' : 'Unlock Vault'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 3. Locked State (Unlock Card)
  if (status === 'locked') {
    return (
      <div className="auth-container">
        <style jsx>{`
          .auth-container {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
            background: radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.03) 0%, var(--bg-primary) 100%);
          }
          .auth-card {
            max-width: 400px;
            width: 100%;
            padding: 40px 32px;
          }
          .auth-header {
            text-align: center;
            margin-bottom: 30px;
          }
          .auth-header h1 {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 6px;
            letter-spacing: -0.5px;
          }
          .auth-header p {
            font-size: 13px;
            color: var(--text-secondary);
          }
          .logo-mark {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 16px auto;
            font-size: 20px;
            box-shadow: 0 0 20px rgba(99, 102, 241, 0.2);
          }
          .error-banner {
            background: rgba(239, 68, 68, 0.08);
            border: 1px solid rgba(239, 68, 68, 0.15);
            color: #fca5a5;
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 13px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .switch-link {
            text-align: center;
            margin-top: 24px;
            font-size: 13px;
          }
          .switch-link button {
            background: none;
            border: none;
            color: var(--accent-primary);
            text-decoration: underline;
            cursor: pointer;
            padding: 0;
          }
        `}</style>

        <div className="auth-card glass-panel animate-fade-in">
          <div className="auth-header">
            <div className="logo-mark">🔒</div>
            <h1>Vault Locked</h1>
            <p>Session active for <strong>{user?.username}</strong>. Enter password to decrypt local keys.</p>
          </div>

          {error && <div className="error-banner">⚠️ {error}</div>}

          <form onSubmit={handleUnlock}>
            <div className="form-group">
              <label className="form-label">Vault Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={submitting}
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', marginTop: '10px' }}
              disabled={submitting || !password}
            >
              {submitting ? 'Decrypting local vault keys...' : 'Unlock Vault'}
            </button>
          </form>
          
          <div className="switch-link">
            <button onClick={logout} disabled={submitting}>Sign in as different user</button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Unlocked State (Main Gallery Dashboard)
  return (
    <div className="app-container">
      <style jsx>{`
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .logo {
          font-size: 22px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .logo-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: var(--accent-primary);
          box-shadow: 0 0 10px var(--accent-primary);
        }
        .user-badge {
          display: flex;
          align-items: center;
          gap: 14px;
          font-size: 13px;
        }
        .username {
          color: var(--text-secondary);
        }
        .key-badge {
          font-size: 10px;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.15);
          color: #34d399;
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: 500;
        }
        .dashboard-body {
          display: flex;
          flex-direction: column;
          gap: 30px;
        }
      `}</style>

      <header className="header animate-fade-in">
        <div className="logo">
          <div className="logo-dot"></div>
          <span>Zero-Knowledge Vault</span>
        </div>
        <div className="user-badge">
          <span className="key-badge">Zero-Knowledge Active</span>
          <span className="username">Active user: <strong>{user?.username}</strong></span>
          <button className="btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }} onClick={logout}>
            Lock & Logout
          </button>
        </div>
      </header>

      <main className="dashboard-body">
        {/* Secure Upload Section */}
        <UploadZone onUploadSuccess={handleUploadSuccess} />

        {/* Gallery Grid View */}
        <VaultGrid refreshTrigger={refreshTrigger} />

        {/* Authorized Active Device List */}
        <SessionManager />
      </main>
    </div>
  );
}
