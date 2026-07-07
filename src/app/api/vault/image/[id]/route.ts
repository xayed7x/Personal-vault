import { NextRequest, NextResponse } from 'next/server';
import { verifyAndTouchSession } from '@/lib/session';
import { db } from '@/lib/db';
import { imageData } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { isRateLimited } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/session';
import { cookies } from 'next/headers';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const ipAddress = getClientIp(req);

  // Rate limit downloads (100 downloads per minute per IP to prevent bulk harvesting)
  const isBlocked = await isRateLimited(ipAddress, 'vault-download', 100, 60 * 1000);
  if (isBlocked) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
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

    const params = await props.params;
    const id = params.id;

    if (!id) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 });
    }

    // Fetch the encrypted binary from the database
    const results = await db
      .select({ encryptedFile: imageData.encryptedFile })
      .from(imageData)
      .where(eq(imageData.imageId, id))
      .limit(1);

    if (results.length === 0) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    const fileBuffer = results[0].encryptedFile;

    // Return the encrypted file binary stream with strict anti-caching headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (err) {
    console.error('Download API error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
