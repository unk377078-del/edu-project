import { NextResponse } from 'next/server';
import { getSessionTokenFromRequest, deleteSession, getLogoutCookieHeader } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const token = await getSessionTokenFromRequest(req);
    if (token) {
      await deleteSession(token);
    }

    const response = NextResponse.json({ ok: true, message: 'تم تسجيل الخروج بنجاح' });
    response.headers.set('Set-Cookie', getLogoutCookieHeader());
    return response;
  } catch (error: any) {
    console.error('Logout error:', error);
    const response = NextResponse.json({ ok: true });
    response.headers.set('Set-Cookie', getLogoutCookieHeader());
    return response;
  }
}
