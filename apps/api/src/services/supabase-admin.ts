import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Supabase admin client — used for server-side operations with elevated
// privileges (service_role key). NEVER expose this client to the browser.
// ---------------------------------------------------------------------------

let _adminClient: SupabaseClient | null = null;
let _anonClient: SupabaseClient | null = null;

interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

/**
 * Validate and return Supabase configuration from environment variables.
 * Throws at startup if required variables are missing from non-test environments.
 */
function getConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // In test environments, return empty config gracefully
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return { url: url || 'http://localhost:54321', anonKey: anonKey || 'test-key', serviceRoleKey: serviceRoleKey || 'test-svc-key' };
  }

  if (!url) {
    throw new Error('SUPABASE_URL environment variable is not set. Supabase is required for authentication.');
  }
  if (!anonKey) {
    throw new Error('SUPABASE_ANON_KEY environment variable is not set.');
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is not set. Get it from Supabase Dashboard > Settings > API.');
  }

  return { url, anonKey, serviceRoleKey };
}

/**
 * Get the Supabase admin client (service_role).
 * Use this for server-side operations like token verification, user management, etc.
 * IMPORTANT: Never expose this client or its results to the client side.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    const config = getConfig();
    _adminClient = createClient(config.url, config.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return _adminClient;
}

/**
 * Get the Supabase anon client for public operations.
 * Use this when you need the public-facing client on the server.
 */
export function getSupabaseAnon(): SupabaseClient {
  if (!_anonClient) {
    const config = getConfig();
    _anonClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return _anonClient;
}

/**
 * Verify a bearer token using Supabase Auth.
 * Returns the user object if valid, or null if invalid/expired.
 */
export async function verifyToken(token: string): Promise<{
  id: string;
  email: string;
  sessionId?: string;
} | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user || !user.email) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      sessionId: user.last_sign_in_at || undefined,
    };
  } catch (err) {
    console.error('[supabase-admin] Token verification failed:', err);
    return null;
  }
}

/**
 * Refresh a Supabase session token.
 * Returns the new session if successful, null otherwise.
 */
export async function refreshSession(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
} | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session) {
      return null;
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at || 0,
    };
  } catch (err) {
    console.error('[supabase-admin] Session refresh failed:', err);
    return null;
  }
}

/**
 * Manually refresh the admin client (useful if the service_role key is rotated).
 */
export function resetAdminClient(): void {
  if (_adminClient) {
    _adminClient = null;
  }
}

/**
 * Manually refresh the anon client.
 */
export function resetAnonClient(): void {
  if (_anonClient) {
    _anonClient = null;
  }
}

export type { SupabaseClient };
