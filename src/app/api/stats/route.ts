import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك (أدمن فقط)' }, { status: 403 });
    }

    // 1. Students count
    const { count: studentsCount } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true });

    // 2. Exams count
    const { data: exams } = await supabase.from('exams').select('*');
    const examsCount = exams?.length || 0;

    // 3. Completed attempts
    const { data: attempts } = await supabase
      .from('attempts')
      .select('*, exam:exams(id, title, passing_marks)')
      .neq('status', 'in_progress');

    const totalAttempts = attempts?.length || 0;

    let totalScoreSum = 0;
    let highestScore = 0;
    let lowestScore = 0;
    let passedCount = 0;
    let failedCount = 0;

    if (totalAttempts > 0 && attempts) {
      lowestScore = attempts[0].score || 0;
      attempts.forEach((att) => {
        const score = att.score || 0;
        totalScoreSum += score;
        if (score > highestScore) highestScore = score;
        if (score < lowestScore) lowestScore = score;

        const passingMarks = att.exam?.passing_marks || 0;
        if (score >= passingMarks) {
          passedCount++;
        } else {
          failedCount++;
        }
      });
    }

    const avgScore = totalAttempts > 0 ? Number((totalScoreSum / totalAttempts).toFixed(1)) : 0;
    const passRate = totalAttempts > 0 ? Number(((passedCount / totalAttempts) * 100).toFixed(1)) : 0;
    const failRate = totalAttempts > 0 ? Number(((failedCount / totalAttempts) * 100).toFixed(1)) : 0;

    // 4. Per Exam Stats
    const examStatsMap: Record<string, any> = {};
    (exams || []).forEach((e) => {
      examStatsMap[e.id] = {
        examId: e.id,
        title: e.title,
        subject: e.subject || '',
        passingMarks: e.passing_marks || 0,
        attemptsCount: 0,
        totalScore: 0,
        passedCount: 0,
        highestScore: 0,
        lowestScore: null,
      };
    });

    (attempts || []).forEach((att) => {
      const eStat = examStatsMap[att.exam_id];
      if (eStat) {
        eStat.attemptsCount++;
        const s = att.score || 0;
        eStat.totalScore += s;
        if (s >= eStat.passingMarks) eStat.passedCount++;
        if (s > eStat.highestScore) eStat.highestScore = s;
        if (eStat.lowestScore === null || s < eStat.lowestScore) eStat.lowestScore = s;
      }
    });

    const perExamStats = Object.values(examStatsMap).map((e: any) => ({
      examId: e.examId,
      title: e.title,
      subject: e.subject,
      attemptsCount: e.attemptsCount,
      avgScore: e.attemptsCount > 0 ? Number((e.totalScore / e.attemptsCount).toFixed(1)) : 0,
      passRate: e.attemptsCount > 0 ? Number(((e.passedCount / e.attemptsCount) * 100).toFixed(1)) : 0,
      highestScore: e.highestScore,
      lowestScore: e.lowestScore === null ? 0 : e.lowestScore,
    }));

    // 5. Per-question performance (least successful first)
    const { data: questions } = await supabase
      .from('questions')
      .select('id, question_text, exam_id, exam:exams(title)');

    const { data: answers } = await supabase
      .from('answers')
      .select('question_id, is_correct, selected_answer');

    const questionStatsMap: Record<string, any> = {};
    (questions || []).forEach((q: any) => {
      questionStatsMap[q.id] = {
        questionId: q.id,
        questionText: q.question_text,
        examTitle: q.exam?.title || '',
        totalAttempts: 0,
        correctCount: 0,
        wrongCount: 0,
      };
    });

    (answers || []).forEach((a) => {
      const qStat = questionStatsMap[a.question_id];
      if (qStat && a.selected_answer) {
        qStat.totalAttempts++;
        if (a.is_correct) {
          qStat.correctCount++;
        } else {
          qStat.wrongCount++;
        }
      }
    });

    const questionPerformance = Object.values(questionStatsMap)
      .map((q: any) => {
        const successRate = q.totalAttempts > 0 ? Number(((q.correctCount / q.totalAttempts) * 100).toFixed(1)) : 0;
        return {
          ...q,
          successRate,
        };
      })
      .sort((a, b) => a.successRate - b.successRate); // Least successful first

    return NextResponse.json({
      ok: true,
      stats: {
        studentsCount: studentsCount || 0,
        examsCount,
        attemptsCount: totalAttempts,
        avgScore,
        highestScore,
        lowestScore,
        passRate,
        failRate,
        passedCount,
        failedCount,
        perExamStats,
        questionPerformance,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
