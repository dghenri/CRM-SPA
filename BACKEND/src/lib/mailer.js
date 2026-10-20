// Envio de e-mail. Três caminhos, escolhidos pelas variáveis de ambiente (nesta ordem):
//
//  1) Resend (RESEND_API_KEY) - API HTTPS. MAIL_FROM precisa ser de um DOMÍNIO verificado no Resend.
//  2) Brevo (BREVO_API_KEY)   - API HTTPS. MAIL_FROM precisa ser um remetente verificado na Brevo.
//     (1 e 2 servem para hospedagens que bloqueiam SMTP, como o plano grátis do Render.)
//  3) SMTP via nodemailer: SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS - bom em desenvolvimento.
//
// MAIL_FROM: "Riviera SPA <no-reply@seudominio.com.br>"
// Sem nenhum deles, o e-mail NÃO é enviado: o conteúdo vai para o console do servidor.

// "Nome <email@x.com>" -> { name, email }
function parseFrom(value) {
  const match = String(value ?? '').match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim() || undefined, email: match[2].trim() };
  return { email: String(value ?? '').trim() };
}

async function sendViaBrevo({ to, subject, text, html }) {
  const sender = parseFrom(process.env.MAIL_FROM);
  if (!sender.email) throw new Error('Defina MAIL_FROM com o e-mail remetente verificado na Brevo.');

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Brevo respondeu ${response.status}: ${detail.slice(0, 300)}`);
  }
  return { delivered: true };
}

async function sendViaResend({ to, subject, text, html }) {
  const from = String(process.env.MAIL_FROM ?? '').trim();
  if (!from) throw new Error('Defina MAIL_FROM com um endereço do domínio verificado no Resend.');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend respondeu ${response.status}: ${detail.slice(0, 300)}`);
  }
  return { delivered: true };
}

export async function sendMail({ to, subject, text, html }) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

  // o log diz qual caminho foi usado: ajuda a achar variável faltando no Render
  if (process.env.RESEND_API_KEY) { console.log('[mailer] enviando via Resend'); return sendViaResend({ to, subject, text, html }); }
  if (process.env.BREVO_API_KEY) { console.log('[mailer] enviando via Brevo'); return sendViaBrevo({ to, subject, text, html }); }
  console.log(SMTP_HOST ? `[mailer] enviando via SMTP (${SMTP_HOST}) - sem RESEND_API_KEY nem BREVO_API_KEY` : '[mailer] nenhum provedor configurado');

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
    `Se não foi você, ignore este e-mail: sua senha continua a mesma.`;
  const html =
    `<p>Olá, ${escapeHtml(firstName)}!</p>` +
    `<p>Recebemos um pedido para redefinir a senha da sua conta no Viva Bem SPA.</p>` +
    `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#2f6f5e;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Redefinir minha senha</a></p>` +
    `<p>O link vale por ${minutes} minutos e só pode ser usado uma vez.</p>` +
    `<p style="color:#666">Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>`;
  return sendMail({ to, subject: 'Redefinição de senha - Viva Bem SPA', text, html });
}
