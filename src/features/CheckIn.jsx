import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { Dialog, ScreenHeader } from '../App'

export default function CheckIn() {
  const navigate = useNavigate()
  const { setCheckIn, cancelTimer, setActivity, setToast, triggerSOS } = useApp()
  const [choice, setChoice] = useState('')
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(false)
  const submit = async () => {
    setCheckIn(choice)
    if (choice === 'help') {
      setConfirm(false)
      try {
        await cancelTimer()
      } catch (error) {
        setToast(`Could not cancel the timer. Sending SOS anyway: ${error.message}`)
      }
      await triggerSOS()
      navigate('/emergency')
      return
    }
    try {
      await cancelTimer()
    } catch (error) {
      setToast(`Could not cancel the timer: ${error.message}`)
      return
    }
    setActivity((items) => [{ id: Date.now(), title: choice === 'safe' ? 'Safe check-in' : 'Need help check-in', detail: 'Demo check-in', time: 'Just now', tone: choice === 'safe' ? 'green' : 'coral' }, ...items])
    setToast('Safe check-in confirmed. Timer cancelled.')
    setConfirm(false)
  }
  return (
    <section className="page checkin-page">
      <ScreenHeader title="Check in" subtitle="Tell Tila how you're doing" back={() => navigate('/home')} />
      <div className="checkin-card">
        <div className="checkin-options">
          <button type="button" className={choice === 'safe' ? 'selected safe' : 'safe'} onClick={() => setChoice('safe')}><span>✓</span><strong>I’m safe</strong><p>I’m in a good place and can update later.</p></button>
          <button type="button" className={choice === 'help' ? 'selected help' : 'help'} onClick={() => setChoice('help')}><span>!</span><strong>I need help</strong><p>I may need support or emergency guidance.</p></button>
        </div>
        <label>Optional note<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="A short private note…" /></label>
        <button className="button primary wide" type="button" disabled={!choice} onClick={() => setConfirm(true)}>Confirm check-in</button>
        <p className="privacy-line">Choosing “I need help” starts an SOS text to your trusted contacts.</p>
      </div>
      {confirm && <Dialog title={choice === 'safe' ? 'Confirm safe check-in?' : 'Send an SOS text?'} confirmLabel={choice === 'safe' ? 'Confirm safe' : 'Send SOS'} danger={choice === 'help'} onCancel={() => setConfirm(false)} onConfirm={submit}>{choice === 'safe' ? 'This cancels your active safety timer.' : 'This sends an SOS text to all saved trusted contacts.'}</Dialog>}
    </section>
  )
}
