import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import nodemailer, { Transporter } from "nodemailer";
import { Env } from "../../config/env";
import { renderVerifyEmail, renderResetPasswordEmail, renderWelcomeEmail } from "./templates";

/**
 * Single email service.
 *
 * Three transport modes:
 *   - SMTP        (production — set SMTP_* env vars)
 *   - JSON        (dev — no SMTP configured; emails are logged, not sent)
 *   - Disabled    (NODE_ENV=test — total no-op)
 *
 * The "JSON" mode lets developers iterate locally without a real mail server;
 * the actual content lands in the logs and the verification/reset link is
 * easy to copy.
 */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter!: Transporter;
  private mode: "smtp" | "json" | "disabled" = "disabled";

  constructor(private readonly env: Env) {}

  onModuleInit() {
    if (this.env.NODE_ENV === "test") {
      this.mode = "disabled";
      return;
    }
    if (this.env.SMTP_HOST && this.env.SMTP_PORT) {
      this.transporter = nodemailer.createTransport({
        host: this.env.SMTP_HOST,
        port: this.env.SMTP_PORT,
        secure: this.env.SMTP_PORT === 465,
        auth: this.env.SMTP_USER ? { user: this.env.SMTP_USER, pass: this.env.SMTP_PASSWORD } : undefined,
      });
      this.mode = "smtp";
      this.logger.log(`Email transport: SMTP (${this.env.SMTP_HOST}:${this.env.SMTP_PORT})`);
    } else {
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
      this.mode = "json";
      this.logger.warn("Email transport: JSON (no SMTP_* configured — emails will be logged, not sent)");
    }
  }

  // ---------- Public sendXxx() methods ----------

  async sendVerifyEmail(args: { to: string; username: string; verifyUrl: string }) {
    const { subject, html, text } = renderVerifyEmail(args);
    return this.send({ to: args.to, subject, html, text });
  }

  async sendResetPasswordEmail(args: { to: string; username: string; resetUrl: string }) {
    const { subject, html, text } = renderResetPasswordEmail(args);
    return this.send({ to: args.to, subject, html, text });
  }

  async sendWelcomeEmail(args: { to: string; username: string }) {
    const { subject, html, text } = renderWelcomeEmail(args);
    return this.send({ to: args.to, subject, html, text });
  }

  // ---------- Plumbing ----------

  private async send(opts: { to: string; subject: string; html: string; text: string }) {
    if (this.mode === "disabled") return;
    const info = await this.transporter.sendMail({
      from: this.env.SMTP_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (this.mode === "json") {
      // Surface the dev preview so the link is easy to grab from the logs.
      this.logger.log(`📧 ${opts.subject} → ${opts.to}\n${opts.text}`);
    } else {
      this.logger.log(`📧 ${opts.subject} → ${opts.to} (id=${info.messageId})`);
    }
  }
}
