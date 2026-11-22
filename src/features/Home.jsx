import { Link, useNavigate } from 'react-router-dom'
import { Alert24Regular, Chat24Regular, Checkmark24Regular, Location24Regular, Timer24Regular } from '@fluentui/react-icons'
import { useApp } from '../app/AppContext'
import { ScreenHeader, StatusPill } from '../App'
import { getGoogleMapsPlaceLink } from './googleMaps'

export default function Home() {
  const navigate = useNavigate()
  const { timer, checkIn, activity, emergency, requestLocation, userLocation, triggerSOS, smsConfigured, serviceError, signOut, setToast } = useApp()
  const point = userLocation.coords
  const startSOS = () => {
    if (emergency === 'active') {
      navigate('/emergency')
      return
    }
    triggerSOS()
    navigate('/emergency')
  }
  const closeMenu = (event) => {
    event.currentTarget.closest('details').open = false
  }
  return (
    <section className="page home-page">
      <div className="home-header">
        <ScreenHeader title="Good evening" subtitle="Your safety tools, in one place" />
        <details className="home-menu">
          <summary aria-label="Open navigation menu">
            <span className="menu-icon" aria-hidden="true"><i /><i /><i /></span>
            <span>Menu</span>
          </summary>
          <nav className="home-menu-panel" aria-label="Home menu">
            <Link to="/home" onClick={closeMenu}>Home</Link>
            <Link to={['running', 'paused', 'grace', 'expired'].includes(timer.status) ? '/timer/active' : '/timer/setup'} onClick={closeMenu}>Safety timer</Link>
            <Link to="/contacts" onClick={closeMenu}>Trusted contacts</Link>
            <Link to="/location" onClick={closeMenu}>Location &amp; directions</Link>
            <Link to="/assistant" onClick={closeMenu}>Safety assistant</Link>
            <Link className="home-menu-sos" to="/emergency" onClick={closeMenu}>SOS alert</Link>
            <button type="button" onClick={(event) => { closeMenu(event); signOut().catch((error) => setToast(`Could not sign out: ${error.message}`)) }}>Sign out</button>
          </nav>
        </details>
      </div>
      <div className="dashboard-grid">
        <article className="home-sos-card">
          <div className="sos-copy"><StatusPill tone={emergency === 'active' ? 'coral' : 'neutral'}>{emergency === 'active' ? 'SOS alert active' : 'SOS · Quick access'}</StatusPill><h2>{emergency === 'active' ? 'Your SOS alarm is active' : 'Need help quickly?'}</h2><p>{emergency === 'active' ? 'The alarm is active. Check the SOS screen for text-delivery status.' : 'Start an SOS text alert now, or set a timer for automatic escalation.'}</p>{!smsConfigured && <p className="field-error" role="alert">SMS is not configured on the server. SOS texts cannot be sent yet.</p>}</div>
          <button className="button danger sos-button" type="button" onClick={startSOS}>{emergency === 'active' ? 'Open SOS alert' : 'Start SOS now'}</button>
        </article>
        <article className="home-location-card">
          <div className="home-location-heading"><span className="home-location-icon"><Location24Regular /></span><div><StatusPill tone={point ? 'green' : userLocation.status === 'error' ? 'coral' : 'neutral'}>{point ? 'Current location ready' : userLocation.status === 'locating' ? 'Finding your location' : 'Location is the priority'}</StatusPill><h2>{point ? 'Your current position' : 'Where are you right now?'}</h2><p>{point ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}` : userLocation.error || 'Find your position and get directions to where you need to go.'}</p></div></div>
          <div className="home-location-actions">
            <button className="button primary" type="button" onClick={requestLocation} disabled={userLocation.status === 'locating'}>{userLocation.status === 'locating' ? 'Finding location…' : point ? 'Refresh my location' : 'Find where I am'}</button>
            {point && <a className="button secondary" href={getGoogleMapsPlaceLink(point)} target="_blank" rel="noreferrer">Open Google Maps</a>}
            <Link className="button secondary" to="/location">Directions and map</Link>
          </div>
        </article>
        <article className="action-grid">
          <Link to={['running', 'paused', 'grace', 'expired'].includes(timer.status) ? '/timer/active' : '/timer/setup'} className="action-card"><span><Timer24Regular /></span><h3>{timer.status === 'grace' ? 'Check in now' : timer.status === 'running' || timer.status === 'paused' ? 'Active timer' : 'Safety timer'}</h3><p>{timer.status === 'grace' ? `SOS text in ${formatCountdown(timer.graceRemaining)}` : timer.status === 'running' || timer.status === 'paused' ? 'Check remaining time' : 'Set a check-in countdown'}</p></Link>
          <Link to="/check-in" className="action-card"><span><Checkmark24Regular /></span><h3>Check in</h3><p>{checkIn === 'idle' ? 'No check-in due' : 'Update your status'}</p></Link>
          <Link to="/contacts" className="action-card"><span><PeopleIcon /></span><h3>Trusted contacts</h3><p>Manage support</p></Link>
          <Link to="/location" className="action-card"><span><Location24Regular /></span><h3>Location &amp; directions</h3><p>Find me or navigate</p></Link>
          <Link to="/assistant" className="action-card"><span><Chat24Regular /></span><h3>Safety assistant</h3><p>Scripted guidance</p></Link>
          <Link to="/emergency" className="action-card danger-card"><span><Alert24Regular /></span><h3>SOS settings</h3><p>Alarm and alert contacts</p></Link>
        </article>
        {serviceError && <p className="service-error" role="alert">{serviceError}</p>}
        <article className="activity-card"><div className="card-heading"><h2>Recent activity</h2></div>{activity.map((item) => <div className="activity-row" key={item.id}><span className={`activity-dot ${item.tone}`} /><div><strong>{item.title}</strong><p>{item.detail}</p></div><time>{item.time}</time></div>)}</article>
      </div>
    </section>
  )
}

function formatCountdown(seconds = 0) {
  const safeSeconds = Math.max(0, seconds)
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`
}

function PeopleIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8.5-1.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2 20v-2c0-3 2.7-5 6-5s6 2 6 5v2H2Zm12.2-7c.9-.4 2-.6 3.3-.6 2.9 0 5 1.8 5 4.6V20h-6.3v-2c0-2-.7-3.8-2-5Z" fill="currentColor"/></svg>
}
