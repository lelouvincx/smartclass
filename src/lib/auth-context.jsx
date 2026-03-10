import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getMe, login as loginRequest } from './api'
import { clearStoredToken, getStoredToken, setStoredToken } from './auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getStoredToken())
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function hydrate() {
      if (!token) {
        setIsLoading(false)
        return
      }

      try {
        const response = await getMe(token)
        setUser(response.data)
      } catch {
        clearStoredToken()
        setToken(null)
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    hydrate()
  }, [token])

  const login = useCallback(async (payload) => {
    const response = await loginRequest(payload)
    setStoredToken(response.data.token)
    setToken(response.data.token)
    setUser(response.data.user)
    return response
  }, [])

  const logout = useCallback(() => {
    clearStoredToken()
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      token,
      user,
      isLoading,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
    }),
    [isLoading, token, user, login, logout],
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
