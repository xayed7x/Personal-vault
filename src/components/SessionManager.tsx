'use client';

import React from 'react';
import { useAuth } from '@/app/context/AuthContext';

export default function SessionManager() {
  const { sessions, revokeSession } = useAuth();

  const handleRevoke = async (sessionId: string) => {
    if (!confirm('Are you sure you want to revoke this session? If it is your current device, you will be logged out immediately.')) {
      return;
    }
    await revokeSession(sessionId);
  };

  // Extract friendly device names and browser categories from standard user-agent strings
  const getDeviceIconAndName = (uaString: string | null) => {
    if (!uaString) return { icon: '💻', name: 'Unknown Device' };
    const ua = uaString.toLowerCase();
    
    let deviceName = 'Browser / Device';
    let icon = '💻';

    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
      deviceName = ua.includes('ipad') ? 'iPad' : 'iPhone';
      icon = '📱';
    } else if (ua.includes('android')) {
      deviceName = 'Android Device';
      icon = '📱';
    } else if (ua.includes('macintosh') || ua.includes('mac os')) {
      deviceName = 'MacBook / iMac';
      icon = '🖥️';
    } else if (ua.includes('windows')) {
      deviceName = 'Windows PC';
      icon = '💻';
    } else if (ua.includes('linux')) {
      deviceName = 'Linux Workstation';
      icon = '🐧';
    }

    let browser = '';
    if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('chrome') && !ua.includes('chromium')) browser = 'Chrome';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('edge')) browser = 'Edge';
    else if (ua.includes('opera')) browser = 'Opera';

    return {
      icon,
      name: browser ? `${deviceName} (${browser})` : deviceName,
    };
  };

  return (
    <div className="session-manager-container glass-panel animate-fade-in">
      <style jsx>{`
        .session-manager-container {
          padding: 24px;
          margin-top: 40px;
          border-top: 1px solid var(--border-subtle);
        }
        h2 {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 6px;
        }
        .subtitle {
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 20px;
        }
        .session-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .session-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 18px;
          background: rgba(0, 0, 0, 0.15);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          gap: 15px;
        }
        .session-info {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .device-icon {
          font-size: 26px;
        }
        .session-details {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .device-name {
          font-size: 14px;
          font-weight: 500;
        }
        .meta-text {
          font-size: 12px;
          color: var(--text-secondary);
        }
      `}</style>
      
      <h2>Authorized Devices & Sessions</h2>
      <div className="subtitle">Active login sessions linked to this vault. You can revoke any listing to force a remote logout.</div>
      
      <div className="session-list">
        {sessions.map((session) => {
          const device = getDeviceIconAndName(session.userAgent);
          return (
            <div className="session-card" key={session.id}>
              <div className="session-info">
                <div className="device-icon">{device.icon}</div>
                <div className="session-details">
                  <div className="device-name">{device.name}</div>
                  <div className="meta-text">
                    IP Address: {session.ipAddress || '127.0.0.1'} &bull; Logged In: {new Date(session.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
              <button className="btn-danger" style={{ padding: '8px 12px', fontSize: '12px' }} onClick={() => handleRevoke(session.id)}>
                Revoke
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
