import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailClient, EmailMessage } from './types';

/**
 * Real SMTP delivery (IONOS for us), behind the same EmailClient seam as the
 * dev adapter — so Auth.js's sendVerificationRequest and the pool cron's
 * notifications don't change a line when this is the active client.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/**
 * Assemble the SMTP config from env, or null if it isn't fully set. EMAIL_FROM
 * falls back to the auth user so a missing display-name var can't break sends.
 */
export function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.EMAIL_HOST;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!host || !user || !pass) return null;

  return {
    host,
    port: Number(process.env.EMAIL_PORT ?? 587),
    user,
    pass,
    from: process.env.EMAIL_FROM ?? `Junior Dev <${user}>`,
  };
}

export class SmtpEmailClient implements EmailClient {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpConfig) {
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      // 465 is implicit TLS; everything else (587) upgrades via STARTTLS,
      // which we require rather than allow — no silent plaintext fallback.
      secure: config.port === 465,
      requireTLS: config.port !== 465,
      auth: { user: config.user, pass: config.pass },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }

  /** Connect + authenticate WITHOUT sending — proves the credentials work. */
  async verify(): Promise<void> {
    await this.transporter.verify();
  }
}
