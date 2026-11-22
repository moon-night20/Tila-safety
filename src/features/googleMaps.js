function getCoordinates(location) {
  return `${location.latitude},${location.longitude}`
}

export function getGoogleMapsPlaceLink(location) {
  const url = new URL('https://www.google.com/maps/search/')
  url.searchParams.set('api', '1')
  url.searchParams.set('query', getCoordinates(location))
  return url.toString()
}

export function getGoogleMapsEmbedLink(location) {
  const url = new URL('https://maps.google.com/maps')
  url.searchParams.set('q', getCoordinates(location))
  url.searchParams.set('z', '16')
  url.searchParams.set('output', 'embed')
  return url.toString()
}

export function getGoogleMapsDirectionsLink(origin, destination, travelMode) {
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('origin', getCoordinates(origin))
  url.searchParams.set('destination', destination.trim())
  url.searchParams.set('travelmode', travelMode)
  return url.toString()
}
