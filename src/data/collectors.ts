/**
 * Supabase calls for profiles and the admin screen. Row-level security and the security-definer
 * functions decide what is allowed; these calls only ask.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseProfile, type CollectorStatus, type Profile } from '../lib/profile'

export async function fetchOwnProfile(client: SupabaseClient): Promise<Profile | null> {
  const { data: userData } = await client.auth.getUser()
  const uid = userData.user?.id
  if (!uid) return null
  const { data, error } = await client
    .from('collectors')
    .select('id, display_name, status, role')
    .eq('id', uid)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return parseProfile({ id: data.id, displayName: data.display_name ?? '', status: data.status, role: data.role })
}

export interface CollectorRow {
  id: string
  displayName: string
  phone: string
  status: CollectorStatus
  role: 'collector' | 'admin'
  createdAt: string
  inviteLabel: string | null
}

export async function listCollectors(client: SupabaseClient): Promise<CollectorRow[]> {
  const { data, error } = await client
    .from('collectors')
    .select('id, display_name, phone, status, role, created_at, invite_codes(label)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => {
    const invite = r.invite_codes as { label?: string } | { label?: string }[] | null
    const label = Array.isArray(invite) ? invite[0]?.label : invite?.label
    return {
      id: r.id as string,
      displayName: (r.display_name as string | null) ?? '',
      phone: r.phone as string,
      status: r.status as CollectorStatus,
      role: r.role as 'collector' | 'admin',
      createdAt: r.created_at as string,
      inviteLabel: label ?? null,
    }
  })
}

export async function decideCollector(
  client: SupabaseClient,
  id: string,
  decision: 'approved' | 'rejected' | 'disabled',
) {
  const { error } = await client.rpc('approve_collector', { p_id: id, p_decision: decision })
  if (error) throw error
}

export interface InviteRow {
  id: string
  label: string
  maxUses: number
  uses: number
  expiresAt: string
  revoked: boolean
}

export async function listInvites(client: SupabaseClient): Promise<InviteRow[]> {
  const { data, error } = await client
    .from('invite_codes')
    .select('id, label, max_uses, uses, expires_at, revoked')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    label: r.label as string,
    maxUses: r.max_uses as number,
    uses: r.uses as number,
    expiresAt: r.expires_at as string,
    revoked: r.revoked as boolean,
  }))
}

/** Returns the plain code. It is shown once; only its hash is stored. */
export async function createInvite(client: SupabaseClient, label: string, maxUses = 10, days = 14): Promise<string> {
  const { data, error } = await client.rpc('create_invite', { p_label: label, p_max_uses: maxUses, p_days: days })
  if (error) throw error
  return data as string
}

export async function revokeInvite(client: SupabaseClient, id: string) {
  const { error } = await client.rpc('revoke_invite', { p_id: id })
  if (error) throw error
}
