'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/app/context/AuthContext';
import { decryptMetadata, decryptFile, uint8ArrayToHex } from '@/lib/clientCrypto';

interface EncryptedImageRecord {
  id: string;
  encryptedMetadata: string;
  metadataIv: string;
  uploadedBy: string;
  createdAt: string;
  category: 'normal' | 'couple' | 'hot' | 'super_hot';
}

interface VaultGridProps {
  refreshTrigger: number;
  category: 'normal' | 'couple' | 'hot' | 'super_hot';
}

export default function VaultGrid({ refreshTrigger, category }: VaultGridProps) {
  const { vaultKey } = useAuth();
  const [records, setRecords] = useState<EncryptedImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal Lightbox state
  const [activeRecord, setActiveRecord] = useState<EncryptedImageRecord | null>(null);
  const [activeDecryptedBlob, setActiveDecryptedBlob] = useState<{ src: string; name: string; size: number; date: string } | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>('');

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (activeRecord) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [activeRecord]);

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
    setActiveRecord(record);
    setModalLoading(true);
    setModalError(null);
    setLoadingStep('Initializing vault decryption keys...');

    try {
      const isPlaintext = record.category === 'normal' || record.category === 'couple' || record.category === 'hot';

      if (isPlaintext) {
        setLoadingStep('Loading image asset...');
        const meta = JSON.parse(record.encryptedMetadata);
        setActiveDecryptedBlob({
          src: `/api/vault/image/${record.id}`,
          name: meta.filename,
          size: meta.size,
          date: new Date(meta.uploadedAt).toLocaleString(),
        });
      } else {
        if (!vaultKey) {
          throw new Error('Vault is locked. Cannot decrypt file.');
        }
        // 1. Decrypt the metadata payload
        setLoadingStep('Decrypting secure metadata payload...');
        const meta = await decryptMetadata(record.encryptedMetadata, record.metadataIv, vaultKey);

        // 2. Fetch the encrypted binary file (with prepended 12-byte IV)
        setLoadingStep('Downloading encrypted secure image file...');
        const res = await fetch(`/api/vault/image/${record.id}`);
        if (!res.ok) {
          throw new Error(`Failed to retrieve file binary (Status ${res.status}).`);
        }
        
        const arrayBuffer = await res.arrayBuffer();
        if (arrayBuffer.byteLength <= 12) {
          throw new Error('Encrypted payload is malformed or empty.');
        }

        // 3. Extract the IV (first 12 bytes) and ciphertext bytes (remainder)
        setLoadingStep('Extracting initialization vectors...');
        const ivBytes = arrayBuffer.slice(0, 12);
        const ciphertextBytes = arrayBuffer.slice(12);
        const ivHex = uint8ArrayToHex(new Uint8Array(ivBytes));

        // 4. Decrypt the image binary
        setLoadingStep('Performing client-side AES-GCM decryption...');
        const decryptedBlob = await decryptFile(ciphertextBytes, ivHex, vaultKey, meta.mimeType);
        const objectUrl = URL.createObjectURL(decryptedBlob);

        setActiveDecryptedBlob({
          src: objectUrl,
          name: meta.filename,
          size: meta.size,
          date: new Date(meta.uploadedAt).toLocaleString(),
        });
      }
    } catch (err: any) {
      console.error('Retrieving file details failed:', err);
      setModalError(err.message || 'Retrieving file details failed.');
    } finally {
      setModalLoading(false);
    }
  };

  const closeImageModal = () => {
    // Explicitly release browser memory hold on image object URL
    if (activeDecryptedBlob?.src && activeDecryptedBlob.src.startsWith('blob:')) {
      URL.revokeObjectURL(activeDecryptedBlob.src);
    }
    setActiveRecord(null);
    setActiveDecryptedBlob(null);
    setModalLoading(false);
    setModalError(null);
    setLoadingStep('');
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
        .tabs-container {
          display: flex;
          justify-content: center;
          gap: 12px;
          margin-bottom: 30px;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 16px;
        }
        .tab-btn {
          background: none;
          border: none;
          color: var(--text-secondary);
          padding: 8px 24px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border-radius: 8px;
          transition: var(--transition-smooth);
        }
        .tab-btn:hover {
          color: white;
          background: rgba(255, 255, 255, 0.03);
        }
        .tab-btn.active {
          color: white;
          background: rgba(255, 255, 255, 0.06);
          box-shadow: inset 0 0 10px rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border-subtle);
        }
        .grid {
          column-count: 4;
          column-gap: 16px;
          width: 100%;
        }
        @media (max-width: 1200px) {
          .grid { column-count: 3; }
        }
        @media (max-width: 768px) {
          .grid { column-count: 2; }
        }
        @media (max-width: 480px) {
          .grid { column-count: 1; }
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

        /* Modal Loading and Error wrapper styles */
        .modal-loading-wrapper, .modal-error-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 40px 20px;
          text-align: center;
        }
        .loading-step {
          font-size: 15px;
          font-weight: 500;
          color: white;
          margin-top: 8px;
        }
        .loading-subtext, .error-subtext {
          font-size: 12px;
          color: var(--text-secondary);
        }
        .error-icon {
          font-size: 36px;
          margin-bottom: 4px;
        }
        .error-message {
          font-size: 15px;
          font-weight: 600;
          color: var(--danger-primary);
          max-width: 450px;
          word-break: break-word;
        }
        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255, 255, 255, 0.05);
          border-radius: 50%;
          border-top-color: var(--accent-primary);
          animation: spin 1s linear infinite;
          box-shadow: 0 0 15px var(--accent-glow);
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {(() => {
        const filteredRecords = records.filter((r) => r.category === category);
        if (filteredRecords.length === 0) {
          return (
            <div className="empty-state">
              <p style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>No files in this category</p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Drag and drop images to initiate uploads into this category.</p>
            </div>
          );
        }
        return (
          <div className="grid">
            {filteredRecords.map((record) => (
              <VaultImageCard
                key={record.id}
                record={record}
                vaultKey={vaultKey!}
                onClick={() => openImageModal(record)}
              />
            ))}
          </div>
        );
      })()}

      {/* Decryption Lightbox Modal (Rendered under body to bypass parent CSS transform contexts) */}
      {mounted && activeRecord && createPortal(
        <div className="modal-overlay" onClick={closeImageModal}>
          <div className="modal-content glass-panel animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={closeImageModal}>✕</button>
            
            <div className="modal-image-container">
              {modalLoading ? (
                <div className="modal-loading-wrapper">
                  <div className="spinner"></div>
                  <div className="loading-step">{loadingStep}</div>
                  <div className="loading-subtext">Zero-knowledge decryption takes a few moments.</div>
                </div>
              ) : modalError ? (
                <div className="modal-error-wrapper">
                  <span className="error-icon">⚠️</span>
                  <div className="error-message">{modalError}</div>
                  <div className="error-subtext">Please verify vault key and connection and try again.</div>
                </div>
              ) : activeDecryptedBlob ? (
                <img
                  src={activeDecryptedBlob.src}
                  alt={activeDecryptedBlob.name}
                  className="modal-image"
                />
              ) : (
                <div className="modal-error-wrapper">
                  <span className="error-icon">⚠️</span>
                  <div className="error-message">Decryption validation failed.</div>
                </div>
              )}
            </div>

            {(activeDecryptedBlob || modalError || modalLoading) && (
              <div className="modal-meta">
                <div className="meta-details">
                  {activeDecryptedBlob ? (
                    <>
                      <h3>{activeDecryptedBlob.name}</h3>
                      <p>
                        Size: {(activeDecryptedBlob.size / 1024 / 1024).toFixed(2)} MB &bull; Uploaded: {activeDecryptedBlob.date}
                      </p>
                    </>
                  ) : modalError ? (
                    <>
                      <h3 style={{ color: 'var(--danger-primary)' }}>Decryption Failed</h3>
                      <p>An error occurred while fetching or decrypting the file.</p>
                    </>
                  ) : (
                    <>
                      <h3>Processing Security Layer...</h3>
                      <p>{loadingStep}</p>
                    </>
                  )}
                </div>
                <div className="modal-actions">
                  {activeDecryptedBlob && (
                    <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
                      {deleting ? 'Deleting...' : 'Delete'}
                    </button>
                  )}
                  <button className="btn-secondary" onClick={closeImageModal} disabled={deleting}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Subcomponent that manages metadata parsing/decryption and card state
function VaultImageCard({
  record,
  vaultKey,
  onClick,
}: {
  record: EncryptedImageRecord;
  vaultKey: CryptoKey;
  onClick: () => void;
}) {
  const [filename, setFilename] = useState<string>('Loading...');
  const [error, setError] = useState(false);
  const isPlaintext = record.category === 'normal' || record.category === 'couple' || record.category === 'hot';

  useEffect(() => {
    let active = true;
    async function resolveMetadata() {
      try {
        if (isPlaintext) {
          const meta = JSON.parse(record.encryptedMetadata);
          if (active) {
            setFilename(meta.filename);
          }
        } else {
          if (!vaultKey) return;
          const meta = await decryptMetadata(record.encryptedMetadata, record.metadataIv, vaultKey);
          if (active) {
            setFilename(meta.filename);
          }
        }
      } catch (err) {
        console.error('Metadata parsing/decryption error:', err);
        if (active) {
          setError(true);
          setFilename('Loading Error');
        }
      }
    }
    resolveMetadata();
    return () => {
      active = false;
    };
  }, [record, vaultKey, isPlaintext]);

  return (
    <div className="card glass-panel animate-fade-in" onClick={onClick}>
      <style jsx>{`
        .card {
          padding: 12px;
          cursor: pointer;
          transition: var(--transition-smooth);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          break-inside: avoid;
          margin-bottom: 16px;
          width: 100%;
          box-sizing: border-box;
        }
        .card:hover {
          transform: translateY(-2px);
          border-color: var(--accent-primary);
          box-shadow: 0 8px 30px rgba(99, 102, 241, 0.08);
        }
        .card:hover .thumbnail-image {
          transform: scale(1.03);
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
        .thumbnail-image-container {
          width: 100%;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid var(--border-subtle);
          background: rgba(0, 0, 0, 0.2);
        }
        .thumbnail-image {
          width: 100%;
          height: auto;
          display: block;
          object-fit: cover;
          transition: transform 0.3s ease;
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
      
      {isPlaintext ? (
        <div className="thumbnail-image-container">
          <img
            src={`/api/vault/image/${record.id}`}
            alt={filename}
            className="thumbnail-image"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="thumbnail-placeholder">
          🔒
          <div className="lock-badge">AES-GCM</div>
        </div>
      )}
      
      <div className="title" title={filename}>{filename}</div>
      <div className="date">{new Date(record.createdAt).toLocaleDateString()}</div>
    </div>
  );
}
