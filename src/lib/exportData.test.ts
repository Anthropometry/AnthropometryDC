/** F8 research export on fake data only: files, columns, exclusions, export ids, checks. */
import { describe, expect, it, vi } from 'vitest'
import { buildExport, csv, dataFolderProblem, ExportProblem, type ExportInput, type FRow, type MRow, type PRow } from './exportData'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

const person = (id: string, over: Partial<PRow> = {}): PRow => ({
  id,
  collector_id: 'col-1',
  is_practice: false,
  age_group: 'adult',
  status: 'draft',
  sex: 'female',
  age_range: '25-34',
  clothing: 'light',
  created_at: `2026-12-01T09:00:0${id.length % 10}Z`,
  measurements_done_at: '2026-12-01T09:20:00Z',
  photos_done_at: '2026-12-01T09:30:00Z',
  height_told_typed: '5 7 1/2',
  height_told_unit: 'ftin',
  height_told_cm: '171.5',
  weight_told_kg: null,
  weight_kg: '64.2',
  weight_source: 'scale',
  intimate_ok: true,
  weight_ok: true,
  ...over,
})
const m = (participant_id: string, code: string, value: string): MRow => ({ participant_id, code, unit: 'cm', readings_cm: [value, value], value_cm: value, skipped: false, skip_reason: null, confirmed_unusual: false, height_method: code === 'height' ? 'steel_tape' : null, hair_adds_height: null })
const f = (participant_id: string, slot: FRow['slot'], over: Partial<FRow> = {}): FRow => ({ participant_id, slot, width: 1200, height: 1600, bytes: 7, taken_at: '2026-12-01T09:25:00Z', zoom: '1.5', level_pitch: '0.4', level_roll: '-0.2', head_top_y: 60, heel_y: 1540, people_detected: 1, faces_detected: 1, a4_confirmed: true, blur_version: 2, phone_model: 'TECNO KI5', ...over })

function input(over: Partial<ExportInput> = {}): ExportInput {
  return {
    participants: [person('real-1'), person('real-2', { sex: 'male' }), person('prac-1', { is_practice: true }), person('rej-1', { status: 'rejected' }), person('noconsent')],
    consents: [{ participant_id: 'real-1', consent_version: 'v1' }, { participant_id: 'real-2', consent_version: 'v1' }, { participant_id: 'prac-1', consent_version: 'practice' }, { participant_id: 'rej-1', consent_version: 'v1' }],
    measurements: [m('real-1', 'height', '171.0'), m('real-1', 'waist_girth', '78.4'), m('prac-1', 'height', '160.0')],
    photos: [f('real-1', 'front'), f('real-1', 'side'), f('real-2', 'front', { blur_version: 1 })],
    collectorIds: ['col-0', 'col-1'],
    includePractice: false,
    exportedAt: new Date('2027-01-15T10:00:00Z'),
    ...over,
  }
}

let n = 0
const ids = () => `exp-${++n}`

describe('research export', () => {
  it('writes README, CSVs, images and one metadata file per participant', async () => {
    n = 0
    const fetchImage = vi.fn(async () => JPEG)
    const r = await buildExport(input(), fetchImage, ids)
    expect([...r.files.keys()].sort()).toEqual(['README.txt', 'images/exp-1/front.jpg', 'images/exp-1/side.jpg', 'measurements.csv', 'metadata/exp-1.json', 'metadata/exp-2.json', 'participants.csv', 'photos.csv'])
    expect(fetchImage).toHaveBeenCalledWith('real-1', false, 'front')
    expect(r.counts).toEqual({ participants: 2, measurements: 2, photos: 2, practice: 0 })
    const pcsv = r.files.get('participants.csv') as string
    expect(pcsv.split('\n')[0]).toMatch(/^export_id,practice,sex,age_group,age_range/)
    expect(pcsv).toMatch(/exp-1,false,female,adult,25-34,light,v1,true,true,5 7 1\/2,ftin,171.5,,64.2,scale,C02,TECNO KI5,2026-12-01/)
    expect(r.files.get('measurements.csv')).toMatch(/exp-1,waist_girth,78.4,78.4\|78.4,cm,false/)
    expect(r.files.get('photos.csv')).toMatch(/exp-1,front,images\/exp-1\/front.jpg,1200,1600,7,2026-12-01T09:25:00Z,1.5,0.4,-0.2,60,1540,1,1,true,2/)
    expect(JSON.parse(r.files.get('metadata/exp-1.json') as string).measurements).toHaveLength(2)
    expect(r.mapping).toBe('export_id,database_id\nexp-1,real-1\nexp-2,real-2\n')
  })

  it('DENY: no practice, rejected, unconsented participant, or old-blur photo; no database ids, names or receipt codes in the files', async () => {
    n = 0
    const r = await buildExport(input(), async () => JPEG, ids)
    // Every data file (the README only explains what is left out).
    const text = [...r.files.entries()]
      .filter(([k, v]) => typeof v === 'string' && k !== 'README.txt')
      .map(([, v]) => v)
      .join('\n')
    expect(text).not.toMatch(/prac-1|rej-1|noconsent|real-1|real-2|col-1/)
    expect(text).not.toMatch(/participant_name|receipt_code|signature|guardian_name/)
    expect(r.files.has('images/exp-2/front.jpg')).toBe(false) // blur version 1 left out
  })

  it('a practice test export only when asked, marked PRACTICE in the README and every row', async () => {
    n = 0
    const r = await buildExport(input({ includePractice: true }), async () => JPEG, ids)
    expect(r.counts.practice).toBe(1)
    expect(r.files.get('README.txt')).toMatch(/INCLUDES PRACTICE RECORDS/)
    expect(r.files.get('participants.csv')).toMatch(/,true,female,adult,25-34,light,practice,/)
    const plain = await buildExport(input(), async () => JPEG, ids)
    expect(plain.files.get('README.txt')).not.toMatch(/PRACTICE/)
  })

  it('new random export ids each export (the default uses crypto)', async () => {
    const a = await buildExport(input(), async () => JPEG)
    const b = await buildExport(input(), async () => JPEG)
    expect(a.mapping).not.toBe(b.mapping)
  })

  it('DENY: a photo row without its file, or a file that is not a JPEG or too large, stops the export', async () => {
    await expect(buildExport(input(), async () => Promise.reject(new Error('404')), ids)).rejects.toBeInstanceOf(ExportProblem)
    await expect(buildExport(input(), async () => new Uint8Array([1, 2, 3, 4]), ids)).rejects.toThrow(/not a JPEG/)
    const big = new Uint8Array(4 * 1024 * 1024 + 1)
    big.set([0xff, 0xd8, 0xff])
    await expect(buildExport(input(), async () => big, ids)).rejects.toThrow(/too large/)
  })

  it('CSV quoting', () => {
    expect(csv(['a', 'b'], [['x,y', 'say "hi"'], [null, 3]])).toBe('a,b\n"x,y","say ""hi"""\n,3\n')
  })
})

describe('data folder: outside the project and outside OneDrive', () => {
  const root = 'C:\\Users\\User\\Downloads\\OneDrive_Personal\\OneDrive - Ashesi University\\Documents\\anthro-collect'
  it('DENY: inside the project, in OneDrive or another synced folder, or not given', () => {
    expect(dataFolderProblem(`${root}\\exports`, root)).toMatch(/outside the project/)
    expect(dataFolderProblem('C:\\Users\\User\\OneDrive\\data', root)).toMatch(/OneDrive/)
    expect(dataFolderProblem('C:\\Users\\User\\Google Drive\\data', root)).toMatch(/synced/)
    expect(dataFolderProblem('', root)).toMatch(/Give the data folder/)
  })
  it('ALLOW: a local folder', () => {
    expect(dataFolderProblem('C:\\anthro-data', root)).toBeNull()
  })
})
