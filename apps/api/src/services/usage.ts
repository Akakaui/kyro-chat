import { getDb } from '../db/init.js';

// ── Get user's usage for current period ──
export function getUsage(userId: string) {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const dayStart = now - (now % 86400);

  const rows = await db.prepare(`
    SELECT metric, SUM(count) as total
    FROM usage_tracking
    WHERE user_id = ? AND period_start >= ?
    GROUP BY metric
  `).all(userId, dayStart) as any[];

  const usage: Record<string, number> = {};
  for (const row of rows) {
    usage[row.metric] = row.total;
  }

  return {
    messages: usage.messages || 0,
    tokens: usage.tokens || 0,
    browserSessions: usage.browser_sessions || 0,
    imageGenerations: usage.image_generations || 0,
  };
}

// ── Increment usage counter ──
export function trackUsage(userId: string, metric: string, count: number = 1): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const dayStart = now - (now % 86400);
  const dayEnd = dayStart + 86400;

  await db.prepare(`
    INSERT INTO usage_tracking (id, user_id, metric, count, period_start, period_end)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT DO UPDATE SET count = count + excluded.count
  `).run(crypto.randomUUID(), userId, metric, count, dayStart, dayEnd);
}

// Need crypto for UUID generation
import crypto from 'crypto';
