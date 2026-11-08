import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSystemSettings, updateSystemSettings } from '@/lib/settings';

// Public GET so login page can know if passwordless is enabled
export async function GET() {
  try {
    const settings = await getSystemSettings();
    return NextResponse.json({ ok: true, settings });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'حدث خطأ أثناء جلب الإعدادات' },
      { status: 500 }
    );
  }
}

// Admin only: Update settings
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user || user.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'غير مصرح لك بتعديل الإعدادات (أدمن فقط)' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { allowPasswordlessLogin } = body;

    const updated = await updateSystemSettings({
      allowPasswordlessLogin: Boolean(allowPasswordlessLogin),
    });

    return NextResponse.json({
      ok: true,
      message: 'تم حفظ الإعدادات بنجاح',
      settings: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'فشل حفظ الإعدادات' },
      { status: 500 }
    );
  }
}
