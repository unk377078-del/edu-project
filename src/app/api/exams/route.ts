import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status')?.trim();

    let query = supabase.from('exams').select('*').order('created_at', { ascending: false });

    // Students only see published exams
    if (currentUser?.role === 'student') {
      query = query.eq('status', 'published');
    } else if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data: exams, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Get question counts and attempts counts
    const examList = exams || [];
    const examIds = examList.map((e: any) => e.id);

    let questionCountsMap: Record<string, number> = {};
    if (examIds.length > 0) {
      const { data: qData } = await supabase.from('questions').select('*');
      if (qData) {
        qData.forEach((q: any) => {
          questionCountsMap[q.exam_id] = (questionCountsMap[q.exam_id] || 0) + 1;
        });
      }
    }

    // Student specific attempts count
    let studentAttemptsMap: Record<string, number> = {};
    let studentLastAttemptMap: Record<string, any> = {};

    if (currentUser?.role === 'student' && currentUser.studentId && examIds.length > 0) {
      const { data: attempts } = await supabase
        .from('attempts')
        .select('*')
        .eq('student_id', currentUser.studentId)
        .order('created_at', { ascending: false });

      if (attempts) {
        attempts.forEach((att: any) => {
          studentAttemptsMap[att.exam_id] = (studentAttemptsMap[att.exam_id] || 0) + 1;
          if (!studentLastAttemptMap[att.exam_id]) {
            studentLastAttemptMap[att.exam_id] = att;
          }
        });
      }
    }

    const formatted = examList.map((exam: any) => {
      const questionsCount = questionCountsMap[exam.id] || 0;
      const attemptsCount = studentAttemptsMap[exam.id] || 0;
      const lastAttempt = studentLastAttemptMap[exam.id] || null;
      const isMaxReached = exam.max_attempts > 0 && attemptsCount >= exam.max_attempts;

      return {
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
        questionsCount,
        studentAttemptsCount: attemptsCount,
        isMaxReached,
        inProgressAttempt: lastAttempt?.status === 'in_progress' ? lastAttempt : null,
      };
    });

    return NextResponse.json({ ok: true, exams: formatted });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك (أدمن فقط)' }, { status: 403 });
    }

    const body = await req.json();
    const {
      title,
      subject,
      description,
      durationMinutes,
      passingMarks,
      maxAttempts,
      examDate,
      status,
      showResult,
      showCorrectAnswers,
      randomQuestions,
      randomAnswers,
    } = body;

    if (!title || String(title).trim().length === 0) {
      return NextResponse.json({ ok: false, error: 'عنوان الامتحان مطلوب' }, { status: 400 });
    }

    const { data: exam, error } = await supabase
      .from('exams')
      .insert({
        title: String(title).trim(),
        subject: subject ? String(subject).trim() : '',
        description: description ? String(description).trim() : '',
        duration_minutes: durationMinutes !== undefined ? Number(durationMinutes) : 30,
        passing_marks: passingMarks !== undefined ? Number(passingMarks) : 10,
        max_attempts: maxAttempts !== undefined ? Number(maxAttempts) : 1,
        exam_date: examDate ? new Date(examDate).toISOString() : null,
        status: status || 'draft',
        show_result: showResult !== undefined ? Boolean(showResult) : true,
        show_correct_answers: showCorrectAnswers !== undefined ? Boolean(showCorrectAnswers) : true,
        random_questions: randomQuestions !== undefined ? Boolean(randomQuestions) : false,
        random_answers: randomAnswers !== undefined ? Boolean(randomAnswers) : false,
      })
      .select()
      .single();

    if (error || !exam) {
      return NextResponse.json({ ok: false, error: error?.message || 'فشل إنشاء الامتحان' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, exam });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
