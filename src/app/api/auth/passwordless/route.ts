import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { hashPassword, createSession, getSessionCookieHeader } from '@/lib/auth';
import { getSystemSettings } from '@/lib/settings';

export async function POST(req: Request) {
  try {
    const settings = await getSystemSettings();
    if (!settings.allowPasswordlessLogin) {
      return NextResponse.json(
        { ok: false, error: 'خاصية الدخول بدون كلمة مرور معطلة حالياً من قبل الإدارة.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const name = String(body.name || '').trim();
    const className = String(body.className || '').trim() || 'عام';
    let studentCode = String(body.studentCode || '').trim().toUpperCase();

    if (!name || name.length < 2) {
      return NextResponse.json(
        { ok: false, error: 'يرجى إدخال اسم الطالب بالكامل (حرفين على الأقل)' },
        { status: 400 }
      );
    }

    // If student code not provided, generate random one
    if (!studentCode) {
      const rand = Math.floor(1000 + Math.random() * 9000);
      studentCode = `ST-${rand}`;
    }

    // Check if studentCode already exists
    const { data: existingStudent } = await supabase
      .from('students')
      .select('id, student_code, user_id, user:users(id, name, email)')
      .eq('student_code', studentCode)
      .single();

    let userId: string;
    let studentId: string;
    let email: string;

    if (existingStudent && existingStudent.user_id) {
      userId = existingStudent.user_id;
      studentId = existingStudent.id;
      email = (existingStudent.user as any)?.email || `student_${studentCode.toLowerCase()}@exam.internal`;
      // Update name to what was entered
      await supabase.from('users').update({ name }).eq('id', userId);
    } else {
      const randSuffix = crypto.randomBytes(3).toString('hex');
      email = `guest_${Date.now()}_${randSuffix}@exam.internal`;
      const dummyPasswordHash = await hashPassword(crypto.randomBytes(16).toString('hex'));

      const { data: newUser, error: userErr } = await supabase
        .from('users')
        .insert({
          email,
          name,
          role: 'student',
          password_hash: dummyPasswordHash,
        })
        .select()
        .single();

      if (userErr || !newUser) {
        console.error('Create user error in passwordless login:', userErr);
        throw new Error('فشل إنشاء حساب الطالب');
      }

      userId = newUser.id;

      const { data: newStudent, error: studErr } = await supabase
        .from('students')
        .insert({
          user_id: userId,
          student_code: studentCode,
          class_name: className,
          status: 'active',
        })
        .select()
        .single();

      if (studErr || !newStudent) {
        console.error('Create student error in passwordless login:', studErr);
        throw new Error('فشل تسجيل بيانات الطالب');
      }

      studentId = newStudent.id;
    }

    const token = await createSession(userId);
    const cookieHeader = getSessionCookieHeader(token);

    const userData = {
      id: userId,
      email,
      name,
      role: 'student',
      studentId,
      studentCode,
      className,
      status: 'active',
      isGuest: true,
    };

    const response = NextResponse.json({
      ok: true,
      user: userData,
    });

    response.headers.set('Set-Cookie', cookieHeader);
    return response;
  } catch (error: any) {
    console.error('Passwordless login error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'حدث خطأ أثناء الدخول السريع' },
      { status: 500 }
    );
  }
}
