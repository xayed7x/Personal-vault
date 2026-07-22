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
  filename: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  sequenceNumber?: number;
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

  const [searchQuery, setSearchQuery] = useState('');
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
      
      // Decrypt/resolve metadata for all records immediately
      const decryptedList: EncryptedImageRecord[] = [];
      for (const record of data) {
        let filename = 'Unknown';
        let size = 0;
        let mimeType = 'image/jpeg';
        let uploadedAt = record.createdAt;

        try {
          const isPlaintext = record.category === 'normal' || record.category === 'couple' || record.category === 'hot';
          if (isPlaintext) {
            const meta = JSON.parse(record.encryptedMetadata);
            filename = meta.filename || 'Unknown';
            size = meta.size || 0;
            mimeType = meta.mimeType || 'image/jpeg';
            uploadedAt = meta.uploadedAt || record.createdAt;
          } else {
            if (vaultKey) {
              const meta = await decryptMetadata(record.encryptedMetadata, record.metadataIv, vaultKey);
              filename = meta.filename || 'Unknown';
              size = meta.size || 0;
              mimeType = meta.mimeType || 'image/jpeg';
              uploadedAt = meta.uploadedAt || record.createdAt;
            } else {
              filename = '🔒 Encrypted';
            }
          }
        } catch (e) {
          console.error('Error resolving metadata for record:', record.id, e);
          filename = 'Decryption Error';
        }
        decryptedList.push({
          ...record,
          filename,
          size,
          mimeType,
          uploadedAt,
        });
      }

      setRecords(decryptedList);
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
        setActiveDecryptedBlob({
          src: `/api/vault/image/${record.id}`,
          name: record.filename,
          size: record.size,
          date: new Date(record.uploadedAt).toLocaleString(),
        });
      } else {
        if (!vaultKey) {
          throw new Error('Vault is locked. Cannot decrypt file.');
        }

        // 2. Fetch the encrypted secure image file (with prepended 12-byte IV)
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
        const decryptedBlob = await decryptFile(ciphertextBytes, ivHex, vaultKey, record.mimeType);
        const objectUrl = URL.createObjectURL(decryptedBlob);

        setActiveDecryptedBlob({
          src: objectUrl,
          name: record.filename,
          size: record.size,
          date: new Date(record.uploadedAt).toLocaleString(),
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

  // 1. Assign sequential numbers chronologically (oldest = 1) grouped by category
  const recordsWithNumbers = React.useMemo(() => {
    // Sort chronologically ascending
    const sorted = [...records].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    const categoryCounters: Record<string, number> = {};
    
    return sorted.map((record) => {
      const cat = record.category;
      if (!categoryCounters[cat]) {
        categoryCounters[cat] = 0;
      }
      categoryCounters[cat] += 1;
      
      return {
        ...record,
        sequenceNumber: categoryCounters[cat],
      };
    });
  }, [records]);

  // 2. Filter records based on active category and search query
  const filteredRecords = React.useMemo(() => {
    // Get records for active category
    let list = recordsWithNumbers.filter((r) => r.category === category);
    
    // Sort descending by creation date (newest first)
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    // Apply search query filtering
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      list = list.filter((r) => {
        const nameMatches = r.filename.toLowerCase().includes(query);
        const seqStr = String(r.sequenceNumber);
        const numberMatches = 
          query === seqStr || 
          query === `image ${seqStr}` || 
          query === `image${seqStr}`;
        
        return nameMatches || numberMatches;
      });
    }
    
    return list;
  }, [recordsWithNumbers, category, searchQuery]);

  if (loading) {
    return (
      <div className="vault-grid-container" style={{ marginTop: '20px' }}>
        <div className="grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <style jsx>{`
          .grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 16px;
            width: 100%;
          }
          @media (max-width: 1200px) {
            .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          }
          @media (max-width: 768px) {
            .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          }
          @media (max-width: 480px) {
            .grid { grid-template-columns: repeat(1, minmax(0, 1fr)); }
          }
        `}</style>
      </div>
    );
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
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
          width: 100%;
        }
        @media (max-width: 1200px) {
          .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (max-width: 768px) {
          .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 480px) {
          .grid { grid-template-columns: repeat(1, minmax(0, 1fr)); }
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

        /* Search Bar Styles */
        .search-container {
          position: relative;
          width: 100%;
          max-width: 500px;
          margin: 0 auto 24px auto;
          display: flex;
          align-items: center;
        }
        .search-icon {
          position: absolute;
          left: 14px;
          font-size: 14px;
          color: var(--text-secondary);
          pointer-events: none;
        }
        .search-input {
          width: 100%;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-subtle);
          padding: 10px 40px 10px 38px;
          border-radius: 10px;
          color: white;
          font-size: 14px;
          outline: none;
          transition: var(--transition-smooth);
        }
        .search-input:focus {
          border-color: var(--accent-primary);
          background: rgba(255, 255, 255, 0.05);
          box-shadow: 0 0 12px rgba(99, 102, 241, 0.15);
        }
        .clear-search-btn {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 11px;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: var(--transition-smooth);
        }
        .clear-search-btn:hover {
          color: white;
          background: rgba(255, 255, 255, 0.1);
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Search Bar */}
      <div className="search-container">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="search-input"
          placeholder="Search by image name or number (e.g. Image 3 or 3)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="clear-search-btn" onClick={() => setSearchQuery('')} title="Clear search">
            ✕
          </button>
        )}
      </div>

      {(() => {
        const categoryRecords = records.filter((r) => r.category === category);
        if (categoryRecords.length === 0) {
          return (
            <div className="empty-state">
              <p style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>No files in this category</p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Drag and drop images to initiate uploads into this category.</p>
            </div>
          );
        }

        if (filteredRecords.length === 0) {
          return (
            <div className="empty-state">
              <p style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>No matching results</p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No images found matching "{searchQuery}" in this category.</p>
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

// Subcomponent that manages metadata display and card state
function VaultImageCard({
  record,
  vaultKey,
  onClick,
}: {
  record: EncryptedImageRecord;
  vaultKey: CryptoKey;
  onClick: () => void;
}) {
  const isPlaintext = record.category === 'normal' || record.category === 'couple' || record.category === 'hot';
  const [imgLoaded, setImgLoaded] = useState(false);

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
          aspect-ratio: 16/10;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid var(--border-subtle);
          background: rgba(0, 0, 0, 0.25);
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .thumbnail-image {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
          transition: transform 0.3s ease, opacity 0.3s ease;
          opacity: 0;
        }
        .thumbnail-image.loaded {
          opacity: 1;
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
        .number-badge {
          position: absolute;
          top: 8px;
          left: 8px;
          font-size: 10px;
          background: rgba(8, 8, 12, 0.85);
          border: 1px solid var(--border-subtle);
          padding: 2px 6px;
          border-radius: 4px;
          color: var(--text-primary);
          font-weight: 600;
          z-index: 2;
          backdrop-filter: blur(4px);
        }
        .shimmer-placeholder {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.02) 25%, rgba(255, 255, 255, 0.06) 50%, rgba(255, 255, 255, 0.02) 75%);
          background-size: 200% 100%;
          animation: loading-shimmer 1.5s infinite;
          border-radius: 8px;
        }
        @keyframes loading-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .title {
          font-size: 13px;
          font-weight: 500;
          text-align: center;
          width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text-primary);
        }
        .date {
          font-size: 11px;
          color: var(--text-muted);
        }
      `}</style>
      
      {isPlaintext ? (
        <div className="thumbnail-image-container">
          <div className="number-badge">Image {record.sequenceNumber}</div>
          {!imgLoaded && <div className="shimmer-placeholder" />}
          <img
            src={`/api/vault/image/${record.id}`}
            alt={record.filename}
            className={`thumbnail-image ${imgLoaded ? 'loaded' : ''}`}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
          />
        </div>
      ) : (
        <div className="thumbnail-placeholder">
          <div className="number-badge">Image {record.sequenceNumber}</div>
          🔒
          <div className="lock-badge">AES-GCM</div>
        </div>
      )}
      
      <div className="title" title={record.filename}>{record.filename}</div>
      <div className="date">{new Date(record.createdAt).toLocaleDateString()}</div>
    </div>
  );
}

// Subcomponent for card skeletons while loading
function SkeletonCard() {
  return (
    <div className="card skeleton-card glass-panel">
      <style jsx>{`
        .card {
          padding: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          width: 100%;
          box-sizing: border-box;
          pointer-events: none;
        }
        .skeleton-thumb {
          width: 100%;
          aspect-ratio: 16/10;
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.02) 25%, rgba(255, 255, 255, 0.06) 50%, rgba(255, 255, 255, 0.02) 75%);
          background-size: 200% 100%;
          animation: loading-shimmer 1.5s infinite;
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
        }
        .skeleton-title {
          width: 70%;
          height: 14px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 4px;
          margin: 4px 0;
          animation: pulse 1.5s infinite alternate;
        }
        .skeleton-date {
          width: 40%;
          height: 10px;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 4px;
          animation: pulse 1.5s infinite alternate;
        }
        @keyframes loading-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes pulse {
          0% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
      <div className="skeleton-thumb" />
      <div className="skeleton-title" />
      <div className="skeleton-date" />
    </div>
  );
}

