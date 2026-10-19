// Envio de e-mail via SMTP (nodemailer). Variáveis de ambiente:
//   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, MAIL_FROM ("Viva Bem SPA <no-reply@seudominio.com>")
// Sem SMTP configurado (ou sem o pacote), o e-mail NÃO é enviado: o conteúdo vai para o
// console do servidor, o que basta para testar o fluxo em desenvolvimento.
export async function sendMail({ to, subject, text, html }) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

  if (!SMTP_HOST) {
    console.log(`\n[mailer] SMTP não configurado - e-mail para ${to}\nAssunto: ${subject}\n${text}\n`);
    return { delivered: false };
  }

  let nodemailer;
  try {
    ({ default: nodemailer } = await import('nodemailer'));
  } catch {
    console.warn('[mailer] pacote "nodemailer" não instalado (npm i nodemailer). E-mail não enviado.');
    return { delivered: false };
  }
  
  const port = Number(SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  await transporter.sendMail({ from: MAIL_FROM || SMTP_USER, to, subject, text, html });
  return { delivered: true };
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function sendPasswordResetEmail({ to, name, link, minutes }) {
  const firstName = String(name ?? '').trim().split(/\s+/)[0] || 'olá';
  const text =
    `Olá, ${firstName}!\n\nRecebemos um pedido para redefinir a senha da sua conta no Viva Bem SPA.\n` +
    `Use o link abaixo (vale por ${minutes} minutos e só pode ser usado uma vez):\n\n${link}\n\n` +
    `Se não foi você, ignore este e-mail e sua senha não será alterada.`;
  const html =
    `<p>Olá, ${escapeHtml(firstName)}!</p>` +
    `<p>Recebemos um pedido para redefinir a senha da sua conta no Viva Bem SPA.</p>` +
    `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#2f6f5e;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Redefinir minha senha</a></p>` +
    `<p>O link vale por ${minutes} minutos e só pode ser usado uma vez.</p>` +
    `<p style="color:#666">Se não foi você, ignore este e-mail e sua senha não será alterada.</p>`;
  return sendMail({ to, subject: 'Redefinição de senha - Viva Bem SPA', text, html });
}
