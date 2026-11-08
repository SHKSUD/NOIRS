import { supa, err } from './supa';

// Dev-only fake login: on in `next dev` when MOCK_AI=1 or Supabase keys are missing. Never in production.
export const isMockAuth = () =>
  process.env.NODE_ENV !== 'production' &&
  (process.env.MOCK_AI === '1' || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY);

export const MOCK_TOKEN = 'mock-dev-token';
const MOCK_USER = { id: '00000000-0000-4000-8000-000000000001', email: 'dev@localhost', user_metadata: { full_name: 'Dev Director' } };

// Returns the signed-in Supabase user for this request, or null.
export async function getUser(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  if (isMockAuth()) return token === MOCK_TOKEN ? MOCK_USER : null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const { data, error } = await supa().auth.getUser(token);
  return error ? null : data.user;
}

// Usage: const { user, res } = await requireUser(req); if (res) return res;
export async function requireUser(req) {
  const user = await getUser(req);
  return user ? { user } : { res: err('Please sign in to continue.', 401) };
}
