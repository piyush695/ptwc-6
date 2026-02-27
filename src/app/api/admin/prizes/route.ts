// src/app/api/admin/prizes/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { z } from 'zod'

const DEFAULT_PRIZES = [
  { key: 'place_1', label: '1st Place', prize: '$60,000', position: 1 },
  { key: 'place_2', label: '2nd Place', prize: '$25,000', position: 2 },
  { key: 'place_3', label: '3rd Place', prize: '$10,000', position: 3 },
  { key: 'place_4', label: '4th Place', prize: '$5,000', position: 4 },
  { key: 'place_5', label: '5th Place', prize: '$3,500', position: 5 },
  { key: 'place_6', label: '6th Place', prize: '$3,000', position: 6 },
  { key: 'place_7', label: '7th Place', prize: '$2,500', position: 7 },
  { key: 'place_8', label: '8th Place', prize: '$2,000', position: 8 },
  { key: 'place_9', label: '9th Place', prize: '$1,500', position: 9 },
  { key: 'place_10', label: '10th Place', prize: '$1,000', position: 10 },
  { key: 'place_11_25', label: '11th - 25th Place', prize: '$500 each', position: 11 },
  { key: 'place_26_50', label: '26th - 50th Place', prize: '$250 each', position: 12 },
  { key: 'place_51_100', label: '51st - 100th Place', prize: '$100 each', position: 13 },
  { key: 'most_lots', label: 'Most Lots Traded', prize: '$2,000', position: 14 },
  { key: 'lowest_dd', label: 'Lowest Drawdown', prize: '$2,000', position: 15 },
]

// ── GET — load all prize tiers for admin panel ─────────────────────────────
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rows = await db.prizeTier.findMany({
      orderBy: { position: 'asc' },
    })

    // If DB is empty, return defaults so admin can see/edit them
    if (rows.length === 0) {
      return NextResponse.json({ prizes: DEFAULT_PRIZES })
    }

    return NextResponse.json({ prizes: rows })
  } catch {
    return NextResponse.json({ prizes: DEFAULT_PRIZES })
  }
}

// ── PATCH — bulk upsert all prize tiers ───────────────────────────────────
const tierSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  prize: z.string().min(1),   // free-form: "$60,000" or "Funded Account" or "Trophy"
  position: z.number().int().min(1),
})

const bodySchema = z.object({
  prizes: z.array(tierSchema),
})

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { prizes } = bodySchema.parse(body)

  // Upsert every tier in a transaction
  await db.$transaction(
    prizes.map(p =>
      db.prizeTier.upsert({
        where: { key: p.key },
        update: { label: p.label, prize: p.prize, position: p.position, isActive: true, updatedBy: user.email },
        create: { key: p.key, label: p.label, prize: p.prize, position: p.position, isActive: true, updatedBy: user.email },
      })
    )
  )

  await db.adminLog.create({
    data: {
      userId: user.userId,
      action: 'PRIZES_UPDATED',
      details: JSON.stringify({ updatedBy: user.email, count: prizes.length }),
    },
  })

  const updated = await db.prizeTier.findMany({ orderBy: { position: 'asc' } })
  return NextResponse.json({ prizes: updated, saved: true })
}
