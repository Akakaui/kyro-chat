import { createClient, type SupabaseClient, type AuthError } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Enhanced Supabase client for Kyro Chat
// Handles:
//   - Lazy client initialization (safe for SSR)
//   - Token expiration detection and auto-refresh
//   - Session persistence via localStorage
//   - Auth state change listeners
// ---------------------------------------------------------------------------

// ── Types ─────────────────────────────────────────────────────────────────

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  error: AuthError | null;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  user: User | null;
}

export interface User {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

// ── Configuration ─────────────────────────────────────────────────────────

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';
  return { supabaseUrl, supabaseAnonKey };
}

// ── Client initialization ─────────────────────────────────────────────────

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
    _client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'kyro-auth-token',
      },
    });
  }
  return _client;
}

// Lazy getter — avoids crashing during SSR prerender when env vars are missing
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseClient() as any)[prop];
  },
});

// ── Auth helpers ──────────────────────────────────────────────────────────

/**
 * Sign in with email and password.
 * Returns the session and handles errors gracefully.
 */
export async function signIn(email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Map common auth errors to user-friendly messages
      const message = mapAuthError(error);
      return { data: null, error: { ...error, message } };
    }

    // Store token in localStorage for API calls
    if (data.session) {
      localStorage.setItem('token', data.session.access_token);
      localStorage.setItem('refresh_token', data.session.refresh_token);
    }

    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'An unexpected error occurred' } };
  }
}

/**
 * Sign up with email and password.
 */
export async function signUp(email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      const message = mapAuthError(error);
      return { data: null, error: { ...error, message } };
    }

    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'An unexpected error occurred' } };
  }
}

/**
 * Sign out and clear local state.
 */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();

    // Clear local token regardless of server response
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');

    return { error };
  } catch (err: any) {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    return { error: { message: err.message } };
  }
}

/**
 * Get the current session.
 * This will automatically refresh if the token is expired.
 */
export async function getSession(): Promise<{ session: Session | null; error: AuthError | null }> {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      return { session: null, error };
    }

    if (data.session) {
      // Store/update the token
      localStorage.setItem('token', data.session.access_token);
      if (data.session.refresh_token) {
        localStorage.setItem('refresh_token', data.session.refresh_token);
      }

      return {
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at || 0,
          expires_in: data.session.expires_in || 0,
          user: data.session.user
            ? {
                id: data.session.user.id,
                email: data.session.user.email || '',
                user_metadata: data.session.user.user_metadata,
                app_metadata: data.session.user.app_metadata,
              }
            : null,
        },
        error: null,
      };
    }

    return { session: null, error: null };
  } catch (err: any) {
    return { session: null, error: err };
  }
}

/**
 * Get the current user. Returns null if not authenticated.
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return null;
    }

    return {
      id: data.user.id,
      email: data.user.email || '',
      user_metadata: data.user.user_metadata,
      app_metadata: data.user.app_metadata,
    };
  } catch {
    return null;
  }
}

/**
 * Force-refresh the session token.
 * Call this when you get a 401 response from the API.
 */
export async function refreshSession(): Promise<Session | null> {
  try {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      return null;
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      // Refresh failed, clear everything
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      return null;
    }

    // Update stored tokens
    localStorage.setItem('token', data.session.access_token);
    if (data.session.refresh_token) {
      localStorage.setItem('refresh_token', data.session.refresh_token);
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at || 0,
      expires_in: data.session.expires_in || 0,
      user: data.session.user
        ? {
            id: data.session.user.id,
            email: data.session.user.email || '',
            user_metadata: data.session.user.user_metadata,
            app_metadata: data.session.user.app_metadata,
          }
        : null,
    };
  } catch {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    return null;
  }
}

/**
 * Check if the current token is expired or about to expire.
 * Returns true if token should be refreshed.
 */
export function isTokenExpired(): boolean {
  const token = localStorage.getItem('token');
  if (!token) return true;

  try {
    // Decode JWT to check expiry
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.exp) return true;

    // Consider expired 30 seconds before actual expiry
    return payload.exp * 1000 < Date.now() + 30_000;
  } catch {
    return true;
  }
}

/**
 * Get the valid access token. Refreshes if necessary.
 */
export async function getValidToken(): Promise<string | null> {
  if (isTokenExpired()) {
    const session = await refreshSession();
    return session?.access_token || null;
  }

  return localStorage.getItem('token');
}

// ── Error mapping ─────────────────────────────────────────────────────────

function mapAuthError(error: AuthError): string {
  const message = error.message.toLowerCase();

  if (message.includes('invalid login credentials') || message.includes('invalid email or password')) {
    return 'Invalid email or password. Please try again.';
  }
  if (message.includes('email not confirmed')) {
    return 'Email not confirmed. Please check your inbox.';
  }
  if (message.includes('user already registered')) {
    return 'An account with this email already exists.';
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return 'Too many attempts. Please wait a moment before trying again.';
  }
  if (message.includes('expired') || message.includes('token')) {
    return 'Session expired. Please sign in again.';
  }

  return error.message;
}
