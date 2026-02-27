import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

const schema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  fromName: z.string().optional(),
  fromEmail: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['ADMIN', 'SUPER_ADMIN'])(req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 })
  }

  try {
    const ok = await sendEmail({
      to: parsed.data.to,
      subject: parsed.data.subject,
      html: parsed.data.body,
      template: 'admin_test',
      fromName: parsed.data.fromName,
      fromEmail: parsed.data.fromEmail,
    })

    return NextResponse.json({ success: ok })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 })
  }
}
