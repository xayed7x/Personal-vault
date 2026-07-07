import { NextRequest, NextResponse } from 'next/server';
import { verifyAndTouchSession } from '@/lib/session';
import { db } from '@/lib/db';
import { images } from '@/lib/schema';
import { desc } from 'drizzle-orm';
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

    // Retrieve encrypted metadata list. Do NOT fetch image_data binary table here.
    const list = await db
      .select({
        id: images.id,
        encryptedMetadata: images.encryptedMetadata,
        metadataIv: images.metadataIv,
        uploadedBy: images.uploadedBy,
        createdAt: images.createdAt,
      })
      .from(images)
      .orderBy(desc(images.createdAt));

    return NextResponse.json(list);
  } catch (err) {
    console.error('Fetch images error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
