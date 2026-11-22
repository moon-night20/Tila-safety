import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Location24Regular } from '@fluentui/react-icons'
import { useApp } from '../app/AppContext'
import { ScreenHeader, StatusPill } from '../App'
import { getGoogleMapsDirectionsLink, getGoogleMapsEmbedLink, getGoogleMapsPlaceLink } from './googleMaps'

export default function Location() {
  const navigate = useNavigate()
  const { userLocation, requestLocation } = useApp()
  const [destination, setDestination] = useState('')
  const [travelMode, setTravelMode] = useState('driving')
  const point = userLocation.coords
  const mapEmbed = point ? getGoogleMapsEmbedLink(point) : ''
  const directionsLink = point && destination.trim()
    ? getGoogleMapsDirectionsLink(point, destination, travelMode)
    : ''

  return (
    <section className="page location-page">
      <ScreenHeader title="My location" subtitle="See where you are and get directions to where you’re going" back={() => navigate('/home')} />
      <div className="location-layout">
        <article className="map-card">
          {point
            ? <iframe className="location-map-embed" title="Your current location on Google Maps" src={mapEmbed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            : <div className="map-grid"><div className="map-road road-one" /><div className="map-road road-two" /><div className="map-pin"><Location24Regular /></div><div className="map-empty-message">{userLocation.status === 'locating' ? 'Finding your location…' : 'Your map will appear here'}</div></div>}
          <div className="map-status"><StatusPill tone={point ? 'green' : userLocation.status === 'error' || userLocation.status === 'unavailable' ? 'coral' : 'neutral'}>{point ? 'Current position found' : userLocation.status === 'locating' ? 'Finding location' : 'Location not set'}</StatusPill></div>
        </article>
        <aside className="location-info">
          <h2>{point ? 'Where you are' : 'Find where you are'}</h2>
          {point
            ? <><p className="location-coordinates">{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</p><p>{userLocation.updatedAt ? `Updated ${new Date(userLocation.updatedAt).toLocaleTimeString()}` : ''}<br />Google Maps will use this position as your route origin.</p><a className="button secondary wide" href={getGoogleMapsPlaceLink(point)} target="_blank" rel="noreferrer">Open my location in Google Maps</a></>
            : <><p>{userLocation.error || 'Allow location access to see your current position and include a Google Maps link in your SOS message.'}</p><button className="button primary wide" type="button" onClick={requestLocation} disabled={userLocation.status === 'locating'}>{userLocation.status === 'locating' ? 'Finding your location…' : 'Find my location'}</button></>}
          {point && <button className="button primary wide" type="button" onClick={requestLocation} disabled={userLocation.status === 'locating'}>{userLocation.status === 'locating' ? 'Updating location…' : 'Update my location'}</button>}
          <form className="directions-form" onSubmit={(event) => { event.preventDefault(); if (directionsLink) window.open(directionsLink, '_blank', 'noopener,noreferrer') }}>
            <h3>Where are you going?</h3>
            <label htmlFor="destination">Destination<input id="destination" value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Enter an address or place" autoComplete="street-address" /></label>
            <label htmlFor="travel-mode">Travel by<select id="travel-mode" value={travelMode} onChange={(event) => setTravelMode(event.target.value)}><option value="driving">Driving</option><option value="walking">Walking</option><option value="bicycling">Bicycling</option><option value="transit">Transit</option></select></label>
            <button className="button primary wide" type="submit" disabled={!directionsLink}>Get directions in Google Maps</button>
            {!point && <p className="directions-hint">Find your current location first so Google Maps can start directions from where you are.</p>}
          </form>
          <p className="privacy-line">Your browser asks for location permission. When available, your location is included in SOS texts sent to trusted contacts when Twilio is configured. If no fresh location is available, Tila uses your last saved location. Google Maps opens directions from your current coordinates to the destination you enter.</p>
        </aside>
      </div>
    </section>
  )
}
