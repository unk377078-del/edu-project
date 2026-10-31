import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { supabase } from './supabase';

export interface UserSessionData {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'student';
  studentId?: string;
  studentCode?: string;
  className?: string;
  studentStatus?: string;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(userId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('sessions').insert({
    token,
    user_id: userId,
    expires_at: expiresAt,
  });

  if (error) {
    console.error('Error creating session:', error);
    throw new Error('Failed to create session');
  }

  return token;
}

export async function deleteSession(token: string): Promise<void> {
  await supabase.from('sessions').delete().eq('token', token);
}

export async function getSessionTokenFromRequest(req?: Request): Promise<string | null> {
  if (req) {
    const cookieHeader = req.headers.get('cookie') || '';
    const match = cookieHeader.match(/exam_session=([^;]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('exam_session')?.value;
    return token || null;
  } catch {
    return null;
  }
}

export async function getCurrentUser(req?: Request): Promise<UserSessionData | null> {
  const token = await getSessionTokenFromRequest(req);
  if (!token) return null;

  // Find active session in Supabase sessions table
  const now = new Date().toISOString();
  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .select('user_id, expires_at')
    .eq('token', token)
    .gt('expires_at', now)
    .single();

  if (sessionErr || !session) {
    return null;
  }

  // Fetch user info from users table
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('id', session.user_id)
    .single();

  if (userErr || !user) {
    return null;
  }

  const result: UserSessionData = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as 'admin' | 'student',
  };

  // If student, attach student details
  if (user.role === 'student') {
    const { data: student } = await supabase
      .from('students')
      .select('id, student_code, class_name, status')
      .eq('user_id', user.id)
      .single();

    if (student) {
      result.studentId = student.id;
      result.studentCode = student.student_code;
      result.className = student.class_name;
      result.studentStatus = student.status;
    }
  }

  return result;
}

export function getSessionCookieHeader(token: string, maxAgeDays = 7): string {
  const maxAge = maxAgeDays * 24 * 60 * 60;
  return `exam_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function getLogoutCookieHeader(): string {
  return `exam_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
