/**
 * Converts a hex string into a Uint8Array.
 */
export function hexToUint8Array(hexString: string): Uint8Array {
  const matches = hexString.match(/.{1,2}/g);
  if (!matches) return new Uint8Array(0);
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

/**
 * Converts a Uint8Array into a hex string.
 */
export function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Client-side Key Derivation Function (KDF).
 * Derives a 512-bit key from the user password and salt using PBKDF2-HMAC-SHA256 with 600,000 iterations.
 * Splits it into:
 * 1. MasterKey (256-bit AES-GCM key)
 * 2. AuthHash (256-bit hash, hex-encoded for transmission)
 */
export async function deriveClientKeys(
  password: string,
  saltHex: string
): Promise<{ authHashHex: string; masterKey: CryptoKey }> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  const saltBytes = hexToUint8Array(saltHex);

  // Import password as base key material
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    passwordBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  // Derive 512 bits
  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as any,
      iterations: 600000,
      hash: 'SHA-256',
    },
    baseKey,
    512
  );

  const masterKeyBytes = new Uint8Array(derivedBits, 0, 32);
  const authHashBytes = new Uint8Array(derivedBits, 32, 32);

  const authHashHex = uint8ArrayToHex(authHashBytes);

  // Import derived master key bytes as AES-GCM CryptoKey
  const masterKey = await window.crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt', 'encrypt']
  );

  return {
    authHashHex,
    masterKey,
  };
}

/**
 * Decrypts the shared VaultKey using the user's derived MasterKey.
 */
export async function decryptVaultKey(
  encryptedVaultKeyHex: string,
  ivHex: string,
  masterKey: CryptoKey
): Promise<CryptoKey> {
  const ciphertext = hexToUint8Array(encryptedVaultKeyHex);
  const iv = hexToUint8Array(ivHex);

  const decryptedBytes = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    masterKey,
    ciphertext as any
  );

  return window.crypto.subtle.importKey(
    'raw',
    decryptedBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a JSON metadata object using the shared VaultKey.
 */
export async function encryptMetadata(
  metadata: Record<string, any>,
  vaultKey: CryptoKey
): Promise<{ ciphertextHex: string; ivHex: string }> {
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(JSON.stringify(metadata));
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV

  const encryptedBytes = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    vaultKey,
    plaintextBytes as any
  );

  return {
    ciphertextHex: uint8ArrayToHex(new Uint8Array(encryptedBytes)),
    ivHex: uint8ArrayToHex(iv),
  };
}

/**
 * Decrypts encrypted metadata using the shared VaultKey.
 */
export async function decryptMetadata(
  encryptedMetadataHex: string,
  ivHex: string,
  vaultKey: CryptoKey
): Promise<Record<string, any>> {
  const ciphertext = hexToUint8Array(encryptedMetadataHex);
  const iv = hexToUint8Array(ivHex);

  const decryptedBytes = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    vaultKey,
    ciphertext as any
  );

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decryptedBytes));
}

/**
 * Encrypts an image file using the shared VaultKey.
 */
export async function encryptFile(
  file: File,
  vaultKey: CryptoKey
): Promise<{ encryptedBlob: Blob; ivHex: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV

  const encryptedBytes = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    vaultKey,
    arrayBuffer
  );

  return {
    encryptedBlob: new Blob([encryptedBytes], { type: 'application/octet-stream' }),
    ivHex: uint8ArrayToHex(iv),
  };
}

/**
 * Decrypts file data using the shared VaultKey and returns a decrypted Blob with the correct MIME type.
 */
export async function decryptFile(
  encryptedArrayBuffer: ArrayBuffer,
  ivHex: string,
  vaultKey: CryptoKey,
  mimeType: string
): Promise<Blob> {
  const iv = hexToUint8Array(ivHex);

  const decryptedBytes = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    vaultKey,
    encryptedArrayBuffer
  );

  return new Blob([decryptedBytes], { type: mimeType });
}
