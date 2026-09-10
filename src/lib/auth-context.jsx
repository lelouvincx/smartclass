import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getMe, login as loginRequest } from './api'
import { clearStoredToken, getStoredToken, setStoredToken } from './auth'
import { clearAllSubmissionDrafts } from './submission-draft'
import { getAuthPermissions } from './navigation'

const AuthContext = createContext(null)

export function deriveAuthState({ token, user, workspace, membership, teacherRouting, isLoading }) {
  return {
    token,
    user,
    workspace,
    membership,
    teacherRouting,
    isLoading,
    isAuthenticated: Boolean(token && user),
    ...getAuthPermissions({ user, membership }),
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getStoredToken())
  const [user, setUser] = useState(null)
  const [workspace, setWorkspace] = useState(null)
  const [membership, setMembership] = useState(null)
  const [teacherRouting, setTeacherRouting] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const applyEnvelope = useCallback((data) => {
    setUser(data?.user ?? null)
    setWorkspace(data?.workspace ?? null)
    setMembership(data?.membership ?? null)
    setTeacherRouting(data?.teacher_routing ?? null)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      if (!token) {
        setIsLoading(false)
        return
      }

      try {
        const response = await getMe(token)
        if (cancelled) return
        applyEnvelope(response.data)
      } catch {
        if (cancelled) return
        clearStoredToken()
        setToken(null)
        applyEnvelope(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    hydrate()
    return () => { cancelled = true }
  }, [token, applyEnvelope])

  const login = useCallback(async (payload) => {
    const response = await loginRequest(payload)
    setStoredToken(response.data.token)
    setToken(response.data.token)
    applyEnvelope(response.data)
    return response
  }, [applyEnvelope])

  const loginWithGoogleResponse = useCallback((data) => {
    setStoredToken(data.token)
    setToken(data.token)
    applyEnvelope(data)
  }, [applyEnvelope])

  const refreshUser = useCallback(async () => {
    if (!token) return
    const response = await getMe(token)
    applyEnvelope(response.data)
    return response
  }, [token, applyEnvelope])

  const logout = useCallback(() => {
    clearAllSubmissionDrafts()
    clearStoredToken()
    setToken(null)
    applyEnvelope(null)
  }, [applyEnvelope])

  const value = useMemo(
    () => ({
      ...deriveAuthState({ token, user, workspace, membership, teacherRouting, isLoading }),
      teacherRouting,
      token,
      user,
      workspace,
      membership,
      login,
      loginWithGoogleResponse,
      refreshUser,
      logout,
    }),
    [
      isLoading,
      token,
      user,
      workspace,
      membership,
      teacherRouting,
      login,
      loginWithGoogleResponse,
      refreshUser,
      logout,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
