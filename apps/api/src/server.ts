import { serve } from '@hono/node-server';
import app from './index.js';

const port = parseInt(process.env.PORT || '3001');

console.log(`Node.js HTTP server starting on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`✅ Server listening on http://localhost:${info.port}`);
});
