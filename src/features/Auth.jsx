import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { normalizePhoneNumber } from './phoneNumber'

export default function Auth() {
  const { mode } = useParams()
  const signup = mode === 'signup'
  const navigate = useNavigate()
  const { signIn, signUp } = useApp()
  const [form, setForm] = useState({ name: '', username: '', identifier: '', phone: '', password: '' })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    const next = {}
    if (signup && !form.name.trim()) next.name = 'Enter your name'
    if (signup && !/^[a-zA-Z0-9_]{3,30}$/.test(form.username.trim())) {
      next.username = 'Use 3–30 letters, numbers, or underscores'
    }
    if (!signup && form.phone.trim() && !normalizePhoneNumber(form.phone)) {
      next.phone = 'Enter an Ethiopian mobile number (09… or +251…) or an international number with country code.'
    }
    if (!signup && !form.identifier.trim()) next.identifier = 'Enter your username or phone number'
    if (form.password.length < 10) next.password = 'Use at least 10 characters'
    setErrors(next)
    if (Object.keys(next).length) return
    setSubmitting(true)
    setServerError('')
    try {
      if (signup) await signUp(form)
      else await signIn({ identifier: form.identifier, phone: form.phone, password: form.password })
      navigate('/home')
    } catch (error) {
      setServerError(error.message)
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <section className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">TILA · SECURE ACCOUNT</p>
        <h1>{signup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="subtitle">{signup ? 'Your trusted contacts and safety timers are stored securely on this server.' : 'Sign in to access your contacts and safety timers.'}</p>
        <form onSubmit={submit} noValidate>
          {signup && (
            <label>Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-describedby="name-error" />
              {errors.name && <small id="name-error" className="field-error">{errors.name}</small>}
            </label>
          )}
          {signup ? (
            <>
              <label>Username
                <input type="text" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} aria-describedby="username-error" />
                {errors.username && <small id="username-error" className="field-error">{errors.username}</small>}
              </label>
            </>
          ) : (
            <>
              <label>Username or phone number
                <input type="text" autoComplete="username" placeholder="Username, 09…, or +251…" value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} aria-describedby="identifier-error" />
                {errors.identifier && <small id="identifier-error" className="field-error">{errors.identifier}</small>}
              </label>
              <label>Phone number (optional)
                <input type="tel" autoComplete="tel" inputMode="tel" placeholder="09… or +251…" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-describedby="phone-help phone-error" />
                <small id="phone-help">Enter your own number to save it. Ethiopian 09… and +251… formats are accepted.</small>
                {errors.phone && <small id="phone-error" className="field-error">{errors.phone}</small>}
              </label>
            </>
          )}
          <label>Password
            <input type="password" autoComplete={signup ? 'new-password' : 'current-password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} aria-describedby="password-error" />
            {errors.password && <small id="password-error" className="field-error">{errors.password}</small>}
          </label>
          {serverError && <p className="field-error" role="alert">{serverError}</p>}
          <button className="button primary" type="submit" disabled={submitting}>{submitting ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</button>
        </form>
        <button className="text-button" type="button" onClick={() => navigate(signup ? '/auth/login' : '/auth/signup')}>{signup ? 'Already have an account? Sign in' : 'New to Tila? Create account'}</button>
      </div>
    </section>
  )
}
