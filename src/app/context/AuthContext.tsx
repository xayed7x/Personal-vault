'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { deriveClientKeys, decryptVaultKey } from '@/lib/clientCrypto';

export type AuthStatus = 'loading' | 'unauthenticated' | 'locked' | 'unlocked';

interface User {
  id: string;
  username: string;
  encryptedVaultKey: string;
  vaultKeyIv: string;
}

interface Session {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
}

interface AuthContextType {
  status: AuthStatus;
  user: User | null;
  vaultKey: CryptoKey | null;
  sessions: Session[];
  login: (username: string, password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  revokeSession: (sessionId: string) => Promise<void>;
  error: string | null;
  setError: (err: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Check session cookie validity on app startup
  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const res = await fetch('/api/auth/session');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setSessions(data.sessions);
        setStatus('locked'); // Session cookie exists, but vault needs local password to decrypt key
      } else {
        setStatus('unauthenticated');
      }
    } catch (err) {
      console.error('Session check error on load:', err);
      setStatus('unauthenticated');
    }
  }

  async function login(username: string, password: string) {
    setError(null);
    try {
      // 1. Retrieve the client KDF salt
      const saltRes = await fetch(`/api/auth/salt?username=${encodeURIComponent(username)}`);
      if (!saltRes.ok) {
        throw new Error('Failed to retrieve authentication parameters.');
      }
      const { salt } = await saltRes.json();

      // 2. Perform client-side PBKDF2 key derivation (600,000 iterations)
      const { authHashHex, masterKey } = await deriveClientKeys(password, salt);

      // 3. Authenticate with server using username and Derived AuthHash
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, authHash: authHashHex }),
      });

      if (!loginRes.ok) {
        const errData = await loginRes.json();
        throw new Error(errData.error || 'Invalid credentials');
      }

      const loginData = await loginRes.json();

      // 4. Decrypt the VaultKey in browser memory using derived MasterKey
      const decryptedKey = await decryptVaultKey(
        loginData.encryptedVaultKey,
        loginData.vaultKeyIv,
        masterKey
      );

      // 5. Update client state
      setUser({
        id: loginData.id || '',
        username: loginData.username,
        encryptedVaultKey: loginData.encryptedVaultKey,
        vaultKeyIv: loginData.vaultKeyIv,
      });
      setVaultKey(decryptedKey);
      setStatus('unlocked');
      
      await refreshSessions();
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed.');
      throw err;
    }
  }

  async function unlock(password: string) {
    setError(null);
    if (!user) {
      setStatus('unauthenticated');
      return;
    }
    try {
      // 1. Fetch user salt
      const saltRes = await fetch(`/api/auth/salt?username=${encodeURIComponent(user.username)}`);
      if (!saltRes.ok) {
        throw new Error('Failed to retrieve authentication parameters.');
      }
      const { salt } = await saltRes.json();

      // 2. Derive master key
      const { masterKey } = await deriveClientKeys(password, salt);

      // 3. Decrypt VaultKey in memory
      const decryptedKey = await decryptVaultKey(
        user.encryptedVaultKey,
        user.vaultKeyIv,
        masterKey
      );

      setVaultKey(decryptedKey);
      setStatus('unlocked');
      await refreshSessions();
    } catch (err: any) {
      console.error('Unlock error:', err);
      setError('Incorrect password. Failed to unlock vault.');
      throw err;
    }
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
      setVaultKey(null);
      setSessions([]);
      setStatus('unauthenticated');
    }
  }

  async function refreshSessions() {
    try {
      const res = await fetch('/api/auth/session');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions);
      }
    } catch (err) {
      console.error('Sessions refresh error:', err);
    }
  }

  async function revokeSession(sessionId: string) {
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', sessionId }),
      });
      if (res.ok) {
        await refreshSessions();
      }
    } catch (err) {
      console.error('Session revocation error:', err);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        vaultKey,
        sessions,
        login,
        unlock,
        logout,
        refreshSessions,
        revokeSession,
        error,
        setError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
