import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../config/env.js";
import type { Mailer, MensajeSaliente } from "./Mailer.js";

// SMTP real (nodemailer). SMTP_HOST/PORT/USER/PASS por entorno (backend/.env, nunca en el repo);
// sin ellos configurados, sendMail fallará y el job lo reintenta con backoff (ver
// jobs/correoSalienteJob.ts). El remitente es SOPORTE_EMAIL: no hay una variable MAIL_REMITENTE
// aparte porque hoy solo existe un buzón conocido (ver docs/backend-diseno.md decisión 0.1).
export class SmtpMailer implements Mailer {
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.mail.smtpHost,
      port: env.mail.smtpPort ?? 587,
      auth: env.mail.smtpUser ? { user: env.mail.smtpUser, pass: env.mail.smtpPass } : undefined,
    });
  }

  async enviar(msg: MensajeSaliente): Promise<void> {
    await this.transporter.sendMail({
      from: env.mail.soporteEmail,
      to: msg.para,
      subject: msg.asunto,
      html: msg.cuerpoHtml,
      headers: msg.headers,
    });
  }
}
