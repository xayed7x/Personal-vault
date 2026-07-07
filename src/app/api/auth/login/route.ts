import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { verifyAuthHash } from '@/lib/crypto';
import { createSession, getClientIp, verifyCsrf } from '@/lib/session';
import { isRateLimited } from '@/lib/rateLimit';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  // 1. CSRF check on login POST request
  if (!verifyCsrf(req)) {
    return NextResponse.json({ error: 'CSRF validation failed.' }, { status: 403 });
  }

  const ipAddress = getClientIp(req);

  // Strict rate limit on login attempts (5 per minute per IP)
  const isBlocked = await isRateLimited(ipAddress, 'auth-login', 5, 60 * 1000);
  if (isBlocked) {
    return NextResponse.json({ error: 'Too many login attempts. Please try again later.' }, { status: 429 });
  }

  try {
    const { username, authHash } = await req.json();

    if (!username || !authHash) {
      return NextResponse.json({ error: 'Username and password credentials are required.' }, { status: 400 });
    }

    // Lookup user
    const results = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    const user = results[0];

    if (!user) {
      // Dummy check to prevent user enumeration via response timing
      const dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXlzYWx0ZHVtbXlzYWx0$ZHVtbXlzaGFzaGR1bW15c2hhc2hkdW1teXNoYXNo';
      await verifyAuthHash(authHash, dummyHash);
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    // Verify client AuthHash
    const isValid = await verifyAuthHash(authHash, user.authHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    // Create session
    const token = await createSession(user.id, req);

    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set('session', token, {
      httpOnly: true,
      secure: true, // Unconditionally enforce secure cookie transmission
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60, // 1 hour absolute maximum lifetime
    });

    return NextResponse.json({
      username: user.username,
      encryptedVaultKey: user.encryptedVaultKey,
      vaultKeyIv: user.vaultKeyIv,
    });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
