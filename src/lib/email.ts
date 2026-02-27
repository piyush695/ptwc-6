// src/lib/email.ts
import nodemailer from 'nodemailer'
import { db } from './db'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
})

interface SendEmailParams {
  to: string
  subject: string
  html: string
  traderId?: string
  template?: string
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const log = await db.emailLog.create({
    data: {
      to: params.to,
      from: process.env.EMAIL_FROM || 'noreply@worldcup.holaprime.com',
      subject: params.subject,
      body: params.html,
      traderId: params.traderId,
      template: params.template,
      status: 'QUEUED',
    },
  })

  try {
    await transporter.sendMail({
      from: `"Hola Prime World Cup" <${process.env.EMAIL_FROM}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
    })

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
        <div class="cred-row">
          <span class="cred-label">Login URL</span>
          <span class="cred-value">${params.loginUrl}</span>
        </div>
        <div class="cred-row">
          <span class="cred-label">Email</span>
          <span class="cred-value">${params.email}</span>
        </div>
        <div class="cred-row">
          <span class="cred-label">Temporary Password</span>
          <span class="cred-value">${params.password}</span>
        </div>
        <div class="cred-row">
          <span class="cred-label">Role</span>
          <span class="cred-value">${roleIcon} ${roleLabel}</span>
        </div>
      </div>
      <div class="warn">
        ⚠ <strong>Security:</strong> Please log in and change your password immediately. Do not share these credentials with anyone.
      </div>
      <div style="text-align:center;">
        <a href="${params.loginUrl}" class="btn">Access Admin Panel →</a>
      </div>
    </div>
    <div class="footer">
      <p>Hola Prime World Cup 2026 — Admin System</p>
      <p>This email was sent because an admin account was created for ${params.email}.<br>If you did not expect this, contact <a href="mailto:security@holaprime.com" style="color:#00d4ff;">security@holaprime.com</a></p>
    </div>
  </div>
</body>
</html>
`
}

export function templateRoleChanged(params: {
  firstName: string
  email: string
  oldRole: string
  newRole: string
  changedBy: string
}) {
  const newLabel = params.newRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'
  const oldLabel = params.oldRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; background: #060A14; color: #fff; margin: 0; padding: 0; }
  .container { max-width: 580px; margin: 0 auto; padding: 40px 20px; }
  .card { background: #0F1829; border: 1px solid rgba(0,212,255,0.15); border-radius: 12px; padding: 28px; }
  .header-bar { background: linear-gradient(135deg, #0D2B4E, #092040); border-radius: 8px; padding: 20px; text-align:center; margin-bottom:20px; }
  .badge { display:inline-block; background:rgba(0,212,255,0.1); border:1px solid rgba(0,212,255,0.3); border-radius:6px; padding:4px 12px; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#00d4ff; }
  .footer { text-align: center; color: rgba(100,120,160,0.6); font-size: 11px; margin-top: 24px; }
</style></head>
<body>
  <div class="container">
    <div class="card">
      <div class="header-bar">
        <div style="font-size:28px;margin-bottom:6px;">🔐</div>
        <h2 style="margin:0;font-size:18px;">Your Admin Role Has Changed</h2>
      </div>
      <p style="color:rgba(180,200,235,0.8);line-height:1.6;">Hi <strong style="color:#fff;">${params.firstName}</strong>,</p>
      <p style="color:rgba(180,200,235,0.8);line-height:1.6;">
        Your admin panel role has been updated by <strong style="color:#00d4ff;">${params.changedBy}</strong>.
      </p>
      <div style="display:flex;align-items:center;gap:16px;margin:20px 0;padding:16px;background:rgba(0,0,0,0.3);border-radius:8px;">
        <div style="text-align:center;">
          <div style="font-size:11px;color:rgba(180,200,235,0.5);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em;">Previous</div>
          <span class="badge" style="background:rgba(136,152,184,0.1);border-color:rgba(136,152,184,0.2);color:#8898b8;">${oldLabel}</span>
        </div>
        <div style="font-size:20px;color:rgba(0,212,255,0.4);">→</div>
        <div style="text-align:center;">
          <div style="font-size:11px;color:rgba(180,200,235,0.5);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em;">New Role</div>
          <span class="badge">${newLabel}</span>
        </div>
      </div>
      <p style="color:rgba(180,200,235,0.7);font-size:13px;line-height:1.6;">Your new permissions take effect immediately on your next page load. No re-login required.</p>
    </div>
    <div class="footer">Hola Prime World Cup 2026 · Admin System</div>
  </div>
</body>
</html>
`
}

// ─── PASSWORD RESET EMAIL ──────────────────────────────────────────────────

export function templatePasswordReset(params: { firstName: string; resetUrl: string; expiresMinutes: number }) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin:0; padding:0; background:#060a14; font-family:'Helvetica Neue',Arial,sans-serif; }
    .container { max-width:560px; margin:0 auto; padding:40px 20px; }
    .card { background:rgba(7,11,22,0.98); border:1px solid rgba(0,212,255,0.15); border-radius:16px; overflow:hidden; }
    .top-bar { height:3px; background:linear-gradient(90deg,transparent,#00d4ff,#f0c040,#00d4ff,transparent); }
    .body { padding:40px; }
    .logo { text-align:center; margin-bottom:32px; }
    .logo-icon { width:56px; height:56px; background:rgba(0,212,255,0.1); border:1px solid rgba(0,212,255,0.3); border-radius:14px; display:inline-flex; align-items:center; justify-content:center; font-size:26px; margin-bottom:10px; }
    .logo-name { font-size:14px; font-weight:900; letter-spacing:0.1em; color:#fff; }
    .logo-sub { font-size:10px; letter-spacing:0.25em; color:#00d4ff; margin-top:2px; }
    h1 { margin:0 0 8px; font-size:26px; font-weight:900; color:#fff; text-align:center; letter-spacing:0.05em; text-transform:uppercase; }
    .subtitle { text-align:center; font-size:14px; color:rgba(180,200,235,0.7); margin-bottom:28px; line-height:1.6; }
    .btn { display:block; padding:16px 32px; background:#00d4ff; color:#060a14; text-decoration:none; border-radius:10px; font-size:14px; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; text-align:center; margin:24px 0; box-shadow:0 0 24px rgba(0,212,255,0.35); }
    .expiry { background:rgba(240,192,64,0.08); border:1px solid rgba(240,192,64,0.2); border-radius:8px; padding:12px 16px; text-align:center; font-size:13px; color:rgba(240,192,64,0.9); margin-bottom:20px; }
    .url-box { background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:12px 14px; font-family:monospace; font-size:11px; color:rgba(180,200,235,0.5); word-break:break-all; margin-bottom:20px; }
    .footer { text-align:center; padding:20px; font-size:11px; color:rgba(180,200,235,0.3); }
    .warning { font-size:12px; color:rgba(180,200,235,0.5); line-height:1.6; text-align:center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="top-bar"></div>
      <div class="body">
        <div class="logo">
          <div class="logo-icon">🔐</div>
          <div class="logo-name">HOLA PRIME</div>
          <div class="logo-sub">WORLD CUP 2026</div>
        </div>
        <h1>Reset Your Password</h1>
        <p class="subtitle">Hi <strong style="color:#fff;">${params.firstName}</strong>, we received a request to reset your password. Click the button below to set a new one.</p>
        <a href="${params.resetUrl}" class="btn">Reset My Password →</a>
        <div class="expiry">⏱ This link expires in <strong>${params.expiresMinutes} minutes</strong></div>
        <p class="warning">If you didn't request this, you can safely ignore this email. Your password will not change.</p>
        <div class="url-box">If the button doesn't work, copy this link:<br>${params.resetUrl}</div>
      </div>
    </div>
    <div class="footer">Hola Prime World Cup 2026 · For security issues contact support@holaprime.com</div>
  </div>
</body>
</html>
`
}
