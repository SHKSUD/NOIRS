import { createClient } from '@supabase/supabase-js';
export const G = 'https://generativelanguage.googleapis.com/v1beta';
export const err = (m, s = 500) => Response.json({ error: String(m) }, { status: s });
// Returns an error Response if any env var is missing, else null.
export const need = (...keys) => {
  const miss = keys.filter(k => !process.env[k]);
  return miss.length ? err(`Server not configured: set ${miss.join(', ')} in .env.local`, 503) : null;
};
export const supa = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
export const gkey = () => ({ 'x-goog-api-key': process.env.GEMINI_API_KEY });
