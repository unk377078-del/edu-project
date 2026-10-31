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

    const { data: questions, error } = await supabase
      .from('questions')
      .select('question_text, option_a, option_b, option_c, option_d, correct_answer, marks, order')
      .eq('exam_id', examId)
      .order('order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const exportData = (questions || []).map((q) => ({
      questionText: q.question_text,
      optionA: q.option_a,
      optionB: q.option_b,
      optionC: q.option_c || null,
      optionD: q.option_d || null,
      correctAnswer: q.correct_answer,
      marks: q.marks,
    }));

    return NextResponse.json(exportData, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="exam-${examId}-questions.json"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
