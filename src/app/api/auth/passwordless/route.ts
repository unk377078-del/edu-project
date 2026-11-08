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
    // Normalize phone number: convert Arabic digits (٠-٩) and remove any spaces/dashes
    const phone = String(body.phone || body.studentCode || '')
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
      .replace(/[\s\-\+]/g, '')
      .trim();

    if (!name || name.length < 2) {
      return NextResponse.json(
        { ok: false, error: 'يرجى إدخال اسم الطالب بالكامل (حرفين على الأقل)' },
        { status: 400 }
      );
    }

    if (!phone || phone.length < 6) {
      return NextResponse.json(
        { ok: false, error: 'يرجى إدخال رقم هاتف صحيح (6 أرقام على الأقل)' },
        { status: 400 }
      );
    }

    // Use phone number directly as student_code
    const studentCode = phone;

    // Check if student with this phone number already exists
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
      email = (existingStudent.user as any)?.email || `phone_${phone}@guest.exam`;
      // Update name to what was entered
      await supabase.from('users').update({ name }).eq('id', userId);
    } else {
      const randSuffix = crypto.randomBytes(3).toString('hex');
      email = `phone_${phone}_${randSuffix}@guest.exam`;
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
          class_name: 'طالب زائر (هاتف: ' + phone + ')',
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
      className: 'طالب زائر',
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
