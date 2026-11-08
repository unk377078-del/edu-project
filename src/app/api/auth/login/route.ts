import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { verifyPassword, createSession, getSessionCookieHeader, hashPassword } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';

export async function POST(req: Request) {
  try {
    await ensureSeeded();

    const body = await req.json();

    // 1. Student Login via Name + Phone Number (Primary Login Method)
    if (body.name || body.phone) {
      const name = String(body.name || '').trim();
      const phone = String(body.phone || '')
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
        // Keep name updated
        await supabase.from('users').update({ name }).eq('id', userId);
      } else {
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
    }

    // 2. Admin Login via Email + Password
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: 'الاسم ورقم الهاتف مطلوبان لتسجيل الدخول' },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Fetch user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: 'بيانات تسجيل الدخول غير صحيحة' },
        { status: 401 }
      );
    }

    // Check password
    const isMatch = await verifyPassword(password, user.password_hash);
    if (!isMatch) {
      return NextResponse.json(
        { ok: false, error: 'بيانات تسجيل الدخول غير صحيحة' },
        { status: 401 }
      );
    }

    // Create session token in Supabase
    const token = await createSession(user.id);

    // Get student details if role is student
    let studentDetails = null;
    if (user.role === 'student') {
      const { data: student } = await supabase
        .from('students')
        .select('*')
        .eq('user_id', user.id)
        .single();
      studentDetails = student;
    }

    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      studentId: studentDetails?.id,
      studentCode: studentDetails?.student_code,
      className: studentDetails?.class_name,
      status: studentDetails?.status,
    };

    const cookieHeader = getSessionCookieHeader(token);

    const response = NextResponse.json({
      ok: true,
      user: userData,
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
