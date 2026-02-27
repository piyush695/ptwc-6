import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(['ADMIN', 'SUPER_ADMIN'])(req)
  if (auth instanceof NextResponse) return auth

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 100)

  const logs = await db.emailLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      to: true,
      subject: true,
      status: true,
      template: true,
      sentAt: true,
      error: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ logs })
}
