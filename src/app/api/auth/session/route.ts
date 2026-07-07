import { NextRequest, NextResponse } from 'next/server';
import { verifyAndTouchSession, getActiveSessionsForUser, revokeSessionById, verifyCsrf } from '@/lib/session';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionUser = await verifyAndTouchSession(token, req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Retrieve user record to get encrypted vault key
    const userResults = await db
      .select({
        username: users.username,
        encryptedVaultKey: users.encryptedVaultKey,
        vaultKeyIv: users.vaultKeyIv,
      })
      .from(users)
      .where(eq(users.id, sessionUser.userId))
      .limit(1);

    if (userResults.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const user = userResults[0];
    const activeSessions = await getActiveSessionsForUser(sessionUser.userId);

    // Format sessions to sanitize token hashes and expose human-readable dates
    const formattedSessions = activeSessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    }));

    return NextResponse.json({
      user: {
        id: sessionUser.userId,
        username: user.username,
        encryptedVaultKey: user.encryptedVaultKey,
        vaultKeyIv: user.vaultKeyIv,
      },
      sessions: formattedSessions,
    });
  } catch (err) {
    console.error('Session API GET error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // 1. CSRF check on session modification POST request
  if (!verifyCsrf(req)) {
    return NextResponse.json({ error: 'CSRF validation failed.' }, { status: 403 });
  }

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionUser = await verifyAndTouchSession(token, req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, sessionId } = await req.json();

    if (action === 'revoke' && sessionId) {
      await revokeSessionById(sessionId, sessionUser.userId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Session API POST error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
