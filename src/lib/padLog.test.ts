// @vitest-environment jsdom
/** The hidden diagnostic log is off unless ?pad-log is used, and never records values. */
import { describe, expect, it } from 'vitest'
import { describeElement, padLog, padLogLines, padLogOn } from './padLog'

describe('padLog (hidden diagnostic)', () => {
  it('is off by default: nothing is recorded', () => {
    expect(padLogOn).toBe(false)
    padLog('should not appear')
    expect(padLogLines()).toEqual([])
  })

  it('describes elements by type and label only, never their text or value', () => {
    const input = document.createElement('input')
    input.type = 'text'
    input.value = 'Ama Mensah'
    expect(describeElement(input)).toBe('input[text]')
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-label', "Participant's signature")
    expect(describeElement(canvas)).toBe("canvas[Participant's signature]")
    const p = document.createElement('p')
    p.textContent = 'secret'
    expect(describeElement(p)).toBe('p')
    expect(describeElement(null)).toBe('nothing')
  })
})
