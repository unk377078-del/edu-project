import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string; qid: string }> }
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك' }, { status: 403 });
    }

    const params = await context.params;
    const { id: examId, qid } = params;
    const body = await req.json();

    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.questionText !== undefined) updates.question_text = String(body.questionText).trim();
    if (body.optionA !== undefined) updates.option_a = String(body.optionA).trim();
    if (body.optionB !== undefined) updates.option_b = String(body.optionB).trim();
    if (body.optionC !== undefined) updates.option_c = body.optionC ? String(body.optionC).trim() : null;
    if (body.optionD !== undefined) updates.option_d = body.optionD ? String(body.optionD).trim() : null;
    if (body.correctAnswer !== undefined) {
      const clean = String(body.correctAnswer).trim().toUpperCase();
      if (!['A', 'B', 'C', 'D'].includes(clean)) {
        return NextResponse.json({ ok: false, error: 'الإجابة الصحيحة يجب أن تكون A أو B أو C أو D' }, { status: 400 });
      }
      updates.correct_answer = clean;
    }
    if (body.marks !== undefined) updates.marks = Number(body.marks);
    if (body.order !== undefined) updates.order = Number(body.order);

    const { data: updated, error } = await supabase
      .from('questions')
      .update(updates)
      .eq('id', qid)
      .eq('exam_id', examId)
      .select()
      .single();

    if (error || !updated) {
      return NextResponse.json({ ok: false, error: error?.message || 'فشل تحديث السؤال' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      question: {
        id: updated.id,
        examId: updated.exam_id,
        questionText: updated.question_text,
        optionA: updated.option_a,
        optionB: updated.option_b,
        optionC: updated.option_c || '',
        optionD: updated.option_d || '',
        correctAnswer: updated.correct_answer,
        marks: updated.marks,
        order: updated.order,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string; qid: string }> }
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك' }, { status: 403 });
    }

    const params = await context.params;
    const { id: examId, qid } = params;

    const { error } = await supabase
      .from('questions')
      .delete()
      .eq('id', qid)
      .eq('exam_id', examId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'تم حذف السؤال بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
