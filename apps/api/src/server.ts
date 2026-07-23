import { serve } from '@hono/node-server';
import app from './index.js';

// ── Validate required environment variables ──
const E2B_API_KEY = process.env.E2B_API_KEY;
if (!E2B_API_KEY) {
  console.error('❌ E2B_API_KEY is required but not set. Sandbox functionality will fail.');
  console.error('   Get your key at https://e2b.dev/docs/api-keys');
  process.exit(1);
}

const port = parseInt(process.env.PORT || '3001');

console.log(`Node.js HTTP server starting on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`✅ Server listening on http://localhost:${info.port}`);
});
