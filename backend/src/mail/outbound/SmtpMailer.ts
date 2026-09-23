import nodemailer, { type Transporter } from "nodemailer";
import type { Mailer, MensajeSaliente } from "./Mailer.js";

// Config recibida por parámetro (Fase A: antes leía env.mail.* directo, ahora la trae
// mail/outbound/index.ts::crearMailer() desde ConfiguracionCorreo en BD, resuelta en cada corrida
// del job). "from" es correoDesde ("Nombre <correo@dominio>"), ya no env.mail.soporteEmail.
export interface SmtpMailerConfig {
  host: string;
  port: number;
  user: string | null;
  pass: string | null;
  tls: boolean;
  correoDesde: string;
}

export class SmtpMailer implements Mailer {
  private readonly transporter: Transporter;
  private readonly correoDesde: string;

  constructor(config: SmtpMailerConfig) {
    this.correoDesde = config.correoDesde;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.tls,
      auth: config.user ? { user: config.user, pass: config.pass ?? undefined } : undefined,
    });
  }

  async enviar(msg: MensajeSaliente): Promise<void> {
    await this.transporter.sendMail({
      from: this.correoDesde,
      to: msg.para,
      subject: msg.asunto,
      html: msg.cuerpoHtml,
      headers: msg.headers,
    });
  }
}
