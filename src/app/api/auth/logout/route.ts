import { NextRequest, NextResponse } from 'next/server';
import { destroySession, verifyCsrf } from '@/lib/session';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  // 1. CSRF check on logout POST request
  if (!verifyCsrf(req)) {
    return NextResponse.json({ error: 'CSRF validation failed.' }, { status: 403 });
  }

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;

    if (token) {
      await destroySession(token);
    }

    // Clear the session cookie
    cookieStore.set('session', '', {
      httpOnly: true,
      secure: true, // Unconditionally enforce secure cookie transmission
      sameSite: 'strict',
      path: '/',
      expires: new Date(0), // Set to past date
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
