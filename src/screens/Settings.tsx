/** F2: first-time setup and Settings (unit and language only). */
import { useState } from 'react'
import type { Language, Unit } from '../lib/profile'
import { LANGUAGE_NAMES, UNIT_NAMES, type Settings as SettingsValue } from '../lib/settings'
import { Button, Choice, ErrorText, Page, Title } from '../components/ui'

export interface SettingsProps {
  first: boolean
  initial: SettingsValue
  /** Saves on the phone and tries the server; 'waiting' means it will be sent when online. */
  onSave: (s: SettingsValue) => Promise<'saved' | 'waiting'>
  onDone: () => void
  onBack?: () => void
}

export function SettingsScreen({ first, initial, onSave, onDone, onBack }: SettingsProps) {
  const [unit, setUnit] = useState<Unit>(initial.unit)
  const [language, setLanguage] = useState<Language>(initial.language)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setBusy(true)
    setError('')
    try {
      await onSave({ unit, language })
      onDone()
    } catch {
      setError('Could not save on this phone. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <Title>{first ? 'Set up the app' : 'Settings'}</Title>
      {first && <p className="text-slate-600">Choose these once. You can change them later in Settings.</p>}
      <ErrorText>{error}</ErrorText>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-semibold">Which tape do you use?</legend>
        {(['cm', 'in'] as const).map((u) => (
          <Choice key={u} chosen={unit === u} onClick={() => setUnit(u)}>
            {UNIT_NAMES[u]}
          </Choice>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-semibold">Second language</legend>
        <p className="text-sm text-slate-600">
          English is always shown. Your choice is used for the consent text with participants.
        </p>
        {(['fr', 'tw', 'en'] as const).map((l) => (
          <Choice key={l} chosen={language === l} onClick={() => setLanguage(l)}>
            {LANGUAGE_NAMES[l]}
          </Choice>
        ))}
      </fieldset>

      <Button onClick={() => void save()} disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </Button>
      {onBack && (
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
      )}
    </Page>
  )
}
