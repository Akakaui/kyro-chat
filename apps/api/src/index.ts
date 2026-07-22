import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authMiddleware } from './middleware/auth.js';
import { securityHeaders } from './middleware/security-headers.js';
import { authLimiter, apiLimiter, chatLimiter, modelLimiter } from './middleware/rate-limit.js';
import { enhancedAuth, requireAdmin } from './middleware/enhanced-auth.js';
import { sentryMiddleware } from './middleware/sentry.js';
import { initSentry, closeSentryFlush } from './services/sentry.js';
import { startPeriodicMonitoring } from './services/monitor.js';
import { appMonitor } from './services/app-monitor.js';
import { healthRoutes } from './routes/health.js';
import { chatRoutes } from './routes/chat.js';
import { userRoutes } from './routes/user.js';
import { agentRoutes } from './routes/agent.js';
import { kbRoutes } from './routes/kb.js';

import { artifactRoutes } from './routes/artifacts.js';
import { skillRoutes } from './routes/skills.js';
import { scheduledRoutes } from './routes/scheduled.js';
import { browserRoutes } from './routes/browser.js';
import { sandboxRoutes } from './routes/sandbox.js';
import { emailRoutes } from './routes/email.js';
import { memoryRoutes } from './routes/memory.js';
import { mcpRoutes } from './routes/mcp.js';
import { modelRoutes } from './routes/models.js';
import { projectRoutes } from './routes/projects.js';
import { connectorRoutes } from './routes/connectors.js';
import { permissionRoutes } from './routes/permissions.js';
import { keysRoutes } from './routes/keys.js';
import { imageRoutes } from './routes/image.js';
import { billingRoutes } from './routes/billing.js';
import { settingsRoutes } from './routes/settings.js';
import { rbacRoutes } from './routes/rbac.js';
import { storageRoutes } from './routes/storage.js';
import { initFileStorage } from './services/storage/index.js';
import { schedulerService } from './scheduler/service.js';
import { RoleManager } from './services/rbac.js';
import { isPostgreSQLAvailable } from './db/init.js';
import { getRedis } from './services/redis.js';
import { initSandbox, shutdownSandbox } from './services/sandbox/index.js';

const app = new Hono();

app.use('*', logger());

// ── Sentry (non-blocking init) ──────────────────────────────────────────
initSentry().catch((err) => console.error('❌ Sentry init failed:', err));

// Sentry middleware — captures per-request transactions and errors
app.use('*', sentryMiddleware);

// CORS — production allows only the configured frontend domain; dev allows localhost
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const allowedOrigins = frontendUrl.split(',').map((o) => o.trim());

app.use('*', cors({
  origin: (origin) => {
    // Allow requests with no origin (curl, server-to-server)
    if (!origin) return origin;
    if (allowedOrigins.includes(origin)) return origin;
    return allowedOrigins[0]; // fallback to first allowed origin
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Refresh-Token'],
  maxAge: 86400,
}));
app.use('*', securityHeaders);

// Public routes
app.route('/health', healthRoutes);

// Public auth routes (login, signup, password reset) — IP-based rate limit
const authApp = new Hono();
authApp.use('*', authLimiter);
// Mount auth routes here when added, e.g.:
// import { authRoutes } from './routes/auth.js';
// authApp.route('/', authRoutes);
app.route('/auth', authApp);

// Protected routes (require Supabase JWT + RBAC)
const protectedApp = new Hono();
protectedApp.use('*', enhancedAuth);

protectedApp.route('/chat', chatRoutes);
protectedApp.use('/chat/*', chatLimiter);

protectedApp.route('/user', userRoutes);

protectedApp.route('/agents', agentRoutes);

protectedApp.route('/kb', kbRoutes);
protectedApp.use('/kb/*', apiLimiter);

protectedApp.route('/artifacts', artifactRoutes);
protectedApp.use('/artifacts/*', apiLimiter);

protectedApp.route('/skills', skillRoutes);

protectedApp.route('/scheduled', scheduledRoutes);

protectedApp.route('/browser', browserRoutes);

protectedApp.route('/sandbox', sandboxRoutes);

protectedApp.route('/email', emailRoutes);

protectedApp.route('/memory', memoryRoutes);
protectedApp.use('/memory/*', apiLimiter);

protectedApp.route('/mcp', mcpRoutes);
protectedApp.use('/mcp/*', apiLimiter);

protectedApp.route('/models', modelRoutes);
protectedApp.use('/models/*', modelLimiter);

protectedApp.route('/projects', projectRoutes);

protectedApp.route('/connectors', connectorRoutes);

protectedApp.route('/permissions', permissionRoutes);
protectedApp.use('/permissions/*', apiLimiter);

protectedApp.route('/keys', keysRoutes);

protectedApp.route('/image', imageRoutes);

protectedApp.route('/billing', billingRoutes);
protectedApp.use('/billing/*', apiLimiter);

protectedApp.route('/settings', settingsRoutes);
protectedApp.use('/settings/*', apiLimiter);

// RBAC management routes (admin-only)
protectedApp.route('/rbac', rbacRoutes);
protectedApp.use('/rbac/*', requireAdmin);

// File storage routes
protectedApp.route('/storage', storageRoutes);

app.route('/api', protectedApp);

// Public share route (no auth required)
app.get('/share/:hash', async (c) => {
  // Forward to artifacts route
  const hash = c.req.param('hash');
  return c.redirect(`/api/artifacts/share/${hash}`);
});

// 404 for unmatched routes
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler — captures errors in Sentry
app.onError((err, c) => {
  console.error('Server error:', err);

  // Capture to Sentry (non-blocking)
  import('./services/sentry.js').then(({ captureError }) => {
    captureError(err, {
      tags: {
        http_method: c.req.method,
        http_path: c.req.path,
      },
      level: 'error',
    });
  }).catch(() => {});

  return c.json({ error: 'Internal server error' }, 500);
});

// Start scheduler
schedulerService.start();

const port = parseInt(process.env.PORT || '3001');
console.log(`API server running on port ${port}`);

// ── Initialize RBAC on startup ───────────────────────────────────────────
if (isPostgreSQLAvailable()) {
  RoleManager.initializeDefaultRoles()
    .then(() => console.log('✅ RBAC roles initialized'))
    .catch((err) => console.error('❌ Failed to initialize RBAC roles:', err));
} else {
  console.log('ℹ️  RBAC initialization skipped (PostgreSQL not configured)');
}

// ── Initialize File Storage (non-blocking) ─────────────────────────────
initFileStorage()
  .then(() => console.log('✅ File storage initialized'))
  .catch((err) => console.error('❌ File storage init failed:', err.message));

// ── Initialize Sandbox Subsystem (non-blocking) ──────────────────────────
initSandbox()
  .then(() => console.log('✅ Sandbox subsystem initialized'))
  .catch((err) => console.error('❌ Sandbox init failed:', err.message));

// ── Initialize Redis (lazy — doesn't block startup) ─────────────────────
getRedis()
  .connect()
  .then((connected) => {
    if (connected) {
      console.log('✅ Redis connected');
    } else {
      console.log('ℹ️  Redis unavailable — using in-memory fallback');
    }
  })
  .catch((err) => {
    console.error('❌ Redis initialization error:', err.message);
  });

// ── Start application monitoring ────────────────────────────────────────
appMonitor.start();
startPeriodicMonitoring(120_000); // Log memory/CPU every 2 minutes

// ── Graceful shutdown ───────────────────────────────────────────────────
const signals = ['SIGTERM', 'SIGINT'] as const;
for (const signal of signals) {
  process.on(signal, async () => {
    console.log(`\n${signal} received — shutting down gracefully...`);
    appMonitor.stop();
    schedulerService.stop();
    await shutdownSandbox();
    await closeSentryFlush(2000);
    process.exit(0);
  });
}

export default {
  port,
  fetch: app.fetch,
};
