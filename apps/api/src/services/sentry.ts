// ---------------------------------------------------------------------------
// Sentry Service
//
// Error tracking and performance monitoring via Sentry.
// Initializes conditionally — if SENTRY_DSN is not set, all operations are
// no-ops. Graceful degradation throughout.
// ---------------------------------------------------------------------------

import type { Span } from '@sentry/types';

// Lazy import to avoid crash if packages aren't installed
let Sentry: typeof import('@sentry/node') | null = null;
let profilingIntegration: ReturnType<typeof import('@sentry/profiling-node').nodeProfilingIntegration> | null = null;
let initialized = false;

// ── Types ─────────────────────────────────────────────────────────────────

export interface SentryContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  level?: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';
}

export interface SentryTransaction {
  span: Span;
  name: string;
  op: string;
  startTime: number;
}

// ── Logging ───────────────────────────────────────────────────────────────

function log(message: string, ...args: unknown[]): void {
  if (process.env.SENTRY_DEBUG === 'true') {
    console.log('[Sentry]', message, ...args);
  }
}

// ── Initialization ─────────────────────────────────────────────────────────

/**
 * Initialize Sentry with environment configuration.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * Expects env vars:
 *   SENTRY_DSN              — required to enable Sentry
 *   SENTRY_ENVIRONMENT      — defaults to NODE_ENV or 'development'
 *   SENTRY_SAMPLE_RATE      — sample rate (default: 1.0 prod, 0.1 dev)
 *   SENTRY_PROFILES_SAMPLE_RATE — profiling sample rate (default: 0.1)
 *   SENTRY_RELEASE          — optional release version
 */
export async function initSentry(): Promise<boolean> {
  if (initialized) return true;
  if (!process.env.SENTRY_DSN) {
    log('SENTRY_DSN not set — Sentry disabled');
    return false;
  }

  try {
    Sentry = await import('@sentry/node');
    const profiling = await import('@sentry/profiling-node');
    profilingIntegration = profiling.nodeProfilingIntegration();

    const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
    const isProd = environment === 'production';
    const sampleRate = parseFloat(process.env.SENTRY_SAMPLE_RATE || (isProd ? '1.0' : '0.1'));

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment,
      sampleRate,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || (isProd ? '0.2' : '1.0')),
      profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
      release: process.env.SENTRY_RELEASE || undefined,
      integrations: [
        profilingIntegration,
        ...(Sentry.requestDataIntegration ? [Sentry.requestDataIntegration()] : []),
      ],
      beforeSend(event) {
        // Filter out health check noise
        if (event.request?.url?.includes('/health')) {
          return null;
        }
        return event;
      },
    });

    initialized = true;
    console.log('✅ Sentry initialized (env:', environment, 'sampleRate:', sampleRate, ')');
    return true;
  } catch (err) {
    console.warn('[Sentry] Failed to initialize:', (err as Error).message);
    console.warn('[Sentry] Sentry will be disabled');
    return false;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function ensureSentry(): typeof import('@sentry/node') | null {
  if (!initialized) return null;
  if (!Sentry) {
    // Should not happen if init succeeded, but guard just in case
    return null;
  }
  return Sentry;
}

// ── Exported API ──────────────────────────────────────────────────────────

/**
 * Capture an exception with optional context.
 * Gracefully no-ops if Sentry is not initialized.
 */
export function captureError(error: Error | unknown, context?: SentryContext): string | undefined {
  const s = ensureSentry();
  if (!s) return undefined;

  try {
    if (context?.tags || context?.extra || context?.level) {
      let eventId: string | undefined;
      s.withScope((scope) => {
        if (context.tags) {
          for (const [key, val] of Object.entries(context.tags)) {
            scope.setTag(key, val);
          }
        }
        if (context.extra) {
          scope.setExtras(context.extra);
        }
        if (context.level) {
          scope.setLevel(context.level as ReturnType<typeof scope.setLevel> extends (level: infer L) => void ? L : never);
        }
        eventId = s.captureException(error);
      });
      return eventId;
    } else {
      return s.captureException(error);
    }
  } catch (err) {
    log('Failed to capture error:', (err as Error).message);
    return undefined;
  }
}

/**
 * Capture a message with optional severity level and context.
 */
export function captureMessage(
  message: string,
  level?: SentryContext['level'],
  context?: Omit<SentryContext, 'level'>,
): string | undefined {
  const s = ensureSentry();
  if (!s) return undefined;

  try {
    if (context?.tags || context?.extra || level) {
      let eventId: string | undefined;
      s.withScope((scope) => {
        if (context?.tags) {
          for (const [key, val] of Object.entries(context.tags)) {
            scope.setTag(key, val);
          }
        }
        if (context?.extra) {
          scope.setExtras(context.extra);
        }
        if (level) {
          scope.setLevel(level as ReturnType<typeof scope.setLevel> extends (level: infer L) => void ? L : never);
        }
        eventId = s.captureMessage(message);
      });
      return eventId;
    } else {
      return s.captureMessage(message);
    }
  } catch (err) {
    log('Failed to capture message:', (err as Error).message);
    return undefined;
  }
}

/**
 * Set user context on Sentry scope.
 * All subsequent events will include this user info.
 */
export function setUser(userId: string, email?: string): void {
  const s = ensureSentry();
  if (!s) return;

  try {
    s.setUser({ id: userId, email });
  } catch (err) {
    log('Failed to set user:', (err as Error).message);
  }
}

/**
 * Clear user context from Sentry scope.
 */
export function clearUser(): void {
  const s = ensureSentry();
  if (!s) return;

  try {
    s.setUser(null);
  } catch (err) {
    log('Failed to clear user:', (err as Error).message);
  }
}

/**
 * Start a new performance transaction.
 * Returns a SentryTransaction handle that can be passed to stopTransaction.
 *
 * NOTE: In Sentry v10+, the recommended pattern is startSpan() with a callback.
 * This function provides a manual lifecycle for cases where the callback
 * pattern doesn't fit (e.g. middleware orchestrators).
 */
export function startTransaction(name: string, op: string): SentryTransaction | null {
  const s = ensureSentry();
  if (!s) return null;

  try {
    const span = s.startInactiveSpan({
      name,
      op,
      forceTransaction: true,
    });
    if (!span) return null;

    return {
      span: span as any,
      name,
      op,
      startTime: Date.now(),
    };
  } catch (err) {
    log('Failed to start transaction:', (err as Error).message);
    return null;
  }
}

/**
 * Stop a previously started transaction with an optional status.
 */
export function stopTransaction(
  transaction: SentryTransaction | null,
  status?: string,
): void {
  if (!transaction) return;
  const s = ensureSentry();
  if (!s) return;

  try {
    if (status) {
      transaction.span.setAttribute('sentry.status', status);
    }
    transaction.span.setAttribute('duration_ms', Date.now() - transaction.startTime);
    transaction.span.end();
  } catch (err) {
    log('Failed to stop transaction:', (err as Error).message);
  }
}

/**
 * Create a child span under an existing transaction.
 * The span must be manually ended via span.end().
 */
export function createSpan(
  transaction: SentryTransaction | null,
  name: string,
  op: string,
): Span | null {
  if (!transaction) return null;
  const s = ensureSentry();
  if (!s) return null;

  try {
    const span = s.startInactiveSpan({
      name,
      op,
      parentSpan: transaction.span as any,
    });
    return (span ?? null) as any;
  } catch (err) {
    log('Failed to create span:', (err as Error).message);
    return null;
  }
}

/**
 * Flush pending events to Sentry before shutdown.
 * Resolves after timeout or when all events are sent.
 */
export async function closeSentryFlush(timeoutMs?: number): Promise<boolean> {
  const s = ensureSentry();
  if (!s) return true;

  try {
    await s.flush(timeoutMs ?? 2000);
    return true;
  } catch (err) {
    log('Failed to flush Sentry:', (err as Error).message);
    return false;
  }
}

/**
 * Check if Sentry is initialized and ready.
 */
export function isSentryEnabled(): boolean {
  return initialized && Sentry !== null;
}

/**
 * Reset the initialized state (for testing).
 */
export function _resetSentryState(): void {
  initialized = false;
  Sentry = null;
  profilingIntegration = null;
}
