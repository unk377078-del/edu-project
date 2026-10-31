import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';

export async function GET(req: Request) {
  try {
    await ensureSeeded();
    const user = await getCurrentUser(req);
    return NextResponse.json({
      ok: true,
      user: user || null,
    });
  } catch (error: any) {
    console.error('Auth me error:', error);
    return NextResponse.json({
      ok: true,
      user: null,
    });
  }
}
