import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك' }, { status: 401 });
    }

    const params = await context.params;
    const { id: attemptId } = params;

    const { data: attempt } = await supabase
      .from('attempts')
      .select('student_id')
      .eq('id', attemptId)
      .single();

    if (!attempt) {
      return NextResponse.json({ ok: false, error: 'المحاولة غير موجودة' }, { status: 404 });
    }

    if (currentUser.role === 'student' && attempt.student_id !== currentUser.studentId) {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك' }, { status: 403 });
    }

    const { data: answers, error } = await supabase
      .from('answers')
      .select('*')
      .eq('attempt_id', attemptId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, answers: answers || [] });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'student' || !currentUser.studentId) {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك' }, { status: 403 });
    }

    const params = await context.params;
    const { id: attemptId } = params;

    // Fetch attempt
    const { data: attempt, error: attErr } = await supabase
      .from('attempts')
      .select('*, exam:exams(duration_minutes)')
      .eq('id', attemptId)
      .single();

    if (attErr || !attempt) {
      return NextResponse.json({ ok: false, error: 'المحاولة غير موجودة' }, { status: 404 });
    }

    // Verify ownership
    if (attempt.student_id !== currentUser.studentId) {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك' }, { status: 403 });
    }

    // Submit lock: cannot modify answers after submission!
    if (attempt.status !== 'in_progress') {
      return NextResponse.json(
        { ok: false, error: 'تم تسليم الامتحان بالفعل، لا يمكن تعديل الإجابات' },
        { status: 400 }
      );
    }

    // Check timer expiration
    const startTimeMs = new Date(attempt.started_at).getTime();
    const durationMinutes = attempt.exam?.duration_minutes || 30;
    const endTimeMs = startTimeMs + durationMinutes * 60 * 1000;
    if (Date.now() > endTimeMs + 5000) {
      // Grace period of 5 seconds for latency, otherwise locked
      return NextResponse.json(
        { ok: false, error: 'انتهى الوقت المحدد للامتحان', isTimeExpired: true },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { questionId, selectedAnswer } = body;

    if (!questionId) {
      return NextResponse.json({ ok: false, error: 'معرف السؤال مطلوب' }, { status: 400 });
    }

    // Upsert answer
    const cleanAnswer = selectedAnswer ? String(selectedAnswer).trim().toUpperCase() : null;

    // Check if answer record exists
    const { data: existingAns } = await supabase
      .from('answers')
      .select('id')
      .eq('attempt_id', attemptId)
      .eq('question_id', questionId)
      .maybeSingle();

    let ansResult;
    if (existingAns) {
      const { data, error } = await supabase
        .from('answers')
        .update({
          selected_answer: cleanAnswer,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingAns.id)
        .select()
        .single();
      ansResult = { data, error };
    } else {
      const { data, error } = await supabase
        .from('answers')
        .insert({
          attempt_id: attemptId,
          question_id: questionId,
          selected_answer: cleanAnswer,
        })
        .select()
        .single();
      ansResult = { data, error };
    }

    if (ansResult.error) {
      return NextResponse.json({ ok: false, error: ansResult.error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      answer: {
        questionId,
        selectedAnswer: cleanAnswer,
        updatedAt: ansResult.data?.updated_at || new Date().toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
