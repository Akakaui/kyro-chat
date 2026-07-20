import { getDb } from '../db/init.js';
import crypto from 'crypto';

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// ── Handle Stripe Webhook (idempotent) ──
export async function handleWebhook(payload: string, signature: string): Promise<{ handled: boolean; type?: string }> {
  // Fail closed: reject all webhooks when the signing secret is not configured.
  // This prevents accepting unverified (potentially forged) payloads.
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET is not set — refusing to process webhook');
    throw new Error('Webhook secret not configured');
  }

  if (!signature) {
    throw new Error('Missing stripe-signature header');
  }

  // Verify HMAC signature before trusting the payload
  try {
    const parts = Object.fromEntries(
      signature.split(',').map(p => p.split('=').map(s => s.trim()))
    );
    const timestamp = parseInt(parts.t || '0', 10);
    const receivedSignature = parts.v1;
    if (!receivedSignature || !timestamp) {
      throw new Error('Malformed signature');
    }

    // Reject webhooks older than 5 minutes to prevent replay attacks
    const age = Math.floor(Date.now() / 1000) - timestamp;
    if (age > 300) {
      throw new Error('Webhook timestamp too old (possible replay)');
    }

    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', STRIPE_WEBHOOK_SECRET)
      .update(signedPayload)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(expectedSignature))) {
      throw new Error('Invalid webhook signature');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Invalid webhook signature')) {
      throw err;
    }
    throw new Error('Invalid webhook signature');
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    throw new Error('Invalid webhook payload');
  }

  const db = getDb();
  const eventType = event.type as string;
  const eventId = event.id as string;

  // Idempotency check
  const existing = db.prepare(`SELECT 1 FROM usage_tracking WHERE id = ?`).get(eventId);
  if (existing) return { handled: true, type: eventType };

  switch (eventType) {
    case 'checkout.session.completed': {
      const session = event.data?.object;
      const userId = session?.metadata?.userId;
      const plan = session?.metadata?.plan || 'pro';
      if (!userId) break;

      db.prepare(`
        INSERT INTO subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_start, current_period_end, updated_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?, unixepoch())
        ON CONFLICT(user_id) DO UPDATE SET
          stripe_subscription_id = excluded.stripe_subscription_id,
          plan = excluded.plan,
          status = 'active',
          current_period_start = excluded.current_period_start,
          current_period_end = excluded.current_period_end,
          updated_at = unixepoch()
      `).run(
        crypto.randomUUID(), userId,
        session.customer, session.subscription,
        plan, session.current_period_start, session.current_period_end
      );
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data?.object;
      if (!sub) break;

      const status = sub.status === 'active' ? 'active'
        : sub.status === 'past_due' ? 'past_due'
        : sub.status === 'canceled' ? 'canceled'
        : 'active';

      db.prepare(`
        UPDATE subscriptions SET
          status = ?,
          current_period_start = ?,
          current_period_end = ?,
          updated_at = unixepoch()
        WHERE stripe_subscription_id = ?
      `).run(status, sub.current_period_start, sub.current_period_end, sub.id);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data?.object;
      if (!sub) break;

      db.prepare(`
        UPDATE subscriptions SET status = 'canceled', plan = 'free', updated_at = unixepoch()
        WHERE stripe_subscription_id = ?
      `).run(sub.id);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data?.object;
      if (!invoice?.subscription) break;

      db.prepare(`
        UPDATE subscriptions SET status = 'past_due', updated_at = unixepoch()
        WHERE stripe_subscription_id = ?
      `).run(invoice.subscription);
      break;
    }
  }

  return { handled: true, type: eventType };
}
