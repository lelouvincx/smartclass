import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { register } from '../lib/api'
import { PHONE_REGEX } from '../lib/validation'

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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <h1 className="text-2xl font-semibold text-slate-900">Student Registration</h1>
        <p className="text-sm text-slate-600 mt-1">Create your account for teacher approval.</p>

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
              className="w-full h-10 px-3 border border-slate-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-slate-800"
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
              className="w-full h-10 px-3 border border-slate-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-slate-800"
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1">
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full h-10 px-3 border border-slate-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-slate-800"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {successMessage && <p className="text-sm text-emerald-700">{successMessage}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-10 rounded-md bg-slate-900 text-white font-medium disabled:opacity-60"
          >
            {isSubmitting ? 'Submitting...' : 'Register'}
          </button>
        </form>

        <p className="text-sm text-slate-600 mt-5">
          Already have an account?{' '}
          <Link to="/" className="text-slate-900 font-medium underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  )
}
