import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Lee la bandeja REAL de Mailpit para seguir los enlaces de los correos, como lo haría una persona. */
const here = dirname(fileURLToPath(import.meta.url));
const base = () => readFileSync(join(here, ".mailpit-url"), "utf8").trim();

interface MailSummary {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
}

export async function waitForMail(to: string, subjectIncludes: string, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const list = (await (await fetch(`${base()}/api/v1/messages?limit=200`)).json()) as {
      messages: MailSummary[];
    };
    const found = list.messages.find(
      (m) =>
        m.To.some((t) => t.Address.toLowerCase() === to.toLowerCase()) &&
        m.Subject.includes(subjectIncludes),
    );
    if (found) {
      const full = (await (await fetch(`${base()}/api/v1/message/${found.ID}`)).json()) as {
        Text: string;
      };
      const link = /https?:\/\/\S+/.exec(full.Text)?.[0];
      if (!link) throw new Error(`El correo «${found.Subject}» no trae enlace`);
      return { subject: found.Subject, link };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`No llegó un correo «${subjectIncludes}» a ${to}`);
}

/** Convierte un enlace del correo (apunta a NEXO_PUBLIC_URL) en una ruta relativa de la SPA. */
export const pathOf = (link: string) => {
  const u = new URL(link);
  return `${u.pathname}${u.search}`;
};
