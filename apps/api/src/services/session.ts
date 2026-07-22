// ---------------------------------------------------------------------------
// Session Store
//
// Redis-backed session management for user sessions.
// Falls back to in-memory storage when Redis is unavailable.
// ---------------------------------------------------------------------------

import { getRedis, TTL } from './redis.js';
import type { Session, CreateSessionInput } from './session-types.js';
import { generateSessionId } from './session-types.js';

// ── Session Store ─────────────────────────────────────────────────────────

export class SessionStore {
  private sessions = new Map<string, Session>();
  private userSessions = new Map<string, Set<string>>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanup();
  }

  /**
   * Create a new session for a user.
   */
  async createSession(
    userId: string,
    dataOrOpts?: Record<string, unknown> | CreateSessionInput,
    ttlOverride?: number,
  ): Promise<Session> {
    let data: Record<string, unknown> = {};
    let ttl = ttlOverride ?? TTL.SESSION;

    if (dataOrOpts) {
      if ('data' in dataOrOpts && typeof dataOrOpts.data === 'object') {
        data = (dataOrOpts as CreateSessionInput).data ?? {};
        ttl = (dataOrOpts as CreateSessionInput).ttl ?? ttl;
      } else {
        data = dataOrOpts as Record<string, unknown>;
      }
    }

    const id = generateSessionId();
    const now = Date.now();
    const session: Session = {
      id, userId, data,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: now + ttl * 1000,
    };

    const redis = getRedis();
    const serialized = JSON.stringify(session);

    if (redis.isConnected()) {
      await redis.set(`session:${id}`, serialized, ttl);
      await redis.hset(`user:sessions:${userId}`, id, String(now));
      await redis.expire(`user:sessions:${userId}`, ttl);
    } else {
      this.sessions.set(id, session);
      const userSet = this.userSessions.get(userId) ?? new Set();
      userSet.add(id);
      this.userSessions.set(userId, userSet);
    }

    return session;
  }

  /**
   * Get a session by its ID.
   */
  async getSession(sessionId: string): Promise<Session | null> {
    const redis = getRedis();

    if (redis.isConnected()) {
      const raw = await redis.get(`session:${sessionId}`);
      if (!raw) return null;
      try {
        const session = JSON.parse(raw) as Session;
        session.lastAccessedAt = Date.now();
        await redis.set(`session:${sessionId}`, JSON.stringify(session), TTL.SESSION);
        return session;
      } catch {
        return null;
      }
    }

    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      this.removeFromUserIndex(session.userId, sessionId);
      return null;
    }
    session.lastAccessedAt = Date.now();
    return session;
  }

  /**
   * Update session data (merges with existing).
   */
  async updateSession(
    sessionId: string,
    data: Record<string, unknown>,
  ): Promise<Session | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    session.data = { ...session.data, ...data };
    session.lastAccessedAt = Date.now();

    const redis = getRedis();
    const serialized = JSON.stringify(session);

    if (redis.isConnected()) {
      await redis.set(`session:${sessionId}`, serialized, TTL.SESSION);
    } else {
      this.sessions.set(sessionId, session);
    }

    return session;
  }

  /**
   * Delete (invalidate) a session.
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const redis = getRedis();

    if (redis.isConnected()) {
      const raw = await redis.get(`session:${sessionId}`);
      if (!raw) return false;
      try {
        const session = JSON.parse(raw) as Session;
        await redis.hdel(`user:sessions:${session.userId}`, sessionId);
        await redis.del(`session:${sessionId}`);
        return true;
      } catch {
        await redis.del(`session:${sessionId}`);
        return true;
      }
    }

    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.sessions.delete(sessionId);
    this.removeFromUserIndex(session.userId, sessionId);
    return true;
  }

  /**
   * List all active sessions for a user.
   */
  async listUserSessions(userId: string): Promise<Session[]> {
    const redis = getRedis();
    const sessions: Session[] = [];

    if (redis.isConnected()) {
      const sessionIds = await redis.hgetall(`user:sessions:${userId}`);
      for (const sessionId of Object.keys(sessionIds)) {
        const session = await this.getSession(sessionId);
        if (session) {
          sessions.push(session);
        } else {
          await redis.hdel(`user:sessions:${userId}`, sessionId);
        }
      }
    } else {
      const ids = this.userSessions.get(userId);
      if (!ids) return [];
      for (const id of ids) {
        const session = this.sessions.get(id);
        if (session && Date.now() <= session.expiresAt) {
          sessions.push(session);
        }
      }
    }

    return sessions;
  }

  private removeFromUserIndex(userId: string, sessionId: string): void {
    const userSet = this.userSessions.get(userId);
    if (userSet) {
      userSet.delete(sessionId);
      if (userSet.size === 0) this.userSessions.delete(userId);
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions) {
        if (now > session.expiresAt) {
          this.sessions.delete(id);
          this.removeFromUserIndex(session.userId, id);
        }
      }
    }, 60_000);

    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────

let instance: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  if (!instance) {
    instance = new SessionStore();
  }
  return instance;
}

export function _resetSessionSingleton(): void {
  if (instance) {
    instance.stopCleanup();
    instance = null;
  }
}
