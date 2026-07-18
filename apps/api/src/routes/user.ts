import { Hono } from 'hono';
import { getDb } from '../db/init.js';

export const userRoutes = new Hono();

userRoutes.get('/profile', async (c) => {
  const user = c.get('user');
  return c.json({ user });
});
