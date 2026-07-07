import { NextRequest, NextResponse } from 'next/server';
import { verifyAndTouchSession, verifyCsrf } from '@/lib/session';
import { db } from '@/lib/db';
import { images } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  // 1. CSRF check on delete requests
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

    const params = await props.params;
    const id = params.id;

    if (!id) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 });
    }

    // Delete image metadata. The database foreign key CASCADE will delete the binary in image_data.
    const deleteResult = await db
      .delete(images)
      .where(eq(images.id, id))
      .returning({ deletedId: images.id });

    if (deleteResult.length === 0) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete image error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
