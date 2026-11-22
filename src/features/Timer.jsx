import { useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { Dialog, ScreenHeader, StatusPill } from '../App'
import { timerPresets } from '../data/mockData'
import { prepareEmergencyAlarm } from './emergencyAlarm'

export default function Timer() {
  const location = useLocation()
  const active = location.pathname.endsWith('/active')
  const navigate = useNavigate()
  const { timer, startTimer, updateTimer, cancelTimer, contacts, setToast, setActivity, userLocation, requestLocation, smsConfigured, latestAlert } = useApp()
  const [preset, setPreset] = useState(timer.duration || 30)
  const [custom, setCustom] = useState('')
  const [note, setNote] = useState(timer.note || '')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionPending, setActionPending] = useState(false)

  const start = async () => {
    const duration = custom ? Number(custom) : preset
    if (!Number.isInteger(duration) || duration < 1 || duration > 180) {
      setActionError('Choose a whole number of minutes from 1 to 180.')
      return
    }
    setSaving(true)
    setActionError('')
    prepareEmergencyAlarm()
    try {
      await startTimer({ duration, note })
      requestLocation()
      navigate('/timer/active')
    } catch (error) {
      setActionError(error.message)
    } finally {
      setSaving(false)
    }
  }
  const format = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  if (active) {
    const paused = timer.status === 'paused'
    const inGrace = timer.status === 'grace'
    const runAction = async (action) => {
      setActionError('')
      setActionPending(true)
      try {
        await updateTimer(action)
        if (action === 'extend') setToast('Five minutes added. Your safety timer restarted.')
      } catch (error) {
        setActionError(error.message)
      } finally {
        setActionPending(false)
      }
    }
    const timerCanBeManaged = ['running', 'paused', 'grace', 'expired'].includes(timer.status)
    return (
      <section className="page timer-page">
        <ScreenHeader title="Safety timer" subtitle={inGrace ? 'Respond now or SOS texts will be sent' : 'Your timer runs securely on the server'} back={() => navigate('/home')} />
        <div className="timer-layout">
          <article className="timer-card">
            <StatusPill tone={inGrace || timer.status === 'expired' ? 'coral' : paused ? 'neutral' : 'purple'}>{inGrace ? 'Check in now' : timer.status === 'expired' ? timerStatusText(latestAlert) : paused ? 'Paused' : timer.status === 'running' ? 'Running' : 'No active timer'}</StatusPill>
            <div className={`timer-ring ${paused ? 'paused' : ''} ${inGrace ? 'timer-ring-warning' : ''}`}><span>{format(inGrace ? timer.graceRemaining : timer.remaining)}</span><small>{inGrace ? 'UNTIL SOS TEXTS' : timer.status === 'expired' ? 'TIMER EXPIRED' : 'MINUTES LEFT'}</small></div>
            {timer.status === 'running' || paused ? <>
              <button className="button primary" type="button" disabled={actionPending} onClick={() => runAction(paused ? 'resume' : 'pause')}>{actionPending ? 'Updating…' : paused ? 'Resume timer' : 'Pause timer'}</button>
              <div className="timer-actions">
                <button type="button" disabled={actionPending} onClick={() => runAction('add')}>+5 min</button>
                <button type="button" disabled={actionPending} onClick={() => navigate('/check-in')}>Check in</button>
                <button type="button" disabled={actionPending} onClick={() => setCancelOpen(true)}>Cancel</button>
              </div>
            </> : inGrace ? <div className="timer-grace-actions"><p>Choose whether to add five minutes in the prompt. If you don’t respond before this countdown ends, Tila will text your trusted contacts.</p></div> : timerCanBeManaged ? <button className="button danger" type="button" onClick={() => navigate('/emergency')}>Open SOS alert</button> : <button className="button primary" type="button" onClick={() => navigate('/timer/setup')}>Set a safety timer</button>}
            {actionError && <p className="field-error" role="alert">{actionError}</p>}
          </article>
          <aside className="timer-summary"><h2>Timer details</h2><p><span>Duration</span><strong>{timer.duration} min</strong></p><p><span>Alert contacts</span><strong>{contacts.length}</strong></p><p><span>Location</span><strong>{userLocation.coords ? 'Ready to share' : userLocation.status === 'error' || userLocation.status === 'unavailable' ? 'Unavailable' : userLocation.status === 'locating' ? 'Finding location' : 'Last known or unavailable'}</strong></p><p><span>Note</span><strong>{timer.note || 'None'}</strong></p>{timer.status === 'expired' && <p className="timer-alert-note">{timerAlertText(latestAlert, smsConfigured)}</p>}</aside>
        </div>
        {cancelOpen && <Dialog title="Cancel this timer?" confirmLabel="Cancel timer" danger onCancel={() => setCancelOpen(false)} onConfirm={async () => { try { await cancelTimer(); setActivity((items) => [{ id: Date.now(), title: 'Timer cancelled', detail: 'Safety timer', time: 'Just now', tone: 'neutral' }, ...items]); setCancelOpen(false); navigate('/home') } catch (error) { setActionError(error.message); setCancelOpen(false) } }}>No timer-expiry alert will be sent after cancellation.</Dialog>}
      </section>
    )
  }
  return (
    <section className="page setup-page">
      <ScreenHeader title="Set a safety timer" subtitle="Choose when to check in" back={() => navigate('/home')} />
      <div className="form-grid">
        <form onSubmit={(event) => { event.preventDefault(); start() }}>
          <fieldset><legend>Quick duration</legend><div className="preset-grid">{timerPresets.map((value) => <button type="button" className={preset === value && !custom ? 'selected' : ''} key={value} onClick={() => { setPreset(value); setCustom('') }}><strong>{value}</strong><span>min</span></button>)}</div></fieldset>
          <label>Custom duration (minutes)<input type="number" min="1" max="180" value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="e.g. 20" /></label>
          <label>Note<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Heading home…" /></label>
          <div className="timer-contact-summary"><strong>SOS contact order</strong><p>{contacts.length ? contacts.map((contact, index) => `Rank ${index + 1}: ${contact.name}`).join(' · ') : 'No contacts added. The countdown still works, but Tila cannot send an SOS text until you add a trusted contact.'}</p><button className="text-button" type="button" onClick={() => navigate('/contacts')}>Manage contacts</button></div>
          {!smsConfigured && <p className="field-error" role="alert">Your countdown will work even without Twilio, but SOS texts cannot be sent until SMS is configured on the server.</p>}
          {actionError && <p className="field-error" role="alert">{actionError}</p>}
          <button className="button primary wide" type="submit" disabled={saving}>{saving ? 'Starting…' : 'Start safety countdown'}</button>
        </form>
        <aside className="privacy-card"><h2>How SOS works</h2><ol><li><b>1</b><div><strong>Start a countdown</strong><p>Your timer is saved on the server so it continues if you close the app.</p></div></li><li><b>2</b><div><strong>Respond at zero</strong><p>You have 1 minute to check in or add five minutes.</p></div></li><li><b>3</b><div><strong>No response sends SOS</strong><p>After the response window, Twilio texts your consented contacts with your last saved location.</p></div></li></ol></aside>
      </div>
    </section>
  )
}

function timerAlertText(alert, smsConfigured) {
  if (!alert) return 'No response was received. Checking SOS text delivery status…'
  if (alert.status === 'sent') return `SOS text sent to ${alert.sentCount} trusted contact${alert.sentCount === 1 ? '' : 's'}.`
  if (alert.status === 'partial') return `SOS text sent to ${alert.sentCount} of ${alert.totalCount} contacts. Some messages failed.`
  if (alert.status === 'failed' && !alert.totalCount) return 'No trusted contacts were available, so no SOS text could be sent. Add a contact to enable timer alerts.'
  if (alert.status === 'failed') return 'SOS texts could not be delivered. Use the contact links on the SOS screen or call local emergency services.'
  if (!smsConfigured) return 'SOS alert queued, but no text was sent because SMS is not configured on the server.'
  return 'No response was received. SOS texts are being sent to your trusted contacts.'
}

function timerStatusText(alert) {
  if (alert?.status === 'sent') return 'SOS texts sent'
  if (alert?.status === 'partial') return 'Texts partly sent'
  if (alert?.status === 'failed' && !alert.totalCount) return 'No contacts to alert'
  if (alert?.status === 'failed') return 'Text delivery failed'
  return 'Alert queued'
}
