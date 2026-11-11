/**
 * Big number pad for one tape reading (F5). cm: up to 3 digits and one decimal (0.1 cm).
 * Inches: whole inches on the pad plus ⅛ buttons. It shows the value in cm as you type.
 * Hands back the reading exactly as it will be stored ("87.3", "34 3/8").
 */
import { useEffect, useRef } from 'react'
import { EIGHTHS, ftinTyped, inchesTyped, readingTenths, showCm, toldHeightTenths, type Unit } from '../lib/measurements'

export interface ReadingPadProps {
  unit: Unit
  /** The typed reading so far (stored form). */
  value: string
  onChange: (typed: string) => void
  /** Added to the cm value for display only (the 100 cm wall mark). */
  addCm?: number
  /** Weight (F5 Amendment A): same 0.1 pad, shown in kg, no conversion line. */
  kg?: boolean
  /** Stated height in feet + inches (F5 Amendment B): the pad types the inches; shown with the feet. */
  feet?: number | null
}

/** "34 3/8" → [ "34", 3 ]; "34" → ["34", 0] */
function splitInches(v: string): [string, number] {
  const [whole, frac] = v.split(' ')
  const e = EIGHTHS.find((x) => x.text === frac)?.eighths ?? 0
  return [whole ?? '', e]
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'] as const

export function ReadingPad({ unit, value, onChange: report, addCm = 0, kg = false, feet }: ReadingPadProps) {
  const [whole, eighths] = unit === 'in' ? splitInches(value) : [value, 0]
  const tenths = !value
    ? null
    : feet != null
      ? toldHeightTenths(ftinTyped(feet, Number(whole), eighths), 'ftin')
      : readingTenths(value, unit)

  // Fast taps can arrive before the screen redraws: always build on the latest value, not the last drawn one.
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])
  const onChange = (v: string) => {
    latest.current = v
    report(v)
  }

  function press(k: (typeof KEYS)[number]) {
    const value = latest.current
    const [whole, eighths] = unit === 'in' ? splitInches(value) : [value, 0]
    if (unit === 'in') {
      if (k === '.') return
      const w = k === '⌫' ? whole.slice(0, -1) : whole.length < 3 ? (whole === '0' ? k : whole + k) : whole
      onChange(w ? inchesTyped(Number(w), eighths) : '')
      return
    }
    if (k === '⌫') return onChange(value.slice(0, -1))
    if (k === '.') {
      if (!value || value.includes('.')) return
      return onChange(value + '.')
    }
    const [int, dec] = value.split('.')
    if (dec !== undefined) return dec.length < 1 ? onChange(value + k) : undefined
    if (int.length >= 3) return
    onChange(int === '0' ? k : value + k)
  }

  const shown =
    unit === 'in'
      ? `${feet != null ? `${feet} ft ` : ''}${whole || '0'}${eighths ? ' ' + EIGHTHS[eighths].glyph : ''} in`
      : `${value || '0'} ${kg ? 'kg' : 'cm'}`

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border-2 border-slate-300 bg-white p-3 text-center" role="status" aria-label="Reading">
        <p className="font-mono text-4xl font-bold">{shown}</p>
        <p className="text-sm text-slate-600">
          {kg
            ? tenths !== null
              ? ' '
              : 'Type the weight in kg'
            : tenths !== null
              ? unit === 'in' || addCm
                ? `= ${showCm(tenths + (feet != null ? 0 : addCm * 10))}`
                : ' '
              : 'Type the reading from the tape'}
        </p>
      </div>
      {unit === 'in' && (
        <div className="grid grid-cols-4 gap-2" aria-label="Eighths of an inch">
          {EIGHTHS.map((x) => (
            <button
              key={x.eighths}
              type="button"
              aria-pressed={eighths === x.eighths}
              disabled={!whole}
              onClick={() => onChange(inchesTyped(Number(whole), x.eighths))}
              className={`rounded-lg border-2 py-2 text-xl font-semibold disabled:opacity-40 ${eighths === x.eighths ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white'}`}
            >
              {x.eighths === 0 ? '—' : x.glyph}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            aria-label={k === '⌫' ? 'Delete' : k === '.' ? 'Decimal point' : k}
            disabled={unit === 'in' && k === '.'}
            onClick={() => press(k)}
            className="rounded-xl border-2 border-slate-300 bg-white py-4 text-2xl font-semibold active:bg-slate-100 disabled:opacity-30"
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}
