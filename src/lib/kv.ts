// src/lib/kv.ts
// Simple Postgres-backed KV store for small configuration blobs.
// Purpose: allow admin panel to persist integration credentials without relying on .env file writes.

import { db } from '@/lib/db'

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS app_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`

let ensured = false

export async function ensureKvTable() {
  if (ensured) return
  try {
    // prisma doesn't support CREATE TABLE in a tagged template reliably across drivers.
    await db.$executeRawUnsafe(TABLE_SQL)
    ensured = true
  } catch (e) {
    // If concurrent calls try to create, ignore.
    ensured = true
  }
}

export async function kvGet<T = any>(key: string): Promise<T | null> {
  await ensureKvTable()
  const rows = await db.$queryRaw<{ value: string }[]>`SELECT value FROM app_kv WHERE key = ${key} LIMIT 1`
  if (!rows?.length) return null
  try {
    return JSON.parse(rows[0].value) as T
  } catch {
    // fall back to raw string
    return rows[0].value as unknown as T
  }
}

export async function kvSet(key: string, value: any): Promise<void> {
  await ensureKvTable()
  const str = typeof value === 'string' ? value : JSON.stringify(value)
  await db.$executeRaw`
    INSERT INTO app_kv (key, value) VALUES (${key}, ${str})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
  `
}
