import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, hashPassword } from '@/lib/auth';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك بالوصول' }, { status: 403 });
    }

    const params = await context.params;
    const { id } = params;

    const { data: student, error } = await supabase
      .from('students')
      .select('id, student_code, class_name, status, created_at, updated_at, user_id, user:users(id, name, email)')
      .eq('id', id)
      .single();

    if (error || !student) {
      return NextResponse.json({ ok: false, error: 'الطالب غير موجود' }, { status: 404 });
    }

    const studentData = {
      id: student.id,
      userId: student.user_id,
      name: (student.user as any)?.name || '',
      email: (student.user as any)?.email || '',
      studentCode: student.student_code,
      className: student.class_name,
      status: student.status,
      createdAt: student.created_at,
    };

    return NextResponse.json({ ok: true, student: studentData });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك بالوصول' }, { status: 403 });
    }

    const params = await context.params;
    const { id } = params;
    const body = await req.json();
    const { name, email, password, studentCode, className, status } = body;

    // Get existing student
    const { data: student, error: fetchErr } = await supabase
      .from('students')
      .select('id, user_id, student_code')
      .eq('id', id)
      .single();

    if (fetchErr || !student) {
      return NextResponse.json({ ok: false, error: 'الطالب غير موجود' }, { status: 404 });
    }

    // Check duplicate student code if changed
    if (studentCode && studentCode !== student.student_code) {
      const { data: existingCode } = await supabase
        .from('students')
        .select('id')
        .eq('student_code', String(studentCode).trim())
        .neq('id', id)
        .maybeSingle();

      if (existingCode) {
        return NextResponse.json({ ok: false, error: 'كود الطالب مسجل بالفعل لطالب آخر' }, { status: 400 });
      }
    }

    // Update students table
    const studentUpdates: any = {
      updated_at: new Date().toISOString(),
    };
    if (studentCode !== undefined) studentUpdates.student_code = String(studentCode).trim();
    if (className !== undefined) studentUpdates.class_name = String(className).trim();
    if (status !== undefined) studentUpdates.status = status;

    const { error: studentUpErr } = await supabase
      .from('students')
      .update(studentUpdates)
      .eq('id', id);

    if (studentUpErr) {
      return NextResponse.json({ ok: false, error: studentUpErr.message }, { status: 500 });
    }

    // Update users table
    const userUpdates: any = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) userUpdates.name = String(name).trim();
    if (email !== undefined) {
      const cleanEmail = String(email).trim().toLowerCase();
      // Check duplicate email
      const { data: existingEmail } = await supabase
        .from('users')
        .select('id')
        .eq('email', cleanEmail)
        .neq('id', student.user_id)
        .maybeSingle();

      if (existingEmail) {
        return NextResponse.json({ ok: false, error: 'البريد الإلكتروني مسجل بالفعل لمستخدم آخر' }, { status: 400 });
      }
      userUpdates.email = cleanEmail;
    }
    if (password && String(password).trim().length > 0) {
      userUpdates.password_hash = await hashPassword(String(password).trim());
    }

    const { error: userUpErr } = await supabase
      .from('users')
      .update(userUpdates)
      .eq('id', student.user_id);

    if (userUpErr) {
      return NextResponse.json({ ok: false, error: userUpErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'تم تحديث بيانات الطالب بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'غير مصرح لك بالوصول' }, { status: 403 });
    }

    const params = await context.params;
    const { id } = params;

    const { data: student, error: fetchErr } = await supabase
      .from('students')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (fetchErr || !student) {
      return NextResponse.json({ ok: false, error: 'الطالب غير موجود' }, { status: 404 });
    }

    // Delete user (cascades to student, attempts, answers)
    const { error: delErr } = await supabase.from('users').delete().eq('id', student.user_id);

    if (delErr) {
      return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'تم حذف الطالب بنجاح' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
