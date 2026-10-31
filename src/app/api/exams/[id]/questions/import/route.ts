import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك' }, { status: 403 });
    }

    const params = await context.params;
    const { id: examId } = params;

    const { searchParams } = new URL(req.url);
    const replace = searchParams.get('replace') === 'true';

    const body = await req.json();
    let rawQuestions: any[] = [];

    if (Array.isArray(body)) {
      rawQuestions = body;
    } else if (body && Array.isArray(body.questions)) {
      rawQuestions = body.questions;
    } else {
      return NextResponse.json({ ok: false, error: 'صيغة JSON غير صحيحة، يجب إرسال مصفوفة أسئلة' }, { status: 400 });
    }

    if (rawQuestions.length === 0) {
      return NextResponse.json({ ok: false, error: 'لا توجد أسئلة في البيانات المرسلة' }, { status: 400 });
    }

    // If replace mode, delete all existing questions for this exam
    if (replace) {
      await supabase.from('questions').delete().eq('exam_id', examId);
    }

    // Get current order offset
    let startOrder = 1;
    if (!replace) {
      const { count } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('exam_id', examId);
      startOrder = (count || 0) + 1;
    }

    const validQuestionsToInsert: any[] = [];
    const warnings: string[] = [];

    rawQuestions.forEach((q, index) => {
      const questionText = q.questionText || q.question || q.text || '';
      const optionA = q.optionA || q.A || q.option_a || '';
      const optionB = q.optionB || q.B || q.option_b || '';
      const optionC = q.optionC || q.C || q.option_c || null;
      const optionD = q.optionD || q.D || q.option_d || null;
      let correctAnswer = q.correctAnswer || q.correct || q.answer || '';
      const marks = q.marks !== undefined ? Number(q.marks) : 1;

      if (!questionText || !optionA || !optionB) {
        warnings.push(`تم تخطي السؤال #${index + 1}: ينقصه نص السؤال أو الخيارات الأساسية`);
        return;
      }

      correctAnswer = String(correctAnswer).trim().toUpperCase();
      if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) {
        warnings.push(`تم تخطي السؤال #${index + 1}: الإجابة الصحيحة غير صالحة (${correctAnswer})`);
        return;
      }

      validQuestionsToInsert.push({
        exam_id: examId,
        question_text: String(questionText).trim(),
        option_a: String(optionA).trim(),
        option_b: String(optionB).trim(),
        option_c: optionC ? String(optionC).trim() : null,
        option_d: optionD ? String(optionD).trim() : null,
        correct_answer: correctAnswer,
        marks: isNaN(marks) || marks <= 0 ? 1 : marks,
        order: startOrder + validQuestionsToInsert.length,
      });
    });

    if (validQuestionsToInsert.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'لم يتم العثور على أي سؤال صالح للاستيراد', warnings },
        { status: 400 }
      );
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('questions')
      .insert(validQuestionsToInsert)
      .select();

    if (insertErr) {
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      count: inserted?.length || 0,
      totalProcessed: rawQuestions.length,
      warnings,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
