import { supa, err, need } from '../../../lib/supa';
import { requireUser } from '../../../lib/auth';
import { isMock, mockProjects } from '../../../lib/mock';
// Projects belong to the signed-in user.
const mock = () => isMock('SUPABASE_SERVICE_ROLE_KEY') || isMock('NEXT_PUBLIC_SUPABASE_URL');
export async function GET(req) {
  const { user, res } = await requireUser(req); if (res) return res;
  if (mock()) return Response.json(mockProjects.list(user.id));
  const miss = need('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'); if (miss) return miss;
  const { data, error } = await supa().from('projects').select('data').eq('user_id', user.id).order('at', { ascending: false });
  return error ? err(error.message) : Response.json(data.map(r => r.data));
}
export async function POST(req) {
  const { user, res } = await requireUser(req); if (res) return res;
  const { id, data } = await req.json();
  if (!id || typeof id !== 'string' || id.length > 80) return err('bad id', 400);
  if (mock()) { mockProjects.save(user.id, id, data); return Response.json({ ok: true }); }
  const miss = need('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'); if (miss) return miss;
  const { error } = await supa().from('projects').upsert({ id: user.id + ':' + id, user_id: user.id, at: Date.now(), data });
  return error ? err(error.message) : Response.json({ ok: true });
}
