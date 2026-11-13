/**
 * F8 research export (specs/F8-admin-export.md): turns database rows and photo files into the dataset
 * folder. Pure apart from the image fetcher, so it is tested on fake data only.
 * Never included: practice (unless asked, then marked PRACTICE), rejected participants, names,
 * signatures, guardian names, receipt codes, consent records, collectors' names or phones, photos made
 * with the old blur. Participants get a new random export id each export; the mapping is returned
 * separately and stays in Ryan's data folder.
 */

export interface PRow {
  id: string
  collector_id: string
  is_practice: boolean
  age_group: 'adult' | 'child'
  status: string
  sex: string | null
  age_range: string | null
  clothing: string | null
  created_at: string
  measurements_done_at: string | null
  photos_done_at: string | null
  height_told_typed: string | null
  height_told_unit: string | null
  height_told_cm: number | string | null
  weight_told_kg: number | string | null
  weight_kg: number | string | null
  weight_source: string | null
  intimate_ok: boolean
  weight_ok: boolean
}

/** Only what proves consent exists and which version: never names or signatures. */
export interface CRow {
  participant_id: string
  consent_version: string
}

export interface MRow {
  participant_id: string
  code: string
  unit: string | null
  readings_cm: (number | string)[] | null
  value_cm: number | string | null
  skipped: boolean
  skip_reason: string | null
  confirmed_unusual: boolean
  height_method: string | null
  hair_adds_height: boolean | null
}

export interface FRow {
  participant_id: string
  slot: 'front' | 'side' | 'back'
  width: number
  height: number
  bytes: number
  taken_at: string
  zoom: number | string
  level_pitch: number | string | null
  level_roll: number | string | null
  head_top_y: number | null
  heel_y: number | null
  people_detected: number | null
  faces_detected: number
  a4_confirmed: boolean
  blur_version: number
  phone_model: string | null
}

export interface ExportInput {
  participants: PRow[]
  consents: CRow[]
  measurements: MRow[]
  photos: FRow[]
  /** Approved collectors' ids in the order they joined (for codes C01, C02 …). */
  collectorIds: string[]
  includePractice: boolean
  exportedAt: Date
}

export interface ExportResult {
  files: Map<string, string | Uint8Array>
  /** export id → database id: kept ONLY in Ryan's data folder, never shared. */
  mapping: string
  counts: { participants: number; measurements: number; photos: number; practice: number }
}

export class ExportProblem extends Error {}

const MAX_BYTES = 4 * 1024 * 1024
const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff

/** CSV with quotes only where needed. */
export function csv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const cell = (v: string | number | boolean | null | undefined) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n'
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
const n = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v))

export const README = (i: { exportedAt: Date; includePractice: boolean; counts: ExportResult['counts'] }) => `Anthro Collect research dataset
A student research project at Ashesi University.
Exported: ${i.exportedAt.toISOString()}
${i.includePractice ? '\n*** INCLUDES PRACTICE RECORDS (marked practice = true). NOT FOR RESEARCH. ***\n' : ''}
Participants: ${i.counts.participants}   Measurements: ${i.counts.measurements}   Photos: ${i.counts.photos}

No names, signatures, receipt codes or consent records are included. Faces were blurred on the phone
before each photo was saved. Each participant has a new random export id in this export; it does not
match other exports.

participants.csv  one row per participant
  export_id, practice, sex (female/male), age_group (adult/child), age_range (e.g. 25-34),
  clothing (light/medium/heavy), consent_version, intimate_agreed, weight_agreed,
  stated_height_typed, stated_height_unit (cm or ftin: "5 7 1/2" = 5 ft 7.5 in), stated_height_cm,
  stated_weight_kg, weight_kg, weight_source (scale/told), collector (C01 …), phone_model,
  created_date, measured_date, photos_date
measurements.csv  one row per participant and measurement
  export_id, code (ISO 8559-1 based), value_cm (the mean of the two closest readings for x2 codes),
  readings_cm (separated by |), unit_typed (cm/in), skipped, skip_reason, unusual_confirmed,
  height_method (steel_tape / wall_100), hair_adds_height
photos.csv  one row per photo
  export_id, slot (front/side/back), file, width, height, bytes, taken_at, zoom (digital zoom, 1-4),
  level_pitch_deg, level_roll_deg (phone tilt at the shutter), head_top_y, heel_y (pixels from the
  top, measured before the blur), people_detected, faces_detected, a4_confirmed, blur_version
images/<export_id>/front.jpg, side.jpg, back.jpg   3:4 portrait JPEGs, head blurred
metadata/<export_id>.json   everything above for one participant
`

export async function buildExport(
  input: ExportInput,
  fetchImage: (participantId: string, isPractice: boolean, slot: string) => Promise<Uint8Array>,
  newId: () => string = () => crypto.randomUUID(),
): Promise<ExportResult> {
  const consented = new Map(input.consents.map((c) => [c.participant_id, c.consent_version]))
  const people = input.participants
    .filter((p) => consented.has(p.id) && p.status !== 'rejected' && (!p.is_practice || input.includePractice))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const ids = new Map(people.map((p) => [p.id, newId()]))
  const code = (collectorId: string) => {
    const i = input.collectorIds.indexOf(collectorId)
    return i < 0 ? 'C??' : `C${String(i + 1).padStart(2, '0')}`
  }

  const files = new Map<string, string | Uint8Array>()
  const pRows: (string | number | boolean | null)[][] = []
  const mRows: (string | number | boolean | null)[][] = []
  const fRows: (string | number | boolean | null)[][] = []

  for (const p of people) {
    const eid = ids.get(p.id)!
    const ms = input.measurements.filter((m) => m.participant_id === p.id).sort((a, b) => a.code.localeCompare(b.code))
    const fs = input.photos.filter((f) => f.participant_id === p.id && f.blur_version === 2).sort((a, b) => a.slot.localeCompare(b.slot))
    const phone = fs.find((f) => f.phone_model)?.phone_model ?? null
    const participant = {
      export_id: eid,
      practice: p.is_practice,
      sex: p.sex,
      age_group: p.age_group,
      age_range: p.age_range,
      clothing: p.clothing,
      consent_version: consented.get(p.id)!,
      intimate_agreed: p.intimate_ok,
      weight_agreed: p.weight_ok,
      stated_height_typed: p.height_told_typed,
      stated_height_unit: p.height_told_unit,
      stated_height_cm: n(p.height_told_cm),
      stated_weight_kg: n(p.weight_told_kg),
      weight_kg: n(p.weight_kg),
      weight_source: p.weight_source,
      collector: code(p.collector_id),
      phone_model: phone,
      created_date: day(p.created_at),
      measured_date: day(p.measurements_done_at),
      photos_date: day(p.photos_done_at),
    }
    pRows.push(Object.values(participant))
    const measurements = ms.map((m) => ({
      code: m.code,
      value_cm: n(m.value_cm),
      readings_cm: (m.readings_cm ?? []).map(Number),
      unit_typed: m.unit,
      skipped: m.skipped,
      skip_reason: m.skip_reason,
      unusual_confirmed: m.confirmed_unusual,
      height_method: m.height_method,
      hair_adds_height: m.hair_adds_height,
    }))
    for (const m of measurements)
      mRows.push([eid, m.code, m.value_cm, m.readings_cm.join('|'), m.unit_typed, m.skipped, m.skip_reason, m.unusual_confirmed, m.height_method, m.hair_adds_height])
    const photos = []
    for (const f of fs) {
      let img: Uint8Array
      try {
        img = await fetchImage(p.id, p.is_practice, f.slot)
      } catch {
        throw new ExportProblem(`A photo row has no file in storage (${f.slot} of export id ${eid}). Nothing was written.`)
      }
      if (!isJpeg(img) || img.length > MAX_BYTES) throw new ExportProblem(`A stored photo is not a JPEG or is too large (${f.slot} of export id ${eid}). Nothing was written.`)
      const file = `images/${eid}/${f.slot}.jpg`
      files.set(file, img)
      const photo = {
        slot: f.slot,
        file,
        width: f.width,
        height: f.height,
        bytes: f.bytes,
        taken_at: f.taken_at,
        zoom: n(f.zoom),
        level_pitch_deg: n(f.level_pitch),
        level_roll_deg: n(f.level_roll),
        head_top_y: f.head_top_y,
        heel_y: f.heel_y,
        people_detected: f.people_detected,
        faces_detected: f.faces_detected,
        a4_confirmed: f.a4_confirmed,
        blur_version: f.blur_version,
      }
      photos.push(photo)
      fRows.push([eid, ...Object.values(photo)])
    }
    files.set(`metadata/${eid}.json`, JSON.stringify({ participant, measurements, photos }, null, 2) + '\n')
  }

  const counts = { participants: people.length, measurements: mRows.length, photos: fRows.length, practice: people.filter((p) => p.is_practice).length }
  files.set('README.txt', README({ exportedAt: input.exportedAt, includePractice: input.includePractice, counts }))
  files.set(
    'participants.csv',
    csv(
      ['export_id', 'practice', 'sex', 'age_group', 'age_range', 'clothing', 'consent_version', 'intimate_agreed', 'weight_agreed', 'stated_height_typed', 'stated_height_unit', 'stated_height_cm', 'stated_weight_kg', 'weight_kg', 'weight_source', 'collector', 'phone_model', 'created_date', 'measured_date', 'photos_date'],
      pRows,
    ),
  )
  files.set('measurements.csv', csv(['export_id', 'code', 'value_cm', 'readings_cm', 'unit_typed', 'skipped', 'skip_reason', 'unusual_confirmed', 'height_method', 'hair_adds_height'], mRows))
  files.set(
    'photos.csv',
    csv(['export_id', 'slot', 'file', 'width', 'height', 'bytes', 'taken_at', 'zoom', 'level_pitch_deg', 'level_roll_deg', 'head_top_y', 'heel_y', 'people_detected', 'faces_detected', 'a4_confirmed', 'blur_version'], fRows),
  )
  const mapping = csv(['export_id', 'database_id'], [...ids.entries()].map(([db, eid]) => [eid, db]))
  return { files, mapping, counts }
}

/** The data folder must be outside the project and outside OneDrive (spec, decision 7). */
export function dataFolderProblem(folder: string, projectRoot: string): string | null {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const f = norm(folder)
  const root = norm(projectRoot)
  if (!f) return 'Give the data folder: npm run export -- --data C:\\anthro-data'
  if (f === root || f.startsWith(`${root}/`)) return 'The data folder must be outside the project folder (it syncs to OneDrive and GitHub).'
  if (/onedrive|dropbox|google ?drive|icloud/.test(f)) return 'The data folder must not be in OneDrive or another synced folder. Use a local folder such as C:\\anthro-data.'
  return null
}
