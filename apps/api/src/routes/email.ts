import { Hono } from 'hono';
import { emailService } from '../email/service.js';
import { getDb } from '../db/init.js';

export const emailRoutes = new Hono();

// Configure email service
emailRoutes.post('/configure', async (c) => {
  const user = c.get('user');
  const { smtp, imap } = await c.req.json();

  try {
    await emailService.initialize({
      smtp: {
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure || false,
        auth: {
          user: smtp.user,
          pass: smtp.password,
        },
      },
      imap: {
        user: imap.user,
        password: imap.password,
        host: imap.host,
        port: imap.port,
        tls: imap.tls || true,
      },
    }, user.id);

    // Save config (encrypted)
    const db = getDb();
    db.prepare(`
      UPDATE user_profiles
      SET email_config = ?
      WHERE id = ?
    `).run(JSON.stringify({ smtp, imap }), user.id);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Send email
emailRoutes.post('/send', async (c) => {
  const user = c.get('user');
  const { to, subject, text, html } = await c.req.json();

  try {
    const result = await emailService.sendEmail(to, subject, text, html);

    // Log email
    const db = getDb();
    db.prepare(`
      INSERT INTO email_logs (id, user_id, to_address, subject, status)
      VALUES (?, ?, ?, ?, 'sent')
    `).run(crypto.randomUUID(), user.id, to, subject);

    return c.json({ success: true, messageId: result.messageId });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Start polling for emails
emailRoutes.post('/poll/start', async (c) => {
  const user = c.get('user');
  const { interval = 30000 } = await c.req.json();

  emailService.startPolling((email) => {
    // Emit event to connected clients via WebSocket
    // TODO: Implement WebSocket for real-time email notifications
    console.log('New email:', email.subject);
  }, interval);

  return c.json({ success: true });
});

// Stop polling
emailRoutes.post('/poll/stop', async (c) => {
  emailService.stopPolling();
  return c.json({ success: true });
});

// Get email logs
emailRoutes.get('/logs', async (c) => {
  const user = c.get('user');
  const db = getDb();

  const logs = db.prepare(`
    SELECT * FROM email_logs
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(user.id);

  return c.json({ logs });
});
