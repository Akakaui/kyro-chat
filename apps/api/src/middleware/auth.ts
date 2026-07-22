import { createClient } from '@supabase/supabase-js';
import type { Context, Next } from 'hono';
import type { AuthenticatedUser } from './enhanced-auth.js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid authorization header' }, 401);
  }

  const token = authHeader.split(' ')[1];

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  c.set('user', {
    id: user.id,
    email: user.email!,
    roles: [],
    permissions: [],
    ipAddress: '',
    requestId: '',
  });

  await next();
}
