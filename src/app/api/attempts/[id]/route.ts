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
      return NextResponse.json({ ok: false, error: 'المحاولة غير موجودة' }, { status: 404 });
    }

    // Student isolation: students can only access their own attempts
    if (currentUser.role === 'student' && attempt.student_id !== currentUser.studentId) {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك بالوصول لهذه المحاولة' }, { status: 403 });
    }

    const exam = attempt.exam;

    // Fetch questions
    const { data: questions } = await supabase
      .from('questions')
      .select('*')
      .eq('exam_id', exam.id)
      .order('order', { ascending: true })
      .order('created_at', { ascending: true });

    // Fetch saved answers
    const { data: savedAnswers } = await supabase
      .from('answers')
      .select('*')
      .eq('attempt_id', attemptId);

    const answersMap: Record<string, string> = {};
    (savedAnswers || []).forEach((ans) => {
      answersMap[ans.question_id] = ans.selected_answer;
    });

    // Compute server-side end time & remaining seconds
    const startTimeMs = new Date(attempt.started_at).getTime();
    const durationMinutes = exam.duration_minutes || 30;
    const endTimeMs = startTimeMs + durationMinutes * 60 * 1000;
    const nowMs = Date.now();
    const remainingSeconds = Math.max(0, Math.floor((endTimeMs - nowMs) / 1000));

    // Format questions
    let formattedQuestions = (questions || []).map((q) => {
      const isAnswered = Boolean(answersMap[q.id]);
      const selectedAnswer = answersMap[q.id] || null;

      // Security requirement: if student & in_progress, DO NOT send correct_answer!
      const canSeeCorrect =
        currentUser.role === 'admin' ||
        (attempt.status !== 'in_progress' && exam.show_correct_answers);

      return {
        id: q.id,
        questionText: q.question_text,
        optionA: q.option_a,
        optionB: q.option_b,
        optionC: q.option_c || '',
        optionD: q.option_d || '',
        marks: q.marks,
        order: q.order,
        isAnswered,
        selectedAnswer,
        correctAnswer: canSeeCorrect ? q.correct_answer : undefined,
      };
    });

    // If random questions enabled and student
    if (currentUser.role === 'student' && exam.random_questions && attempt.status === 'in_progress') {
      // Deterministic shuffle based on attemptId so it doesn't change on refresh
      const seed = attemptId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      formattedQuestions = formattedQuestions.sort((a, b) => {
        const hashA = (a.id.charCodeAt(0) * seed) % 100;
        const hashB = (b.id.charCodeAt(0) * seed) % 100;
        return hashA - hashB;
      });
    }

    return NextResponse.json({
      ok: true,
      attempt: {
        id: attempt.id,
        examId: attempt.exam_id,
        studentId: attempt.student_id,
        startedAt: attempt.started_at,
        submittedAt: attempt.submitted_at,
        score: attempt.score,
        percentage: attempt.percentage,
        correctCount: attempt.correct_count,
        wrongCount: attempt.wrong_count,
        unansweredCount: attempt.unanswered_count,
        status: attempt.status,
        timeTakenSeconds: attempt.time_taken_seconds,
        exam: {
          id: exam.id,
          title: exam.title,
          subject: exam.subject,
          durationMinutes: exam.duration_minutes,
          passingMarks: exam.passing_marks,
          showResult: exam.show_result,
          showCorrectAnswers: exam.show_correct_answers,
        },
        student: {
          name: attempt.student?.user?.name,
          studentCode: attempt.student?.student_code,
          className: attempt.student?.class_name,
        },
        endTime: new Date(endTimeMs).toISOString(),
        remainingSeconds,
        isTimeExpired: remainingSeconds <= 0 && attempt.status === 'in_progress',
        questions: formattedQuestions,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
