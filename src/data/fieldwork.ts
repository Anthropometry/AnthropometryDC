/**
 * Supabase calls for M2 (F2 settings and phone checks, F3 practice). Row-level security and the
 * database triggers decide what is allowed; these calls only ask.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PhoneCheckResult } from '../lib/phonecheck'
import type { LocalPractice, PracticeRow } from '../lib/practice'
import type { Settings } from '../lib/settings'

export async function saveSettingsRemote(client: SupabaseClient, id: string, s: Settings): Promise<void> {
  const { data, error } = await client
    .from('collectors')
    .update({ unit: s.unit, language: s.language })
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!data || data.length !== 1) throw new Error('not_saved')
}

export async function saveDeviceCheck(client: SupabaseClient, r: PhoneCheckResult): Promise<void> {
  const { error } = await client.from('device_checks').insert({
    phone_model: r.phoneModel,
    os: r.os,
    browser: r.browser,
    camera_ok: r.cameraOk,
    camera_resolution: r.cameraResolution,
    motion_ok: r.motionOk,
    storage_ok: r.storageOk,
    storage_mb: r.storageMb,
    passed: r.passed,
  })
  if (error) throw error
}

export interface PhoneCheckRow {
  collectorId: string
  displayName: string
  phoneModel: string | null
  os: string | null
  browser: string | null
  passed: boolean
  checkedAt: string
}

/** Admin only (checked again in the database): latest check per collector. */
export async function listPhoneChecks(client: SupabaseClient): Promise<PhoneCheckRow[]> {
  const { data, error } = await client.rpc('admin_phone_checks')
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    collectorId: r.collector_id as string,
    displayName: (r.display_name as string | null) ?? '',
    phoneModel: (r.phone_model as string | null) ?? null,
    os: (r.os as string | null) ?? null,
    browser: (r.browser as string | null) ?? null,
    passed: r.passed === true,
    checkedAt: r.checked_at as string,
  }))
}

export async function fetchCollectionOpen(client: SupabaseClient): Promise<boolean> {
  return (await fetchGate(client)).open
}

/** F3/F4: is real collection open, and which consent version real consents must use (null before Gate B). */
export async function fetchGate(client: SupabaseClient): Promise<{ open: boolean; consentVersion: string | null }> {
  const { data, error } = await client.from('app_settings').select('collection_open, consent_version').maybeSingle()
  if (error) throw error
  return { open: data?.collection_open === true, consentVersion: (data?.consent_version as string | null) ?? null }
}

/** Insert a practice participant; if it already arrived (a retry), read its number instead. */
export async function insertPractice(client: SupabaseClient, p: LocalPractice): Promise<number | null> {
  const { data, error } = await client
    .from('participants')
    .insert({ id: p.id, is_practice: true, age_group: p.ageGroup })
    .select('practice_no')
    .single()
  if (!error) return (data?.practice_no as number | null) ?? null
  if (error.code !== '23505') throw error
  const again = await client.from('participants').select('practice_no').eq('id', p.id).single()
  if (again.error) throw again.error
  return (again.data?.practice_no as number | null) ?? null
}

/** The signed-in collector's own practice records. Admins may read everyone's, so filter by owner. */
export async function listPractice(client: SupabaseClient, collectorId: string): Promise<PracticeRow[]> {
  const { data, error } = await client
    .from('participants')
    .select('id, practice_no, age_group, status, created_at')
    .eq('is_practice', true)
    .eq('collector_id', collectorId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    practiceNo: (r.practice_no as number | null) ?? null,
    ageGroup: r.age_group as 'adult' | 'child',
    status: r.status as string,
    createdAt: r.created_at as string,
    waiting: false,
  }))
}

/** Through the Worker, so a practice participant's signature images are deleted too (F4). */
export async function deletePractice(
  client: SupabaseClient,
  id: string,
  fetchFn: (input: string, init: RequestInit) => Promise<Response> = (i, r) => fetch(i, r),
): Promise<void> {
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('signed_out')
  const res = await fetchFn(`/api/practice/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
  if (res.status !== 200) throw new Error(`not_deleted_${res.status}`)
}
