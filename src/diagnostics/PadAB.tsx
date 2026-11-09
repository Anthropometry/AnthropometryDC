/**
 * DIAGNOSTIC ONLY (?pad-ab), temporary. The old signature box next to the new one, with nothing
 * else on the page (no logging, no extra listeners), like the plain app. No login; nothing is saved
 * or sent. Used to prove the touch fix on Ryan's iPhone before merging.
 */
import { useState } from 'react'
import { SignaturePad } from '../components/SignaturePad'
import { OldSignaturePad } from './OldSignaturePad'

function Result({ count, bytes }: { count: number; bytes: number | null }) {
  return (
    <p className="text-sm">
      <b>Result:</b> {count === 0 ? 'nothing yet' : `${count} signature image${count === 1 ? '' : 's'} made · last ${bytes ?? 0} bytes`}
    </p>
  )
}

export function PadAB() {
  const [oldCount, setOldCount] = useState(0)
  const [oldBytes, setOldBytes] = useState<number | null>(null)
  const [newCount, setNewCount] = useState(0)
  const [newBytes, setNewBytes] = useState<number | null>(null)
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6 text-slate-900">
      <h1 className="text-xl font-bold">Signature box: old vs new</h1>
      <p className="text-sm text-slate-600">
        Nothing is saved or sent. In each box: sign, tap Clear, sign again (3 times). Then screenshot both results.
      </p>
      <section className="flex flex-col gap-2 rounded-xl border-2 border-red-300 p-3">
        <h2 className="font-semibold">OLD box (the one in the app now)</h2>
        <OldSignaturePad
          label="Old box"
          onChange={(png) => {
            if (png) {
              setOldCount((n) => n + 1)
              setOldBytes(png.length)
            }
          }}
        />
        <Result count={oldCount} bytes={oldBytes} />
      </section>
      <section className="flex flex-col gap-2 rounded-xl border-2 border-emerald-400 p-3">
        <h2 className="font-semibold">NEW box (touch fix)</h2>
        <SignaturePad
          label="New box"
          onChange={(png) => {
            if (png) {
              setNewCount((n) => n + 1)
              setNewBytes(png.length)
            }
          }}
        />
        <Result count={newCount} bytes={newBytes} />
      </section>
    </main>
  )
}
