import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { getDefaultPathForRole } from '../lib/navigation'
import { PHONE_REGEX } from '../lib/validation'

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

    if (!PHONE_REGEX.test(phone)) {
      setError('Phone must match +84xxxxxxxxx format.')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await login({ phone, password })
      navigate(getDefaultPathForRole(response.data.user.role), { replace: true })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow p-6">
        <h1 className="text-2xl font-semibold text-slate-900">SmartClass Login</h1>
        <p className="text-sm text-slate-600 mt-1">Sign in with your phone number.</p>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">
              Phone
            </label>
            <input
              id="phone"
              type="text"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+84xxxxxxxxx"
              className="w-full h-10 px-3 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-800"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full h-10 px-3 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-800"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-10 rounded-md bg-slate-900 text-white font-medium disabled:opacity-60"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-sm text-slate-600 mt-5">
          No account?{' '}
          <Link to="/register" className="text-slate-900 font-medium underline">
            Register as student
          </Link>
        </p>
      </div>
    </div>
  )
}
