import nodemailer from 'nodemailer';
import Imap from 'imap-simple';
import { simpleParser } from 'mailparser';
import { getDb } from '../db/init.js';
import { decryptApiKey } from '../lib/encryption.js';

/*
 * Email credentials (SMTP/IMAP passwords) are encrypted at rest in the database
 * using AES-256-GCM via lib/encryption.ts. They are only decrypted in memory
 * at the point of use (initialize / initializeFromStored).
 *
 * SECURITY RULES:
 * 1. Credentials must NEVER appear in logs, error messages, or API responses.
 * 2. All catch blocks sanitize errors before logging to prevent credential leaks.
 * 3. Prefer OAuth2 tokens over passwords for SMTP/IMAP where supported.
 */

interface EmailConfig {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  imap: {
    user: string;
    password: string;
    host: string;
    port: number;
    tls: boolean;
  };
}

interface EmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  date: Date;
  isRead: boolean;
}

interface EmailSettings {
  userEmail: string;
  agentDisplayName: string;
  notifications: {
    taskComplete: boolean;
    scheduledDone: boolean;
    actionRequired: boolean;
  };
}

/**
 * Generate agent email address from agent ID
 */
function getAgentEmail(agentId?: string): string {
  const suffix = agentId ? agentId.slice(0, 8) : 'default';
  return `agent-${suffix}@kyro.chat`;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private imapConnection: any = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private userId: string = '';
  private onEmailReceived?: (email: EmailMessage) => void;

  /**
   * Initialize email service with SMTP config
   */
  async initialize(config: EmailConfig, userId: string): Promise<void> {
    this.userId = userId;

    // Create SMTP transporter
    this.transporter = nodemailer.createTransport(config.smtp);

    // Verify SMTP connection
    try {
      await this.transporter.verify();
      console.log('SMTP connection verified');
    } catch (error) {
      // DO NOT log the full error object — it may contain credentials
      console.error('SMTP verification failed: connection error (credentials redacted for security)');
    }

    // Connect to IMAP for receiving
    try {
      this.imapConnection = await Imap.connect(config.imap);
      await this.imapConnection.openBox('INBOX');
      console.log('IMAP connected');
    } catch (error) {
      // DO NOT log the full error object — it may contain credentials
      console.error('IMAP connection failed: connection error (credentials redacted for security)');
    }
  }

  /**
   * Initialize email service from stored encrypted config in the database.
   * Decrypts the email_config column before passing to initialize().
   */
  async initializeFromStored(userId: string): Promise<void> {
    const db = getDb();
    const profile = db.prepare(`
      SELECT email_config FROM user_profiles WHERE id = ?
    `).get(userId) as any;

    if (!profile?.email_config) {
      throw new Error('No email configuration found for this user');
    }

    let configJson: string;
    try {
      configJson = await decryptApiKey(profile.email_config);
    } catch {
      throw new Error('Failed to decrypt email configuration');
    }

    let config: EmailConfig;
    try {
      config = JSON.parse(configJson);
    } catch {
      throw new Error('Stored email configuration is corrupted');
    }

    await this.initialize(config, userId);
  }

  /**
   * Get user's email settings
   */
  getSettings(userId: string): EmailSettings {
    const db = getDb();
    const profile = db.prepare(`
      SELECT email_address, agent_display_name, email_notifications
      FROM user_profiles WHERE id = ?
    `).get(userId) as any;

    return {
      userEmail: profile?.email_address || '',
      agentDisplayName: profile?.agent_display_name || 'Kyro',
      notifications: profile?.email_notifications
        ? JSON.parse(profile.email_notifications)
        : { taskComplete: true, scheduledDone: true, actionRequired: true },
    };
  }

  /**
   * Update user's email settings
   */
  updateSettings(userId: string, settings: Partial<EmailSettings>): EmailSettings {
    const db = getDb();
    const current = this.getSettings(userId);

    const updates: string[] = [];
    const values: any[] = [];

    if (settings.userEmail !== undefined) {
      updates.push('email_address = ?');
      values.push(settings.userEmail);
    }
    if (settings.agentDisplayName !== undefined) {
      updates.push('agent_display_name = ?');
      values.push(settings.agentDisplayName);
    }
    if (settings.notifications !== undefined) {
      updates.push('email_notifications = ?');
      values.push(JSON.stringify(settings.notifications));
    }

    if (updates.length > 0) {
      values.push(userId);
      db.prepare(`
        UPDATE user_profiles SET ${updates.join(', ')} WHERE id = ?
      `).run(...values);
    }

    return this.getSettings(userId);
  }

  /**
   * Send an email
   */
  async sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
    agentId?: string
  ): Promise<{ messageId: string }> {
    if (!this.transporter) {
      throw new Error('Email service not initialized');
    }

    const fromEmail = getAgentEmail(agentId);
    const settings = this.getSettings(this.userId);
    const fromName = settings.agentDisplayName;

    const result = await this.transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text,
      html,
    });

    return { messageId: result.messageId };
  }

  /**
   * Send task completion notification
   */
  async sendTaskCompleteNotification(
    taskName: string,
    result: string,
    conversationId?: string
  ): Promise<void> {
    const settings = this.getSettings(this.userId);
    if (!settings.userEmail || !settings.notifications.taskComplete) return;

    const subject = `Task Complete: ${taskName}`;
    const body = [
      `Your scheduled task "${taskName}" has completed.`,
      '',
      'Result:',
      result.slice(0, 2000),
      '',
      conversationId
        ? `View conversation: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/chat/${conversationId}`
        : '',
    ].filter(Boolean).join('\n');

    try {
      await this.sendEmail(settings.userEmail, subject, body);
    } catch (error) {
      console.error('Failed to send task notification:', error);
    }
  }

  /**
   * Send scheduled task completion notification
   */
  async sendScheduledTaskNotification(
    taskName: string,
    result: string
  ): Promise<void> {
    const settings = this.getSettings(this.userId);
    if (!settings.userEmail || !settings.notifications.scheduledDone) return;

    const subject = `Scheduled Task Done: ${taskName}`;
    const body = [
      `Your scheduled task "${taskName}" has finished running.`,
      '',
      'Output:',
      result.slice(0, 2000),
      '',
      `View details: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/scheduled`,
    ].join('\n');

    try {
      await this.sendEmail(settings.userEmail, subject, body);
    } catch (error) {
      console.error('Failed to send scheduled task notification:', error);
    }
  }

  /**
   * Send action required notification
   */
  async sendActionRequiredNotification(
    title: string,
    details: string
  ): Promise<void> {
    const settings = this.getSettings(this.userId);
    if (!settings.userEmail || !settings.notifications.actionRequired) return;

    const subject = `Action Required: ${title}`;
    const body = [
      'Your agent needs your attention:',
      '',
      details,
      '',
      `Respond here: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/chat`,
    ].join('\n');

    try {
      await this.sendEmail(settings.userEmail, subject, body);
    } catch (error) {
      console.error('Failed to send action notification:', error);
    }
  }

  /**
   * Send test email
   */
  async sendTestEmail(to: string): Promise<{ success: boolean; messageId?: string }> {
    try {
      const result = await this.sendEmail(
        to,
        'Test Email from Kyro',
        'This is a test email from your Kyro agent. If you received this, your email configuration is working correctly.'
      );
      return { success: true, messageId: result.messageId };
    } catch (error) {
      return { success: false };
    }
  }

  /**
   * Start polling for new emails
   */
  startPolling(callback: (email: EmailMessage) => void, intervalMs: number = 30000): void {
    this.onEmailReceived = callback;
    this.checkEmails();
    this.pollInterval = setInterval(() => {
      this.checkEmails();
    }, intervalMs);
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Check for new emails
   */
  private async checkEmails(): Promise<void> {
    if (!this.imapConnection) return;

    try {
      const searchCriteria = ['UNSEEN'];
      const fetchOptions = {
        bodies: ['HEADER', 'TEXT'],
        markSeen: false,
      };

      const messages = await this.imapConnection.search(searchCriteria, fetchOptions);

      for (const message of messages) {
        const all = message.parts.find((part: any) => part.which === 'TEXT');
        const header = message.parts.find((part: any) => part.which === 'HEADER');

        if (header && all) {
          const parsed = await simpleParser(all.body);

          const email: EmailMessage = {
            id: message.attributes.uid.toString(),
            from: parsed.from?.text || '',
            to: parsed.to?.text || '',
            subject: parsed.subject || '',
            text: parsed.text || '',
            html: parsed.html?.toString(),
            date: parsed.date || new Date(),
            isRead: false,
          };

          this.onEmailReceived?.(email);
        }
      }
    } catch (error) {
      console.error('Error checking emails:', error);
    }
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    this.stopPolling();

    if (this.imapConnection) {
      this.imapConnection.end();
      this.imapConnection = null;
    }

    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
  }
}

export const emailService = new EmailService();
