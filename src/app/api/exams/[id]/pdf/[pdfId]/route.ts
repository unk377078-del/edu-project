import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string; pdfId: string }> }
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك' }, { status: 403 });
    }

    const params = await context.params;
    const { id: examId, pdfId } = params;

    const { data: record, error: fetchErr } = await supabase
      .from('exam_pdfs')
      .select('id, storage_path')
      .eq('id', pdfId)
      .eq('exam_id', examId)
      .single();

    if (fetchErr || !record) {
      return NextResponse.json({ ok: false, error: 'الملف غير موجود' }, { status: 404 });
    }

    // Delete from Supabase Storage
    await supabase.storage.from('exam-pdfs').remove([record.storage_path]);

    // Delete from database
    const { error: delErr } = await supabase
      .from('exam_pdfs')
      .delete()
      .eq('id', pdfId);

    if (delErr) {
      return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'تم حذف الملف بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
