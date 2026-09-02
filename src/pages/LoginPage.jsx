import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { getDefaultPathForRole } from '@/lib/navigation'
import { PHONE_REGEX, normalizePhone } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field'
import GoogleSignInButton from '@/components/google-signin-button'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [invalidField, setInvalidField] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setInvalidField('')

    if (!phone || !password) {
      setError('Phone and password are required.')
      setInvalidField('all')
      return
    }

    const normalizedPhone = normalizePhone(phone)

    if (!PHONE_REGEX.test(normalizedPhone)) {
      setError('Phone must match +84xxxxxxxxx or 0xxxxxxxxx format.')
      setInvalidField('phone')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await login({ phone: normalizedPhone, password })
      navigate(getDefaultPathForRole(response.data.user.role), { replace: true })
    } catch (submitError) {
      setError(submitError.message)
      setInvalidField('all')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">SmartClass Login</CardTitle>
          <CardDescription>Sign in with your phone number.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field orientation="vertical" data-invalid={invalidField === 'phone' || invalidField === 'all'}>
                <FieldLabel htmlFor="login-phone">Phone</FieldLabel>
                <Input
                  id="login-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="username"
                  required
                  aria-invalid={invalidField === 'phone' || invalidField === 'all'}
                  aria-describedby={`login-phone-help${error ? ' login-error' : ''}`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0xxxxxxxxx or +84xxxxxxxxx"
                />
                <FieldDescription id="login-phone-help">
                  Use 0xxxxxxxxx or +84xxxxxxxxx format.
                </FieldDescription>
              </Field>

              <Field orientation="vertical" data-invalid={invalidField === 'password' || invalidField === 'all'}>
                <FieldLabel htmlFor="current-password">Password</FieldLabel>
                <Input
                  id="current-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  aria-invalid={invalidField === 'password' || invalidField === 'all'}
                  aria-describedby={error ? 'login-error' : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>

              {error && <FieldError id="login-error">{error}</FieldError>}

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? 'Signing in...' : 'Sign In'}
              </Button>
            </FieldGroup>
          </form>

          <FieldSeparator className="my-4">or</FieldSeparator>

          <GoogleSignInButton mode="login" className="w-full" />

          <p className="mt-5 text-sm text-muted-foreground">
            No account?{' '}
            <Link to="/register" className="font-medium text-foreground underline underline-offset-4">
              Register as student
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
