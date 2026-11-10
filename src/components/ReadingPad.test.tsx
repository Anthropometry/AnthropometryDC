// @vitest-environment jsdom
/** Number pad: formats, limits, and fast taps (found while testing F5 in a browser). */
import { act, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ReadingPad } from './ReadingPad'

afterEach(cleanup)

function Harness({ unit, add = 0 }: { unit: 'cm' | 'in'; add?: number }) {
  const [v, setV] = useState('')
  return (
    <>
      <ReadingPad unit={unit} value={v} onChange={setV} addCm={add} />
      <output data-testid="typed">{v}</output>
    </>
  )
}

const key = (k: string) => screen.getByRole('button', { name: k === '.' ? 'Decimal point' : k === '⌫' ? 'Delete' : k })
const typed = () => screen.getByTestId('typed').textContent

describe('ReadingPad', () => {
  it('cm: three digits and one decimal at most; delete; no leading zero', () => {
    render(<Harness unit="cm" />)
    for (const k of ['0', '1', '6', '5', '4', '.', '2', '9']) fireEvent.click(key(k))
    expect(typed()).toBe('165.2') // leading "0" replaced; a 4th digit and a 2nd decimal ignored
    fireEvent.click(key('⌫'))
    fireEvent.click(key('⌫'))
    expect(typed()).toBe('165')
    fireEvent.click(key('.'))
    fireEvent.click(key('.'))
    expect(typed()).toBe('165.')
  })

  it('inches: whole inches then eighths; no decimal key; shown in cm', () => {
    render(<Harness unit="in" />)
    expect((key('.') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(key('3'))
    fireEvent.click(key('4'))
    fireEvent.click(screen.getByRole('button', { name: '⅜' }))
    expect(typed()).toBe('34 3/8')
    expect(screen.getByRole('status', { name: 'Reading' }).textContent).toMatch(/34 ⅜ in= 87\.3 cm/)
    fireEvent.click(key('⌫'))
    expect(typed()).toBe('3 3/8')
  })

  it('fast taps before the screen redraws are all kept', () => {
    render(<Harness unit="cm" />)
    act(() => {
      // All four taps land before React redraws (as with a quick finger on a slow phone).
      for (const k of ['1', '6', '5', '.']) key(k).click()
      key('2').click()
    })
    expect(typed()).toBe('165.2')
  })

  it('the 100 cm wall mark is added for display only', () => {
    render(<Harness unit="cm" add={100} />)
    for (const k of ['6', '5', '.', '2']) fireEvent.click(key(k))
    expect(typed()).toBe('65.2')
    expect(screen.getByRole('status', { name: 'Reading' }).textContent).toMatch(/= 165\.2 cm/)
  })
})
