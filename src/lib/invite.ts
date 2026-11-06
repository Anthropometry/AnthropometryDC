/** Sharing an invite code (F1 Amendment A3). Pure, so it is easy to test. */

/** "ABCD2345" → "ABCD-2345": easier to read aloud and type. */
export function formatInviteCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

/**
 * The ready-made message a collector sends. It holds only the app link and the code:
 * never a PIN, a phone number or anyone's name.
 */
export function inviteMessage(code: string, appUrl: string): string {
  return (
    `Join the Anthro Collect student research project at Ashesi University: open ${appUrl}, ` +
    `tap "Join with invite code" and enter ${formatInviteCode(code)}. ` +
    `The code works for 3 people and expires in 10 days.`
  )
}

export interface ShareEnv {
  share?: (data: { title?: string; text?: string }) => Promise<void>
  copy?: (text: string) => Promise<void>
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'unavailable'

/** Share sheet first (WhatsApp, SMS…); fall back to copying. Nothing is sent by the app itself. */
export async function shareInvite(text: string, env: ShareEnv): Promise<ShareOutcome> {
  if (env.share) {
    try {
      await env.share({ title: 'Anthro Collect invite', text })
      return 'shared'
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled'
      // otherwise fall through to copying
    }
  }
  if (env.copy) {
    try {
      await env.copy(text)
      return 'copied'
    } catch {
      return 'unavailable'
    }
  }
  return 'unavailable'
}
