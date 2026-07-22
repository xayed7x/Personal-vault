'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { encryptFile, encryptMetadata, hexToUint8Array } from '@/lib/clientCrypto';

interface UploadZoneProps {
  onUploadSuccess: () => void;
  category: 'normal' | 'couple' | 'hot' | 'super_hot';
}

interface StagedFile {
  id: string;
  file: File;
  previewUrl: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export default function UploadZone({ onUploadSuccess, category }: UploadZoneProps) {
  const { vaultKey } = useAuth();
  const [dragActive, setDragActive] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Global Clipboard paste event handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Avoid intercepting paste inside form inputs/textareas
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            pastedFiles.push(file);
          }
        }
      }

      if (pastedFiles.length > 0) {
        addFilesToStage(pastedFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [vaultKey, category, stagedFiles]); // Include relevant states/props to stay up to date

  // Keep a ref of staged files to clean up Object URLs when unmounting
  const stagedFilesRef = useRef<StagedFile[]>([]);
  useEffect(() => {
    stagedFilesRef.current = stagedFiles;
  }, [stagedFiles]);

  useEffect(() => {
    return () => {
      stagedFilesRef.current.forEach((f) => {
        URL.revokeObjectURL(f.previewUrl);
      });
    };
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      addFilesToStage(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      addFilesToStage(Array.from(e.target.files));
    }
  };

  const triggerFileInput = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  const addFilesToStage = (files: File[]) => {
    if (!vaultKey) {
      setError('Vault is locked. Cannot stage files.');
      return;
    }

    if (uploading) {
      setError('Please wait until current upload process completes.');
      return;
    }

    setError(null);
    setSuccess(null);

    const added: StagedFile[] = [];
    let fileLimitError = false;
    let formatError = false;

    files.forEach((file) => {
      // Validate image mime type
      if (!file.type.startsWith('image/')) {
        formatError = true;
        return;
      }

      // Limit upload size (20MB)
      if (file.size > 20 * 1024 * 1024) {
        fileLimitError = true;
        return;
      }

      added.push({
        id: `${Math.random().toString(36).substring(2, 9)}-${Date.now()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'pending',
      });
    });

    if (formatError) {
      setError('Only valid image files are supported.');
    } else if (fileLimitError) {
      setError('One or more files exceed the maximum size limit of 20MB.');
    }

    if (added.length > 0) {
      setStagedFiles((prev) => [...prev, ...added]);
    }
  };

  const removeStagedFile = (id: string) => {
    if (uploading) return;
    
    setStagedFiles((prev) => {
      const fileToRevoke = prev.find((f) => f.id === id);
      if (fileToRevoke) {
        URL.revokeObjectURL(fileToRevoke.previewUrl);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const clearStagedFiles = () => {
    if (uploading) return;
    
    stagedFiles.forEach((f) => {
      URL.revokeObjectURL(f.previewUrl);
    });
    setStagedFiles([]);
    setError(null);
    setSuccess(null);
  };

  const handleUploadStaged = async () => {
    if (!vaultKey) {
      setError('Vault is locked. Cannot upload files.');
      return;
    }

    const pending = stagedFiles.filter((f) => f.status !== 'success');
    if (pending.length === 0) {
      setError('No staged files left to upload.');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    let successCount = 0;
    let failCount = 0;

    // Work on a copy of staged files to avoid closures holding state references
    const currentQueue = [...stagedFiles];

    for (let i = 0; i < currentQueue.length; i++) {
      const staged = currentQueue[i];
      if (staged.status === 'success') continue;

      // Update item status in UI
      setStagedFiles((prev) =>
        prev.map((f) => (f.id === staged.id ? { ...f, status: 'uploading', error: undefined } : f))
      );

      try {
        const file = staged.file;
        const metadataPayload = {
          filename: file.name,
          size: file.size,
          mimeType: file.type,
          uploadedAt: new Date().toISOString(),
        };

        let encryptedMeta;
        let combinedBlob;
        const isSuperHot = category === 'super_hot';

        if (isSuperHot) {
          // 1. Encrypt metadata locally
          encryptedMeta = await encryptMetadata(metadataPayload, vaultKey);

          // 2. Encrypt binary locally
          const encryptedFileData = await encryptFile(file, vaultKey);
          const ivBytes = hexToUint8Array(encryptedFileData.ivHex);
          combinedBlob = new Blob([ivBytes as any, encryptedFileData.encryptedBlob], { type: 'application/octet-stream' });
        } else {
          // Plaintext (no client-side encryption)
          encryptedMeta = {
            ciphertextHex: JSON.stringify(metadataPayload),
            ivHex: 'none',
          };
          combinedBlob = file;
        }

        // 3. Assemble multipart payload
        const formData = new FormData();
        formData.append('file', combinedBlob, isSuperHot ? 'encrypted_blob' : file.name);
        formData.append('metadata', encryptedMeta.ciphertextHex);
        formData.append('metadataIv', encryptedMeta.ivHex);
        formData.append('category', category);

        // 4. Dispatch payload
        const res = await fetch('/api/vault/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `Upload failed with status ${res.status}`);
        }

        // Success
        successCount++;
        setStagedFiles((prev) =>
          prev.map((f) => (f.id === staged.id ? { ...f, status: 'success' } : f))
        );

        // Controlled delay between uploads to avoid database deadlocks or network choke
        await new Promise((resolve) => setTimeout(resolve, 150));
      } catch (err: any) {
        console.error(`Error uploading file ${staged.file.name}:`, err);
        failCount++;
        setStagedFiles((prev) =>
          prev.map((f) => (f.id === staged.id ? { ...f, status: 'error', error: err.message || 'Error occurred.' } : f))
        );
      }
    }

    setUploading(false);

    if (successCount > 0) {
      onUploadSuccess();
    }

    if (failCount === 0) {
      setSuccess(`Successfully uploaded all ${successCount} image(s).`);
      // Revoke all staged file preview URLs
      stagedFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      setStagedFiles([]);
    } else {
      setError(`Uploaded ${successCount} image(s) successfully, but ${failCount} failed. Please resolve errors and try again.`);
      // Clean up successfully uploaded files and revoke their preview URLs
      setStagedFiles((prev) => {
        const successfulFiles = prev.filter((f) => f.status === 'success');
        successfulFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
        return prev.filter((f) => f.status !== 'success');
      });
    }
  };

  return (
    <div className="upload-container animate-fade-in">
      <style jsx>{`
        .upload-container {
          margin-bottom: 30px;
        }
        .dropzone {
          border: 2px dashed rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 35px 20px;
          text-align: center;
          background: rgba(255, 255, 255, 0.01);
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .dropzone:hover, .dropzone.active {
          border-color: var(--accent-primary);
          background: rgba(99, 102, 241, 0.02);
        }
        .icon {
          font-size: 32px;
          margin-bottom: 12px;
          color: var(--text-secondary);
        }
        .text {
          color: var(--text-secondary);
          font-size: 15px;
          margin-bottom: 4px;
        }
        .subtext {
          color: var(--text-muted);
          font-size: 12px;
        }
        .alert {
          margin-top: 15px;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .alert-error {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.15);
          color: #fca5a5;
        }
        .alert-success {
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.15);
          color: #a7f3d0;
        }

        /* Staging Area Styles */
        .staging-area {
          margin-top: 24px;
          padding: 20px;
          background: rgba(25, 25, 30, 0.4);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          backdrop-filter: var(--glass-blur);
          animation: fadeIn 0.3s ease-out;
        }
        .staging-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 12px;
        }
        .staging-title {
          font-size: 15px;
          font-weight: 600;
          color: white;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .staging-count {
          background: var(--accent-primary);
          color: white;
          padding: 2px 8px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
        }
        .staging-actions {
          display: flex;
          gap: 10px;
        }
        .staged-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
          gap: 14px;
          max-height: 380px;
          overflow-y: auto;
          padding-right: 4px;
        }
        .staged-card {
          position: relative;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          overflow: hidden;
          aspect-ratio: 1;
          display: flex;
          flex-direction: column;
          transition: var(--transition-smooth);
        }
        .staged-card:hover {
          border-color: var(--accent-primary);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
        }
        .staged-preview-container {
          position: relative;
          flex: 1;
          width: 100%;
          overflow: hidden;
          background: #050507;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .staged-preview {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .staged-details {
          padding: 6px 8px;
          background: rgba(14, 14, 18, 0.95);
          border-top: 1px solid var(--border-subtle);
          font-size: 11px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .staged-name {
          color: white;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 500;
        }
        .staged-size {
          color: var(--text-secondary);
        }
        .remove-staged-btn {
          position: absolute;
          top: 6px;
          right: 6px;
          background: rgba(15, 15, 20, 0.85);
          border: 1px solid var(--border-subtle);
          color: #fca5a5;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          transition: var(--transition-smooth);
          z-index: 10;
        }
        .remove-staged-btn:hover {
          background: var(--danger-primary);
          color: white;
          border-color: transparent;
        }
        .card-status {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(8, 8, 12, 0.85);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 11px;
          padding: 10px;
          text-align: center;
          backdrop-filter: blur(2px);
          z-index: 5;
        }
        .status-badge {
          padding: 3px 8px;
          border-radius: 4px;
          font-weight: 600;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .status-badge.pending {
          background: rgba(255, 255, 255, 0.1);
          color: var(--text-secondary);
        }
        .status-badge.uploading {
          background: rgba(99, 102, 241, 0.25);
          color: #a5b4fc;
          animation: pulse 1.5s infinite alternate;
        }
        .status-badge.error {
          background: rgba(239, 68, 68, 0.25);
          color: #fca5a5;
        }
        .status-badge.success {
          background: rgba(16, 185, 129, 0.25);
          color: #a7f3d0;
        }
        .card-error-text {
          color: #fca5a5;
          font-size: 10px;
          line-height: 1.3;
          max-height: 45px;
          overflow-y: auto;
          scrollbar-width: thin;
        }
        @keyframes pulse {
          from { opacity: 0.5; }
          to { opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        className={`dropzone ${dragActive ? 'active' : ''}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={triggerFileInput}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileInput}
          disabled={uploading}
        />
        
        <div className="icon">🛡️</div>
        
        {uploading ? (
          <div className="text">Processing batch uploads...</div>
        ) : (
          <>
            <div className="text">
              <span>Drag & drop images here, or </span>
              <span style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>browse</span>
            </div>
            <div className="subtext">
              {stagedFiles.length > 0
                ? 'Images will be appended to the staging queue below.'
                : 'Supports clipboard pasting (Ctrl+V) anywhere on the page.'}
            </div>
          </>
        )}
      </div>

      {error && <div className="alert alert-error">⚠️ {error}</div>}
      {success && <div className="alert alert-success">✓ {success}</div>}

      {stagedFiles.length > 0 && (
        <div className="staging-area">
          <div className="staging-header">
            <div className="staging-title">
              Staged Images <span className="staging-count">{stagedFiles.length}</span>
            </div>
            <div className="staging-actions">
              <button
                className="btn-secondary"
                style={{ padding: '8px 16px', fontSize: '13px' }}
                onClick={clearStagedFiles}
                disabled={uploading}
              >
                Clear All
              </button>
              <button
                className="btn-primary"
                style={{ padding: '8px 20px', fontSize: '13px' }}
                onClick={handleUploadStaged}
                disabled={uploading || stagedFiles.every(f => f.status === 'success')}
              >
                {uploading ? 'Uploading...' : 'Send Images'}
              </button>
            </div>
          </div>

          <div className="staged-grid">
            {stagedFiles.map((staged) => (
              <div className="staged-card" key={staged.id}>
                <button
                  className="remove-staged-btn"
                  onClick={() => removeStagedFile(staged.id)}
                  disabled={uploading || staged.status === 'success'}
                  title="Remove image"
                >
                  ✕
                </button>

                <div className="staged-preview-container">
                  <img
                    src={staged.previewUrl}
                    alt={staged.file.name}
                    className="staged-preview"
                  />
                  {staged.status !== 'pending' && (
                    <div className="card-status">
                      <span className={`status-badge ${staged.status}`}>
                        {staged.status}
                      </span>
                      {staged.status === 'error' && staged.error && (
                        <div className="card-error-text" title={staged.error}>
                          {staged.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="staged-details">
                  <div className="staged-name" title={staged.file.name}>
                    {staged.file.name}
                  </div>
                  <div className="staged-size">
                    {(staged.file.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
