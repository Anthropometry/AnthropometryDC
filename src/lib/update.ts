/**
 * F7: app updates never interrupt a participant (specs/F7-sync.md). The service worker no longer
 * reloads the page by itself (registerType 'prompt'): a new version waits. Home shows "Update ready"
 * with Restart now; otherwise it starts by itself the next time the app is opened.
 */
type Apply = () => Promise<void> | void

let apply: Apply | null = null
const listeners = new Set<() => void>()

/** Called by the service worker registration when a new version is waiting. */
export function setUpdateReady(fn: Apply): void {
  apply = fn
  listeners.forEach((l) => l())
}

export function isUpdateReady(): boolean {
  return apply !== null
}

/** Restart into the new version (only offered on Home, never during a participant). */
export async function applyUpdate(): Promise<void> {
  const fn = apply
  if (!fn) return
  await fn()
}

export function onUpdateChange(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** For tests. */
export function resetUpdate(): void {
  apply = null
}
