// @vitest-environment jsdom
/**
 * Signature pad fixes (found in Ryan's F4 phone test): drawing must work even when the browser
 * refuses pointer capture (Safari), a stroke ending outside the box still counts, and the PNG
 * export falls back to a data URL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { canvasToPng, dataUrlToBytes, SignaturePad } from './SignaturePad'

const PNG_URL = 'data:image/png;base64,iVBORw0KGgo=' // the 8 PNG signature bytes
const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PNG export', () => {
  it('dataUrlToBytes decodes a PNG data URL and refuses anything else', () => {
    expect([...dataUrlToBytes(PNG_URL)!]).toEqual(PNG_BYTES)
    expect(dataUrlToBytes('data:image/jpeg;base64,AAAA')).toBeNull()
  })

  it('uses toBlob when it works', async () => {
    const c = {
      toBlob: (cb: (b: Blob | null) => void) => cb(new Blob([new Uint8Array([1, 2, 3])])),
      toDataURL: () => PNG_URL,
    } as unknown as HTMLCanvasElement
    expect([...(await canvasToPng(c))!]).toEqual([1, 2, 3])
  })

  it.each([
    ['no toBlob', { toBlob: undefined }],
    ['toBlob gives null', { toBlob: (cb: (b: Blob | null) => void) => cb(null) }],
    ['toBlob throws', { toBlob: () => { throw new Error('x') } }],
    ['arrayBuffer fails', { toBlob: (cb: (b: unknown) => void) => cb({ arrayBuffer: () => Promise.reject(new Error('x')) }) }],
  ])('falls back to the data URL when %s', async (_name, over) => {
    const c = { toDataURL: () => PNG_URL, ...over } as unknown as HTMLCanvasElement
    expect([...(await canvasToPng(c))!]).toEqual(PNG_BYTES)
  })

  it('gives null if nothing works', async () => {
    const c = { toBlob: undefined, toDataURL: () => { throw new Error('x') } } as unknown as HTMLCanvasElement
    expect(await canvasToPng(c)).toBeNull()
  })
})

describe('SignaturePad', () => {
  beforeEach(() => {
    const ctx = { beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillRect: vi.fn() }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: BlobCallback) {
      cb(new Blob([new Uint8Array(PNG_BYTES)]))
    })
  })

  it('ALLOW: draws and hands back PNG bytes even when pointer capture is refused (iPhone)', async () => {
    const capture = vi.fn(() => {
      throw new DOMException('No active pointer', 'NotFoundError')
    })
    HTMLCanvasElement.prototype.setPointerCapture = capture
    const onChange = vi.fn()
    render(<SignaturePad label="Participant's signature" onChange={onChange} />)
    const canvas = screen.getByLabelText("Participant's signature")
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 50, clientY: 20, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: 50, clientY: 20, pointerId: 1 })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(capture).toHaveBeenCalled()
    expect([...onChange.mock.calls[0][0]]).toEqual(PNG_BYTES)
    screen.getByText('Signed.')
  })

  it('a stroke that ends outside the box still counts', async () => {
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn()
    const onChange = vi.fn()
    render(<SignaturePad label="Sig" onChange={onChange} />)
    const canvas = screen.getByLabelText('Sig')
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(canvas, { clientX: 500, clientY: 20 })
    fireEvent.pointerLeave(canvas)
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
  })

  it('a lift without touching first does nothing; Clear empties the signature', async () => {
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn()
    const onChange = vi.fn()
    render(<SignaturePad label="Sig" onChange={onChange} />)
    fireEvent.pointerUp(screen.getByLabelText('Sig'))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledWith(null)
    screen.getByText('Sign with your finger in the box.')
  })
})
