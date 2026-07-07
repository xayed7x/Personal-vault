import { db } from './db';
import { sessions, users } from './schema';
import { eq, and, lt } from 'drizzle-orm';
import { generateSessionToken, hashSessionToken, timingSafeCompare } from './crypto';

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes inactivity limit
const ABSOLUTE_TIMEOUT_MS = 60 * 60 * 1000;    // 1 hour absolute limit

/**
 * Extracts the client's real IP address from standard headers, prioritizing trusted framework fields.
 */
export function getClientIp(req: Request): string {
  // Check Next.js internal trusted IP resolution first
  if ('ip' in req && (req as any).ip) {
    return (req as any).ip;
  }
  
  // Vercel/Cloudflare proxy-overwritten and secured header
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  // Multi-proxy header parsing (untrusted unless configured, used as fallback)
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return '127.0.0.1';
}

/**
 * Extracts the client's User Agent string.
 */
export function getClientUserAgent(req: Request): string {
  return req.headers.get('user-agent') || '';
}

/**
 * Validates request Origin and Referer headers against Host to mitigate CSRF attacks on mutations.
 * Complies with 'Fail Secure': returns false if headers are missing or mismatched.
 */
export function verifyCsrf(req: Request): boolean {
  // Only mutation endpoints require CSRF checks
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return true;
  }

  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const host = req.headers.get('host') || req.headers.get('x-forwarded-host');

  if (!host) return false;

  // 1. Check Origin header
  if (origin) {
    try {
      const originUrl = new URL(origin);
      return originUrl.host === host;
    } catch {
      return false;
    }
  }

  // 2. Fallback to Referer header if Origin is omitted
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      return refererUrl.host === host;
    } catch {
      return false;
    }
  }

  // High-security requirement: Fail closed if both headers are omitted on a mutation
  return false;
}

/**
 * Creates a new secure session for a user and returns the raw session token.
 */
export async function createSession(userId: string, req: Request): Promise<string> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INACTIVITY_TIMEOUT_MS);
  
  const ipAddress = getClientIp(req);
  const userAgent = getClientUserAgent(req);

  await db.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt,
    ipAddress,
    userAgent,
    createdAt: now,
  });

  return token;
}

/**
 * Verifies a session token, checks for timeouts and session hijacking.
 * Renews the session expiration time if active and valid.
 * 
 * Complies with 'Fail Secure': deletes the session and denies access on any validation mismatch.
 */
export async function verifyAndTouchSession(
  token: string,
  req: Request
): Promise<{ userId: string; username: string } | null> {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const now = new Date();

  try {
    // Lazy garbage collection: asynchronously remove expired sessions to prevent DB bloat
    db.delete(sessions).where(lt(sessions.expiresAt, now)).catch((err) => {
      console.error('Lazy session garbage collection error:', err);
    });

    // Fetch session and associated user info
    const results = await db
      .select({
        session: sessions,
        user: users,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);

    if (results.length === 0) return null;

    const { session, user } = results[0];

    // Check inactivity timeout
    if (session.expiresAt.getTime() < now.getTime()) {
      await destroySession(token);
      return null;
    }

    // Check absolute timeout (1 hour from creation)
    const absoluteExpiry = new Date(session.createdAt.getTime() + ABSOLUTE_TIMEOUT_MS);
    if (absoluteExpiry.getTime() < now.getTime()) {
      await destroySession(token);
      return null;
    }

    // Session hijacking mitigation: Verify IP and User Agent match exactly
    const currentIp = getClientIp(req);
    const currentUserAgent = getClientUserAgent(req);

    // Constant-time compare IP and UA for extra hardening
    const ipMatches = timingSafeCompare(session.ipAddress || '', currentIp);
    const uaMatches = timingSafeCompare(session.userAgent || '', currentUserAgent);

    if (!ipMatches || !uaMatches) {
      console.warn(`Session hijack attempt detected! IP Match: ${ipMatches}, UA Match: ${uaMatches}. Revoking session.`);
      await destroySession(token);
      return null;
    }

    // Calculate new expiration time (15 minutes from now, capped by absolute timeout)
    const newExpiresAt = new Date(
      Math.min(now.getTime() + INACTIVITY_TIMEOUT_MS, absoluteExpiry.getTime())
    );

    // Touch the session in database
    await db
      .update(sessions)
      .set({ expiresAt: newExpiresAt })
      .where(eq(sessions.id, session.id));

    return {
      userId: user.id,
      username: user.username,
    };
  } catch (err) {
    console.error('Session verification database failure:', err);
    return null;
  }
}

/**
 * Destroys a session, invalidating the token hash in the database.
 */
export async function destroySession(token: string): Promise<void> {
  const tokenHash = hashSessionToken(token);
  try {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  } catch (err) {
    console.error('Error destroying session:', err);
  }
}

/**
 * Returns all active sessions for a user (for device management).
 */
export async function getActiveSessionsForUser(userId: string) {
  try {
    return await db
      .select({
        id: sessions.id,
        ipAddress: sessions.ipAddress,
        userAgent: sessions.userAgent,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(sessions.createdAt);
  } catch (err) {
    console.error('Error listing user sessions:', err);
    return [];
  }
}

/**
 * Allows a user to revoke any specific session (e.g. log out other devices).
 */
export async function revokeSessionById(sessionId: string, userId: string): Promise<void> {
  try {
    await db
      .delete(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  } catch (err) {
    console.error('Error revoking session:', err);
  }
}
