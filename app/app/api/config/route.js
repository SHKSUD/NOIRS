import { isMockAuth } from '../../../lib/auth';
// Public, browser-safe settings for the login screen (anon key is designed to be public).
export async function GET() {
  return Response.json({
    mockAuth: isMockAuth(),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null,
  });
}
