import { useState, type ComponentType, type FormEvent } from 'react'
import { failureMessage, signInWithPhonePin, type AuthClient } from '../lib/auth'
import { phoneToLoginId } from '../lib/phone'
import { Turnstile, type CaptchaProps } from '../components/Turnstile'
import { Button, ErrorText, Field, Page, Title } from '../components/ui'

export interface SignInProps {
  client: AuthClient
  onSignedIn: () => void
  onBack: () => void
  fetchFn?: (input: string, init: RequestInit) => Promise<Response>
  Captcha?: ComponentType<CaptchaProps>
}

export function SignIn({ client, onSignedIn, onBack, fetchFn = (i, o) => fetch(i, o), Captcha = Turnstile }: SignInProps) {
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const ready = phoneToLoginId(phone) !== null && pin.length === 6 && captchaToken !== ''

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const result = await signInWithPhonePin(client, fetchFn, { phone, pin, captchaToken })
    setBusy(false)
    if (result.ok) {
      onSignedIn()
      return
    }
    setError(failureMessage(result.reason, result.retryAfter))
    setPin('')
    setResetKey((k) => k + 1) // every attempt needs a fresh safety check
  }

  return (
    <Page>
      <Title>Sign in</Title>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <Field
          label="Phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          autoComplete="tel"
        />
        <Field
          label="6-digit PIN"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
        <Captcha onToken={setCaptchaToken} resetKey={resetKey} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={!ready || busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-center text-slate-600">Forgot PIN? Contact the project lead.</p>
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
      </form>
    </Page>
  )
}
