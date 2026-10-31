import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ ok: false, error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });
    }

    const params = await context.params;
    const { id: attemptId } = params;

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const isAuto = Boolean(body.auto);

    // Fetch attempt
    const { data: attempt, error: attErr } = await supabase
      .from('attempts')
      .select('*, exam:exams(*)')
      .eq('id', attemptId)
      .single();

    if (attErr || !attempt) {
      return NextResponse.json({ ok: false, error: 'المحاولة غير موجودة' }, { status: 404 });
    }

    // Verify ownership
    if (currentUser.role === 'student' && attempt.student_id !== currentUser.studentId) {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك' }, { status: 403 });
    }

    // If already submitted, return current result
    if (attempt.status !== 'in_progress') {
      return NextResponse.json({
        ok: true,
        alreadySubmitted: true,
        attemptId: attempt.id,
        score: attempt.score,
        percentage: attempt.percentage,
        correctCount: attempt.correct_count,
        wrongCount: attempt.wrong_count,
        unansweredCount: attempt.unanswered_count,
        status: attempt.status,
      });
    }

    const exam = attempt.exam;
    const submittedAt = new Date().toISOString();
    const startTimeMs = new Date(attempt.started_at).getTime();
    const submitTimeMs = new Date(submittedAt).getTime();
    const timeTakenSeconds = Math.max(1, Math.round((submitTimeMs - startTimeMs) / 1000));

    // Fetch all questions for this exam
    const { data: questions, error: qErr } = await supabase
      .from('questions')
      .select('*')
      .eq('exam_id', exam.id);

    if (qErr || !questions) {
      return NextResponse.json({ ok: false, error: 'فشل تحميل أسئلة الامتحان' }, { status: 500 });
    }

    // Fetch saved answers
    const { data: savedAnswers } = await supabase
      .from('answers')
      .select('*')
      .eq('attempt_id', attemptId);

    const answersMap: Record<string, any> = {};
    (savedAnswers || []).forEach((a) => {
      answersMap[a.question_id] = a;
    });

    let totalMarks = 0;
    let earnedMarks = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;

    const answerUpdates: Array<{ id?: string; question_id: string; selected_answer: string | null; is_correct: boolean }> = [];

    questions.forEach((q) => {
      const qMark = q.marks ?? 1;
      totalMarks += qMark;

      const saved = answersMap[q.id];
      const selected = saved?.selected_answer ? String(saved.selected_answer).trim().toUpperCase() : null;
      const correct = String(q.correct_answer).trim().toUpperCase();

      if (!selected) {
        unansweredCount++;
        if (saved) {
          answerUpdates.push({
            id: saved.id,
            question_id: q.id,
            selected_answer: null,
            is_correct: false,
          });
        }
      } else if (selected === correct) {
        correctCount++;
        earnedMarks += qMark;
        answerUpdates.push({
          id: saved?.id,
          question_id: q.id,
          selected_answer: selected,
          is_correct: true,
        });
      } else {
        wrongCount++;
        answerUpdates.push({
          id: saved?.id,
          question_id: q.id,
          selected_answer: selected,
          is_correct: false,
        });
      }
    });

    // Update each answer's is_correct
    for (const item of answerUpdates) {
      if (item.id) {
        await supabase
          .from('answers')
          .update({ is_correct: item.is_correct, updated_at: new Date().toISOString() })
          .eq('id', item.id);
      } else {
        await supabase.from('answers').insert({
          attempt_id: attemptId,
          question_id: item.question_id,
          selected_answer: item.selected_answer,
          is_correct: item.is_correct,
        });
      }
    }

    const percentage = totalMarks > 0 ? Number(((earnedMarks / totalMarks) * 100).toFixed(1)) : 0;
    const finalStatus = isAuto ? 'auto_submitted' : 'completed';

    // Update attempt
    const { data: updatedAttempt, error: updateErr } = await supabase
      .from('attempts')
      .update({
        submitted_at: submittedAt,
        score: earnedMarks,
        percentage,
        correct_count: correctCount,
        wrong_count: wrongCount,
        unanswered_count: unansweredCount,
        status: finalStatus,
        time_taken_seconds: timeTakenSeconds,
      })
      .eq('id', attemptId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }

    const isPassed = earnedMarks >= (exam.passing_marks || 0);

    return NextResponse.json({
      ok: true,
      attemptId: updatedAttempt.id,
      score: earnedMarks,
      totalMarks,
      percentage,
      correctCount,
      wrongCount,
      unansweredCount,
      status: finalStatus,
      timeTakenSeconds,
      isPassed,
      showResult: exam.show_result,
      showCorrectAnswers: exam.show_correct_answers,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
