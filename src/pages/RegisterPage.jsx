import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { register } from '@/lib/api'
import { PHONE_REGEX } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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

    if (!PHONE_REGEX.test(phone)) {
      setError('Phone must match +84xxxxxxxxx format.')
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
      await register({ phone, password })
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+84xxxxxxxxx"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {successMessage && <p className="text-sm text-emerald-700 dark:text-emerald-400">{successMessage}</p>}

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Submitting...' : 'Register'}
            </Button>
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
