import { NextRequest, NextResponse } from 'next/server';
import { verifyAndTouchSession } from '@/lib/session';
import { db } from '@/lib/db';
import { imageData, images } from '@/lib/schema';
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

    // Fetch the binary and category details from the database using an inner join
    const results = await db
      .select({
        file: imageData.encryptedFile,
        category: images.category,
        metadata: images.encryptedMetadata,
      })
      .from(imageData)
      .innerJoin(images, eq(imageData.imageId, images.id))
      .where(eq(imageData.imageId, id))
      .limit(1);

    if (results.length === 0) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    const record = results[0];
    const fileBuffer = record.file;
    const isPlaintext = record.category === 'normal' || record.category === 'couple';

    if (isPlaintext) {
      let mimeType = 'image/jpeg';
      try {
        const meta = JSON.parse(record.metadata);
        if (meta.mimeType) mimeType = meta.mimeType;
      } catch (e) {
        console.error('Error parsing plaintext metadata:', e);
      }

      // Return the plaintext file directly with its native MIME type and browser caching
      return new NextResponse(new Uint8Array(fileBuffer), {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'private, max-age=86400', // Cache for 1 day for local performance
        },
      });
    }

    // Return the encrypted file binary stream with strict anti-caching headers (Super Hot secure mode)
    return new NextResponse(new Uint8Array(fileBuffer), {
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
