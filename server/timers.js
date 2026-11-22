import { database } from './database.js'
import { processQueuedAlerts } from './alerts.js'
import { getContacts } from './database.js'

let processing = false

function queueTimerAlert(userId, runId) {
  const contacts = getContacts(userId)

  const location = database.prepare(`
    SELECT latitude, longitude, updated_at AS updatedAt
    FROM locations WHERE user_id = ?
  `).get(userId)
  const now = Date.now()
  const result = database.prepare(`
    INSERT OR IGNORE INTO alerts
      (user_id, timer_run_id, source, status, latitude, longitude, location_updated_at, created_at, updated_at)
    VALUES (?, ?, 'timer', ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    runId,
    contacts.length ? 'queued' : 'failed',
    location?.latitude ?? null,
    location?.longitude ?? null,
    location?.updatedAt ?? null,
    now,
    now
  )
  if (!result.changes) return

  if (!contacts.length) {
    console.error('Timer expired without trusted contacts; SOS text could not be sent', { userId })
    return
  }

  const insertDelivery = database.prepare(`
    INSERT INTO alert_deliveries (alert_id, contact_id, contact_name, phone, rank, status)
    VALUES (?, ?, ?, ?, ?, 'queued')
  `)
  for (const contact of contacts) {
    insertDelivery.run(result.lastInsertRowid, contact.id, contact.name, contact.phone, contact.rank)
  }
}

export async function processExpiredTimers() {
  if (processing) return
  processing = true
  try {
    const now = Date.now()
    database.exec('BEGIN IMMEDIATE')
    try {
      const dueTimers = database.prepare(`
        SELECT user_id AS userId, run_id AS runId, status
        FROM timers WHERE status IN ('running', 'grace') AND due_at <= ?
      `).all(now)
      const startGrace = database.prepare(`
        UPDATE timers SET status = 'grace', remaining_seconds = 0, due_at = ?, updated_at = ?
        WHERE user_id = ? AND run_id = ? AND status = 'running' AND due_at <= ?
      `)
      const expire = database.prepare(`
        UPDATE timers SET status = 'expired', remaining_seconds = 0, due_at = NULL, updated_at = ?
        WHERE user_id = ? AND run_id = ? AND status = 'grace' AND due_at <= ?
      `)
      for (const timer of dueTimers) {
        if (timer.status === 'running') {
          startGrace.run(now + 60_000, now, timer.userId, timer.runId, now)
        } else {
          const result = expire.run(now, timer.userId, timer.runId, now)
          if (result.changes) queueTimerAlert(timer.userId, timer.runId)
        }
      }
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }

    await processQueuedAlerts()
  } finally {
    processing = false
  }
}
