'use client';

import React, { useState, useRef } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { encryptFile, encryptMetadata, hexToUint8Array } from '@/lib/clientCrypto';

interface UploadZoneProps {
  onUploadSuccess: () => void;
  category: 'normal' | 'couple' | 'hot' | 'super_hot';
}

export default function UploadZone({ onUploadSuccess, category }: UploadZoneProps) {
  const { vaultKey } = useAuth();
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFilesUpload(e.dataTransfer.files);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await handleFilesUpload(e.target.files);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFilesUpload = async (files: FileList) => {
    if (!vaultKey) {
      setError('Vault is locked. Cannot upload files.');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Validate image mime type
        if (!file.type.startsWith('image/')) {
          throw new Error(`File '${file.name}' is not a valid image.`);
        }

        // Limit upload size (20MB)
        if (file.size > 20 * 1024 * 1024) {
          throw new Error(`File '${file.name}' exceeds the maximum size limit of 20MB.`);
        }

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
          throw new Error(errData.error || `Failed to upload ${file.name}`);
        }
      }

      setSuccess(`Successfully encrypted and uploaded ${files.length} image(s).`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onUploadSuccess();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error occurred during upload.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-container animate-fade-in">
      <style jsx>{`
        .upload-container {
          margin-bottom: 30px;
        }
        .category-selector {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-bottom: 20px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-subtle);
          padding: 12px;
          border-radius: 12px;
        }
        .selector-label {
          font-size: 13px;
          color: var(--text-secondary);
          font-weight: 500;
        }
        .options-group {
          display: flex;
          gap: 8px;
        }
        .option-btn {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 500;
          border-radius: 8px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .option-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: white;
        }
        .option-btn.active {
          background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
          border-color: transparent;
          color: white;
          box-shadow: 0 0 15px rgba(99, 102, 241, 0.25);
        }
        .dropzone {
          border: 2px dashed rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 30px 20px;
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
          <div className="text">Encrypting and uploading securely...</div>
        ) : (
          <>
            <div className="text">
              <span>Drag & drop images here, or </span>
              <span style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>browse</span>
            </div>
            <div className="subtext">Zero-Knowledge client-side encryption. Max 20MB.</div>
          </>
        )}
      </div>

      {error && <div className="alert alert-error">⚠️ {error}</div>}
      {success && <div className="alert alert-success">✓ {success}</div>}
    </div>
  );
}
