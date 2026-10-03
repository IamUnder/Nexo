import { createTransport } from "nodemailer";
import type { Logger } from "../logger";
import type { SystemEmail, SystemMailer } from "../ports";

/**
 * Correo DEL SISTEMA (invitaciones, verificación, recuperación). Los envíos de un tenant a sus
 * clientes (SMTP propio / Resend con sobrecoste) llegan con el módulo `communication` (hito 5).
 */

/** SMTP genérico (Mailpit en desarrollo; el proveedor transaccional real en producción). */
export class SmtpMailer implements SystemMailer {
  private readonly transport;
  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = createTransport(smtpUrl);
  }
  async send(email: SystemEmail): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
    });
  }
}

/** Solo desarrollo: registra el correo completo (con enlaces) en el log. NUNCA en producción. */
export class LogMailer implements SystemMailer {
  constructor(private readonly logger: Logger) {}
  async send(email: SystemEmail): Promise<void> {
    this.logger.info(
      { mail: { to: "[oculto]", subject: email.subject, text: email.text } },
      "email (LogMailer)",
    );
  }
}

/** Para tests: guarda los correos enviados y permite leerlos. */
export class MemoryMailer implements SystemMailer {
  readonly sent: SystemEmail[] = [];
  async send(email: SystemEmail): Promise<void> {
    this.sent.push(email);
  }
  last(to?: string): SystemEmail | undefined {
    const list = to ? this.sent.filter((e) => e.to === to) : this.sent;
    return list.at(-1);
  }
  clear(): void {
    this.sent.length = 0;
  }
}

export function createMailer(args: {
  nodeEnv: string;
  smtpUrl: string | undefined;
  from: string;
  logger: Logger;
}): SystemMailer {
  if (args.smtpUrl) return new SmtpMailer(args.smtpUrl, args.from);
  if (args.nodeEnv === "production") {
    throw new Error("SMTP_URL es obligatoria en producción (correo del sistema)");
  }
  return new LogMailer(args.logger);
}

/** Extrae el primer enlace de un texto (para tests y para depurar flujos de email). */
export function firstLink(text: string): string | undefined {
  return /https?:\/\/\S+/.exec(text)?.[0];
}
