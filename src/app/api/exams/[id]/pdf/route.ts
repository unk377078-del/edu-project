import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك' }, { status: 403 });
    }

    const params = await context.params;
    const { id: examId } = params;

    const { data: pdfs, error } = await supabase
      .from('exam_pdfs')
      .select('*')
      .eq('exam_id', examId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const formatted = (pdfs || []).map((p) => ({
      id: p.id,
      examId: p.exam_id,
      fileName: p.file_name,
      storagePath: p.storage_path,
      fileSize: p.file_size,
      uploadedAt: p.uploaded_at,
    }));

    return NextResponse.json({ ok: true, pdfs: formatted });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك' }, { status: 403 });
    }

    const params = await context.params;
    const { id: examId } = params;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ ok: false, error: 'لم يتم تحديد ملف PDF' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      return NextResponse.json({ ok: false, error: 'الملف المرفوع يجب أن يكون بصيغة PDF' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `exams/${examId}/${timestamp}_${safeFileName}`;

    // Upload to Supabase Storage bucket 'exam-pdfs'
    const { error: uploadError } = await supabase.storage
      .from('exam-pdfs')
      .upload(storagePath, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json(
        {
          ok: false,
          error:
            'فشل رفع الملف إلى Supabase Storage. تأكد من إنشاء Bucket باسم exam-pdfs في لوحة تحكم Supabase.',
          details: uploadError.message,
        },
        { status: 500 }
      );
    }

    // Insert record in exam_pdfs table
    const { data: record, error: dbError } = await supabase
      .from('exam_pdfs')
      .insert({
        exam_id: examId,
        file_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
      })
      .select()
      .single();

    if (dbError || !record) {
      return NextResponse.json({ ok: false, error: dbError?.message || 'فشل حفظ بيانات الملف' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      pdf: {
        id: record.id,
        examId: record.exam_id,
        fileName: record.file_name,
        storagePath: record.storage_path,
        fileSize: record.file_size,
        uploadedAt: record.uploaded_at,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
