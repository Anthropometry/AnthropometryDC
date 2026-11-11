/**
 * F5 calls: participant details, measurements (insert, or update on a retry or a change), Finish,
 * and reading back a participant's own measurements. The database checks every rule and
 * recomputes every centimetre value; the app never sends one.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { About, Entry, MeasureApi, Weight } from '../lib/measureQueue'
import type { Code } from '../lib/measurements'

const isDuplicate = (e: { code?: string; message?: string } | null) =>
  !!e && e.code === '23505' && (e.message ?? '').includes('measurements_participant_id_code_key')

/** Only the columns a collector may change (the database grant allows exactly these). */
function changeable(e: Entry) {
  return {
    unit: e.unit,
    readings_typed: e.readingsTyped,
    skipped: e.skipped,
    skip_reason: e.skipReason,
    skip_note: e.skipNote,
    confirmed_unusual: e.confirmedUnusual,
    height_method: e.heightMethod,
    hair_adds_height: e.hairAddsHeight,
    measured_at: e.measuredAt,
  }
}

export function measureApi(client: SupabaseClient): MeasureApi {
  return {
    async saveAbout(participantId: string, about: About) {
      const { data, error } = await client
        .from('participants')
        .update({ sex: about.sex, age_years: about.ageYears, clothing: about.clothing })
        .eq('id', participantId)
        .select('id')
      if (error) throw error
      if (!data || data.length !== 1) throw new Error('not_saved')
    },
    async saveEntry(participantId: string, entry: Entry) {
      const { error } = await client.from('measurements').insert({ participant_id: participantId, code: entry.code, ...changeable(entry) })
      if (!error) return
      if (!isDuplicate(error)) throw error
      const again = await client
        .from('measurements')
        .update(changeable(entry))
        .eq('participant_id', participantId)
        .eq('code', entry.code)
        .select('id')
      if (again.error) throw again.error
      if (!again.data || again.data.length !== 1) throw new Error('not_saved')
    },
    async saveWeight(participantId: string, w: Weight) {
      const { data, error } = await client
        .from('participants')
        .update({ weight_kg: w.kg, weight_source: w.kg === null ? null : w.source })
        .eq('id', participantId)
        .select('id')
      if (error) throw error
      if (!data || data.length !== 1) throw new Error('not_saved')
    },
    async finish(participantId: string) {
      const { data, error } = await client
        .from('participants')
        .update({ measurements_done_at: new Date().toISOString() })
        .eq('id', participantId)
        .is('measurements_done_at', null)
        .select('id')
      if (error) throw error
      // Already finished (a retry) is fine; nothing else to check.
      void data
    },
  }
}

/** A participant's measurements from the server (own participants only, by row-level security). */
export async function fetchEntries(client: SupabaseClient, participantId: string): Promise<Partial<Record<Code, Entry>>> {
  const { data, error } = await client
    .from('measurements')
    .select('code, unit, readings_typed, skipped, skip_reason, skip_note, confirmed_unusual, height_method, hair_adds_height, measured_at')
    .eq('participant_id', participantId)
  if (error) throw error
  const out: Partial<Record<Code, Entry>> = {}
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const code = r.code as Code
    out[code] = {
      code,
      unit: (r.unit as Entry['unit']) ?? null,
      readingsTyped: (r.readings_typed as string[]) ?? [],
      skipped: r.skipped === true,
      skipReason: (r.skip_reason as Entry['skipReason']) ?? null,
      skipNote: (r.skip_note as string | null) ?? null,
      confirmedUnusual: r.confirmed_unusual === true,
      heightMethod: (r.height_method as Entry['heightMethod']) ?? null,
      hairAddsHeight: (r.hair_adds_height as boolean | null) ?? null,
      measuredAt: r.measured_at as string,
    }
  }
  return out
}
