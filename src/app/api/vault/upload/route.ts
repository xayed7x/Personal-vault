import { NextRequest, NextResponse } from 'next/server';
import { verifyAndTouchSession, verifyCsrf } from '@/lib/session';
import { db } from '@/lib/db';
import { images, imageData } from '@/lib/schema';
import { isRateLimited } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/session';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  // 1. CSRF check on upload POST request
  if (!verifyCsrf(req)) {
    return NextResponse.json({ error: 'CSRF validation failed.' }, { status: 403 });
  }

  // 2. Early request size boundary check (prevents memory exhaustion DoS)
  const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
  if (contentLength > 21 * 1024 * 1024) { // 21 MB threshold
    return NextResponse.json({ error: 'Payload size exceeds limit.' }, { status: 413 });
  }

  const ipAddress = getClientIp(req);

  // Rate limit uploads (15 uploads per minute per IP)
  const isBlocked = await isRateLimited(ipAddress, 'vault-upload', 15, 60 * 1000);
  if (isBlocked) {
    return NextResponse.json({ error: 'Too many upload attempts. Please try again later.' }, { status: 429 });
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

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const encryptedMetadata = formData.get('metadata') as string | null;
    const metadataIv = formData.get('metadataIv') as string | null;

    if (!file || !encryptedMetadata || !metadataIv) {
      return NextResponse.json({ error: 'Missing required upload files or metadata.' }, { status: 400 });
    }

    // Convert file to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Limit maximum upload size to protect server memory resources (20 MB)
    if (fileBuffer.length > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size exceeds maximum limit of 20MB.' }, { status: 413 });
    }

    // Atomic transaction to keep metadata and binary records synchronized
    const result = await db.transaction(async (tx) => {
      // 1. Insert metadata record
      const [insertedImage] = await tx
        .insert(images)
        .values({
          encryptedMetadata,
          metadataIv,
          uploadedBy: sessionUser.userId,
        })
        .returning({ id: images.id });

      // 2. Insert encrypted binary blob record linked to the metadata record
      await tx.insert(imageData).values({
        imageId: insertedImage.id,
        encryptedFile: fileBuffer,
      });

      return insertedImage;
    });

    return NextResponse.json({ success: true, id: result.id });
  } catch (err) {
    console.error('Upload API error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
