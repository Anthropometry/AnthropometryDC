import { useState, type ComponentType, type FormEvent } from 'react'
import { failureMessage, joinWithInvite, type AuthClient } from '../lib/auth'
import { phoneToLoginId } from '../lib/phone'
import { isValidDisplayName, isValidInviteCode, newPinProblem } from '../lib/validate'
import { Turnstile, type CaptchaProps } from '../components/Turnstile'
import { Button, ErrorText, Field, Page, Title } from '../components/ui'

export interface JoinProps {
  client: AuthClient
  onJoined: () => void
  onBack: () => void
  Captcha?: ComponentType<CaptchaProps>
}

export function Join({ client, onJoined, onBack, Captcha = Turnstile }: JoinProps) {
  const [inviteCode, setInviteCode] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const ready =
    isValidInviteCode(inviteCode) &&
    isValidDisplayName(name) &&
    phoneToLoginId(phone) !== null &&
    pin.length === 6 &&
    confirmPin.length === 6 &&
    captchaToken !== ''

  async function submit(e: FormEvent) {
    e.preventDefault()
    const pinProblem = newPinProblem(pin, confirmPin)
    if (pinProblem) {
      setError(failureMessage(pinProblem === 'format' ? 'invalid_pin' : pinProblem === 'weak' ? 'weak_pin' : 'pin_mismatch'))
      return
    }
    setBusy(true)
    setError('')
    const result = await joinWithInvite(client, { inviteCode, name, phone, pin, confirmPin, captchaToken })
    setBusy(false)
    if (result.ok) {
      onJoined()
      return
    }
    setError(failureMessage(result.reason))
    setResetKey((k) => k + 1) // each safety-check token works once
  }

  return (
    <Page>
      <Title>Join with invite code</Title>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <Field
          label="Invite code"
          hint="8 letters and numbers from the person who invited you"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={12}
        />
        <Field
          label="Your name (collector)"
          hint="Your own name, so the project lead knows who joined"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={60}
        />
        <Field
          label="Phone number"
          hint="With country code, for example +233 24 123 4567 or +234 803 123 4567. Ghana numbers can start with 0."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          autoComplete="tel"
        />
        <Field
          label="Choose a 6-digit PIN"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
        <Field
          label="Type the PIN again"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
        />
        <Captcha onToken={setCaptchaToken} resetKey={resetKey} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={!ready || busy}>
          {busy ? 'Joining…' : 'Join'}
        </Button>
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
      </form>
    </Page>
  )
}
