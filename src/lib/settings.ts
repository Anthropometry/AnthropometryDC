/**
 * F2 settings: unit and language, saved on the phone first and sent when online.
 * Only unit and language: the database refuses any other change by a collector.
 */
import { readJson, writeJson, type KeyValueStore, type Language, type Profile, type Unit } from './profile'

export interface Settings {
  unit: Unit
  language: Language
}

const PENDING = 'anthro-collect.settings-pending.v1'

export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English only', fr: 'French', tw: 'Twi' }
export const UNIT_NAMES: Record<Unit, string> = { cm: 'Centimetres (cm)', in: 'Inches (in)' }

export function loadPendingSettings(store: KeyValueStore | undefined): Settings | null {
  const v = readJson<Partial<Settings> | null>(store, PENDING, null)
  return v && (v.unit === 'cm' || v.unit === 'in') && (v.language === 'en' || v.language === 'fr' || v.language === 'tw')
    ? { unit: v.unit, language: v.language }
    : null
}

/** The profile as the collector last chose it, even before the server has it. */
export function withSettings(profile: Profile, s: Settings | null): Profile {
  return s ? { ...profile, unit: s.unit, language: s.language, settingsChosen: true } : profile
}

/** Save on the phone now; `send` tries the server and clears the pending copy when it worked. */
export async function saveSettings(
  store: KeyValueStore | undefined,
  s: Settings,
  send: (s: Settings) => Promise<void>,
): Promise<'saved' | 'waiting'> {
  writeJson(store, PENDING, s)
  return flushSettings(store, send)
}

export async function flushSettings(
  store: KeyValueStore | undefined,
  send: (s: Settings) => Promise<void>,
): Promise<'saved' | 'waiting'> {
  const s = loadPendingSettings(store)
  if (!s) return 'saved'
  try {
    await send(s)
    // Clear only if nothing newer was saved meanwhile.
    const now = loadPendingSettings(store)
    if (now && now.unit === s.unit && now.language === s.language) writeJson(store, PENDING, null)
    return 'saved'
  } catch {
    return 'waiting'
  }
}
