/**
 * F5 measurement logic (specs/F5-measurements.md). Pure functions, so they are easy to test.
 * The catalogue, sets, reading formats and ×2 rules match the database exactly
 * (supabase/migrations/20261110000000_f5_measurements.sql): the database recomputes every value.
 */
export type Sex = 'female' | 'male'
export type Unit = 'cm' | 'in'

export type Code =
  | 'height' | 'neck_girth' | 'shoulder_width' | 'shoulder_length' | 'bust_girth' | 'underbust_girth'
  | 'chest_girth' | 'bust_point_distance' | 'shoulder_to_bust_point' | 'front_length' | 'back_length'
  | 'waist_girth' | 'high_hip_girth' | 'hip_girth' | 'waist_to_hip' | 'arm_length' | 'upper_arm_girth'
  | 'wrist_girth' | 'inseam' | 'outseam' | 'thigh_girth' | 'knee_girth' | 'calf_girth' | 'waist_to_knee'
  | 'shoulder_to_knee'

export interface MeasurementDef {
  code: Code
  label: string
  how: string
  /** Adult range in cm: outside it the app asks the collector to check (spec, accepted 9 Nov). */
  adult: [number, number]
}

/** In order, top to bottom (decision 16). */
export const CATALOGUE: readonly MeasurementDef[] = [
  { code: 'height', label: 'Height', how: 'Barefoot, back to the wall. Steel tape from the floor; straight edge flat on the head.', adult: [130, 210] },
  { code: 'neck_girth', label: 'Neck girth', how: 'Around the base of the neck.', adult: [28, 55] },
  { code: 'shoulder_width', label: 'Shoulder width', how: 'Shoulder point to shoulder point, across the back.', adult: [30, 60] },
  { code: 'shoulder_length', label: 'Shoulder length', how: 'Side of the neck to the shoulder point.', adult: [9, 20] },
  { code: 'bust_girth', label: 'Bust girth', how: 'Around the fullest part of the bust, tape level.', adult: [65, 170] },
  { code: 'underbust_girth', label: 'Under-bust girth', how: 'Around the ribcage just below the bust.', adult: [55, 150] },
  { code: 'chest_girth', label: 'Chest girth', how: 'Around the fullest part of the chest, under the arms.', adult: [70, 160] },
  { code: 'bust_point_distance', label: 'Bust point to bust point', how: 'Straight across, from one bust point to the other.', adult: [10, 30] },
  { code: 'shoulder_to_bust_point', label: 'Shoulder to bust point', how: 'From the side of the neck down to the bust point.', adult: [18, 40] },
  { code: 'front_length', label: 'Front length', how: 'Side of the neck to the waist, at the front (over the bust for women).', adult: [30, 60] },
  { code: 'back_length', label: 'Back length', how: 'From the neck bone at the back (nape) down to the waist.', adult: [32, 55] },
  { code: 'waist_girth', label: 'Waist girth', how: 'Around the natural waist (the narrowest part).', adult: [50, 170] },
  { code: 'high_hip_girth', label: 'High hip girth', how: 'Around the body about 10 cm below the waist.', adult: [60, 175] },
  { code: 'hip_girth', label: 'Hip girth', how: 'Around the fullest part of the hips.', adult: [70, 180] },
  { code: 'waist_to_hip', label: 'Waist to hip', how: 'At the side, from the waist down to the fullest part of the hip.', adult: [12, 30] },
  { code: 'arm_length', label: 'Arm length', how: 'Shoulder point to wrist bone, arm hanging relaxed.', adult: [45, 80] },
  { code: 'upper_arm_girth', label: 'Upper arm girth', how: 'Around the fullest part of the upper arm.', adult: [18, 60] },
  { code: 'wrist_girth', label: 'Wrist girth', how: 'Around the wrist, just above the wrist bone.', adult: [12, 24] },
  { code: 'inseam', label: 'Inseam', how: 'From the crotch down the inside of the leg to the ankle bone.', adult: [60, 100] },
  { code: 'outseam', label: 'Outseam', how: 'From the waist down the side of the leg to the ankle bone.', adult: [85, 125] },
  { code: 'thigh_girth', label: 'Thigh girth', how: 'Around the fullest part of the thigh.', adult: [35, 95] },
  { code: 'knee_girth', label: 'Knee girth', how: 'Around the middle of the knee.', adult: [28, 55] },
  { code: 'calf_girth', label: 'Calf girth', how: 'Around the fullest part of the calf.', adult: [25, 60] },
  { code: 'waist_to_knee', label: 'Waist to knee', how: 'From the waist down to the middle of the knee (skirt length).', adult: [45, 75] },
  { code: 'shoulder_to_knee', label: 'Shoulder to knee', how: 'From the side of the neck at the shoulder down to the knee (dress length).', adult: [80, 120] },
]

export const DEF: Record<Code, MeasurementDef> = Object.fromEntries(CATALOGUE.map((d) => [d.code, d])) as Record<Code, MeasurementDef>

const CHILD_CORE: readonly Code[] = ['height', 'neck_girth', 'shoulder_width', 'chest_girth', 'back_length', 'waist_girth', 'hip_girth', 'arm_length', 'inseam']
const MALE_ONLY: readonly Code[] = ['chest_girth']
const FEMALE_ONLY: readonly Code[] = ['bust_girth', 'underbust_girth', 'bust_point_distance', 'shoulder_to_bust_point', 'high_hip_girth', 'waist_to_knee', 'shoulder_to_knee']
export const INTIMATE: ReadonlySet<Code> = new Set(['bust_girth', 'underbust_girth', 'bust_point_distance', 'shoulder_to_bust_point', 'inseam'])
export const DOUBLE: ReadonlySet<Code> = new Set(['height', 'bust_girth', 'chest_girth', 'waist_girth', 'hip_girth'])

// ---------------------------------------------------------------- age groups (F5 Amendment C)

/** Age is recorded as a range, never the exact age (Ryan, 12 Nov). Stored text uses a plain hyphen. */
export const ADULT_RANGES = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'] as const
/** Children's ranges follow the measurement sets: 8–9 and 10–12 core set; 13–14 and 15–17 full set. */
export const CHILD_RANGES = ['8-9', '10-12', '13-14', '15-17'] as const
export type AgeRange = (typeof ADULT_RANGES)[number] | (typeof CHILD_RANGES)[number]

export const rangesFor = (ageGroup: 'adult' | 'child'): readonly AgeRange[] => (ageGroup === 'child' ? CHILD_RANGES : ADULT_RANGES)
export const isAgeRange = (v: unknown): v is AgeRange => typeof v === 'string' && ([...ADULT_RANGES, ...CHILD_RANGES] as string[]).includes(v)
/** For display: "25–34", "65+". */
export const showRange = (r: AgeRange) => r.replace('-', '–')

/** First and last year of a range (65+ → 65–100). */
export function rangeYears(r: AgeRange): [number, number] {
  if (r === '65+') return [65, 100]
  const [a, b] = r.split('-').map(Number)
  return [a, b]
}

/** The range an exact age falls in (only for drafts saved on a phone before Amendment C). */
export function rangeOf(age: number): AgeRange {
  const all: AgeRange[] = [...CHILD_RANGES, ...ADULT_RANGES]
  return all.find((r) => age >= rangeYears(r)[0] && age <= rangeYears(r)[1]) ?? (age < 8 ? '8-9' : '65+')
}

const isChildRange = (r: AgeRange) => rangeYears(r)[0] < 18

/** The set for a participant, in catalogue order (8–12 core; 13+ by sex). */
export function setFor(sex: Sex, range: AgeRange): Code[] {
  if (rangeYears(range)[1] <= 12) return CATALOGUE.map((d) => d.code).filter((c) => CHILD_CORE.includes(c))
  const not = sex === 'female' ? MALE_ONLY : FEMALE_ONLY
  return CATALOGUE.map((d) => d.code).filter((c) => !not.includes(c))
}

// ---------------------------------------------------------------- readings

/** Allowed inch fractions in lowest terms, as stored in `typed`. */
export const EIGHTHS: readonly { eighths: number; text: string; glyph: string }[] = [
  { eighths: 0, text: '', glyph: '0' },
  { eighths: 1, text: '1/8', glyph: '⅛' },
  { eighths: 2, text: '1/4', glyph: '¼' },
  { eighths: 3, text: '3/8', glyph: '⅜' },
  { eighths: 4, text: '1/2', glyph: '½' },
  { eighths: 5, text: '5/8', glyph: '⅝' },
  { eighths: 6, text: '3/4', glyph: '¾' },
  { eighths: 7, text: '7/8', glyph: '⅞' },
]

/** Whole inches + eighths → the stored text, e.g. (34, 3) → "34 3/8". */
export function inchesTyped(whole: number, eighths: number): string {
  const f = EIGHTHS[eighths]?.text ?? ''
  return f ? `${whole} ${f}` : String(whole)
}

/**
 * One typed reading → tenths of a cm (integer), or null if malformed. Same rules as the database:
 * cm "87.3" (0.1 cm); inches "34", "34 3/8" (halves, quarters, eighths in lowest terms). 1–300 cm.
 * Integer arithmetic so the rounding matches Postgres exactly.
 */
export function readingTenths(typed: string, unit: Unit): number | null {
  let tenths: number
  if (unit === 'cm') {
    const m = typed.match(/^(\d{1,3})(?:\.(\d))?$/)
    if (!m) return null
    tenths = Number(m[1]) * 10 + Number(m[2] ?? 0)
  } else {
    const m = typed.match(/^(\d{1,3})(?: ([1-7])\/([248]))?$/)
    if (!m) return null
    let eighths = Number(m[1]) * 8
    if (m[2]) {
      const allowed = (m[3] === '2' && m[2] === '1') || (m[3] === '4' && ['1', '3'].includes(m[2])) || (m[3] === '8' && ['1', '3', '5', '7'].includes(m[2]))
      if (!allowed) return null
      eighths += (Number(m[2]) * 8) / Number(m[3])
    }
    // 1 in = 2.54 cm → tenths of a cm per eighth of an inch = 3.175; round half up (Postgres round()).
    tenths = Math.round((eighths * 3175) / 1000)
  }
  return tenths >= 10 && tenths <= 3000 ? tenths : null
}

export const cm = (tenths: number) => tenths / 10
export const showCm = (tenths: number) => `${(tenths / 10).toFixed(1)} cm`

/** ×2 rule: after two readings, is a third needed (more than 1.0 cm apart)? */
export function needsThird(t: readonly number[]): boolean {
  return t.length === 2 && Math.abs(t[0] - t[1]) > 10
}

/** Value in tenths from the readings (one, or the mean of the two closest), or null if not complete. */
export function valueTenths(t: readonly number[], double: boolean): number | null {
  if (!double) return t.length === 1 ? t[0] : null
  if (t.length === 2) return needsThird(t) ? null : Math.round((t[0] + t[1]) / 2)
  if (t.length === 3 && needsThird(t.slice(0, 2))) {
    const pairs: [number, number][] = [[t[0], t[1]], [t[0], t[2]], [t[1], t[2]]]
    let best = pairs[0]
    for (const p of pairs.slice(1)) if (Math.abs(p[0] - p[1]) < Math.abs(best[0] - best[1])) best = p
    return Math.round((best[0] + best[1]) / 2)
  }
  return null
}

// ---------------------------------------------------------------- unusual values

/**
 * Children's height: WHO 2007 growth reference (height-for-age, 5–19 years), median ± 3 SD,
 * rounded to whole cm. Approximate values from the published WHO tables; to be checked at Gate A.
 */
const WHO_HEIGHT: Record<Sex, Record<number, [number, number]>> = {
  male: { 8: [110, 145], 9: [115, 150], 10: [119, 157], 11: [122, 164], 12: [126, 172], 13: [132, 180], 14: [140, 187], 15: [147, 191], 16: [152, 194], 17: [154, 196] },
  female: { 8: [109, 144], 9: [114, 151], 10: [119, 159], 11: [124, 166], 12: [130, 172], 13: [136, 177], 14: [141, 179], 15: [143, 181], 16: [144, 182], 17: [144, 182] },
}

/** Children 8–12: wide bands for the core set (girths and lengths). 13–17 use adult ranges. */
const CHILD_8_12: Partial<Record<Code, [number, number]>> = {
  neck_girth: [22, 42], shoulder_width: [24, 45], chest_girth: [50, 110], back_length: [24, 45],
  waist_girth: [40, 110], hip_girth: [50, 120], arm_length: [35, 65], inseam: [45, 85],
}

/**
 * The expected range for this participant, in cm. Children's height: the widest WHO limits across
 * the years of the range (lowest of the youngest year, highest of the oldest).
 */
export function expectedRange(code: Code, sex: Sex, range: AgeRange): [number, number] {
  const [from, to] = rangeYears(range)
  if (isChildRange(range) && code === 'height') return [WHO_HEIGHT[sex][from][0], WHO_HEIGHT[sex][to][1]]
  if (to <= 12) return CHILD_8_12[code] ?? DEF[code].adult
  return DEF[code].adult
}

/** Null if fine, otherwise the range it falls outside. */
export function unusual(code: Code, tenths: number, sex: Sex, range: AgeRange): [number, number] | null {
  const [lo, hi] = expectedRange(code, sex, range)
  const v = tenths / 10
  return v < lo || v > hi ? [lo, hi] : null
}

// ---------------------------------------------------------------- consistency between measurements

export interface Disagreement {
  codes: [Code, Code]
  message: string
}

type V = Partial<Record<Code, number>>

/** Each rule: (a, b, holds?) — checked only when both values exist. Values in cm. */
const RULES: { a: Code; b: Code; ok: (a: number, b: number) => boolean; say: string }[] = [
  { a: 'underbust_girth', b: 'bust_girth', ok: (a, b) => a < b, say: 'Under-bust is not smaller than bust.' },
  { a: 'high_hip_girth', b: 'hip_girth', ok: (a, b) => a <= b + 2, say: 'High hip is larger than hip.' },
  { a: 'waist_girth', b: 'hip_girth', ok: (a, b) => a <= b + 20, say: 'Waist is much larger than hip.' },
  { a: 'inseam', b: 'outseam', ok: (a, b) => a < b, say: 'Inseam is not shorter than outseam.' },
  { a: 'outseam', b: 'height', ok: (a, b) => a < b, say: 'Outseam is not shorter than height.' },
  { a: 'inseam', b: 'height', ok: (a, b) => a < b, say: 'Inseam is not shorter than height.' },
  { a: 'arm_length', b: 'height', ok: (a, b) => a < b / 2, say: 'Arm length is more than half the height.' },
  { a: 'back_length', b: 'height', ok: (a, b) => a < b / 3, say: 'Back length is more than a third of the height.' },
  { a: 'waist_to_knee', b: 'shoulder_to_knee', ok: (a, b) => a < b, say: 'Waist to knee is not shorter than shoulder to knee.' },
  { a: 'shoulder_to_knee', b: 'height', ok: (a, b) => a < b, say: 'Shoulder to knee is not shorter than height.' },
  { a: 'wrist_girth', b: 'upper_arm_girth', ok: (a, b) => a < b, say: 'Wrist is not smaller than upper arm.' },
  { a: 'knee_girth', b: 'thigh_girth', ok: (a, b) => a < b, say: 'Knee is not smaller than thigh.' },
  { a: 'calf_girth', b: 'thigh_girth', ok: (a, b) => a < b, say: 'Calf is not smaller than thigh.' },
  { a: 'bust_point_distance', b: 'bust_girth', ok: (a, b) => a < b / 2, say: 'Bust point distance is more than half the bust.' },
  { a: 'shoulder_to_bust_point', b: 'front_length', ok: (a, b) => a < b, say: 'Shoulder to bust point is not shorter than front length.' },
]

/** Disagreements that involve `code` (the one just entered), given all values so far. */
export function disagreements(code: Code, values: V): Disagreement[] {
  return RULES.filter((r) => (r.a === code || r.b === code) && values[r.a] !== undefined && values[r.b] !== undefined)
    .filter((r) => !r.ok(values[r.a]!, values[r.b]!))
    .map((r) => ({ codes: [r.a, r.b], message: `${r.say} Check both.` }))
}

// ---------------------------------------------------------------- weight (F5 Amendment A)

/** Expected weight range in kg by age range: outside it the app asks to check (can be kept). */
export function weightRange(range: AgeRange): [number, number] {
  const to = rangeYears(range)[1]
  if (to <= 12) return [18, 80]
  if (to <= 17) return [30, 150]
  return [30, 200]
}

/** Null if fine, otherwise the range the weight (in tenths of a kg) falls outside. */
export function unusualWeight(tenths: number, range: AgeRange): [number, number] | null {
  const [lo, hi] = weightRange(range)
  const v = tenths / 10
  return v < lo || v > hi ? [lo, hi] : null
}

// ---------------------------------------------------------------- stated height (F5 Amendment B)

export type ToldUnit = 'cm' | 'ftin'

/** Feet, inches (0–11) and eighths → stored text, e.g. (5, 7, 4) → "5 7 1/2". */
export function ftinTyped(feet: number, inches: number, eighths: number): string {
  const f = EIGHTHS[eighths]?.text ?? ''
  return f ? `${feet} ${inches} ${f}` : `${feet} ${inches}`
}

/** Stated height → tenths of a cm, or null. Same rules as the database (private.told_height_cm). */
export function toldHeightTenths(typed: string, unit: ToldUnit): number | null {
  let tenths: number | null
  if (unit === 'cm') tenths = readingTenths(typed, 'cm')
  else {
    const m = typed.match(/^([1-8]) (\d|1[01])(?: ([1-7])\/([248]))?$/)
    if (!m) return null
    let eighths = (Number(m[1]) * 12 + Number(m[2])) * 8
    if (m[3]) {
      const ok = (m[4] === '2' && m[3] === '1') || (m[4] === '4' && ['1', '3'].includes(m[3])) || (m[4] === '8' && ['1', '3', '5', '7'].includes(m[3]))
      if (!ok) return null
      eighths += (Number(m[3]) * 8) / Number(m[4])
    }
    tenths = Math.round((eighths * 3175) / 1000)
  }
  return tenths !== null && tenths >= 500 && tenths <= 2500 ? tenths : null
}
