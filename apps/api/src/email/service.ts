import nodemailer from 'nodemailer';
import Imap from 'imap-simple';
import { simpleParser } from 'mailparser';

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
      console.error('SMTP verification failed:', error);
    }

    // Connect to IMAP for receiving
    try {
      this.imapConnection = await Imap.connect(config.imap);
      await this.imapConnection.openBox('INBOX');
      console.log('IMAP connected');
    } catch (error) {
      console.error('IMAP connection failed:', error);
    }
  }

  /**
   * Send an email
   */
  async sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string
  ): Promise<{ messageId: string }> {
    if (!this.transporter) {
      throw new Error('Email service not initialized');
    }

    const result = await this.transporter.sendMail({
      from: process.env.AGENT_EMAIL || 'agent@chatbot-saas.com',
      to,
      subject,
      text,
      html,
    });

    return { messageId: result.messageId };
  }

  /**
   * Start polling for new emails
   */
  startPolling(callback: (email: EmailMessage) => void, intervalMs: number = 30000): void {
    this.onEmailReceived = callback;

    // Initial check
    this.checkEmails();

    // Set up polling
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
      // Search for unseen messages
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
