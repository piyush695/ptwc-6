import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(['ADMIN', 'SUPER_ADMIN'])(req)
  if (auth instanceof NextResponse) return auth

  const templates = await db.emailTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      slug: true,
      name: true,
      subject: true,
      body: true,
      variables: true,
      isActive: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ templates })
}
