import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ ok: false, error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });
    }

    const params = await context.params;
    const { id: examId } = params;

    const { data: exam, error: examErr } = await supabase
      .from('exams')
      .select('status, random_questions, random_answers')
      .eq('id', examId)
      .single();

    if (examErr || !exam) {
      return NextResponse.json({ ok: false, error: 'الامتحان غير موجود' }, { status: 404 });
    }

    if (currentUser.role === 'student' && exam.status !== 'published') {
      return NextResponse.json({ ok: false, error: 'هذا الامتحان غير متاح' }, { status: 403 });
    }

    let query = supabase
      .from('questions')
      .select('*')
      .eq('exam_id', examId)
      .order('order', { ascending: true })
      .order('created_at', { ascending: true });

    const { data: questions, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let formatted = (questions || []).map((q) => ({
      id: q.id,
      examId: q.exam_id,
      questionText: q.question_text,
      optionA: q.option_a,
      optionB: q.option_b,
      optionC: q.option_c || '',
      optionD: q.option_d || '',
      correctAnswer: currentUser.role === 'admin' ? q.correct_answer : undefined,
      marks: q.marks ?? 1,
      order: q.order ?? 0,
      createdAt: q.created_at,
    }));

    // If student and random_questions is enabled, shuffle questions deterministically or randomly
    if (currentUser.role === 'student' && exam.random_questions) {
      formatted = [...formatted].sort(() => Math.random() - 0.5);
    }

    return NextResponse.json({ ok: true, questions: formatted });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك (أدمن فقط)' }, { status: 403 });
    }

    const params = await context.params;
    const { id: examId } = params;
    const body = await req.json();

    const { questionText, optionA, optionB, optionC, optionD, correctAnswer, marks, order } = body;

    if (!questionText || !optionA || !optionB || !correctAnswer) {
      return NextResponse.json(
        { ok: false, error: 'نص السؤال، الخيار الأول، الخيار الثاني، والإجابة الصحيحة حقول مطلوبة' },
        { status: 400 }
      );
    }

    const validAnswers = ['A', 'B', 'C', 'D'];
    const cleanCorrect = String(correctAnswer).trim().toUpperCase();
    if (!validAnswers.includes(cleanCorrect)) {
      return NextResponse.json({ ok: false, error: 'الإجابة الصحيحة يجب أن تكون A أو B أو C أو D' }, { status: 400 });
    }

    // Determine order if not passed
    let questionOrder = Number(order);
    if (isNaN(questionOrder)) {
      const { count } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('exam_id', examId);
      questionOrder = (count || 0) + 1;
    }

    const { data: newQ, error } = await supabase
      .from('questions')
      .insert({
        exam_id: examId,
        question_text: String(questionText).trim(),
        option_a: String(optionA).trim(),
        option_b: String(optionB).trim(),
        option_c: optionC ? String(optionC).trim() : null,
        option_d: optionD ? String(optionD).trim() : null,
        correct_answer: cleanCorrect,
        marks: marks !== undefined ? Number(marks) : 1,
        order: questionOrder,
      })
      .select()
      .single();

    if (error || !newQ) {
      return NextResponse.json({ ok: false, error: error?.message || 'فشل حفظ السؤال' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      question: {
        id: newQ.id,
        examId: newQ.exam_id,
        questionText: newQ.question_text,
        optionA: newQ.option_a,
        optionB: newQ.option_b,
        optionC: newQ.option_c || '',
        optionD: newQ.option_d || '',
        correctAnswer: newQ.correct_answer,
        marks: newQ.marks,
        order: newQ.order,
        createdAt: newQ.created_at,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
