import { Hono } from 'hono';
import {
  PLANS, getSubscription, getUsage, trackUsage,
  createCheckoutSession, createPortalSession, handleWebhook,
} from '../services/stripe.js';
import { sanitizeError } from '../lib/sanitize-error.js';

export const billingRoutes = new Hono();

// ── GET /billing/subscription — Get current subscription ──
billingRoutes.get('/subscription', async (c) => {
  const user = c.get('user');
  try {
    const subscription = getSubscription(user.id);
    return c.json({ subscription });
  } catch (err: any) {
    console.error('[Billing] Failed to fetch subscription:', err.message);
    return c.json({ error: 'Failed to fetch subscription' }, 500);
  }
});

// ── POST /billing/checkout — Create Stripe Checkout session ──
billingRoutes.post('/checkout', async (c) => {
  const user = c.get('user');
  const { plan } = await c.req.json();

  if (!plan || !PLANS[plan as keyof typeof PLANS]) {
    return c.json({ error: 'Invalid plan. Must be: free, pro, enterprise' }, 400);
  }

  if (plan === 'free' || plan === 'enterprise') {
    return c.json({ error: 'Free plan is default. Enterprise requires contact sales.' }, 400);
  }

  try {
    const { url } = await createCheckoutSession(user.id, plan, user.email);
    return c.json({ url });
  } catch (err: any) {
    console.error('[Billing] Checkout session failed:', err.message);
    return c.json({ error: 'Payment processing failed. Please try again.' }, 500);
  }
});

// ── POST /billing/portal — Create Stripe Customer Portal ──
billingRoutes.post('/portal', async (c) => {
  const user = c.get('user');

  try {
    const subscription = getSubscription(user.id);
    const customerId = (subscription as any).stripeCustomerId;

    if (!customerId) {
      return c.json({ error: 'No billing account found. Upgrade to a paid plan first.' }, 400);
    }

    const { url } = await createPortalSession(customerId);
    return c.json({ url });
  } catch (err: any) {
    console.error('[Billing] Portal session failed:', err.message);
    return c.json({ error: 'Failed to open billing portal' }, 500);
  }
});

// ── POST /billing/webhook — Handle Stripe webhooks ──
// NOTE: The webhook endpoint is mounted publicly in index.ts (before the
// auth middleware) so that Stripe can reach it without a JWT. The handler
// below is kept for reference but is NOT mounted here — the public
// registration in index.ts takes precedence.

// ── GET /billing/usage — Get current period usage ──
billingRoutes.get('/usage', async (c) => {
  const user = c.get('user');
  try {
    const subscription = await getSubscription(user.id);
    const usage = await getUsage(user.id);

    return c.json({
      usage,
      limits: subscription.limits,
      plan: subscription.plan,
    });
  } catch (err: any) {
    console.error('[Billing] Failed to fetch usage:', err.message);
    return c.json({ error: 'Failed to fetch usage data' }, 500);
  }
});

// ── GET /billing/plans — List available plans ──
billingRoutes.get('/plans', async (c) => {
  return c.json({
    plans: Object.values(PLANS).map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      interval: p.interval,
      limits: p.limits,
    })),
  });
});
