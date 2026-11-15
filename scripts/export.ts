// F8 research export (specs/F8-admin-export.md). Run by Ryan only, on his laptop:
//   npm run export -- --data C:\anthro-data              (real participants)
//   npm run export -- --data C:\anthro-data --include-practice   (test run, marked PRACTICE)
// Reads <data>/.env.admin (never in the repo, never in chat):
//   SUPABASE_URL=...  SUPABASE_SECRET_KEY=...
//   R2_ACCOUNT_ID=...  R2_ACCESS_KEY_ID=...  R2_SECRET_ACCESS_KEY=...  (a READ-ONLY R2 key)
//   R2_PHOTOS_BUCKET=anthro-collect-photos   (optional)
// Writes only inside the data folder, which must be outside this project and outside OneDrive.
// Prints counts only: never names, ids or values. Claude Code never runs this against the real project.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { buildExport, dataFolderProblem, ExportProblem, type CRow, type FRow, type MRow, type PRow } from '../src/lib/exportData.ts'
import { amzDate, signGet } from '../src/lib/sigv4.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const dataArg = args[args.indexOf('--data') + 1] && args.includes('--data') ? args[args.indexOf('--data') + 1] : process.env.ANTHRO_DATA_DIR ?? ''
const includePractice = args.includes('--include-practice')

function fail(msg: string): never {
  console.error(`Export stopped: ${msg}`)
  process.exit(1)
}

const data = dataArg ? resolve(dataArg) : ''
const problem = dataFolderProblem(data, root)
if (problem) fail(problem)

let env: Record<string, string>
try {
  env = Object.fromEntries(
    readFileSync(join(data, '.env.admin'), 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )
} catch {
  fail(`no .env.admin in ${data}. See docs/ADMIN.md, "Research export".`)
}
for (const k of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) if (!env[k]) fail(`${k} is missing in .env.admin`)

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })

/** Every row, 1000 at a time (the server's page size). */
async function all<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data: rows, error } = await db.from(table).select(columns).range(from, from + 999)
    if (error) fail(`could not read ${table} (${error.code ?? 'error'})`)
    out.push(...((rows ?? []) as T[]))
    if (!rows || rows.length < 1000) return out
  }
}

const bucket = env.R2_PHOTOS_BUCKET || 'anthro-collect-photos'
const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
async function fetchImage(participantId: string, isPractice: boolean, slot: string): Promise<Uint8Array> {
  const path = `/${bucket}/${isPractice ? 'practice/' : ''}${participantId}/${slot}.jpg`
  const headers = await signGet({ method: 'GET', host, path, region: 'auto', accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, amzDate: amzDate(new Date()) })
  const res = await fetch(`https://${host}${path}`, { headers })
  if (!res.ok) throw new Error(`r2_${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

const participants = await all<PRow>(
  'participants',
  'id, collector_id, is_practice, age_group, status, sex, age_range, clothing, created_at, measurements_done_at, photos_done_at, height_told_typed, height_told_unit, height_told_cm, weight_told_kg, weight_kg, weight_source, intimate_ok, weight_ok',
)
// Consents: only that one exists and its version. Never names or signatures.
const consents = await all<CRow>('consents', 'participant_id, consent_version')
const measurements = await all<MRow>('measurements', 'participant_id, code, unit, readings_cm, value_cm, skipped, skip_reason, confirmed_unusual, height_method, hair_adds_height')
const photos = await all<FRow>(
  'photos',
  'participant_id, slot, width, height, bytes, taken_at, zoom, level_pitch, level_roll, head_top_y, heel_y, people_detected, faces_detected, a4_confirmed, blur_version, phone_model',
)
const { data: approved, error: collectorsError } = await db.from('collectors').select('id').eq('status', 'approved').order('created_at')
if (collectorsError) fail('could not read collectors')
const collectors = (approved ?? []) as { id: string }[]

const exportedAt = new Date()
let result
try {
  result = await buildExport({ participants, consents, measurements, photos, collectorIds: collectors.map((c) => c.id), includePractice, exportedAt }, fetchImage)
} catch (e) {
  fail(e instanceof ExportProblem ? e.message : 'could not build the export')
}

const stamp = exportedAt.toISOString().slice(0, 16).replace(/[:T]/g, '-')
const name = `anthro-export-${stamp}${includePractice ? '-PRACTICE' : ''}`
const out = join(data, name)
for (const [path, body] of result.files) {
  mkdirSync(dirname(join(out, path)), { recursive: true })
  writeFileSync(join(out, path), body)
}
// The key from export ids back to the database: kept apart, never shared.
writeFileSync(join(data, `${name}-MAPPING-keep-private.csv`), result.mapping)

const c = result.counts
console.log(`Export written to ${out}`)
console.log(`Participants: ${c.participants}${includePractice ? ` (practice: ${c.practice})` : ''} · measurements: ${c.measurements} · photos: ${c.photos}`)
console.log(`The mapping file (${name}-MAPPING-keep-private.csv) stays in ${data}: never share it.`)
