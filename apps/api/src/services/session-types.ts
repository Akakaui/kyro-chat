// ---------------------------------------------------------------------------
// Session Store Types
// ---------------------------------------------------------------------------

export interface Session {
  id: string;
  userId: string;
  data: Record<string, unknown>;
  createdAt: number;
  lastAccessedAt: number;
  expiresAt: number;
}

export interface CreateSessionInput {
  /** Arbitrary session data to store */
  data?: Record<string, unknown>;
  /** TTL in seconds (defaults to TTL.SESSION = 3600) */
  ttl?: number;
}

// ── ID generator ──────────────────────────────────────────────────────────

let idCounter = 0;

export function generateSessionId(): string {
  idCounter++;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  const extra = Math.random().toString(36).slice(2, 6);
  return `sess_${ts}_${rand}_${extra}`;
}
