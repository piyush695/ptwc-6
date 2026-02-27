import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, logAdminAction } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'

const schema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  fromName: z.string().optional(),
  fromEmail: z.string().optional(),
  segment: z.string().optional().default('all'),
  template: z.string().optional(),
})

async function getRecipients(segment: string): Promise<Array<{ id: string; email: string }>> {
  // Keep this intentionally conservative: use simple filters to avoid surprises.
  switch (segment) {
    case 'kyc_approved':
      return db.trader.findMany({
        where: { kycRecord: { is: { status: 'APPROVED' } } },
        select: { id: true, email: true },
      })
    case 'kyc_rejected':
      return db.trader.findMany({
        where: { kycRecord: { is: { status: 'REJECTED' } } },
        select: { id: true, email: true },
      })
    case 'kyc_pending':
      return db.trader.findMany({
        where: { kycRecord: { is: { status: { in: ['PENDING', 'IN_REVIEW'] } } } },
        select: { id: true, email: true },
      })
    case 'active':
      return db.trader.findMany({
        where: { accounts: { some: { status: 'ACTIVE' } } },
        select: { id: true, email: true },
      })
    case 'no_trades':
      return db.trader.findMany({
        where: { accounts: { some: { totalTrades: 0 } } },
        select: { id: true, email: true },
      })
    case 'at_risk':
      return db.trader.findMany({
        where: { accounts: { some: { maxDrawdown: { gt: 0.08 } } } },
        select: { id: true, email: true },
      })
    case 'qualifier_top':
      // If qualifier ranks exist, use them; otherwise fall back to first 32 by qualifier return.
      return db.trader.findMany({
        where: { qualifierEntry: { isNot: null } },
        orderBy: { qualifierEntry: { rank: 'asc' } },
        take: 32,
        select: { id: true, email: true },
      }).catch(async () => {
        return db.trader.findMany({ take: 32, select: { id: true, email: true } })
      })
    case 'all':
    default:
      return db.trader.findMany({ select: { id: true, email: true } })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['ADMIN', 'SUPER_ADMIN'])(req)
  if (auth instanceof NextResponse) return auth
  const { user } = auth

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const recipients = await getRecipients(parsed.data.segment)

  // Hard safety cap to prevent accidental blasts.
  const capped = recipients.slice(0, 2000)

  let sent = 0
  let failed = 0

  // Send sequentially to avoid hammering SMTP.
  for (const r of capped) {
    const ok = await sendEmail({
      to: r.email,
      subject: parsed.data.subject,
      html: parsed.data.body,
      traderId: r.id,
      template: parsed.data.template,
      fromName: parsed.data.fromName,
      fromEmail: parsed.data.fromEmail,
    })
    if (ok) sent += 1
    else failed += 1
  }

  await logAdminAction({
    userId: user.userId,
    action: 'EMAIL_BULK_SENT',
    details: JSON.stringify({ segment: parsed.data.segment, requested: recipients.length, sent, failed }),
    ipAddress: req.headers.get('x-forwarded-for') || undefined,
  })

  return NextResponse.json({ queued: sent, failed, total: capped.length })
}
