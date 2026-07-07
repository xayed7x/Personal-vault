import { hash, verify, Algorithm } from '@node-rs/argon2';
import crypto from 'crypto';

/**
 * Hashes the client-provided AuthHash using Argon2id with OWASP-recommended parameters.
 */
export async function hashAuthHash(authHash: string): Promise<string> {
  return hash(authHash, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,       // 3 iterations
    parallelism: 4,
  });
}

/**
 * Verifies a client-provided AuthHash against a stored Argon2id hash.
 */
export async function verifyAuthHash(authHash: string, hashStr: string): Promise<boolean> {
  try {
    return await verify(hashStr, authHash);
  } catch {
    return false;
  }
}

/**
 * Performs a timing-safe comparison between two strings to prevent timing attacks.
 * Uses HMAC-SHA256 with a random transient key to obfuscate lengths before timingSafeEqual comparison.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  const key = crypto.randomBytes(32);
  const hmacA = crypto.createHmac('sha256', key).update(a).digest();
  const hmacB = crypto.createHmac('sha256', key).update(b).digest();
  return crypto.timingSafeEqual(hmacA, hmacB);
}

/**
 * Generates a secure random session token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hashes a session token using SHA-256 before storage or query comparison.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a random cryptographic salt for client-side key derivation.
 */
export function generateClientSalt(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generates a deterministic dummy salt for non-existent users during login requests
 * to mitigate username enumeration via KDF salt retrieval timing/leakage.
 */
export function generateDummySalt(username: string): string {
  // Use a server-side constant secret or transient secret if none is configured
  const secret = process.env.SESSION_SECRET || 'dummy-salt-secret-fallback';
  return crypto.createHmac('sha256', secret).update(username).digest('hex');
}
