import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك (أدمن فقط)' }, { status: 403 });
    }

    const params = await context.params;
    const { id: examId } = params;
    const body = await req.json();
    const orderList: string[] = body.order;

    if (!Array.isArray(orderList) || orderList.length === 0) {
      return NextResponse.json({ ok: false, error: 'قائمة الترتيب غير صالحة' }, { status: 400 });
    }

    // Update each question's order
    const updates = orderList.map((qid, index) =>
      supabase
        .from('questions')
        .update({ order: index + 1, updated_at: new Date().toISOString() })
        .eq('id', qid)
        .eq('exam_id', examId)
    );

    await Promise.all(updates);

    return NextResponse.json({ ok: true, message: 'تم إعادة ترتيب الأسئلة بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
