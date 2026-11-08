import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { verifyPassword, createSession, getSessionCookieHeader, hashPassword } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';
import { getSystemSettings } from '@/lib/settings';

export async function POST(req: Request) {
  try {
    await ensureSeeded();

    const body = await req.json();
    const inputName = String(body.name || body.email || '').trim();
    const inputPhone = String(body.phone || body.password || '').trim();

    // 1. Check for Admin Login (Secret entry through the same 2 fields)
    const cleanEmail = inputName.toLowerCase();
    if (cleanEmail === 'admin@exam.com' || cleanEmail.includes('@')) {
      const { data: adminUser } = await supabase
        .from('users')
        .select('*')
        .eq('email', cleanEmail)
        .eq('role', 'admin')
        .single();

      if (adminUser) {
        const isMatch = await verifyPassword(inputPhone, adminUser.password_hash);
        if (isMatch) {
          const token = await createSession(adminUser.id);
          const cookieHeader = getSessionCookieHeader(token);
          const response = NextResponse.json({
            ok: true,
            user: {
              id: adminUser.id,
              email: adminUser.email,
              name: adminUser.name,
              role: 'admin',
            },
          });
          response.headers.set('Set-Cookie', cookieHeader);
          return response;
        } else {
          return NextResponse.json(
            { ok: false, error: 'بيانات الدخول غير صحيحة' },
            { status: 401 }
          );
        }
      }
    }

    // 2. Student Login via Name + Phone Number
    const name = inputName;
    const phone = inputPhone
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

    // Check if student with this phone exists
    const { data: existingStudent } = await supabase
      .from('students')
      .select('id, student_code, user_id, user:users(id, name, email)')
      .eq('student_code', phone)
      .single();

    let userId: string;
    let studentId: string;
    let email: string;

    if (existingStudent && existingStudent.user_id) {
      userId = existingStudent.user_id;
      studentId = existingStudent.id;
      email = (existingStudent.user as any)?.email || `student_${phone}@exam.internal`;
      await supabase.from('users').update({ name }).eq('id', userId);
    } else {
      const settings = await getSystemSettings();
      if (!settings.allowPasswordlessLogin) {
        return NextResponse.json(
          {
            ok: false,
            error: 'خاصية الدخول المباشر بدون تسجيل مسبق غير مفعلة حالياً من قبل الإدارة. يرجى التواصل مع المشرف.',
          },
          { status: 403 }
        );
      }

      const randSuffix = crypto.randomBytes(3).toString('hex');
      email = `student_${phone}_${randSuffix}@exam.internal`;
      const dummyPasswordHash = await hashPassword(crypto.randomBytes(16).toString('hex'));

      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          email,
          name,
          role: 'student',
          password_hash: dummyPasswordHash,
        })
        .select()
        .single();

      if (userError || !newUser) {
        throw new Error('فشل إنشاء حساب الطالب');
      }

      userId = newUser.id;

      const { data: newStudent, error: studError } = await supabase
        .from('students')
        .insert({
          user_id: userId,
          student_code: phone,
          class_name: 'طالب',
          status: 'active',
        })
        .select()
        .single();

      if (studError || !newStudent) {
        throw new Error('فشل تسجيل بيانات الطالب');
      }

      studentId = newStudent.id;
    }

    const token = await createSession(userId);
    const cookieHeader = getSessionCookieHeader(token);

    const response = NextResponse.json({
      ok: true,
      user: {
        id: userId,
        email,
        name,
        role: 'student',
        studentId,
        studentCode: phone,
        className: 'طالب',
        status: 'active',
      },
    });

    response.headers.set('Set-Cookie', cookieHeader);
    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'حدث خطأ أثناء تسجيل الدخول' },
      { status: 500 }
    );
  }
}
