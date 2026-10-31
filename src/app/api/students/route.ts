import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, hashPassword } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك بالوصول (أدمن فقط)' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim().toLowerCase() || '';
    const status = searchParams.get('status')?.trim() || '';

    let query = supabase
      .from('students')
      .select('id, student_code, class_name, status, created_at, updated_at, user_id, user:users!inner(id, name, email)')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Fetch students error:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let results = (data || []).map((s: any) => ({
      id: s.id,
      userId: s.user_id,
      studentCode: s.student_code,
      className: s.class_name,
      status: s.status,
      createdAt: s.created_at,
      name: s.user?.name || '',
      email: s.user?.email || '',
    }));

    if (search) {
      results = results.filter(
        (s) =>
          s.name.toLowerCase().includes(search) ||
          s.studentCode.toLowerCase().includes(search) ||
          s.email.toLowerCase().includes(search) ||
          (s.className && s.className.toLowerCase().includes(search))
      );
    }

    return NextResponse.json({ ok: true, students: results });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك بالوصول (أدمن فقط)' }, { status: 403 });
    }

    const body = await req.json();
    const { name, email, password, studentCode, className, status } = body;

    if (!name || !email || !password || !studentCode) {
      return NextResponse.json(
        { ok: false, error: 'الاسم، البريد الإلكتروني، كلمة المرور، ورقم الجلوس/كود الطالب حقول مطلوبة' },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanCode = String(studentCode).trim();

    // Check duplicate email
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ ok: false, error: 'البريد الإلكتروني مسجل مسبقاً' }, { status: 400 });
    }

    // Check duplicate student code
    const { data: existingCode } = await supabase
      .from('students')
      .select('id')
      .eq('student_code', cleanCode)
      .maybeSingle();

    if (existingCode) {
      return NextResponse.json({ ok: false, error: 'كود الطالب مسجل مسبقاً لطالب آخر' }, { status: 400 });
    }

    // Create User
    const passwordHash = await hashPassword(password);
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        email: cleanEmail,
        password_hash: passwordHash,
        name: String(name).trim(),
        role: 'student',
      })
      .select()
      .single();

    if (userError || !newUser) {
      return NextResponse.json({ ok: false, error: userError?.message || 'فشل إنشاء حساب الطالب' }, { status: 500 });
    }

    // Create Student record
    const { data: newStudent, error: studentError } = await supabase
      .from('students')
      .insert({
        user_id: newUser.id,
        student_code: cleanCode,
        class_name: className ? String(className).trim() : '',
        status: status || 'active',
      })
      .select()
      .single();

    if (studentError || !newStudent) {
      // rollback user
      await supabase.from('users').delete().eq('id', newUser.id);
      return NextResponse.json({ ok: false, error: studentError?.message || 'فشل حفظ بيانات الطالب' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      student: {
        id: newStudent.id,
        userId: newUser.id,
        name: newUser.name,
        email: newUser.email,
        studentCode: newStudent.student_code,
        className: newStudent.class_name,
        status: newStudent.status,
        createdAt: newStudent.created_at,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
