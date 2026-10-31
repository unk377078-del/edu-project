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
    const { id } = params;

    const { data: exam, error } = await supabase
      .from('exams')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !exam) {
      return NextResponse.json({ ok: false, error: 'الامتحان غير موجود' }, { status: 404 });
    }

    // Students can only view published exams
    if (currentUser.role === 'student' && exam.status !== 'published') {
      return NextResponse.json({ ok: false, error: 'هذا الامتحان غير متاح حالياً' }, { status: 403 });
    }

    // Fetch questions
    let qQuery = supabase
      .from('questions')
      .select('*')
      .eq('exam_id', id)
      .order('order', { ascending: true })
      .order('created_at', { ascending: true });

    const { data: questions, error: qError } = await qQuery;

    let formattedQuestions = questions || [];

    // Security requirement: For students, WITHOUT correctAnswer!
    if (currentUser.role === 'student') {
      formattedQuestions = formattedQuestions.map((q) => {
        const { correct_answer, ...safeQ } = q;
        return safeQ;
      });
    }

    // Check student's attempts
    let attemptsCount = 0;
    let isMaxReached = false;
    let inProgressAttempt = null;

    if (currentUser.role === 'student' && currentUser.studentId) {
      const { data: attempts } = await supabase
        .from('attempts')
        .select('*')
        .eq('student_id', currentUser.studentId)
        .eq('exam_id', id)
        .order('created_at', { ascending: false });

      if (attempts) {
        attemptsCount = attempts.length;
        isMaxReached = exam.max_attempts > 0 && attemptsCount >= exam.max_attempts;
        inProgressAttempt = attempts.find((a) => a.status === 'in_progress') || null;
      }
    }

    return NextResponse.json({
      ok: true,
      exam: {
        id: exam.id,
        title: exam.title,
        subject: exam.subject || '',
        description: exam.description || '',
        durationMinutes: exam.duration_minutes,
        passingMarks: exam.passing_marks,
        maxAttempts: exam.max_attempts,
        examDate: exam.exam_date,
        status: exam.status,
        showResult: exam.show_result,
        showCorrectAnswers: exam.show_correct_answers,
        randomQuestions: exam.random_questions,
        randomAnswers: exam.random_answers,
        createdAt: exam.created_at,
        questions: formattedQuestions,
        questionsCount: formattedQuestions.length,
        studentAttemptsCount: attemptsCount,
        isMaxReached,
        inProgressAttempt,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك (أدمن فقط)' }, { status: 403 });
    }

    const params = await context.params;
    const { id } = params;
    const body = await req.json();

    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.title !== undefined) updates.title = String(body.title).trim();
    if (body.subject !== undefined) updates.subject = String(body.subject).trim();
    if (body.description !== undefined) updates.description = String(body.description).trim();
    if (body.durationMinutes !== undefined) updates.duration_minutes = Number(body.durationMinutes);
    if (body.passingMarks !== undefined) updates.passing_marks = Number(body.passingMarks);
    if (body.maxAttempts !== undefined) updates.max_attempts = Number(body.maxAttempts);
    if (body.examDate !== undefined) updates.exam_date = body.examDate ? new Date(body.examDate).toISOString() : null;
    if (body.status !== undefined) updates.status = body.status;
    if (body.showResult !== undefined) updates.show_result = Boolean(body.showResult);
    if (body.showCorrectAnswers !== undefined) updates.show_correct_answers = Boolean(body.showCorrectAnswers);
    if (body.randomQuestions !== undefined) updates.random_questions = Boolean(body.randomQuestions);
    if (body.randomAnswers !== undefined) updates.random_answers = Boolean(body.randomAnswers);

    const { data: updatedExam, error } = await supabase
      .from('exams')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !updatedExam) {
      return NextResponse.json({ ok: false, error: error?.message || 'فشل تحديث الامتحان' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, exam: updatedExam });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك (أدمن فقط)' }, { status: 403 });
    }

    const params = await context.params;
    const { id } = params;

    const { error } = await supabase.from('exams').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'تم حذف الامتحان بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
