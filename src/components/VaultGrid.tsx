'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { decryptMetadata, decryptFile, uint8ArrayToHex } from '@/lib/clientCrypto';

interface EncryptedImageRecord {
  id: string;
  encryptedMetadata: string;
  metadataIv: string;
  uploadedBy: string;
  createdAt: string;
}

interface VaultGridProps {
  refreshTrigger: number;
}

export default function VaultGrid({ refreshTrigger }: VaultGridProps) {
  const { vaultKey } = useAuth();
  const [records, setRecords] = useState<EncryptedImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal Lightbox state
  const [activeRecord, setActiveRecord] = useState<EncryptedImageRecord | null>(null);
  const [activeDecryptedBlob, setActiveDecryptedBlob] = useState<{ src: string; name: string; size: number; date: string } | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchImages();
  }, [refreshTrigger]);

  async function fetchImages() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vault/images');
      if (!res.ok) {
        throw new Error('Failed to retrieve vault records.');
      }
      const data = await res.json();
      setRecords(data);
    } catch (err: any) {
      console.error('Error fetching images metadata:', err);
      setError(err.message || 'Error fetching vault data.');
    } finally {
      setLoading(false);
    }
  }

  const openImageModal = async (record: EncryptedImageRecord) => {
    if (!vaultKey) return;
    setActiveRecord(record);
    setModalLoading(true);
    setError(null);

    try {
      // 1. Decrypt the metadata payload
      const meta = await decryptMetadata(record.encryptedMetadata, record.metadataIv, vaultKey);

      // 2. Fetch the encrypted binary file (with prepended 12-byte IV)
      const res = await fetch(`/api/vault/image/${record.id}`);
      if (!res.ok) {
        throw new Error('Failed to retrieve file binary.');
      }
      
      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength <= 12) {
        throw new Error('Encrypted payload is malformed.');
      }

      // 3. Extract the IV (first 12 bytes) and ciphertext bytes (remainder)
      const ivBytes = arrayBuffer.slice(0, 12);
      const ciphertextBytes = arrayBuffer.slice(12);
      const ivHex = uint8ArrayToHex(new Uint8Array(ivBytes));

      // 4. Decrypt the image binary
      const decryptedBlob = await decryptFile(ciphertextBytes, ivHex, vaultKey, meta.mimeType);
      const objectUrl = URL.createObjectURL(decryptedBlob);

      setActiveDecryptedBlob({
        src: objectUrl,
        name: meta.filename,
        size: meta.size,
        date: new Date(meta.uploadedAt).toLocaleString(),
      });
    } catch (err: any) {
      console.error('Decryption failed:', err);
      alert('Decryption failed: verification mismatch or corrupted block.');
      closeImageModal();
    } finally {
      setModalLoading(false);
    }
  };

  const closeImageModal = () => {
    // Explicitly release browser memory hold on image object URL
    if (activeDecryptedBlob?.src) {
      URL.revokeObjectURL(activeDecryptedBlob.src);
    }
    setActiveRecord(null);
    setActiveDecryptedBlob(null);
    setModalLoading(false);
  };

  const handleDelete = async () => {
    if (!activeRecord) return;
    if (!confirm('Are you absolutely sure you want to permanently delete this image from the vault?')) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/vault/delete/${activeRecord.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete image.');
      }

      closeImageModal();
      fetchImages(); // Refresh metadata list
    } catch (err: any) {
      console.error('Delete error:', err);
      alert(err.message || 'Error occurred while deleting.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="loading-state">Accessing vault records...</div>;
  }

  if (error) {
    return <div className="error-state">Error: {error}</div>;
  }

  return (
    <div className="vault-grid-container">
      <style jsx>{`
        .vault-grid-container {
          margin-top: 20px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 20px;
        }
        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: var(--text-secondary);
          border: 1px dashed var(--border-subtle);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.005);
        }
        .loading-state, .error-state {
          text-align: center;
          padding: 40px;
          color: var(--text-secondary);
        }
        
        /* Lightbox modal overlay */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(5, 5, 8, 0.93);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .modal-content {
          max-width: 900px;
          width: 100%;
          max-height: 92vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px;
          position: relative;
        }
        .modal-image-container {
          position: relative;
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          overflow: hidden;
          margin-bottom: 20px;
          min-height: 350px;
        }
        .modal-image {
          max-width: 100%;
          max-height: 60vh;
          object-fit: contain;
        }
        .modal-meta {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          border-top: 1px solid var(--border-subtle);
          padding-top: 18px;
        }
        .meta-details h3 {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 6px;
          word-break: break-all;
        }
        .meta-details p {
          font-size: 13px;
          color: var(--text-secondary);
        }
        .modal-actions {
          display: flex;
          gap: 12px;
        }
        .close-btn {
          position: absolute;
          top: 15px;
          right: 15px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border-subtle);
          color: white;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          transition: var(--transition-smooth);
        }
        .close-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.25);
        }
      `}</style>

      {records.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>Vault contains no files</p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Drag and drop images above to initiate client-side encryption.</p>
        </div>
      ) : (
        <div className="grid">
          {records.map((record) => (
            <VaultImageCard
              key={record.id}
              record={record}
              vaultKey={vaultKey!}
              onClick={() => openImageModal(record)}
            />
          ))}
        </div>
      )}

      {/* Decryption Lightbox Modal */}
      {activeRecord && (
        <div className="modal-overlay" onClick={closeImageModal}>
          <div className="modal-content glass-panel animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={closeImageModal}>✕</button>
            
            <div className="modal-image-container">
              {modalLoading ? (
                <div style={{ color: 'var(--text-secondary)' }}>Retrieving and decrypting payload...</div>
              ) : activeDecryptedBlob ? (
                <img
                  src={activeDecryptedBlob.src}
                  alt={activeDecryptedBlob.name}
                  className="modal-image"
                />
              ) : (
                <div style={{ color: 'var(--danger-primary)' }}>Decryption validation failed.</div>
              )}
            </div>

            {activeDecryptedBlob && (
              <div className="modal-meta">
                <div className="meta-details">
                  <h3>{activeDecryptedBlob.name}</h3>
                  <p>
                    Size: {(activeDecryptedBlob.size / 1024 / 1024).toFixed(2)} MB &bull; Uploaded: {activeDecryptedBlob.date}
                  </p>
                </div>
                <div className="modal-actions">
                  <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                  <button className="btn-secondary" onClick={closeImageModal}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponent that manages lazy metadata decryption and card state
function VaultImageCard({
  record,
  vaultKey,
  onClick,
}: {
  record: EncryptedImageRecord;
  vaultKey: CryptoKey;
  onClick: () => void;
}) {
  const [filename, setFilename] = useState<string>('Decrypting...');
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    async function decrypt() {
      try {
        const meta = await decryptMetadata(record.encryptedMetadata, record.metadataIv, vaultKey);
        if (active) {
          setFilename(meta.filename);
        }
      } catch (err) {
        console.error('Metadata decryption error:', err);
        if (active) {
          setError(true);
          setFilename('Decryption Error');
        }
      }
    }
    decrypt();
    return () => {
      active = false;
    };
  }, [record, vaultKey]);

  return (
    <div className="card glass-panel animate-fade-in" onClick={onClick}>
      <style jsx>{`
        .card {
          padding: 16px;
          cursor: pointer;
          transition: var(--transition-smooth);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .card:hover {
          transform: translateY(-2px);
          border-color: var(--accent-primary);
          box-shadow: 0 8px 30px rgba(99, 102, 241, 0.08);
        }
        .thumbnail-placeholder {
          width: 100%;
          aspect-ratio: 16/10;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          color: var(--text-muted);
          border: 1px solid var(--border-subtle);
          position: relative;
        }
        .lock-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          font-size: 10px;
          background: rgba(0, 0, 0, 0.7);
          border: 1px solid var(--border-subtle);
          padding: 2px 6px;
          border-radius: 4px;
          color: var(--accent-primary);
          font-weight: 500;
        }
        .title {
          font-size: 13px;
          font-weight: 500;
          text-align: center;
          width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: ${error ? 'var(--danger-primary)' : 'var(--text-primary)'};
        }
        .date {
          font-size: 11px;
          color: var(--text-muted);
        }
      `}</style>
      <div className="thumbnail-placeholder">
        🖼️
        <div className="lock-badge">AES-GCM</div>
      </div>
      <div className="title" title={filename}>{filename}</div>
      <div className="date">{new Date(record.createdAt).toLocaleDateString()}</div>
    </div>
  );
}
