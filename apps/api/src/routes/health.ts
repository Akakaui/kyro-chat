import { Hono } from 'hono';

export const healthRoutes = new Hono();

healthRoutes.get('/', (c) => {
  return c.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

healthRoutes.get('/ready', (c) => {
  // Lightweight readiness probe — can be extended to check DB connectivity
  return c.json({ status: 'ready' });
});
