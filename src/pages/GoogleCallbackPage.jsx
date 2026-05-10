import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { getDefaultPathForRole } from '@/lib/navigation'
import { consumeStoredParams } from '@/lib/google-oauth'
import { loginWithGoogle } from '@/lib/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function GoogleCallbackPage() {
  const [searchParams] = useSearchParams()
  const { loginWithGoogleResponse } = useAuth()
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [errorTitle, setErrorTitle] = useState('')

  useEffect(() => {
    let cancelled = false

    async function handleCallback() {
      const errorParam = searchParams.get('error')
      if (errorParam === 'access_denied') {
        setStatus('cancelled')
        return
      }

      const code = searchParams.get('code')
      const returnedState = searchParams.get('state')

      const stored = consumeStoredParams()

      if (!code) {
        setError('No authorization code received from Google.')
        setStatus('error')
        return
      }

      if (!stored.state || !stored.verifier || stored.state !== returnedState) {
        setError('State mismatch. This may be a CSRF attempt.')
        setStatus('error')
        return
      }

      try {
        const response = await loginWithGoogle({
          code,
          code_verifier: stored.verifier,
          redirect_uri: window.location.origin + '/auth/google/callback',
          expected_nonce: stored.nonce,
        })

        if (cancelled) return

        loginWithGoogleResponse(response.data)
        const target = getDefaultPathForRole(response.data.user.role)
        window.location.replace(target)
      } catch (err) {
        if (cancelled) return
        setError(err.message)

        if (err.message?.includes('NO_LINKED_ACCOUNT') || err.message?.includes('linked')) {
          setErrorTitle('No linked account')
        } else if (err.message?.includes('pending')) {
          setErrorTitle('Account pending')
        } else {
          setErrorTitle('Sign-in failed')
        }

        setStatus('error')
      }
    }

    handleCallback()
    return () => { cancelled = true }
  }, [searchParams, loginWithGoogleResponse])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <p className="text-muted-foreground">Signing in with Google...</p>
      </div>
    )
  }

  if (status === 'cancelled') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sign-in cancelled</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              You cancelled the Google sign-in. No changes were made.
            </p>
            <Link to="/">
              <Button variant="outline" className="w-full">Back to login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{errorTitle || 'Error'}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert variant="destructive">
            <AlertTitle>{errorTitle || 'Sign-in error'}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>

          <Link to="/">
            <Button variant="outline" className="w-full">Back to login</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
