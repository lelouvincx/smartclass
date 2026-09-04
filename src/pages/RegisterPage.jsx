import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { register } from '@/lib/api'
import { PHONE_REGEX, normalizePhone } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldError, FieldLabel } from '@/components/ui/field'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [invalidField, setInvalidField] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setInvalidField('')
    setSuccessMessage('')

    if (!name.trim() || !phone || !password || !confirmPassword) {
      setError('Name, phone, password, and confirm password are required.')
      setInvalidField('all')
      return
    }

    const normalizedPhone = normalizePhone(phone)

    if (!PHONE_REGEX.test(normalizedPhone)) {
      setError('Phone must match +84xxxxxxxxx or 0xxxxxxxxx format.')
      setInvalidField('phone')
      return
    }

    if (password.length < 3) {
      setError('Password must be at least 3 characters long.')
      setInvalidField('password')
      return
    }

    if (password !== confirmPassword) {
      setError('Password confirmation does not match.')
      setInvalidField('confirmPassword')
      return
    }

    setIsSubmitting(true)

    try {
      await register({ name: name.trim(), phone: normalizedPhone, password })
      setSuccessMessage('Registration submitted. Please wait for teacher approval.')
      setName('')
      setPassword('')
      setConfirmPassword('')
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
          <CardTitle className="text-2xl">Student Registration</CardTitle>
          <CardDescription>Create your account for teacher approval.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field orientation="vertical" data-invalid={invalidField === 'name' || invalidField === 'all'}>
                <FieldLabel htmlFor="register-name">Name</FieldLabel>
                <Input
                  id="register-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  aria-invalid={invalidField === 'name' || invalidField === 'all'}
                  aria-describedby={error ? 'register-error' : undefined}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>

              <Field orientation="vertical" data-invalid={invalidField === 'phone' || invalidField === 'all'}>
                <FieldLabel htmlFor="register-phone">Phone</FieldLabel>
                <Input
                  id="register-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="username"
                  required
                  aria-invalid={invalidField === 'phone' || invalidField === 'all'}
                  aria-describedby={`register-phone-help${error ? ' register-error' : ''}`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0xxxxxxxxx or +84xxxxxxxxx"
                />
                <FieldDescription id="register-phone-help">
                  Use 0xxxxxxxxx or +84xxxxxxxxx format.
                </FieldDescription>
              </Field>

              <Field orientation="vertical" data-invalid={invalidField === 'password' || invalidField === 'all'}>
                <FieldLabel htmlFor="new-password">Password</FieldLabel>
                <Input
                  id="new-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={3}
                  aria-invalid={invalidField === 'password' || invalidField === 'all'}
                  aria-describedby={error ? 'register-error' : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>

              <Field
                orientation="vertical"
                data-invalid={invalidField === 'confirmPassword' || invalidField === 'all'}
              >
                <FieldLabel htmlFor="confirm-password">Confirm Password</FieldLabel>
                <Input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={3}
                  aria-invalid={invalidField === 'confirmPassword' || invalidField === 'all'}
                  aria-describedby={error ? 'register-error' : undefined}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </Field>

              {error && <FieldError id="register-error">{error}</FieldError>}
              {successMessage && (
                <p
                  role="status"
                  className="text-sm text-emerald-700 dark:text-emerald-400"
                >
                  {successMessage}
                </p>
              )}

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? 'Submitting...' : 'Register'}
              </Button>
            </FieldGroup>
          </form>

          <p className="mt-5 text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/" className="font-medium text-foreground underline underline-offset-4">
              Back to login
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
