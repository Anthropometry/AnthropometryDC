// @vitest-environment jsdom
/** F8 Progress on the Admin screen: counts only, real/practice, collector cards with Call / WhatsApp. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Progress } from './Progress'
import type { ProgressData } from '../data/progress'
import type { CollectorRow } from '../data/collectors'

afterEach(cleanup)

const data = (over: Partial<ProgressData> = {}): ProgressData => ({
  rows: [
    { sex: 'female', ageGroup: 'adult', ageRange: '25-34', complete: 4, measuredNoPhotos: 1, consentedNotMeasured: 0 },
    { sex: 'male', ageGroup: 'adult', ageRange: '35-44', complete: 2, measuredNoPhotos: 0, consentedNotMeasured: 1 },
    { sex: 'female', ageGroup: 'child', ageRange: '10-12', complete: 1, measuredNoPhotos: 0, consentedNotMeasured: 0 },
  ],
  weekly: [{ weekStart: '2026-11-16', complete: 3 }],
  collectors: [
    { collectorId: 'a', completeTotal: 5, completeWeek: 2, measuredNoPhotos: 1, consentedNotMeasured: 0, practiceComplete: 4, lastSentAt: '2026-11-19T10:00:00Z', measurementsTaken: 90, measurementsSkipped: 10, unusualKept: 2, photosMorePeople: 0 },
    { collectorId: 'b', completeTotal: 2, completeWeek: 0, measuredNoPhotos: 0, consentedNotMeasured: 1, practiceComplete: 1, lastSentAt: '2026-11-10T10:00:00Z', measurementsTaken: 20, measurementsSkipped: 0, unusualKept: 0, photosMorePeople: 1 },
  ],
  bands: [{ sex: 'female', ageGroup: 'adult', bandCm: 160, n: 3 }],
  quality: [
    { item: 'skipped', detail: 'declined', n: 3 },
    { item: 'skipped_code', detail: 'bust_girth', n: 2 },
    { item: 'height_stated_minus_measured_cm', detail: null, n: 1.8 },
    { item: 'withdrawals', detail: null, n: 0 },
  ],
  space: { databaseBytes: 25_000_000, photoBytes: 120_000_000, photos: 90 },
  ...over,
})

const people: CollectorRow[] = [
  { id: 'a', displayName: 'Ama', phone: '+233241111111', status: 'approved', role: 'collector', createdAt: '2026-11-01T00:00:00Z' } as CollectorRow,
  { id: 'b', displayName: 'Kofi', phone: '+233242222222', status: 'approved', role: 'collector', createdAt: '2026-11-01T00:00:00Z' } as CollectorRow,
]

function show(load = vi.fn(async () => data())) {
  render(<Progress load={load} collectors={people} checks={[]} online now={() => new Date('2026-11-20T12:00:00Z')} />)
  return load
}

describe('Progress (F8)', () => {
  it('totals by women, men, girls, boys and All, with no targets; tap a row for age groups', async () => {
    show()
    const table = await waitFor(() => screen.getByRole('table', { name: 'Totals' }))
    within(table).getByText(/Women \(18\+\)/)
    within(table).getByText(/Men \(18\+\)/)
    within(table).getByText(/Girls \(8–17\)/)
    expect(table.textContent).not.toMatch(/Target|360|315|225/)
    fireEvent.click(within(table).getByRole('button', { name: /Women/ }))
    within(table).getByText('25–34')
    within(table).getByText('All')
  })

  it('collector cards: follow-ups, amber after 5 quiet days, Call and WhatsApp links', async () => {
    show()
    const ama = await waitFor(() => screen.getByRole('article', { name: 'Progress: Ama' }))
    within(ama).getByText(/1 measured, photos missing/)
    within(ama).getByText(/Practice complete: 4/)
    within(ama).getByText(/Skipped 10% of measurements/)
    expect(within(ama).getByRole('link', { name: 'Call' }).getAttribute('href')).toBe('tel:+233241111111')
    expect(within(ama).getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toBe('https://wa.me/233241111111')
    const kofi = screen.getByRole('article', { name: 'Progress: Kofi' })
    within(kofi).getByText(/Nothing sent for 10 days/)
  })

  it('heights, quality and free space; practice switch reloads with practice', async () => {
    const load = show()
    await waitFor(() => screen.getByRole('list', { name: 'Heights' }))
    screen.getByText(/160–169 cm/)
    screen.getByText(/Most skipped: bust girth \(2\)/)
    screen.getByText(/Stated minus measured height: 1.8 cm/)
    screen.getByText(/Photos: 120.0 MB of 10.00 GB/)
    fireEvent.click(screen.getByRole('button', { name: 'Practice' }))
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(true))
  })

  it('DENY: offline → no loading, a plain note; a failure says so', async () => {
    const load = vi.fn(async () => data())
    render(<Progress load={load} collectors={people} checks={[]} online={false} />)
    screen.getByText(/needs a connection/)
    expect(load).not.toHaveBeenCalled()
    cleanup()
    show(vi.fn(async () => Promise.reject(new Error('x'))))
    await waitFor(() => screen.getByRole('alert'))
  })
})
