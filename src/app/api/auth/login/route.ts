import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyPassword, createSession, getSessionCookieHeader } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';

export async function POST(req: Request) {
  try {
    await ensureSeeded();

    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: 'البريد الإلكتروني وكلمة المرور مطلوبان' },
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
