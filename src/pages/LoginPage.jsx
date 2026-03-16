import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { getDefaultPathForRole } from '@/lib/navigation'
import { PHONE_REGEX, normalizePhone } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!phone || !password) {
      setError('Phone and password are required.')
      return
    }

    const normalizedPhone = normalizePhone(phone)

    if (!PHONE_REGEX.test(normalizedPhone)) {
      setError('Phone must match +84xxxxxxxxx or 0xxxxxxxxx format.')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await login({ phone: normalizedPhone, password })
      navigate(getDefaultPathForRole(response.data.user.role), { replace: true })
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
          <CardTitle className="text-2xl">SmartClass Login</CardTitle>
          <CardDescription>Sign in with your phone number.</CardDescription>
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
                placeholder="0xxxxxxxxx or +84xxxxxxxxx"
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

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

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
