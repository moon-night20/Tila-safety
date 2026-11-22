import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { ScreenHeader, StatusPill } from '../App'
import { getMapLink, getPhoneLink } from './emergencyMessage'
import { startEmergencyAlarm, stopEmergencyAlarm } from './emergencyAlarm'

export default function Emergency() {
  const navigate = useNavigate()
  const {
    emergency, setToast, contacts, userLocation, latestAlert,
    alertError, smsConfigured, triggerSOS, stopSOS,
  } = useApp()
  const [alarmSilenced, setAlarmSilenced] = useState(false)
  const active = emergency === 'active'
  const mapLink = getMapLink(userLocation.coords)
  const sending = latestAlert?.status === 'queued' || latestAlert?.status === 'sending'
  const sentCount = latestAlert?.sentCount || 0
  const totalCount = latestAlert?.totalCount || contacts.length

  const startAlert = async () => {
    setAlarmSilenced(false)
    await triggerSOS()
  }
  const stopAlert = () => {
    stopSOS().catch((error) => setToast(`Could not stop the SOS alarm: ${error.message}`))
  }

  return (
    <section className="page emergency-page">
      <ScreenHeader title="SOS" subtitle="Get attention and text your trusted contacts" back={() => navigate('/home')} />
      <article className={`emergency-card ${active ? 'active' : ''}`}>
        <StatusPill tone={active ? 'coral' : 'neutral'}>{active ? 'SOS alert active' : 'Not active'}</StatusPill>
        <div className="emergency-icon">!</div>
        <h2>{active ? 'SOS alarm is active' : 'Need immediate help?'}</h2>
        <p>{active
          ? sending
            ? smsConfigured
              ? 'Sending SOS texts to your trusted contacts…'
              : 'SOS alert is queued, but SMS is not configured on the server.'
            : latestAlert?.status === 'failed' && !totalCount
              ? 'No trusted contacts were available, so no SOS text could be sent. Add a contact to enable alerts.'
              : `${sentCount} of ${totalCount} SOS texts sent.`
          : 'Tap once to sound the alarm and text your consented contacts.'}</p>
        {active
          ? <div className="emergency-controls">
            <button className="button secondary wide" type="button" onClick={() => { if (alarmSilenced) startEmergencyAlarm(); else stopEmergencyAlarm(); setAlarmSilenced(!alarmSilenced) }}>{alarmSilenced ? 'Turn alarm back on' : 'Silence alarm'}</button>
            <button className="button secondary wide" type="button" onClick={stopAlert}>Stop SOS alarm</button>
          </div>
          : <button className="button danger wide" type="button" onClick={startAlert}>Start SOS and text contacts</button>}
        {!smsConfigured && <p className="field-error" role="alert">Twilio is not configured on the server, so no text was sent.</p>}
        {alertError && <p className="field-error" role="alert">{alertError}</p>}
        <p className="real-services">Tila sends SMS texts only; it does not place calls. For urgent danger, call your local emergency number.</p>
      </article>
      {active && <section className="sos-contacts">
        <div className="sos-section-heading"><div><p className="eyebrow">YOUR ALERT</p><h2>Contact delivery status</h2></div><button className="button secondary" type="button" onClick={() => navigate('/contacts')}>Manage contacts</button></div>
        <div className="alert-message">
          <strong>SMS delivery</strong>
          {latestAlert?.deliveries?.length
            ? latestAlert.deliveries.map((delivery) => <p key={`${delivery.rank}-${delivery.contactName}`}>Rank {delivery.rank} · {delivery.contactName}: {delivery.status === 'sent' ? 'Text sent' : delivery.status === 'failed' ? 'Text failed' : 'Sending'}</p>)
            : <p>{latestAlert?.status === 'failed' ? 'No contact delivery was created.' : active ? 'No confirmed delivery yet.' : 'Your SOS text includes your last saved location when available.'}</p>}
          {mapLink && <a href={mapLink} target="_blank" rel="noreferrer">Open your current location in Google Maps ↗</a>}
          {!mapLink && <p className="location-missing">No saved location is available to include in the alert.</p>}
        </div>
        {contacts.length
          ? <div className="contact-list">{contacts.map((contact, index) => <article className="contact-card sos-contact-card" key={contact.id}><div className="rank-badge">{index + 1}</div><div className="avatar">{contact.initials}</div><div className="contact-info"><h2>{contact.name}<span>Rank {index + 1}</span></h2><p>{contact.relationship} · {contact.phone}</p></div><div className="sos-contact-actions"><a className="button danger" href={getPhoneLink(contact.phone)}>Call manually</a></div></article>)}</div>
          : <div className="empty-state"><h2>No trusted contacts yet</h2><p>Add people who agreed to receive SOS texts.</p><button className="button primary" type="button" onClick={() => navigate('/contacts')}>Add contacts</button></div>}
      </section>}
    </section>
  )
}
