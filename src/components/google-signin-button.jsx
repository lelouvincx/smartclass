import React from 'react'
import { Button } from '@/components/ui/button'
import { MaterialSymbol } from '@/components/material-symbol'
import { startGoogleFlow } from '@/lib/google-oauth'

export default function GoogleSignInButton({ mode = 'login', returnTo, className, ...props }) {
  async function handleClick() {
    await startGoogleFlow({ mode, returnTo })
  }

  return (
    <Button
      variant="outline"
      size="lg"
      className={className}
      onClick={handleClick}
      {...props}
    >
      <MaterialSymbol name="login" className="size-5" />
      Continue with Google
    </Button>
  )
}
