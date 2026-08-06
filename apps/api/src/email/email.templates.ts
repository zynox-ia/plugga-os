import type { TransactionalEmail } from "./email.port";

/**
 * Server-side rendered content for a transactional email. Templates live in the
 * OS (versioned) and are provider-agnostic (ADR-0010): the same rendered output
 * is delivered by Mailpit (local) or Brevo (client account). We never rely on
 * the Brevo template editor, so switching providers never changes the content.
 */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const SENDER_LABEL = "Plugga OS";

/**
 * Renders the PT-BR invite/reset email from the port's variables. The link
 * carries an opaque single-use token — it is placed only in the recipient's
 * message body and is never logged (ADR-0007).
 */
export function renderTemplate(email: TransactionalEmail): RenderedEmail {
  const greetingName = email.variables.name?.trim() || "olá";
  const link = email.variables.link;
  const expiry = formatExpiry(email.variables.expiresInMinutes);

  if (email.template === "invite") {
    return renderInvite(greetingName, link, expiry);
  }

  return renderReset(greetingName, link, expiry);
}

function renderInvite(name: string, link: string, expiry: string): RenderedEmail {
  const subject = `Convite para acessar o ${SENDER_LABEL}`;
  const intro =
    "Você foi convidado(a) para acessar o Plugga OS. Para definir sua senha e ativar o acesso, use o link abaixo.";
  const cta = "Definir minha senha";
  const validity = `Este convite é válido por ${expiry} e só pode ser usado uma vez.`;

  return {
    subject,
    html: layout({ heading: subject, name, intro, cta, link, validity }),
    text: plain({ name, intro, cta, link, validity }),
  };
}

function renderReset(name: string, link: string, expiry: string): RenderedEmail {
  const subject = `Redefinição de senha — ${SENDER_LABEL}`;
  const intro =
    "Recebemos um pedido para redefinir a senha da sua conta no Plugga OS. Se foi você, use o link abaixo para escolher uma nova senha.";
  const cta = "Redefinir minha senha";
  const validity = `Este link é válido por ${expiry} e só pode ser usado uma vez. Se você não fez este pedido, ignore este e-mail — sua senha atual continua válida.`;

  return {
    subject,
    html: layout({ heading: subject, name, intro, cta, link, validity }),
    text: plain({ name, intro, cta, link, validity }),
  };
}

interface Content {
  heading?: string;
  name: string;
  intro: string;
  cta: string;
  link: string;
  validity: string;
}

function layout(content: Content): string {
  const heading = escapeHtml(content.heading ?? SENDER_LABEL);
  const name = escapeHtml(content.name);
  const intro = escapeHtml(content.intro);
  const cta = escapeHtml(content.cta);
  const validity = escapeHtml(content.validity);
  const href = escapeAttribute(content.link);
  const linkText = escapeHtml(content.link);

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${heading}</title>
  </head>
  <body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;padding:32px;">
            <tr><td style="font-size:18px;font-weight:bold;padding-bottom:16px;">${SENDER_LABEL}</td></tr>
            <tr><td style="font-size:16px;padding-bottom:12px;">Olá, ${name}!</td></tr>
            <tr><td style="font-size:14px;line-height:1.5;padding-bottom:20px;">${intro}</td></tr>
            <tr>
              <td style="padding-bottom:20px;">
                <a href="${href}" style="display:inline-block;background:#2f6f4f;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;">${cta}</a>
              </td>
            </tr>
            <tr><td style="font-size:12px;line-height:1.5;color:#52606d;padding-bottom:16px;">Se o botão não funcionar, copie e cole este endereço no navegador:<br /><a href="${href}" style="color:#2f6f4f;word-break:break-all;">${linkText}</a></td></tr>
            <tr><td style="font-size:12px;line-height:1.5;color:#52606d;">${validity}</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function plain(content: Content): string {
  return [
    `${SENDER_LABEL}`,
    "",
    `Olá, ${content.name}!`,
    "",
    content.intro,
    "",
    `${content.cta}: ${content.link}`,
    "",
    content.validity,
  ].join("\n");
}

function formatExpiry(minutes: number): string {
  if (minutes % (24 * 60) === 0) {
    const days = minutes / (24 * 60);
    return days === 1 ? "1 dia" : `${days} dias`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hora" : `${hours} horas`;
  }
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
