import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { activitySeed } from '../data/mockData'
import { startEmergencyAlarm, stopEmergencyAlarm } from '../features/emergencyAlarm'
import { apiRequest } from './api'

const AppContext = createContext(null)

function withInitials(contacts) {
  return contacts.map((contact) => ({
    ...contact,
    initials: contact.name.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase(),
    primary: contact.rank === 1,
  }))
}

function mapLocation(location) {
  return location
    ? { status: 'available', coords: { latitude: location.latitude, longitude: location.longitude }, updatedAt: location.updatedAt, error: '' }
    : { status: 'idle', coords: null, updatedAt: null, error: '' }
}

function timerAlertToast(alert, locationMessage, smsConfigured) {
  if (alert.status === 'sent') return `Safety timer ended. SOS text sent to ${alert.sentCount} trusted contact${alert.sentCount === 1 ? '' : 's'}.${locationMessage}`
  if (alert.status === 'partial') return `Safety timer ended. SOS text sent to ${alert.sentCount} of ${alert.totalCount} contacts.${locationMessage}`
  if (alert.status === 'failed' && !alert.totalCount) return 'Safety timer ended, but no trusted contacts were available to text. Add a contact to enable SOS alerts.'
  if (alert.status === 'failed') return 'Safety timer ended, but SOS texts could not be sent. Check the SOS screen.'
  if (!smsConfigured) return `Safety timer ended. SOS alert queued, but SMS is not configured on the server.${locationMessage}`
  return `Safety timer ended. Sending SOS texts to your trusted contacts.${locationMessage}`
}

export function AppProvider({ children }) {
  const locationRequestId = useRef(0)
  const alerting = useRef(false)
  const notifiedTimerAlertId = useRef(null)
  const [authStatus, setAuthStatus] = useState('checking')
  const [user, setUser] = useState(null)
  const [contacts, setContacts] = useState([])
  const [timer, setTimer] = useState({ status: 'idle', duration: 30, remaining: 30 * 60, note: '', runId: null })
  const [activity, setActivity] = useState(activitySeed)
  const [checkIn, setCheckIn] = useState('idle')
  const [emergency, setEmergency] = useState('idle')
  const [userLocation, setUserLocation] = useState(mapLocation(null))
  const [latestAlert, setLatestAlert] = useState(null)
  const [smsConfigured, setSmsConfigured] = useState(false)
  const [alertError, setAlertError] = useState('')
  const [serviceError, setServiceError] = useState('')
  const [assistantHistory, setAssistantHistory] = useState([])
  const [toast, setToast] = useState('')

  const applySession = useCallback((data) => {
    setUser(data.user)
    setContacts(withInitials(data.contacts || []))
    setTimer(data.timer || { status: 'idle', duration: 30, remaining: 30 * 60, note: '', runId: null })
    setUserLocation(mapLocation(data.location))
    setSmsConfigured(Boolean(data.smsConfigured))
    setLatestAlert(data.latestAlert || null)
    notifiedTimerAlertId.current = data.latestAlert?.id ?? null
    setEmergency(data.latestAlert && data.latestAlert.status !== 'stopped' ? 'active' : 'idle')
    setAuthStatus('signed-in')
    setServiceError('')
  }, [])

  const refreshSession = useCallback(async () => {
    try {
      const data = await apiRequest('/api/me')
      applySession(data)
      return true
    } catch (error) {
      if (error.status === 401) {
        setAuthStatus('signed-out')
        setUser(null)
        setContacts([])
        return false
      }
      setAuthStatus('error')
      setServiceError(error.message)
      return false
    }
  }, [applySession])

  useEffect(() => {
    const id = window.setTimeout(refreshSession, 0)
    return () => window.clearTimeout(id)
  }, [refreshSession])

  const signUp = useCallback(async (details) => {
    const data = await apiRequest('/api/auth/signup', { method: 'POST', body: JSON.stringify(details) })
    applySession(data)
  }, [applySession])

  const signIn = useCallback(async (details) => {
    const data = await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(details) })
    applySession(data)
  }, [applySession])

  const signOut = useCallback(async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' })
    setAuthStatus('signed-out')
    setUser(null)
    setContacts([])
    setEmergency('idle')
    setTimer({ status: 'idle', duration: 30, remaining: 1800, note: '', runId: null })
    setUserLocation(mapLocation(null))
    setLatestAlert(null)
    setSmsConfigured(false)
    setAlertError('')
    setServiceError('')
  }, [])

  const requestLocation = useCallback(({ timeout = 15000 } = {}) => {
    const requestId = ++locationRequestId.current
    if (!navigator.geolocation) {
      const error = 'Location is not supported by this browser.'
      setUserLocation({ status: 'unavailable', coords: null, updatedAt: null, error })
      return Promise.resolve(null)
    }

    setUserLocation((current) => ({ ...current, status: 'locating', coords: null, updatedAt: null, error: '' }))
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const location = { latitude: coords.latitude, longitude: coords.longitude }
          if (requestId === locationRequestId.current) {
            const updatedAt = Date.now()
            setUserLocation({ status: 'available', coords: location, updatedAt, error: '' })
            if (authStatus === 'signed-in') {
              apiRequest('/api/location', { method: 'PUT', body: JSON.stringify(location) })
                .catch((error) => setServiceError(`Could not save your location for timer alerts: ${error.message}`))
            }
          }
          resolve(location)
        },
        (error) => {
          const message = error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. Allow location access in your browser settings and try again.'
            : error.code === error.TIMEOUT
              ? 'Location request timed out. Try again somewhere with a clearer GPS signal.'
              : 'Your current location could not be determined. Try again.'
          if (requestId === locationRequestId.current) setUserLocation({ status: 'error', coords: null, updatedAt: null, error: message })
          resolve(null)
        },
        { enableHighAccuracy: true, timeout, maximumAge: 0 }
      )
    })
  }, [authStatus])

  useEffect(() => {
    if (!toast) return undefined
    const id = window.setTimeout(() => setToast(''), 6000)
    return () => window.clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (authStatus !== 'signed-in') return undefined
    let active = true
    let inFlight = false
    const refresh = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const [timerData, alertData] = await Promise.all([
          apiRequest('/api/timer'),
          apiRequest('/api/alerts/latest'),
        ])
        if (!active) return
        setTimer(timerData.timer)
        setLatestAlert(alertData.alert)
        if (timerData.timer.status === 'expired' && alertData.alert && alertData.alert.status !== 'stopped') {
          setEmergency('active')
          if (notifiedTimerAlertId.current !== alertData.alert.id) {
            notifiedTimerAlertId.current = alertData.alert.id
            const locationIncluded = Number.isFinite(alertData.alert.latitude) && Number.isFinite(alertData.alert.longitude)
            const locationMessage = locationIncluded ? ' A Google Maps location link is included.' : ' No saved location was available.'
            setToast(timerAlertToast(alertData.alert, locationMessage, smsConfigured))
          }
        }
        setServiceError('')
      } catch (error) {
        if (active && error.status !== 401) setServiceError(`Connection to the alert server was lost: ${error.message}`)
      } finally {
        inFlight = false
      }
    }
    const id = window.setInterval(refresh, 2000)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [authStatus, smsConfigured])

  useEffect(() => {
    if (!['running', 'grace'].includes(timer.status) || !timer.dueAt) return undefined
    const id = window.setInterval(() => {
      setTimer((current) => current.status === 'running'
        ? { ...current, remaining: Math.max(0, Math.ceil((current.dueAt - Date.now()) / 1000)) }
        : current.status === 'grace'
          ? { ...current, graceRemaining: Math.max(0, Math.ceil((current.dueAt - Date.now()) / 1000)) }
          : current)
    }, 1000)
    return () => window.clearInterval(id)
  }, [timer.status, timer.dueAt])

  useEffect(() => {
    if (emergency === 'active') {
      startEmergencyAlarm()
      return stopEmergencyAlarm
    }
    stopEmergencyAlarm()
    return undefined
  }, [emergency])

  const createContact = useCallback(async (contact) => {
    const data = await apiRequest('/api/contacts', { method: 'POST', body: JSON.stringify(contact) })
    setContacts(withInitials(data.contacts))
  }, [])

  const updateContact = useCallback(async (id, contact) => {
    const data = await apiRequest(`/api/contacts/${id}`, { method: 'PUT', body: JSON.stringify(contact) })
    setContacts(withInitials(data.contacts))
  }, [])

  const reorderContacts = useCallback(async (ids) => {
    const data = await apiRequest('/api/contacts/order', { method: 'PATCH', body: JSON.stringify({ ids }) })
    setContacts(withInitials(data.contacts))
  }, [])

  const deleteContact = useCallback(async (id) => {
    const data = await apiRequest(`/api/contacts/${id}`, { method: 'DELETE' })
    setContacts(withInitials(data.contacts))
  }, [])

  const startTimer = useCallback(async (details) => {
    const data = await apiRequest('/api/timer', { method: 'POST', body: JSON.stringify(details) })
    setTimer(data.timer)
    setToast('Safety countdown started. It keeps running if you leave the app.')
    return data.timer
  }, [])

  const updateTimer = useCallback(async (action) => {
    const data = await apiRequest('/api/timer', { method: 'PATCH', body: JSON.stringify({ action }) })
    setTimer(data.timer)
    return data.timer
  }, [])

  const cancelTimer = useCallback(async () => {
    const data = await apiRequest('/api/timer', { method: 'DELETE' })
    setTimer(data.timer)
    setToast('Safety countdown cancelled')
  }, [])

  const triggerSOS = useCallback(async () => {
    if (alerting.current) return
    alerting.current = true
    setEmergency('active')
    setAlertError('')
    setToast('Getting your location and sending SOS texts…')
    let timerCancelError = ''
    try {
      if (['running', 'paused', 'grace'].includes(timer.status)) {
        try {
          const timerData = await apiRequest('/api/timer', { method: 'DELETE' })
          setTimer(timerData.timer)
        } catch (error) {
          timerCancelError = error.message
        }
      }
      const location = await requestLocation({ timeout: 5000 })
      setToast('Sending SOS texts to your trusted contacts…')
      const data = await apiRequest('/api/sos', {
        method: 'POST',
        body: JSON.stringify({ location }),
      })
      setLatestAlert(data.alert)
      notifiedTimerAlertId.current = data.alert.id
      const sentCount = data.alert.sentCount || 0
      const locationMessage = Number.isFinite(data.alert.latitude) && Number.isFinite(data.alert.longitude)
        ? ' A Google Maps location link was included.'
        : ' No saved location was available to include.'
      const deliveryError = data.alert.status !== 'sent'
        ? `Some SOS texts could not be sent (${sentCount}/${data.alert.totalCount}).`
        : ''
      const cancellationError = timerCancelError
        ? `The SOS was sent, but the safety timer could not be cancelled: ${timerCancelError}`
        : ''
      setAlertError([deliveryError, cancellationError].filter(Boolean).join(' '))
      setToast(`SOS text sent to ${sentCount} of ${data.alert.totalCount} contacts.${locationMessage}${timerCancelError ? ' The safety timer could not be cancelled.' : ''}`)
    } catch (error) {
      if (error.data?.alert) {
        setLatestAlert(error.data.alert)
        notifiedTimerAlertId.current = error.data.alert.id
      }
      setAlertError([error.message, timerCancelError ? `The safety timer could not be cancelled: ${timerCancelError}` : ''].filter(Boolean).join(' '))
      setToast(`SOS text not sent: ${error.message}`)
    } finally {
      alerting.current = false
    }
  }, [requestLocation, timer.status])

  const stopSOS = useCallback(async () => {
    if (latestAlert?.id && latestAlert.status !== 'stopped') {
      try {
        await apiRequest(`/api/alerts/${latestAlert.id}/stop`, { method: 'POST' })
      } catch (error) {
        if (error.status !== 404) throw error
      }
    }
    setEmergency('idle')
    setLatestAlert((alert) => alert ? { ...alert, status: 'stopped' } : null)
    setToast('SOS alarm stopped. Already sent texts cannot be recalled.')
  }, [latestAlert])

  const value = useMemo(() => ({
    authStatus, user, signUp, signIn, signOut, refreshSession, contacts, createContact, updateContact,
    reorderContacts, deleteContact, timer, startTimer, updateTimer, cancelTimer, activity, setActivity,
    checkIn, setCheckIn, emergency, setEmergency, userLocation, requestLocation, latestAlert, smsConfigured,
    alertError, serviceError, triggerSOS, stopSOS, assistantHistory, setAssistantHistory, toast, setToast,
  }), [
    authStatus, user, signUp, signIn, signOut, refreshSession, contacts, createContact, updateContact,
    reorderContacts, deleteContact, timer, startTimer, updateTimer, cancelTimer, activity, checkIn,
    emergency, userLocation, requestLocation, latestAlert, smsConfigured, alertError, serviceError,
    triggerSOS, stopSOS, assistantHistory, toast,
  ])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside AppProvider')
  return value
}
