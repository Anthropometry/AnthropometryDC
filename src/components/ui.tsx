import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'

export function Page({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-4 py-6 text-slate-900">
      <p className="text-sm font-medium uppercase tracking-wide text-brand">Ashesi University · Student research project</p>
      {children}
    </main>
  )
}

export function Title({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-bold">{children}</h1>
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const look = {
    primary: 'bg-brand text-white',
    secondary: 'border-2 border-brand text-brand bg-white',
    danger: 'bg-red-700 text-white',
  }[variant]
  return (
    <button
      type="button"
      className={`w-full rounded-xl py-4 text-lg font-semibold disabled:opacity-50 ${look} ${className}`}
      {...props}
    />
  )
}

export function Field({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="rounded-xl border-2 border-slate-300 px-3 py-3 text-lg focus:border-brand focus:outline-none"
        {...props}
      />
      {hint && (
        <span id={`${id}-hint`} className="text-sm text-slate-500">
          {hint}
        </span>
      )}
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
      {children}
    </p>
  )
}

export function OfflineBanner({ online }: { online: boolean }) {
  if (online) return null
  return (
    <p role="status" className="rounded-lg bg-amber-100 p-3 text-amber-900">
      You are offline. Your work is kept on this phone.
    </p>
  )
}

/** F3: always on collection screens, never hidden. */
export function ModeBanner({ real }: { real: boolean }) {
  return real ? (
    <p role="note" className="rounded-lg bg-emerald-700 p-3 text-center font-bold tracking-wide text-white">
      REAL COLLECTION
    </p>
  ) : (
    <p role="note" className="rounded-lg bg-amber-400 p-3 text-center font-bold tracking-wide text-amber-950">
      PRACTICE · not real data
    </p>
  )
}

/** F2: what is waiting to upload. */
export function SyncBadge({ online, waiting }: { online: boolean; waiting: number }) {
  const [text, look] = !online
    ? ['Offline: saved on this phone', 'bg-slate-200 text-slate-800']
    : waiting > 0
      ? [`${waiting} waiting to upload`, 'bg-amber-100 text-amber-900']
      : ['All saved', 'bg-emerald-100 text-emerald-900']
  return (
    <p role="status" aria-label="Sync" className={`self-start rounded-full px-3 py-1 text-sm font-semibold ${look}`}>
      {text}
    </p>
  )
}

/** A big button that stays pressed when chosen. */
export function Choice({ chosen, children, onClick }: { chosen: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={onClick}
      className={`w-full rounded-xl border-2 py-4 text-lg font-semibold ${chosen ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white text-slate-900'}`}
    >
      {children}
    </button>
  )
}
