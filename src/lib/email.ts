// src/lib/email.ts
import nodemailer from 'nodemailer'
import { db } from './db'
import { kvGet } from '@/lib/kv'


type StoredEmailConfig = {
  smtp?: {
    host: string
    port: string
    secure?: boolean
    user?: string
    password?: string
    fromName?: string
    fromEmail?: string
  }
  mta?: {
    provider?: string
    credentials?: Record<string, string>
  }
}

async function getEmailConfig() {
  const stored = (await kvGet<StoredEmailConfig>('email_config')) || {}
  const smtp = stored.smtp || {}

  const host = smtp.host || process.env.SMTP_HOST || ''
  const port = parseInt(smtp.port || process.env.SMTP_PORT || '587', 10)
  const secure = !!(smtp.secure ?? false)
  const user = smtp.user || process.env.SMTP_USER || ''
  const pass = smtp.password || process.env.SMTP_PASSWORD || ''

  const fromName = smtp.fromName || process.env.EMAIL_FROM_NAME || 'Hola Prime World Cup'
  const fromEmail = smtp.fromEmail || process.env.EMAIL_FROM || 'noreply@worldcup.holaprime.com'

  return {
    smtp: { host, port, secure, user, pass, fromName, fromEmail },
    mta: stored.mta || {},
  }
}

async function createTransporter() {
  const cfg = await getEmailConfig()
  if (!cfg.smtp.host) throw new Error('SMTP host is not configured')

  const transporter = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure,
    auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined,
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 12_000,
  } as any)

  return { transporter, cfg }
}

async function sendViaMta(params: {
  provider: string
  credentials: Record<string, string>
  from: string
  to: string
  subject: string
  html: string
}) {
  const provider = params.provider
  const c = params.credentials || {}

  // Minimal HTTP implementations for reliability on serverless (SMTP is often blocked).
  if (provider === 'sendgrid') {
    const apiKey = c.apiKey
    if (!apiKey) throw new Error('SendGrid apiKey missing')
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: params.to }] }],
        from: { email: params.from.replace(/^.*<|>.*$/g, '') || params.from },
        subject: params.subject,
        content: [{ type: 'text/html', value: params.html }],
      }),
    })
    if (!res.ok) throw new Error(`SendGrid error: ${res.status} ${await res.text()}`)
    return true
  }

  if (provider === 'mailgun') {
    const apiKey = c.apiKey
    const domain = c.domain
    const region = (c.region || 'US').toUpperCase()
    if (!apiKey || !domain) throw new Error('Mailgun apiKey/domain missing')
    const host = region === 'EU' ? 'api.eu.mailgun.net' : 'api.mailgun.net'
    const url = `https://${host}/v3/${domain}/messages`

    const form = new URLSearchParams()
    form.set('from', params.from)
    form.set('to', params.to)
    form.set('subject', params.subject)
    form.set('html', params.html)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
    if (!res.ok) throw new Error(`Mailgun error: ${res.status} ${await res.text()}`)
    return true
  }

  if (provider === 'postmark') {
    const token = c.serverToken
    if (!token) throw new Error('Postmark serverToken missing')
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        From: params.from,
        To: params.to,
        Subject: params.subject,
        HtmlBody: params.html,
        MessageStream: 'outbound',
      }),
    })
    if (!res.ok) throw new Error(`Postmark error: ${res.status} ${await res.text()}`)
    return true
  }

  if (provider === 'resend') {
    const apiKey = c.apiKey
    if (!apiKey) throw new Error('Resend apiKey missing')
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: params.from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    })
    if (!res.ok) throw new Error(`Resend error: ${res.status} ${await res.text()}`)
    return true
  }

  if (provider === 'smtp2go') {
    const apiKey = c.apiKey
    if (!apiKey) throw new Error('SMTP2GO apiKey missing')
    const res = await fetch('https://api.smtp2go.com/v3/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        to: [params.to],
        sender: params.from,
        subject: params.subject,
        html_body: params.html,
      }),
    })
    if (!res.ok) throw new Error(`SMTP2GO error: ${res.status} ${await res.text()}`)
    const data: any = await res.json().catch(() => null)
    if (data?.data && data.data.succeeded === 0) throw new Error(`SMTP2GO send failed: ${JSON.stringify(data)}`)
    return true
  }

  // SES not implemented without AWS SDK; fall back to SMTP if configured.
  throw new Error(`Unsupported MTA provider: ${provider}`)
}

interface SendEmailParams {
  to: string
  subject: string
  html: string
  traderId?: string
  template?: string
  fromName?: string
  fromEmail?: string
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const cfgAll = await getEmailConfig()

  const fromEmail = params.fromEmail || cfgAll.smtp.fromEmail
  const fromName = params.fromName || cfgAll.smtp.fromName

  const log = await db.emailLog.create({
    data: {
      to: params.to,
      from: fromEmail,
      subject: params.subject,
      body: params.html,
      traderId: params.traderId,
      template: params.template,
      status: 'QUEUED',
    },
  })

  try {
    if (cfgAll.mta?.provider && cfgAll.mta?.credentials) {
      await sendViaMta({
        provider: cfgAll.mta.provider,
        credentials: cfgAll.mta.credentials,
        from: `"${fromName}" <${fromEmail}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
      })
    } else {
      const { transporter } = await createTransporter()
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
      })
    }

    await db.emailLog.update({
      where: { id: log.id },
      data: { status: 'SENT', sentAt: new Date() },
    })
    return true
  } catch (error) {
    await db.emailLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', error: String(error) },
    })
    return false
  }
}
// ─── EMAIL TEMPLATES ──────────────────────────────────────────────────────

export function templateRegistrationConfirm(params: {
  firstName: string
  displayName: string
  countryName: string
}) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; background: #0a0a0a; color: #fff; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
  .header { background: linear-gradient(135deg, #0D2B4E, #C0392B); padding: 40px; border-radius: 12px; text-align: center; margin-bottom: 30px; }
  .header h1 { margin: 0; font-size: 28px; font-weight: 900; }
  .header p { color: rgba(255,255,255,0.8); margin: 8px 0 0; }
  .card { background: #1a1a2e; border: 1px solid #2d2d4e; border-radius: 12px; padding: 30px; margin-bottom: 20px; }
  .highlight { color: #D4A017; font-weight: bold; }
  .btn { display: inline-block; background: #C0392B; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 20px; }
  .footer { text-align: center; color: #555; font-size: 12px; margin-top: 30px; }
</style></head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏆 HOLA PRIME WORLD CUP</h1>
      <p>Prop Trading World Cup 2026</p>
    </div>
    <div class="card">
      <h2>Welcome, ${params.firstName}! 🎉</h2>
      <p>Your registration for the <strong>Hola Prime Prop Trading World Cup</strong> has been confirmed.</p>
      <p>You're representing <span class="highlight">${params.countryName}</span> in the first-ever global prop trading championship.</p>
      <p><strong>Your display name:</strong> <span class="highlight">${params.displayName}</span></p>
      <h3>What's Next?</h3>
      <ul>
        <li>Complete your <strong>KYC verification</strong> within 48 hours</li>
        <li>Your funded trading account will be provisioned upon approval</li>
        <li>Qualifier opens <strong>June 1, 2026</strong></li>
      </ul>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" class="btn">Go to Dashboard →</a>
    </div>
    <div class="footer">
      <p>Hola Prime World Cup 2026 | <a href="${process.env.NEXT_PUBLIC_APP_URL}" style="color:#555">worldcup.holaprime.com</a></p>
      <p>This email was sent to you because you registered for the Hola Prime World Cup.</p>
    </div>
  </div>
</body>
</html>
`
}

export function templateKYCApproved(params: { firstName: string; accountNumber: string; accountSize: string }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; background: #0a0a0a; color: #fff; margin: 0; }
  .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
  .header { background: linear-gradient(135deg, #1E8449, #117A8B); padding: 40px; border-radius: 12px; text-align: center; margin-bottom: 30px; }
  .card { background: #1a1a2e; border: 1px solid #2d2d4e; border-radius: 12px; padding: 30px; }
  .highlight { color: #D4A017; font-weight: bold; }
  .btn { display: inline-block; background: #C0392B; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 20px; }
</style></head>
<body>
  <div class="container">
    <div class="header"><h1>✅ KYC Approved!</h1></div>
    <div class="card">
      <h2>You're cleared to trade, ${params.firstName}!</h2>
      <p>Your identity has been verified. Your funded trading account is ready:</p>
      <p><strong>Account Number:</strong> <span class="highlight">${params.accountNumber}</span></p>
      <p><strong>Starting Balance:</strong> <span class="highlight">$${params.accountSize}</span></p>
      <p>Login credentials have been sent in a separate secure email.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" class="btn">View Dashboard →</a>
    </div>
  </div>
</body>
</html>
`
}

export function templateMatchAnnouncement(params: {
  firstName: string
  opponentName: string
  opponentCountry: string
  phase: string
  startDate: string
  endDate: string
}) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; background: #0a0a0a; color: #fff; margin: 0; }
  .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
  .header { background: linear-gradient(135deg, #0D2B4E, #C0392B); padding: 40px; border-radius: 12px; text-align: center; margin-bottom: 30px; }
  .vs { font-size: 48px; font-weight: 900; color: #D4A017; }
  .card { background: #1a1a2e; border: 1px solid #2d2d4e; border-radius: 12px; padding: 30px; }
  .btn { display: inline-block; background: #C0392B; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 20px; }
</style></head>
<body>
  <div class="container">
    <div class="header">
      <h1>${params.phase}</h1>
      <div class="vs">⚔️</div>
      <p>Your match has been drawn!</p>
    </div>
    <div class="card">
      <h2>Get ready, ${params.firstName}!</h2>
      <p>You are facing <strong>${params.opponentName}</strong> from <strong>${params.opponentCountry}</strong></p>
      <p><strong>Match Period:</strong> ${params.startDate} — ${params.endDate}</p>
      <p>A new funded account will be provisioned for this round. The trader with the higher % return by end of the match period advances.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/bracket" class="btn">View Bracket →</a>
    </div>
  </div>
</body>
</html>
`
}

export function templateAdminInvite(params: {
  firstName: string
  email: string
  password: string
  role: string
  invitedBy: string
  loginUrl: string
}) {
  const roleLabel = params.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'
  const roleIcon  = params.role === 'SUPER_ADMIN' ? '👑' : '🛡'
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; background: #060A14; color: #fff; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
  .header { background: linear-gradient(135deg, #0D2B4E 0%, #092040 100%); border: 1px solid rgba(0,212,255,0.2); padding: 40px; border-radius: 12px; text-align: center; margin-bottom: 24px; }
  .logo { font-size: 32px; margin-bottom: 10px; }
  .header h1 { margin: 0 0 6px; font-size: 22px; font-weight: 900; letter-spacing: 0.06em; color: #fff; }
  .header p { color: rgba(180,200,235,0.7); margin: 0; font-size: 13px; }
  .card { background: #0F1829; border: 1px solid rgba(0,212,255,0.15); border-radius: 12px; padding: 28px; margin-bottom: 20px; }
  .role-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(0,212,255,0.1); border: 1px solid rgba(0,212,255,0.3); border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #00d4ff; margin-bottom: 20px; }
  .cred-box { background: rgba(0,0,0,0.4); border: 1px solid rgba(0,212,255,0.15); border-radius: 8px; padding: 16px 20px; margin: 16px 0; font-family: monospace; }
  .cred-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .cred-row:last-child { border-bottom: none; }
  .cred-label { color: rgba(180,200,235,0.6); font-size: 12px; }
  .cred-value { color: #00d4ff; font-size: 13px; font-weight: 700; }
  .btn { display: inline-block; background: linear-gradient(135deg, #00d4ff, #0099cc); color: #000; padding: 14px 36px; border-radius: 8px; text-decoration: none; font-weight: 900; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; margin-top: 20px; }
  .warn { background: rgba(240,192,64,0.08); border: 1px solid rgba(240,192,64,0.2); border-radius: 8px; padding: 12px 16px; font-size: 12px; color: rgba(240,192,64,0.9); margin-top: 16px; line-height: 1.6; }
  .footer { text-align: center; color: rgba(100,120,160,0.6); font-size: 11px; margin-top: 32px; line-height: 1.8; }
</style></head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🏆</div>
      <h1>HOLA PRIME WORLD CUP</h1>
      <p>Admin Panel Access Granted</p>
    </div>
    <div class="card">
      <div class="role-badge">${roleIcon} ${roleLabel}</div>
      <h2 style="margin:0 0 8px;font-size:20px;">Welcome, ${params.firstName}!</h2>
      <p style="color:rgba(180,200,235,0.8);margin:0 0 16px;line-height:1.6;">
        You have been granted <strong style="color:#fff;">${roleLabel}</strong> access to the Hola Prime World Cup admin panel by <strong style="color:#00d4ff;">${params.invitedBy}</strong>.
      </p>
      <p style="color:rgba(180,200,235,0.7);margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Your Login Credentials</p>
      <div class="cred-box">
        <div class="cred-row"><span class="cred-label">Email</span><span class="cred-value">${params.email}</span></div>
        <div class="cred-row"><span class="cred-label">Password</span><span class="cred-value">${params.password}</span></div>
        <div class="cred-row"><span class="cred-label">Role</span><span class="cred-value">${roleLabel}</span></div>
      </div>
      <a class="btn" href="${params.loginUrl}">Login to Admin →</a>
      <div class="warn">
        For security, please change this password immediately after first login.
      </div>
    </div>
    <div class="footer">
      Hola Prime World Cup • Admin Access
    </div>
  </div>
</body>
</html>
`
}
