import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, logAdminAction } from '@/lib/auth'
import { kvGet, kvSet } from '@/lib/kv'

const SMTP_SCHEMA = z.object({
  host: z.string().min(1),
  port: z.string().min(1),
  secure: z.boolean().optional().default(false),
  user: z.string().optional().default(''),
  password: z.string().optional().default(''),
  fromName: z.string().optional().default(''),
  fromEmail: z.string().optional().default(''),
})

const BODY_SCHEMA = z.union([
  z.object({ smtp: SMTP_SCHEMA }),
  z.object({ provider: z.string().min(1), credentials: z.record(z.string(), z.string()).default({}) }),
])

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

export async function GET(req: NextRequest) {
  const auth = await requireAuth(['ADMIN', 'SUPER_ADMIN'])(req)
  if (auth instanceof NextResponse) return auth

  const stored = (await kvGet<StoredEmailConfig>('email_config')) || {}

  // Provide sensible defaults from env so deployments that set env vars work immediately.
  const smtp = {
    host: stored.smtp?.host || process.env.SMTP_HOST || '',
    port: stored.smtp?.port || (process.env.SMTP_PORT || '587'),
    secure: stored.smtp?.secure ?? false,
    user: stored.smtp?.user || process.env.SMTP_USER || '',
    // never echo password back unless it was stored
    password: stored.smtp?.password || '',
    fromName: stored.smtp?.fromName || process.env.EMAIL_FROM_NAME || 'Hola Prime World Cup',
    fromEmail: stored.smtp?.fromEmail || process.env.EMAIL_FROM || '',
  }

  return NextResponse.json({ smtp, connectedMta: stored.mta?.provider || null })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['ADMIN', 'SUPER_ADMIN'])(req)
  if (auth instanceof NextResponse) return auth
  const { user } = auth

  const body = await req.json().catch(() => ({}))
  const parsed = BODY_SCHEMA.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 })
  }

  const current = (await kvGet<StoredEmailConfig>('email_config')) || {}

  if ('smtp' in parsed.data) {
    const smtp = SMTP_SCHEMA.parse(parsed.data.smtp)
    // Persist for server-side email sending and future admin views.
    await kvSet('email_config', { ...current, smtp })

    await logAdminAction({
      userId: user.userId,
      action: 'EMAIL_SMTP_UPDATED',
      details: JSON.stringify({ host: smtp.host, port: smtp.port, secure: smtp.secure, user: smtp.user, fromEmail: smtp.fromEmail }),
      ipAddress: req.headers.get('x-forwarded-for') || undefined,
    })

    return NextResponse.json({ success: true })
  }

  // MTA provider credentials
  const provider = parsed.data.provider
  const credentials = parsed.data.credentials || {}
  await kvSet('email_config', { ...current, mta: { provider, credentials } })

  await logAdminAction({
    userId: user.userId,
    action: 'EMAIL_MTA_CONNECTED',
    details: JSON.stringify({ provider, keys: Object.keys(credentials) }),
    ipAddress: req.headers.get('x-forwarded-for') || undefined,
  })

  return NextResponse.json({ success: true })
}
