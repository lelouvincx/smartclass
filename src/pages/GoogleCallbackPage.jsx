import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { getDefaultPathForAuth } from '@/lib/navigation'
import { consumeStoredParams } from '@/lib/google-oauth'
import { requireWorkspaceSite } from '@/lib/workspaces'
import { linkGoogle, loginWithGoogle } from '@/lib/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

export default function GoogleCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const auth = useAuth()
  const { token, isLoading, loginWithGoogleResponse } = auth
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [errorTitle, setErrorTitle] = useState('')
  const [storedParams] = useState(() => {
    const errorParam = searchParams.get('error')
    const code = searchParams.get('code')
    const returnedState = searchParams.get('state')
    const stored = consumeStoredParams()

    return { cancelled: errorParam === 'access_denied', code, returnedState, stored }
  })
  const hasAttempted = useRef(false)

  useEffect(() => {
    if (hasAttempted.current) return

    const { cancelled, code, returnedState, stored } = storedParams
    // Keep the one-use code in memory only, including before a cross-site redirect.
    window.history.replaceState(window.history.state, '', '/auth/google/callback')

    if (cancelled) {
      hasAttempted.current = true
      setStatus('cancelled')
      return
    }

    if (!code) {
      hasAttempted.current = true
      setError('No authorization code received from Google.')
      setStatus('error')
      return
    }

    if (!stored?.state || !stored.verifier || !stored.nonce || stored.state !== returnedState) {
      hasAttempted.current = true
      setError('State mismatch. This may be a CSRF attempt.')
      setStatus('error')
      return
    }

    // For link mode: wait until auth is hydrated (token available)
    if (stored.mode === 'link' && isLoading) {
      return
    }

    if (stored.mode === 'link' && !token) {
      hasAttempted.current = true
      setError('You must be signed in to link a Google account.')
      setErrorTitle('Not authenticated')
      setStatus('error')
      return
    }

    hasAttempted.current = true

    async function handleCallback() {
      try {
        const payload = {
          code,
          code_verifier: stored.verifier,
          redirect_uri: requireWorkspaceSite().google_redirect_uri,
          expected_nonce: stored.nonce,
        }
        if (stored.mode === 'link') {
          await linkGoogle(token, payload)
          await auth.refreshUser?.()
          toast.success('Google account linked.')
          navigate('/settings', { replace: true })
        } else {
          const response = await loginWithGoogle(payload)
          loginWithGoogleResponse(response.data)
          const routing = response.data.teacher_routing
          if (response.data.user.platform_role === 'platform_admin' || !routing || routing.action === 'stay') {
            navigate(getDefaultPathForAuth(response.data), { replace: true })
          }
        }
      } catch (err) {
        setError(err.message)

        if (stored.mode === 'link') {
          if (err.message?.includes('GOOGLE_SUB_TAKEN') || err.message?.includes('already linked')) {
            setErrorTitle('Already linked')
          } else {
            setErrorTitle('Link failed')
          }
        } else {
          if (err.message?.includes('NO_LINKED_ACCOUNT') || err.message?.includes('linked')) {
            setErrorTitle('No linked account')
          } else if (err.message?.includes('pending')) {
            setErrorTitle('Account pending')
          } else {
            setErrorTitle('Sign-in failed')
          }
        }

        setStatus('error')
      }
    }

    handleCallback()
  }, [storedParams, isLoading, token, loginWithGoogleResponse, auth, navigate])

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
