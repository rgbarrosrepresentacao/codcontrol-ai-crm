import nodemailer from 'nodemailer'

// ── Transporter criado sob demanda (evita crash no Server Component) ──────────
function createTransporter() {
    const host = process.env.SMTP_HOST
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS

    if (!host || !user || !pass) {
        throw new Error(
            `[MAIL] Variáveis SMTP não configuradas. ` +
            `SMTP_HOST=${host}, SMTP_USER=${user ? '***' : 'undefined'}`
        )
    }

    return nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user, pass },
        tls: {
            rejectUnauthorized: false, // compatibilidade com Hostinger
        },
    })
}

// ── Tipos ────────────────────────────────────────────────────────────────────
export interface SendEmailOptions {
    to: string
    toName?: string
    subject: string
    htmlBody: string
}

export interface BulkEmailResult {
    sent: number
    failed: number
    errors: string[]
}

// ── Envio individual ─────────────────────────────────────────────────────────
export async function sendEmail({ to, toName, subject, htmlBody }: SendEmailOptions) {
    const fromName = process.env.SMTP_FROM_NAME || 'CodControl AI CRM'
    const fromEmail = process.env.SMTP_USER

    const transporter = createTransporter()
    await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: toName ? `"${toName}" <${to}>` : to,
        subject,
        html: htmlBody,
    })
}

// ── Template HTML profissional da CodControl ─────────────────────────────────
export function buildEmailTemplate({
    userName,
    subject,
    bodyContent,
}: {
    userName: string
    subject: string
    bodyContent: string
}) {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    body { margin:0; padding:0; background:#0a0a0f; font-family:'Segoe UI',sans-serif; }
    .wrap { max-width:600px; margin:0 auto; }
    .header { background:linear-gradient(135deg,#00ff88 0%,#00cc6a 100%); padding:32px 40px; border-radius:16px 16px 0 0; text-align:center; }
    .header h1 { margin:0; color:#000; font-size:24px; font-weight:800; letter-spacing:-0.5px; }
    .header p { margin:6px 0 0; color:#000000aa; font-size:13px; }
    .body { background:#111118; padding:36px 40px; }
    .greeting { font-size:18px; font-weight:700; color:#fff; margin-bottom:16px; }
    .content { font-size:14px; color:#a1a1b5; line-height:1.8; white-space:pre-line; }
    .cta { display:block; width:fit-content; margin:28px auto 0; background:linear-gradient(135deg,#00ff88,#00cc6a); color:#000; font-weight:800; font-size:15px; text-decoration:none; padding:14px 36px; border-radius:12px; }
    .footer { background:#0d0d14; padding:24px 40px; border-radius:0 0 16px 16px; text-align:center; }
    .footer p { margin:0; font-size:11px; color:#444460; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>⚡ CodControl AI CRM</h1>
      <p>Automação inteligente para vendas</p>
    </div>
    <div class="body">
      <div class="greeting">Olá, ${userName}! 👋</div>
      <div class="content">${bodyContent}</div>
      <a class="cta" href="https://codcontrolpro.bond">Acessar plataforma →</a>
    </div>
    <div class="footer">
      <p>CodControl AI CRM · contato@codcontrolpro.bond</p>
      <p style="margin-top:6px">Você está recebendo este e-mail pois se cadastrou em nossa plataforma.</p>
    </div>
  </div>
</body>
</html>
  `
}
