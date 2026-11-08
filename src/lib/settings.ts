import { supabase } from './supabase';

export interface SystemSettings {
  allowPasswordlessLogin: boolean;
}

const DEFAULT_SETTINGS: SystemSettings = {
  allowPasswordlessLogin: false,
};

const SYSTEM_CONFIG_EMAIL = 'system_settings@internal';

export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('password_hash')
      .eq('email', SYSTEM_CONFIG_EMAIL)
      .single();

    if (error || !data) {
      // Ensure row exists
      const { data: inserted } = await supabase
        .from('users')
        .insert({
          email: SYSTEM_CONFIG_EMAIL,
          name: 'System Settings',
          role: 'system',
          password_hash: JSON.stringify(DEFAULT_SETTINGS),
        })
        .select('password_hash')
        .single();

      if (inserted?.password_hash) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(inserted.password_hash) };
      }
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(data.password_hash || '{}');
    return {
      allowPasswordlessLogin: Boolean(parsed.allow_passwordless_login || parsed.allowPasswordlessLogin),
    };
  } catch (err) {
    console.error('Error fetching system settings:', err);
    return DEFAULT_SETTINGS;
  }
}

export async function updateSystemSettings(
  updates: Partial<SystemSettings>
): Promise<SystemSettings> {
  const current = await getSystemSettings();
  const next: SystemSettings = {
    ...current,
    ...updates,
  };

  const payload = {
    allow_passwordless_login: next.allowPasswordlessLogin,
  };

  const { error } = await supabase
    .from('users')
    .update({
      password_hash: JSON.stringify(payload),
      updated_at: new Date().toISOString(),
    })
    .eq('email', SYSTEM_CONFIG_EMAIL);

  if (error) {
    console.error('Error saving system settings:', error);
    throw new Error('فشل حفظ إعدادات النظام');
  }

  return next;
}
