import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ ok: false, error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim().toLowerCase() || '';
    const examId = searchParams.get('examId')?.trim() || '';
    const passStatus = searchParams.get('status')?.trim() || ''; // 'passed', 'failed', 'all'

    let query = supabase
      .from('attempts')
      .select('*, exam:exams!inner(*), student:students!inner(*, user:users!inner(*))')
      .neq('status', 'in_progress')
      .order('submitted_at', { ascending: false });

    // Students only see their own results
    if (currentUser.role === 'student') {
      if (!currentUser.studentId) {
        return NextResponse.json({ ok: false, error: 'بيانات الطالب غير مكتملة' }, { status: 400 });
      }
      query = query.eq('student_id', currentUser.studentId);
    }

    if (examId && examId !== 'all') {
      query = query.eq('exam_id', examId);
    }

    const { data: attempts, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let results = (attempts || []).map((att: any) => {
      const passingMarks = att.exam?.passing_marks || 0;
      const isPassed = (att.score || 0) >= passingMarks;

      return {
        id: att.id,
        examId: att.exam_id,
        studentId: att.student_id,
        examTitle: att.exam?.title || '',
        subject: att.exam?.subject || '',
        passingMarks,
        studentName: att.student?.user?.name || '',
        studentCode: att.student?.student_code || '',
        className: att.student?.class_name || '',
        studentEmail: att.student?.user?.email || '',
        startedAt: att.started_at,
        submittedAt: att.submitted_at,
        score: att.score,
        percentage: att.percentage,
        correctCount: att.correct_count,
        wrongCount: att.wrong_count,
        unansweredCount: att.unanswered_count,
        status: att.status,
        timeTakenSeconds: att.time_taken_seconds,
        isPassed,
      };
    });

    if (search) {
      results = results.filter(
        (r) =>
          r.studentName.toLowerCase().includes(search) ||
          r.studentCode.toLowerCase().includes(search) ||
          r.studentEmail.toLowerCase().includes(search) ||
          r.examTitle.toLowerCase().includes(search)
      );
    }

    if (passStatus === 'passed') {
      results = results.filter((r) => r.isPassed);
    } else if (passStatus === 'failed') {
      results = results.filter((r) => !r.isPassed);
    }

    return NextResponse.json({ ok: true, results });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
