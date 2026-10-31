import { supabase } from './supabase';
import { hashPassword } from './auth';

let seedAttempted = false;

export async function ensureSeeded() {
  if (seedAttempted) return;
  seedAttempted = true;

  try {
    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.warn('Seed check warning:', error.message);
      return;
    }

    if (count === 0) {
      console.log('🌱 Seeding initial admin and student accounts...');

      // 1. Create Admin
      const adminPassHash = await hashPassword('admin123');
      const { data: adminUser, error: adminErr } = await supabase
        .from('users')
        .insert({
          email: 'admin@exam.com',
          password_hash: adminPassHash,
          name: 'مدير النظام',
          role: 'admin',
        })
        .select()
        .single();

      if (adminErr) {
        console.error('Failed to seed admin:', adminErr);
      } else {
        console.log('✅ Admin user created: admin@exam.com');
      }

      // 2. Create Student
      const studentPassHash = await hashPassword('student123');
      const { data: studentUser, error: studentUserErr } = await supabase
        .from('users')
        .insert({
          email: 'student@exam.com',
          password_hash: studentPassHash,
          name: 'طالب تجريبي',
          role: 'student',
        })
        .select()
        .single();

      if (studentUserErr) {
        console.error('Failed to seed student user:', studentUserErr);
      } else if (studentUser) {
        const { error: studentErr } = await supabase.from('students').insert({
          user_id: studentUser.id,
          student_code: 'ST001',
          class_name: 'Class A',
          status: 'active',
        });
        if (studentErr) {
          console.error('Failed to seed student record:', studentErr);
        } else {
          console.log('✅ Student user created: student@exam.com (Code: ST001)');
        }
      }
    }
  } catch (err) {
    console.warn('Seed operation error:', err);
  }
}
