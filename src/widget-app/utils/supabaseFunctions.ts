export const OMAFIT_SUPABASE_URL_FALLBACK = 'https://lhkgnirolvbmomeduoaj.supabase.co';
export const OMAFIT_SUPABASE_ANON_KEY_FALLBACK =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxoa2duaXJvbHZibW9tZWR1b2FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NjE2NDYsImV4cCI6MjA2MzMzNzY0Nn0.aSBMJMT8TiAqvdO_Z9D_oINLaQrFMZIK5IEQJG6KaOI';

export function getSupabaseProjectUrl(): string {
  const raw = String(
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || '',
  ).trim();
  if (raw && /^https?:\/\//i.test(raw)) {
    return raw.replace(/\/$/, '');
  }
  return OMAFIT_SUPABASE_URL_FALLBACK;
}

export function getSupabaseAnonKey(): string {
  const raw = String(
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || '',
  ).trim();
  return raw || OMAFIT_SUPABASE_ANON_KEY_FALLBACK;
}

export function getSupabaseFunctionUrl(functionName: string, subPath = ''): string {
  const base = getSupabaseProjectUrl();
  const slug = String(functionName || '').replace(/^\/+/, '').replace(/\/+$/, '');
  const suffix = subPath ? `/${String(subPath).replace(/^\/+/, '')}` : '';
  return `${base}/functions/v1/${slug}${suffix}`;
}

export function getSupabaseFunctionHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  const anonKey = getSupabaseAnonKey();
  return {
    Authorization: `Bearer ${anonKey}`,
    apikey: anonKey,
    ...extra,
  };
}
