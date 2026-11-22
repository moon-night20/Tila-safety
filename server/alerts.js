import twilio from 'twilio'
import { database, getContacts, getCurrentLocation } from './database.js'

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export function isSmsConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID
    && process.env.TWILIO_AUTH_TOKEN
    && (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)
  )
}

function getTwilioClient() {
  if (!isSmsConfigured()) {
    const error = new Error('SMS delivery is not configured on the server.')
    error.status = 503
    throw error
  }
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
}

function mapsLink(latitude, longitude) {
  if (latitude === null || longitude === null) return ''
  const url = new URL('https://www.google.com/maps/search/')
  url.searchParams.set('api', '1')
  url.searchParams.set('query', `${latitude},${longitude}`)
  return url.toString()
}

export function formatMessage(user, alert) {
  const map = mapsLink(alert.latitude, alert.longitude)
  const locationTime = alert.location_updated_at
    ? ` Location last updated ${new Date(alert.location_updated_at).toISOString()}.`
    : ''
  return [
    `TILA SOS: ${user.name} needs help. Please contact them immediately.`,
    map ? `My last known location on Google Maps: ${map}.${locationTime}` : 'My location is not available.',
    'If this is an emergency, contact local emergency services.',
  ].join(' ')
}

function insertAlert(userId, source, timerRunId = null) {
  const contacts = getContacts(userId)
  if (!contacts.length || contacts.some((contact) => !contact.consentConfirmed)) {
    const error = new Error('Add at least one trusted contact who has agreed to receive SOS texts.')
    error.status = 409
    throw error
  }

  const location = getCurrentLocation(userId)
  const now = Date.now()
  const createAlert = database.prepare(`
    INSERT INTO alerts (user_id, timer_run_id, source, status, latitude, longitude, location_updated_at, created_at, updated_at)
    VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?)
  `)
  const createDelivery = database.prepare(`
    INSERT INTO alert_deliveries (alert_id, contact_id, contact_name, phone, rank, status)
    VALUES (?, ?, ?, ?, ?, 'queued')
  `)

  database.exec('BEGIN IMMEDIATE')
  try {
    const result = createAlert.run(
      userId,
      timerRunId,
      source,
      location?.latitude ?? null,
      location?.longitude ?? null,
      location?.updatedAt ?? null,
      now,
      now
    )
    for (const contact of contacts) {
      createDelivery.run(result.lastInsertRowid, contact.id, contact.name, contact.phone, contact.rank)
    }
    database.exec('COMMIT')
    return Number(result.lastInsertRowid)
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

export async function deliverAlert(alertId) {
  const alert = database.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId)
  if (!alert || !['queued', 'partial'].includes(alert.status)) return alert

  const user = database.prepare('SELECT name FROM users WHERE id = ?').get(alert.user_id)
  const client = getTwilioClient()
  const sender = process.env.TWILIO_MESSAGING_SERVICE_SID
    ? { messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID }
    : { from: process.env.TWILIO_FROM_NUMBER }

  database.prepare("UPDATE alerts SET status = 'sending', updated_at = ? WHERE id = ?").run(Date.now(), alertId)
  const queued = database.prepare(`
    SELECT id, phone FROM alert_deliveries WHERE alert_id = ? AND status = 'queued' ORDER BY rank
  `).all(alertId)

  for (const delivery of queued) {
    database.prepare(`
      UPDATE alert_deliveries SET status = 'sending', attempts = attempts + 1 WHERE id = ?
    `).run(delivery.id)
    let lastError
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const message = await client.messages.create({
          ...sender,
          to: delivery.phone,
          body: formatMessage(user, alert),
        })
        database.prepare(`
          UPDATE alert_deliveries SET status = 'sent', provider_sid = ?, error_code = NULL WHERE id = ?
        `).run(message.sid, delivery.id)
        lastError = null
        break
      } catch (error) {
        lastError = error
        database.prepare('UPDATE alert_deliveries SET attempts = attempts + 1, error_code = ? WHERE id = ?')
          .run(String(error.code || 'PROVIDER_ERROR').slice(0, 40), delivery.id)
        if (attempt < 2) await sleep(500 * (2 ** attempt))
      }
    }
    if (lastError) {
      database.prepare(`
        UPDATE alert_deliveries SET status = 'failed', error_code = ? WHERE id = ?
      `).run(String(lastError.code || 'PROVIDER_ERROR').slice(0, 40), delivery.id)
      console.error('SOS text delivery failed', { alertId, deliveryId: delivery.id, code: lastError.code || 'PROVIDER_ERROR' })
    }
  }

  const counts = database.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status IN ('queued', 'sending') THEN 1 ELSE 0 END) AS pending
    FROM alert_deliveries WHERE alert_id = ?
  `).get(alertId)
  const status = counts.pending > 0
    ? 'queued'
    : counts.failed === 0
      ? 'sent'
      : counts.sent > 0
        ? 'partial'
        : 'failed'
  database.prepare('UPDATE alerts SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), alertId)
  return getAlertSummary(alertId)
}

export function createAndSendAlert(userId, source) {
  const alertId = insertAlert(userId, source)
  return deliverAlert(alertId)
}

export function createTimerAlert(userId, timerRunId) {
  try {
    return insertAlert(userId, 'timer', timerRunId)
  } catch (error) {
    console.error('Timer SOS could not be queued', { userId, code: error.status || 'INTERNAL_ERROR' })
    return null
  }
}

export function getAlertSummary(alertId) {
  const alert = database.prepare(`
    SELECT id, source, status, latitude, longitude, location_updated_at AS locationUpdatedAt,
      created_at AS createdAt
    FROM alerts WHERE id = ?
  `).get(alertId)
  if (!alert) return null
  const deliveries = database.prepare(`
    SELECT contact_name AS contactName, rank, status, error_code AS errorCode
    FROM alert_deliveries WHERE alert_id = ? ORDER BY rank
  `).all(alertId)
  return { ...alert, deliveries }
}

export async function processQueuedAlerts() {
  if (!isSmsConfigured()) return
  const queued = database.prepare("SELECT id FROM alerts WHERE status = 'queued' ORDER BY id").all()
  for (const alert of queued) {
    try {
      await deliverAlert(alert.id)
    } catch (error) {
      console.error('Queued SOS delivery failed', { alertId: alert.id, code: error.code || 'DELIVERY_ERROR' })
      database.prepare("UPDATE alerts SET status = 'failed', updated_at = ? WHERE id = ?")
        .run(Date.now(), alert.id)
    }
  }
}

export function getLatestAlert(userId) {
  const alert = database.prepare('SELECT id FROM alerts WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId)
  return alert ? getAlertSummary(alert.id) : null
}
