import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string; pdfId: string }> }
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك' }, { status: 401 });
    }

    const params = await context.params;
    const { id: examId, pdfId } = params;

    const { data: record, error: fetchErr } = await supabase
      .from('exam_pdfs')
      .select('*')
      .eq('id', pdfId)
      .eq('exam_id', examId)
      .single();

    if (fetchErr || !record) {
      return NextResponse.json({ ok: false, error: 'الملف غير موجود' }, { status: 404 });
    }

    // Download from Supabase Storage
    const { data: blob, error: downloadErr } = await supabase.storage
      .from('exam-pdfs')
      .download(record.storage_path);

    if (downloadErr || !blob) {
      return NextResponse.json({ ok: false, error: 'فشل تحميل الملف من التخزين' }, { status: 500 });
    }

    const arrayBuffer = await blob.arrayBuffer();
    const encodedFileName = encodeURIComponent(record.file_name);

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename*=UTF-8''${encodedFileName}`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
