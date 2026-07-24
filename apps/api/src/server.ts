import { serve } from '@hono/node-server';
import app from './index.js';

// ── Validate required environment variables ──
const E2B_API_KEY = process.env.E2B_API_KEY;
if (!E2B_API_KEY) {
  console.warn('⚠️  E2B_API_KEY not set — sandbox functionality disabled. Set E2B_API_KEY to enable.');
}

const port = parseInt(process.env.PORT || '3001');

console.log(`Node.js HTTP server starting on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`✅ Server listening on http://localhost:${info.port}`);
});
