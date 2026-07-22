import { Hono } from 'hono';
import { emailService } from '../email/service.js';
import { getDb } from '../db/init.js';
import { encryptApiKey } from '../lib/encryption.js';
import { sanitizeError } from '../lib/sanitize-error.js';

export const emailRoutes = new Hono();

// Fetch inbox emails
emailRoutes.get('/inbox', async (c) => {
  const user = c.get('user');
  const limit = parseInt(c.req.query('limit') || '50');

  try {
    await emailService.initializeFromStored(user.id);
    const emails = await emailService.fetchInbox(limit);
    return c.json({ emails });
  } catch (error) {
    return c.json({ error: sanitizeError(error) }, 500);
  }
});

// Mark email as read
emailRoutes.put('/read/:uid', async (c) => {
  const uid = c.req.param('uid');

  try {
    await emailService.markAsRead(uid);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: sanitizeError(error) }, 500);
  }
});

// Mark email as unread
emailRoutes.put('/unread/:uid', async (c) => {
  const uid = c.req.param('uid');

  try {
    await emailService.markAsUnread(uid);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: sanitizeError(error) }, 500);
  }
});

// Get email settings
emailRoutes.get('/settings', async (c) => {
  const user = c.get('user');
  const settings = emailService.getSettings(user.id);
  return c.json({ settings });
});

// Update email settings
emailRoutes.put('/settings', async (c) => {
  const user = c.get('user');
  const { userEmail, agentDisplayName, notifications } = await c.req.json();

  const settings = emailService.updateSettings(user.id, {
    userEmail,
    agentDisplayName,
    notifications,
  });

  return c.json({ settings });
});

// Configure email service (SMTP/IMAP)
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

    const db = getDb();
    const emailConfigJson = JSON.stringify({ smtp, imap });
    const encryptedConfig = await encryptApiKey(emailConfigJson);
    await db.prepare(`
      UPDATE user_profiles
      SET email_config = ?
      WHERE id = ?
    `).run(encryptedConfig, user.id);

    return c.json({ success: true });
  } catch (error: unknown) {
    return c.json({ error: sanitizeError(error) }, 500);
  }
});

// Send email
emailRoutes.post('/send', async (c) => {
  const user = c.get('user');
  const { to, subject, text, html, agentId } = await c.req.json();

  if (!to || !subject || !text) {
    return c.json({ error: 'to, subject, and text are required' }, 400);
  }

  try {
    const result = await emailService.sendEmail(to, subject, text, html, agentId);

    const db = getDb();
    await db.prepare(`
      INSERT INTO email_logs (id, user_id, to_address, subject, status)
      VALUES (?, ?, ?, ?, 'sent')
    `).run(crypto.randomUUID(), user.id, to, subject);

    return c.json({ success: true, messageId: result.messageId });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Send test email
emailRoutes.post('/test', async (c) => {
  const user = c.get('user');
  const { to } = await c.req.json();

  if (!to) {
    return c.json({ error: 'to email is required' }, 400);
  }

  const result = await emailService.sendTestEmail(to);
  return c.json(result);
});

// Send task completion notification
emailRoutes.post('/notify/task-complete', async (c) => {
  const user = c.get('user');
  const { taskName, result, conversationId } = await c.req.json();

  await emailService.sendTaskCompleteNotification(taskName, result, conversationId);
  return c.json({ success: true });
});

// Send scheduled task notification
emailRoutes.post('/notify/scheduled', async (c) => {
  const user = c.get('user');
  const { taskName, result } = await c.req.json();

  await emailService.sendScheduledTaskNotification(taskName, result);
  return c.json({ success: true });
});

// Send action required notification
emailRoutes.post('/notify/action-required', async (c) => {
  const user = c.get('user');
  const { title, details } = await c.req.json();

  await emailService.sendActionRequiredNotification(title, details);
  return c.json({ success: true });
});

// Start polling for emails
emailRoutes.post('/poll/start', async (c) => {
  const { interval = 30000 } = await c.req.json();

  emailService.startPolling((email) => {
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

  const logs = await db.prepare(`
    SELECT * FROM email_logs
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(user.id);

  return c.json({ logs });
});
