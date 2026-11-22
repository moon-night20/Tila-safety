import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Welcome from '../features/Welcome'
import Auth from '../features/Auth'
import Home from '../features/Home'
import Timer from '../features/Timer'
import CheckIn from '../features/CheckIn'
import Emergency from '../features/Emergency'
import Contacts from '../features/Contacts'
import Location from '../features/Location'
import Assistant from '../features/Assistant'
import { useApp } from './AppContext'

export default function AppRoutes() {
  const location = useLocation()
  const navigate = useNavigate()
  const { authStatus, serviceError, refreshSession, timer, latestAlert, contacts, smsConfigured, updateTimer, cancelTimer, triggerSOS } = useApp()
  const [timerActionError, setTimerActionError] = useState('')
  const [timerActionPending, setTimerActionPending] = useState(false)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])
  useEffect(() => {
    if (
      authStatus === 'signed-in'
      && timer.status === 'expired'
      && latestAlert
      && latestAlert.status !== 'stopped'
      && location.pathname !== '/emergency'
    ) {
      navigate('/emergency')
    }
  }, [authStatus, latestAlert, location.pathname, navigate, timer.status])

  if (authStatus === 'checking') {
    return <main className="standalone"><p className="auth-loading">Connecting securely to Tila…</p></main>
  }
  if (authStatus === 'error') {
    return <main className="standalone"><section className="auth-card"><h1>Server unavailable</h1><p>{serviceError}</p><button className="button primary wide" type="button" onClick={refreshSession}>Try again</button></section></main>
  }

  const extendTimer = async () => {
    setTimerActionError('')
    setTimerActionPending(true)
    try {
      await updateTimer('extend')
    } catch (error) {
      setTimerActionError(error.message)
    } finally {
      setTimerActionPending(false)
    }
  }
  const sendSOSNow = async () => {
    setTimerActionError('')
    setTimerActionPending(true)
    try {
      await cancelTimer()
      await triggerSOS()
      navigate('/emergency')
    } catch (error) {
      setTimerActionError(error.message)
    } finally {
      setTimerActionPending(false)
    }
  }

  return (
    <>
    <Routes>
      {authStatus === 'signed-out' ? <>
        <Route path="/" element={<Welcome />} />
        <Route path="/auth/:mode" element={<Auth />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </> : <>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/auth/:mode" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<Home />} />
        <Route path="/timer/setup" element={<Timer />} />
        <Route path="/timer/active" element={<Timer />} />
        <Route path="/check-in" element={<CheckIn />} />
        <Route path="/emergency" element={<Emergency />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/location" element={<Location />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </>}
    </Routes>
    {authStatus === 'signed-in' && timer.status === 'grace' && <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="timer-expiry-title">
        <p className="eyebrow">SAFETY TIMER</p>
        <h2 id="timer-expiry-title">Your countdown has finished</h2>
        <p>Add five minutes to restart the timer. If you don’t respond in <strong>{formatCountdown(timer.graceRemaining)}</strong>, {graceOutcome(contacts.length, smsConfigured)}</p>
        {timerActionError && <p className="field-error" role="alert">{timerActionError}</p>}
        <div className="dialog-actions">
          <button className="button secondary" type="button" onClick={sendSOSNow} disabled={timerActionPending}>Send SOS now</button>
          <button className="button primary" type="button" onClick={extendTimer} disabled={timerActionPending}>I’m okay — add 5 minutes</button>
        </div>
      </section>
    </div>}
    </>
  )
}

function formatCountdown(seconds = 0) {
  const safeSeconds = Math.max(0, seconds)
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`
}

function graceOutcome(contactCount, smsConfigured) {
  if (!contactCount) return 'Tila will activate the SOS alarm, but there are no trusted contacts to text.'
  if (!smsConfigured) return 'Tila will queue the SOS alert, but SMS is not configured on the server.'
  return 'Tila will send an SOS text to your trusted contacts.'
}
