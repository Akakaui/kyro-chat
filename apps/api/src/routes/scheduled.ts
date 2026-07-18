import { Hono } from 'hono';
import { schedulerService } from '../scheduler/service.js';

export const scheduledRoutes = new Hono();

// Create scheduled task
scheduledRoutes.post('/', async (c) => {
  const user = c.get('user');
  const { name, description, type, cronExpression, scheduledAt, payload, agentId } = await c.req.json();

  const id = schedulerService.create(user.id, {
    name,
    description,
    type,
    cronExpression,
    scheduledAt,
    payload,
    agentId,
  });

  return c.json({ id });
});

// List tasks
scheduledRoutes.get('/', async (c) => {
  const user = c.get('user');
  const tasks = schedulerService.list(user.id);
  return c.json({ tasks });
});

// Get task
scheduledRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const task = schedulerService.get(id, user.id);
  if (!task) return c.json({ error: 'Not found' }, 404);

  return c.json({ task });
});

// Execute task immediately
scheduledRoutes.post('/:id/execute', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const task = schedulerService.get(id, user.id);
  if (!task) return c.json({ error: 'Not found' }, 404);

  await schedulerService.execute(id);
  return c.json({ success: true });
});

// Cancel task
scheduledRoutes.post('/:id/cancel', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const success = schedulerService.cancel(id, user.id);
  if (!success) return c.json({ error: 'Not found' }, 404);

  return c.json({ success: true });
});

// Delete task
scheduledRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const success = schedulerService.delete(id, user.id);
  if (!success) return c.json({ error: 'Not found' }, 404);

  return c.json({ success: true });
});
