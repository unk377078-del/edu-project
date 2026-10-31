import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ ok: false, error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });
    }

    let query = supabase
      .from('attempts')
      .select('*, exam:exams(id, title, duration_minutes, passing_marks), student:students(id, student_code, class_name, user:users(id, name, email))')
      .order('created_at', { ascending: false });

    // Students only see their own attempts
    if (currentUser.role === 'student') {
      if (!currentUser.studentId) {
        return NextResponse.json({ ok: false, error: 'حساب الطالب غير مكتمل' }, { status: 400 });
      }
      query = query.eq('student_id', currentUser.studentId);
    }

    const { data: attempts, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const formatted = (attempts || []).map((att: any) => ({
      id: att.id,
      examId: att.exam_id,
      studentId: att.student_id,
      startedAt: att.started_at,
      submittedAt: att.submitted_at,
      score: att.score,
      percentage: att.percentage,
      correctCount: att.correct_count,
      wrongCount: att.wrong_count,
      unansweredCount: att.unanswered_count,
      status: att.status,
      timeTakenSeconds: att.time_taken_seconds,
      examTitle: att.exam?.title || '',
      studentName: att.student?.user?.name || '',
      studentCode: att.student?.student_code || '',
      studentEmail: att.student?.user?.email || '',
    }));

    return NextResponse.json({ ok: true, attempts: formatted });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'student' || !currentUser.studentId) {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك (للطلاب فقط)' }, { status: 403 });
    }

    const body = await req.json();
    const { examId } = body;

    if (!examId) {
      return NextResponse.json({ ok: false, error: 'معرف الامتحان مطلوب' }, { status: 400 });
    }

    // Fetch exam
    const { data: exam, error: examErr } = await supabase
      .from('exams')
      .select('*')
      .eq('id', examId)
      .single();

    if (examErr || !exam) {
      return NextResponse.json({ ok: false, error: 'الامتحان غير موجود' }, { status: 404 });
    }

    if (exam.status !== 'published') {
      return NextResponse.json({ ok: false, error: 'هذا الامتحان غير متاح للتقديم حالياً' }, { status: 400 });
    }

    // Check if exam has questions
    const { count: qCount } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('exam_id', examId);

    if (!qCount || qCount === 0) {
      return NextResponse.json({ ok: false, error: 'لا يمكن بدء امتحان بدون أسئلة' }, { status: 400 });
    }

    // Check existing attempts
    const { data: existingAttempts } = await supabase
      .from('attempts')
      .select('*')
      .eq('student_id', currentUser.studentId)
      .eq('exam_id', examId)
      .order('created_at', { ascending: false });

    // 1. If in-progress attempt exists, check if time expired or resume it
    const activeAttempt = existingAttempts?.find((a) => a.status === 'in_progress');
    if (activeAttempt) {
      const startTime = new Date(activeAttempt.started_at).getTime();
      const endTime = startTime + (exam.duration_minutes || 30) * 60 * 1000;
      const now = Date.now();

      if (now > endTime) {
        // Auto-submit expired attempt
        await fetch(`${req.headers.get('origin') || 'http://localhost:3000'}/api/attempts/${activeAttempt.id}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') || '' },
          body: JSON.stringify({ auto: true }),
        }).catch(() => {});
      } else {
        // Resume active attempt
        return NextResponse.json({
          ok: true,
          resumed: true,
          attempt: {
            id: activeAttempt.id,
            examId: activeAttempt.exam_id,
            studentId: activeAttempt.student_id,
            startedAt: activeAttempt.started_at,
            durationMinutes: exam.duration_minutes,
            endTime: new Date(endTime).toISOString(),
            status: activeAttempt.status,
          },
        });
      }
    }

    // 2. Check max attempts
    const completedCount = (existingAttempts || []).filter((a) => a.status !== 'in_progress').length;
    if (exam.max_attempts > 0 && completedCount >= exam.max_attempts) {
      return NextResponse.json(
        { ok: false, error: `لقد استنفدت الحد الأقصى المسموح به لمحاولات هذا الامتحان (${exam.max_attempts} محاولة)` },
        { status: 400 }
      );
    }

    // Create new attempt
    const startedAt = new Date().toISOString();
    const { data: newAttempt, error: createErr } = await supabase
      .from('attempts')
      .insert({
        student_id: currentUser.studentId,
        exam_id: examId,
        started_at: startedAt,
        status: 'in_progress',
      })
      .select()
      .single();

    if (createErr || !newAttempt) {
      return NextResponse.json({ ok: false, error: createErr?.message || 'فشل بدء الامتحان' }, { status: 500 });
    }

    const endTime = new Date(Date.now() + (exam.duration_minutes || 30) * 60 * 1000).toISOString();

    return NextResponse.json({
      ok: true,
      resumed: false,
      attempt: {
        id: newAttempt.id,
        examId: newAttempt.exam_id,
        studentId: newAttempt.student_id,
        startedAt: newAttempt.started_at,
        durationMinutes: exam.duration_minutes,
        endTime,
        status: newAttempt.status,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
