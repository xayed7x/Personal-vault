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
  const [currentView, setCurrentView] = useState<'landing' | 'normal' | 'couple' | 'hot' | 'super_hot'>('landing');

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
          cursor: pointer;
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
        .landing-portal {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 40px;
          margin-top: 20px;
          margin-bottom: 40px;
        }
        .portal-hero {
          text-align: center;
          max-width: 600px;
        }
        .portal-hero h1 {
          font-size: 32px;
          font-weight: 800;
          margin-bottom: 12px;
          letter-spacing: -0.8px;
          background: linear-gradient(135deg, #ffffff 0%, var(--text-secondary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .portal-hero p {
          font-size: 15px;
          color: var(--text-muted);
        }
        .gates-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
          width: 100%;
          max-width: 800px;
        }
        @media (max-width: 600px) {
          .gates-grid {
            grid-template-columns: 1fr;
          }
        }
        .gate-card {
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: 30px 24px;
          cursor: pointer;
          transition: var(--transition-smooth);
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
          position: relative;
          overflow: hidden;
        }
        .gate-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: radial-gradient(circle at 10% 10%, rgba(99, 102, 241, 0.03) 0%, transparent 80%);
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        .gate-card:hover::before {
          opacity: 1;
        }
        .gate-card:hover {
          transform: translateY(-4px);
          border-color: var(--accent-primary);
          box-shadow: 0 12px 40px rgba(99, 102, 241, 0.08);
        }
        .gate-icon {
          font-size: 36px;
          margin-bottom: 8px;
        }
        .gate-card h3 {
          font-size: 18px;
          font-weight: 700;
          color: white;
        }
        .gate-card p {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.5;
        }
        .gate-badge {
          font-size: 10px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: 500;
          margin-top: 8px;
        }
        .gate-badge.secure {
          background: rgba(16, 185, 129, 0.08);
          border-color: rgba(16, 185, 129, 0.2);
          color: #34d399;
        }
        .view-navigation {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 10px;
        }
        .back-btn {
          padding: 8px 16px;
          font-size: 13px;
        }
        .view-title {
          font-size: 20px;
          font-weight: 700;
          color: white;
        }
      `}</style>

      <header className="header animate-fade-in">
        <div className="logo" onClick={() => setCurrentView('landing')}>
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
        {currentView === 'landing' ? (
          <>
            <div className="landing-portal animate-fade-in">
              <div className="portal-hero">
                <h1>This is our personal vault</h1>
                <p>A private, secure space for our shared photos.</p>
              </div>

              <div className="gates-grid">
                <div className="gate-card" onClick={() => setCurrentView('normal')}>
                  <div className="gate-icon">🖼️</div>
                  <h3>Normal Vault</h3>
                  <p>Instant scrollable grid for regular photos</p>
                  <span className="gate-badge">Plaintext</span>
                </div>

                <div className="gate-card" onClick={() => setCurrentView('couple')}>
                  <div className="gate-icon">👩‍❤️‍👨</div>
                  <h3>Couple Vault</h3>
                  <p>Our shared couple photos and moments</p>
                  <span className="gate-badge">Plaintext</span>
                </div>

                <div className="gate-card" onClick={() => setCurrentView('hot')}>
                  <div className="gate-icon">🔥</div>
                  <h3>Hot Vault</h3>
                  <p>High performance feed for hot photos</p>
                  <span className="gate-badge">Plaintext</span>
                </div>

                <div className="gate-card" onClick={() => setCurrentView('super_hot')}>
                  <div className="gate-icon">🔒</div>
                  <h3>Super Hot Vault</h3>
                  <p>Maximum security zero-knowledge encrypted vault</p>
                  <span className="gate-badge secure">AES-GCM Secure</span>
                </div>
              </div>
            </div>

            {/* Authorized Active Device List (Landing Only) */}
            <SessionManager />
          </>
        ) : (
          <div className="category-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div className="view-navigation">
              <button className="btn-secondary back-btn" onClick={() => setCurrentView('landing')}>
                ← Back to Entrance
              </button>
              <div className="view-title">
                {currentView === 'normal' && '🖼️ Normal Gallery'}
                {currentView === 'couple' && '👩‍❤️‍👨 Couple Gallery'}
                {currentView === 'hot' && '🔥 Hot Gallery'}
                {currentView === 'super_hot' && '🔒 Super Hot Gallery'}
              </div>
            </div>

            {/* Dedicated Upload Zone for this category */}
            <UploadZone onUploadSuccess={handleUploadSuccess} category={currentView} />

            {/* Dedicated Gallery for this category */}
            <VaultGrid refreshTrigger={refreshTrigger} category={currentView} />
          </div>
        )}
      </main>
    </div>
  );
}
