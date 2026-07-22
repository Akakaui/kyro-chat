import { getDb } from '../db/init.js';
import crypto from 'crypto';
import { handleWebhook } from './stripe-webhook.js';
import { getUsage, trackUsage } from './usage.js';

// Re-export from split modules
export { handleWebhook, getUsage, trackUsage };

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

function getStripeHeaders(): Record<string, string> {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY environment variable is required');
  }
  return {
    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

// ── Plan definitions ──
export const PLANS = {
  free: {
    id: 'free', name: 'Free', price: 0, interval: 'month',
    limits: {
      messagesPerDay: 50, tokensPerDay: 10_000,
      browserEnabled: false, imageGenEnabled: false,
      customAgents: 1, knowledgeBases: 2,
    },
  },
  pro: {
    id: 'pro', name: 'Pro', price: 2000, interval: 'month',
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID || 'price_pro_monthly',
    limits: {
      messagesPerDay: -1, tokensPerDay: 100_000,
      browserEnabled: true, imageGenEnabled: true,
      customAgents: -1, knowledgeBases: -1,
    },
  },
  enterprise: {
    id: 'enterprise', name: 'Enterprise', price: -1, interval: 'month',
    limits: {
      messagesPerDay: -1, tokensPerDay: -1,
      browserEnabled: true, imageGenEnabled: true,
      customAgents: -1, knowledgeBases: -1,
    },
  },
} as const;

// ── Get or create Stripe customer ──
async function getOrCreateStripeCustomer(userId: string, email?: string): Promise<string> {
  const db = getDb();
  const sub = await db.prepare('SELECT stripe_customer_id FROM subscriptions WHERE user_id = ?').get(userId) as any;
  if (sub?.stripe_customer_id) return sub.stripe_customer_id;

  const params = new URLSearchParams();
  if (email) params.append('email', email);
  params.append('metadata[userId]', userId);

  const res = await fetch('https://api.stripe.com/v1/customers', {
    method: 'POST', headers: getStripeHeaders(), body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Stripe customer creation failed: ${(err as any).error?.message || res.statusText}`);
  }

  const customer = await res.json() as any;
  await db.prepare(`
    INSERT INTO subscriptions (id, user_id, stripe_customer_id, plan, status)
    VALUES (?, ?, ?, 'free', 'active')
    ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id
  `).run(crypto.randomUUID(), userId, customer.id);

  return customer.id;
}

// ── Create Checkout Session ──
export async function createCheckoutSession(userId: string, plan: string, email?: string): Promise<{ url: string }> {
  const planDef = PLANS[plan as keyof typeof PLANS];
  if (!planDef || !('stripePriceId' in planDef) || !planDef.stripePriceId) {
    throw new Error(`Invalid plan or no Stripe price ID: ${plan}`);
  }

  const customerId = await getOrCreateStripeCustomer(userId, email);
  const params = new URLSearchParams();
  params.append('customer', customerId);
  params.append('line_items[0][price]', planDef.stripePriceId);
  params.append('line_items[0][quantity]', '1');
  params.append('mode', 'subscription');
  params.append('success_url', `${FRONTEND_URL}/settings?billing=success`);
  params.append('cancel_url', `${FRONTEND_URL}/settings?billing=cancelled`);
  params.append('metadata[userId]', userId);
  params.append('metadata[plan]', plan);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST', headers: getStripeHeaders(), body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Stripe checkout failed: ${(err as any).error?.message || res.statusText}`);
  }

  const session = await res.json() as any;
  return { url: session.url };
}

// ── Create Customer Portal Session ──
export async function createPortalSession(customerId: string): Promise<{ url: string }> {
  const params = new URLSearchParams();
  params.append('customer', customerId);
  params.append('return_url', `${FRONTEND_URL}/settings`);

  const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST', headers: getStripeHeaders(), body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Stripe portal failed: ${(err as any).error?.message || res.statusText}`);
  }

  const session = await res.json() as any;
  return { url: session.url };
}

// ── Get user's subscription ──
export function getSubscription(userId: string) {
  const db = getDb();
  const sub = await db.prepare(`
    SELECT id, user_id, stripe_customer_id, stripe_subscription_id, plan, status,
           current_period_start, current_period_end, created_at, updated_at
    FROM subscriptions WHERE user_id = ?
  `).get(userId) as any;

  if (!sub) {
    return { id: null, plan: 'free', status: 'active', limits: PLANS.free.limits };
  }

  const planDef = PLANS[sub.plan as keyof typeof PLANS] || PLANS.free;
  return {
    id: sub.id, plan: sub.plan, status: sub.status,
    stripeCustomerId: sub.stripe_customer_id,
    currentPeriodStart: sub.current_period_start,
    currentPeriodEnd: sub.current_period_end,
    limits: planDef.limits,
  };
}
