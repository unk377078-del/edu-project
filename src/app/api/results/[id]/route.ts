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
    const { id: attemptId } = params;

    const { data: attempt, error: attErr } = await supabase
      .from('attempts')
      .select('*, exam:exams(*), student:students(*, user:users(id, name, email))')
      .eq('id', attemptId)
      .single();

    if (attErr || !attempt) {
      return NextResponse.json({ ok: false, error: 'النتيجة غير موجودة' }, { status: 404 });
    }

    // Student isolation: students can only see their own results
    if (currentUser.role === 'student' && attempt.student_id !== currentUser.studentId) {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك' }, { status: 403 });
    }

    const exam = attempt.exam;

    // Check if result is visible to student
    if (currentUser.role === 'student' && !exam.show_result) {
      return NextResponse.json({
        ok: false,
        error: 'عرض النتيجة محجوب حالياً من قبل إدارة الامتحان',
      });
    }

    // Fetch questions
    const { data: questions } = await supabase
      .from('questions')
      .select('*')
      .eq('exam_id', exam.id)
      .order('order', { ascending: true })
      .order('created_at', { ascending: true });

    // Fetch student's answers
    const { data: answers } = await supabase
      .from('answers')
      .select('*')
      .eq('attempt_id', attemptId);

    const answersMap: Record<string, any> = {};
    (answers || []).forEach((a) => {
      answersMap[a.question_id] = a;
    });

    const canSeeCorrect = currentUser.role === 'admin' || Boolean(exam.show_correct_answers);

    let totalMarks = 0;
    const questionsDetail = (questions || []).map((q) => {
      totalMarks += q.marks ?? 1;
      const ans = answersMap[q.id];
      const selected = ans?.selected_answer || null;
      const isCorrect = ans ? ans.is_correct : false;

      return {
        id: q.id,
        questionText: q.question_text,
        optionA: q.option_a,
        optionB: q.option_b,
        optionC: q.option_c || null,
        optionD: q.option_d || null,
        marks: q.marks ?? 1,
        order: q.order,
        selectedAnswer: selected,
        isAnswered: Boolean(selected),
        isCorrect: canSeeCorrect ? isCorrect : undefined,
        correctAnswer: canSeeCorrect ? q.correct_answer : undefined,
      };
    });

    const passingMarks = exam.passing_marks || 0;
    const isPassed = (attempt.score || 0) >= passingMarks;

    return NextResponse.json({
      ok: true,
      result: {
        id: attempt.id,
        examId: attempt.exam_id,
        studentId: attempt.student_id,
        startedAt: attempt.started_at,
        submittedAt: attempt.submitted_at,
        score: attempt.score,
        totalMarks,
        percentage: attempt.percentage,
        correctCount: attempt.correct_count,
        wrongCount: attempt.wrong_count,
        unansweredCount: attempt.unanswered_count,
        status: attempt.status,
        timeTakenSeconds: attempt.time_taken_seconds,
        isPassed,
        passingMarks,
        showCorrectAnswers: canSeeCorrect,
        exam: {
          id: exam.id,
          title: exam.title,
          subject: exam.subject,
          description: exam.description,
          durationMinutes: exam.duration_minutes,
          passingMarks: exam.passing_marks,
          showCorrectAnswers: exam.show_correct_answers,
        },
        student: {
          name: attempt.student?.user?.name || '',
          email: attempt.student?.user?.email || '',
          studentCode: attempt.student?.student_code || '',
          className: attempt.student?.class_name || '',
        },
        questions: questionsDetail,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
