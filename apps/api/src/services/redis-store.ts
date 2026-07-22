// ---------------------------------------------------------------------------
// In-Memory Redis Fallback Store
//
// A Map-based store that mimics basic Redis operations.
// Used when the real Redis server is unavailable.
// ---------------------------------------------------------------------------

interface MemoryEntry {
  value: unknown;
  expiresAt: number | null;
}

export class InMemoryStore {
  private data = new Map<string, MemoryEntry>();
  private lists = new Map<string, string[]>();
  private hashes = new Map<string, Map<string, string>>();

  // ── Key-Value ───────────────────────────────────────────────────────────

  get(key: string): string | null {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.data.delete(key);
      return null;
    }
    return entry.value as string;
  }

  set(key: string, value: string, ttlSeconds?: number): void {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.data.set(key, { value, expiresAt });
  }

  del(key: string): number {
    const existed = this.data.has(key) || this.lists.has(key) || this.hashes.has(key);
    this.data.delete(key);
    this.lists.delete(key);
    this.hashes.delete(key);
    return existed ? 1 : 0;
  }

  exists(key: string): boolean {
    const entry = this.data.get(key);
    if (!entry) return false;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.data.delete(key);
      return false;
    }
    return true;
  }

  expire(key: string, seconds: number): boolean {
    const entry = this.data.get(key);
    if (!entry) return false;
    entry.expiresAt = Date.now() + seconds * 1000;
    return true;
  }

  incr(key: string): number {
    this.purgeExpired(key);
    const current = parseInt(this.get(key) || '0', 10);
    const next = current + 1;
    this.set(key, String(next));
    return next;
  }

  decr(key: string): number {
    const current = parseInt(this.get(key) || '0', 10);
    const next = current - 1;
    this.set(key, String(next));
    return next;
  }

  // ── Lists ───────────────────────────────────────────────────────────────

  lpush(key: string, value: string): number {
    let list = this.lists.get(key);
    if (!list) {
      list = [];
      this.lists.set(key, list);
    }
    list.unshift(value);
    return list.length;
  }

  rpop(key: string): string | null {
    const list = this.lists.get(key);
    if (!list || list.length === 0) return null;
    const val = list.pop() ?? null;
    if (list.length === 0) this.lists.delete(key);
    return val;
  }

  llen(key: string): number {
    return this.lists.get(key)?.length ?? 0;
  }

  lrange(key: string, start: number, stop: number): string[] {
    const list = this.lists.get(key) ?? [];
    if (start < 0) start = Math.max(list.length + start, 0);
    if (stop < 0) stop = list.length + stop;
    return list.slice(start, stop + 1);
  }

  // ── Hashes ──────────────────────────────────────────────────────────────

  hget(key: string, field: string): string | null {
    return this.hashes.get(key)?.get(field) ?? null;
  }

  hset(key: string, field: string, value: string): number {
    let hash = this.hashes.get(key);
    if (!hash) {
      hash = new Map();
      this.hashes.set(key, hash);
    }
    const isNew = !hash.has(field);
    hash.set(field, value);
    return isNew ? 1 : 0;
  }

  hgetall(key: string): Record<string, string> {
    const hash = this.hashes.get(key);
    if (!hash) return {};
    const result: Record<string, string> = {};
    for (const [k, v] of hash) result[k] = v;
    return result;
  }

  hdel(key: string, field: string): number {
    const hash = this.hashes.get(key);
    if (!hash) return 0;
    const existed = hash.delete(field);
    if (hash.size === 0) this.hashes.delete(key);
    return existed ? 1 : 0;
  }

  // ── Admin ───────────────────────────────────────────────────────────────

  ping(): string {
    return 'PONG';
  }

  flush(): void {
    this.data.clear();
    this.lists.clear();
    this.hashes.clear();
  }

  quit(): void {
    this.flush();
  }

  /** Get all stored keys (for pattern scanning). */
  getKeys(): string[] {
    const keys = new Set<string>();
    for (const key of this.data.keys()) keys.add(key);
    for (const key of this.lists.keys()) keys.add(key);
    for (const key of this.hashes.keys()) keys.add(key);
    return [...keys];
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private purgeExpired(key: string): void {
    const entry = this.data.get(key);
    if (entry && entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.data.delete(key);
    }
  }
}
