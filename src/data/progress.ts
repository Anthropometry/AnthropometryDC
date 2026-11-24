/** F8: the admin progress counts from the database (admins only; the database checks it). */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProgressRow } from '../lib/progress'

export interface CollectorProgress {
  collectorId: string
  completeTotal: number
  completeWeek: number
  measuredNoPhotos: number
  consentedNotMeasured: number
  practiceComplete: number
  lastSentAt: string | null
  measurementsTaken: number
  measurementsSkipped: number
  unusualKept: number
  photosMorePeople: number
}

export interface ProgressData {
  rows: ProgressRow[]
  weekly: { weekStart: string; complete: number }[]
  collectors: CollectorProgress[]
  bands: { sex: string; ageGroup: 'adult' | 'child'; bandCm: number; n: number }[]
  quality: { item: string; detail: string | null; n: number }[]
  space: { databaseBytes: number; photoBytes: number; photos: number }
}

type Row = Record<string, unknown>

async function rpc(client: SupabaseClient, fn: string, args?: Row): Promise<Row[]> {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw error
  return (data ?? []) as Row[]
}

const num = (v: unknown) => Number(v ?? 0)

export async function loadProgress(client: SupabaseClient, practice: boolean): Promise<ProgressData> {
  const p = { p_practice: practice }
  const [rows, weekly, collectors, bands, quality, space] = await Promise.all([
    rpc(client, 'admin_progress', p),
    rpc(client, 'admin_weekly', p),
    rpc(client, 'admin_collector_progress'),
    rpc(client, 'admin_height_bands', p),
    rpc(client, 'admin_quality', p),
    rpc(client, 'admin_space'),
  ])
  return {
    rows: rows.map((r) => ({
      sex: String(r.sex),
      ageGroup: r.age_group as 'adult' | 'child',
      ageRange: String(r.age_range),
      complete: num(r.complete),
      measuredNoPhotos: num(r.measured_no_photos),
      consentedNotMeasured: num(r.consented_not_measured),
    })),
    weekly: weekly.map((r) => ({ weekStart: String(r.week_start), complete: num(r.complete) })),
    collectors: collectors.map((r) => ({
      collectorId: String(r.collector_id),
      completeTotal: num(r.complete_total),
      completeWeek: num(r.complete_week),
      measuredNoPhotos: num(r.measured_no_photos),
      consentedNotMeasured: num(r.consented_not_measured),
      practiceComplete: num(r.practice_complete),
      lastSentAt: (r.last_sent_at as string | null) ?? null,
      measurementsTaken: num(r.measurements_taken),
      measurementsSkipped: num(r.measurements_skipped),
      unusualKept: num(r.unusual_kept),
      photosMorePeople: num(r.photos_more_people),
    })),
    bands: bands.map((r) => ({ sex: String(r.sex), ageGroup: r.age_group as 'adult' | 'child', bandCm: num(r.band_cm), n: num(r.n) })),
    quality: quality.map((r) => ({ item: String(r.item), detail: (r.detail as string | null) ?? null, n: num(r.n) })),
    space: { databaseBytes: num(space[0]?.database_bytes), photoBytes: num(space[0]?.photo_bytes), photos: num(space[0]?.photos) },
  }
}
