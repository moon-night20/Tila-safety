import { getGoogleMapsPlaceLink } from './googleMaps'

export function getMapLink(location) {
  if (!location) return ''
  return getGoogleMapsPlaceLink(location)
}

export function getHelpMessage(timer, location) {
  const mapLink = getMapLink(location)
  const note = timer.note?.trim()
  return ['Help me. I need assistance. Please call me.', note && `Note: ${note}`, mapLink && `My location: ${mapLink}`]
    .filter(Boolean)
    .join(' ')
}

export function getPhoneLink(phone) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

export function getMessageLink(phone, message) {
  return `sms:${phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(message)}`
}
