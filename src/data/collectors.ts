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
  /** Who created the code they joined with: a collector name, "<name> (admin)", "admin", or null. */
  invitedBy: string | null
}

/** Admin only (checked again in the database). */
export async function listCollectors(client: SupabaseClient): Promise<CollectorRow[]> {
  const { data, error } = await client.rpc('admin_list_collectors')
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    displayName: (r.display_name as string | null) ?? '',
    phone: r.phone as string,
    status: r.status as CollectorStatus,
    role: r.role as 'collector' | 'admin',
    createdAt: r.created_at as string,
    inviteLabel: (r.invite_label as string | null) ?? null,
    invitedBy: (r.invited_by as string | null) ?? null,
  }))
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
  /** True for an active admin-made code whose plain code is kept (Amendment B1). */
  canShow: boolean
}

/** Admin only (checked again in the database). */
export async function listInvites(client: SupabaseClient): Promise<InviteRow[]> {
  const { data, error } = await client.rpc('admin_list_invites')
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    label: r.label as string,
    maxUses: r.max_uses as number,
    uses: r.uses as number,
    expiresAt: r.expires_at as string,
    revoked: r.revoked as boolean,
    canShow: r.can_show === true,
  }))
}

/** The plain code of an active admin-made code (Amendment B1). Admin only. */
export async function showInvite(client: SupabaseClient, id: string): Promise<string> {
  const { data, error } = await client.rpc('admin_show_invite', { p_id: id })
  if (error) throw error
  if (typeof data !== 'string') throw new Error('code_not_available')
  return data
}

/** Returns the plain code. Admins can show it again while it is active (Amendment B1). */
export async function createInvite(client: SupabaseClient, label: string, maxUses = 3, days = 10): Promise<string> {
  const { data, error } = await client.rpc('create_invite', { p_label: label, p_max_uses: maxUses, p_days: days })
  if (error) throw error
  return data as string
}

export async function revokeInvite(client: SupabaseClient, id: string) {
  const { error } = await client.rpc('revoke_invite', { p_id: id })
  if (error) throw error
}

// ---------------------------------------------------------------- referral codes (Amendment A3)

export interface MyInviteRow {
  id: string
  label: string
  maxUses: number
  uses: number
  expiresAt: string
  revoked: boolean
}

/** The signed-in collector's own codes (no hashes). */
export async function listMyInvites(client: SupabaseClient): Promise<MyInviteRow[]> {
  const { data, error } = await client.rpc('my_invites')
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    label: r.label as string,
    maxUses: r.max_uses as number,
    uses: r.uses as number,
    expiresAt: r.expires_at as string,
    revoked: r.revoked as boolean,
  }))
}

/** New referral code (3 joins, 10 days). Throws "too_many_active_codes" when 2 are already active. */
export async function createMyInvite(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.rpc('create_my_invite')
  if (error) throw new Error(error.message.includes('too_many_active_codes') ? 'too_many_active_codes' : 'failed')
  return data as string
}

export async function revokeMyInvite(client: SupabaseClient, id: string) {
  const { error } = await client.rpc('revoke_my_invite', { p_id: id })
  if (error) throw error
}
