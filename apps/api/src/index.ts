import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authMiddleware } from './middleware/auth.js';
import { securityHeaders } from './middleware/security-headers.js';
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
import { schedulerService } from './scheduler/service.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use('*', securityHeaders);

// Public routes
app.route('/health', healthRoutes);

// Protected routes (require Supabase JWT)
const protectedApp = new Hono();
protectedApp.use('*', authMiddleware);

protectedApp.route('/chat', chatRoutes);
protectedApp.route('/user', userRoutes);
protectedApp.route('/agents', agentRoutes);
protectedApp.route('/kb', kbRoutes);
protectedApp.route('/artifacts', artifactRoutes);
protectedApp.route('/skills', skillRoutes);
protectedApp.route('/scheduled', scheduledRoutes);
protectedApp.route('/browser', browserRoutes);
protectedApp.route('/sandbox', sandboxRoutes);
protectedApp.route('/email', emailRoutes);
protectedApp.route('/memory', memoryRoutes);
protectedApp.route('/mcp', mcpRoutes);
protectedApp.route('/models', modelRoutes);
protectedApp.route('/projects', projectRoutes);
protectedApp.route('/connectors', connectorRoutes);
protectedApp.route('/permissions', permissionRoutes);
protectedApp.route('/keys', keysRoutes);
protectedApp.route('/image', imageRoutes);
protectedApp.route('/billing', billingRoutes);

app.route('/api', protectedApp);

// Public share route (no auth required)
app.get('/share/:hash', async (c) => {
  // Forward to artifacts route
  const hash = c.req.param('hash');
  return c.redirect(`/api/artifacts/share/${hash}`);
});

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

// Start scheduler
schedulerService.start();

const port = parseInt(process.env.PORT || '3001');
console.log(`API server running on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
