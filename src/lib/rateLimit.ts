import { db } from './db';
import { rateLimits } from './schema';
import { eq, and, lt } from 'drizzle-orm';

/**
 * Validates whether a given IP address is rate limited for an endpoint.
 * Implements a sliding-window-like behavior backed by Postgres.
 * 
 * Complies with the 'Fail Secure' design principle: if a rate-limiting check fails due to database
 * issues, it defaults to blocking the request.
 * 
 * @param ipAddress Client's IP address.
 * @param endpoint Endpoint descriptor (e.g. "login", "upload").
 * @param limit Maximum allowed requests within the window.
 * @param windowMs Time window duration in milliseconds.
 * @returns Promise<boolean> True if rate limited (blocked), False if allowed.
 */
export async function isRateLimited(
  ipAddress: string,
  endpoint: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const now = new Date();
  const windowStartThreshold = new Date(now.getTime() - windowMs);

  try {
    // 1. Clean up expired rate limits (garbage collection) to keep the table small
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, windowStartThreshold));

    // 2. Lookup existing rate limit record
    const records = await db
      .select()
      .from(rateLimits)
      .where(
        and(
          eq(rateLimits.ipAddress, ipAddress),
          eq(rateLimits.endpoint, endpoint)
        )
      )
      .limit(1);

    if (records.length === 0) {
      // Create new record
      await db.insert(rateLimits).values({
        ipAddress,
        endpoint,
        requestCount: 1,
        windowStart: now,
      });
      return false;
    }

    const record = records[0];

    // If window has passed, reset it
    if (record.windowStart.getTime() < windowStartThreshold.getTime()) {
      await db
        .update(rateLimits)
        .set({
          requestCount: 1,
          windowStart: now,
        })
        .where(
          and(
            eq(rateLimits.ipAddress, ipAddress),
            eq(rateLimits.endpoint, endpoint)
          )
        );
      return false;
    }

    // Check if count exceeds limit
    if (record.requestCount >= limit) {
      return true; // Rate limited (blocked)
    }

    // Increment count
    await db
      .update(rateLimits)
      .set({
        requestCount: record.requestCount + 1,
      })
      .where(
        and(
          eq(rateLimits.ipAddress, ipAddress),
          eq(rateLimits.endpoint, endpoint)
        )
      );

    return false; // Allowed
  } catch (error) {
    console.error('Rate limiting database failure:', error);
    // FAIL SECURE: If unexpected behavior occurs, deny access rather than allow it
    return true; 
  }
}
