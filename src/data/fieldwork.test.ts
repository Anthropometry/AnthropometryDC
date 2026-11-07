/** Supabase calls for M2: the practice list must ask only for the signed-in collector's rows. */
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listPractice } from './fieldwork'

/** Records every filter the query builder is given. */
function fakeClient(rows: Record<string, unknown>[]) {
  const filters: [string, unknown][] = []
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push([col, val])
      return builder
    },
    order: async () => ({ data: rows, error: null }),
  }
  return { client: { from: () => builder } as unknown as SupabaseClient, filters }
}

describe('listPractice', () => {
  it("DENY: an admin's practice list never includes other collectors' records (filters by owner)", async () => {
    const { client, filters } = fakeClient([
      { id: 'a', practice_no: 1, age_group: 'adult', status: 'draft', created_at: '2026-11-07T09:00:00Z' },
    ])
    const rows = await listPractice(client, 'me')
    expect(filters).toEqual([
      ['is_practice', true],
      ['collector_id', 'me'],
    ])
    expect(rows).toEqual([{ id: 'a', practiceNo: 1, ageGroup: 'adult', status: 'draft', createdAt: '2026-11-07T09:00:00Z', waiting: false }])
  })
})
