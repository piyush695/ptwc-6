import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'

const SMTP_SCHEMA = z.object({
  host: z.string().min(1),
  port: z.string().min(1),
  secure: z.boolean().optional().default(false),
  user: z.string().optional().default(''),
  password: z.string().optional().default(''),
})

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['ADMIN', 'SUPER_ADMIN'])(req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => ({}))
  const smtp = SMTP_SCHEMA.safeParse(body?.smtp)
  if (!smtp.success) {
    return NextResponse.json({ success: false, error: 'Invalid SMTP payload' }, { status: 400 })
  }

  try {
    const port = parseInt(smtp.data.port || '587', 10)
    const transporter = nodemailer.createTransport({
      host: smtp.data.host,
      port,
      secure: !!smtp.data.secure,
      auth: smtp.data.user ? { user: smtp.data.user, pass: smtp.data.password } : undefined,
      // tighten timeouts so the admin UI doesn't hang forever
      connectionTimeout: 12_000,
      greetingTimeout: 12_000,
      socketTimeout: 12_000,
    } as any)

    await transporter.verify()
    return NextResponse.json({ success: true })
  } catch (e: any) {
    const msg = String(e?.message || e)

    // Common deployment gotchas: serverless platforms may block outbound SMTP.
    if (msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED') || msg.includes('EHOSTUNREACH')) {
      return NextResponse.json({
        success: false,
        error: `SMTP connection failed (${msg}). If you're deployed on a serverless platform, outbound SMTP ports (465/587) may be blocked. In that case, use an HTTP email API (SendGrid/Mailgun/Postmark/Resend) or run this app on a VM/container with SMTP egress allowed.`,
      }, { status: 500 })
    }

    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
