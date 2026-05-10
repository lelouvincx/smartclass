import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { register } from '@/lib/api'
import { PHONE_REGEX, normalizePhone } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldError } from '@/components/ui/field'

export default function RegisterPage() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccessMessage('')

    if (!phone || !password || !confirmPassword) {
      setError('Phone, password, and confirm password are required.')
      return
    }

    const normalizedPhone = normalizePhone(phone)

    if (!PHONE_REGEX.test(normalizedPhone)) {
      setError('Phone must match +84xxxxxxxxx or 0xxxxxxxxx format.')
      return
    }

    if (password.length < 3) {
      setError('Password must be at least 3 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Password confirmation does not match.')
      return
    }

    setIsSubmitting(true)

    try {
      await register({ phone: normalizedPhone, password })
      setSuccessMessage('Registration submitted. Please wait for teacher approval.')
      setPassword('')
      setConfirmPassword('')
    } catch (submitError) {
      setError(submitError.message)
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
              <Field orientation="vertical">
                <Input
                  id="phone"
                  type="text"
                  aria-label="Phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0xxxxxxxxx or +84xxxxxxxxx"
                />
              </Field>

              <Field orientation="vertical">
                <Input
                  id="password"
                  type="password"
                  aria-label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>

              <Field orientation="vertical">
                <Input
                  id="confirm-password"
                  type="password"
                  aria-label="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </Field>

              {error && <FieldError>{error}</FieldError>}
              {successMessage && (
                <p className="text-sm text-emerald-700 dark:text-emerald-400">{successMessage}</p>
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
