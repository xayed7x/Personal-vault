import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { generateDummySalt } from '@/lib/crypto';
import { isRateLimited } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/session';

export async function GET(req: NextRequest) {
  const ipAddress = getClientIp(req);
  
  // Rate limit salt retrieval (20 requests per minute per IP)
  const isBlocked = await isRateLimited(ipAddress, 'auth-salt', 20, 60 * 1000);
  if (isBlocked) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');

  if (!username) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  try {
    const results = await db
      .select({ clientSalt: users.clientSalt })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (results.length > 0) {
      return NextResponse.json({ salt: results[0].clientSalt });
    }

    // Username not found: return deterministic dummy salt to prevent enumeration
    const dummySalt = generateDummySalt(username);
    return NextResponse.json({ salt: dummySalt });
  } catch (err) {
    console.error('Error fetching salt:', err);
    // FAIL SECURE: Return generic server error and deny details
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
