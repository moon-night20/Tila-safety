import { randomBytes, randomUUID, scrypt as scryptCallback, createHash, timingSafeEqual } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import express from 'express'
import { database, getContacts, getCurrentLocation, getTimer } from './database.js'
import { createAndSendAlert, getAlertSummary, getLatestAlert, isSmsConfigured } from './alerts.js'
import { processExpiredTimers } from './timers.js'

const scrypt = promisify(scryptCallback)
const app = express()
const port = Number(process.env.PORT || 5173)
const sessionDuration = 7 * 24 * 60 * 60 * 1000
const cookieName = 'tila_session'
const limits = new Map()

app.disable('x-powered-by')
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  if (req.path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin')
    if (!origin || new URL(origin).host !== req.get('host')) {
      res.status(403).json({ error: 'Request origin was not accepted.' })
      return
    }
  }
  next()
})
app.use(express.json({ limit: '16kb' }))

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function endpoint(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next)
}

function rateLimit(keyFor, max, windowMs) {
  return (req, res, next) => {
    const now = Date.now()
    const key = keyFor(req)
    const record = limits.get(key)
    if (!record || record.resetAt <= now) {
      limits.set(key, { count: 1, resetAt: now + windowMs })
      next()
      return
    }
    if (record.count >= max) {
      res.status(429).json({ error: 'Too many attempts. Please wait and try again.' })
      return
    }
    record.count += 1
    next()
  }
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function readCookie(request, name) {
  const cookie = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : ''
}

function setSessionCookie(response, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader('Set-Cookie', `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(sessionDuration / 1000)}${secure}`)
}

function clearSessionCookie(response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`)
}

function publicUser(user) {
  return { id: user.id, name: user.name, username: user.username, phone: user.phone || null }
}

function normalizePhone(value) {
  const phone = String(value || '').trim().replace(/[\s().-]/g, '')
  if (!phone) return null
  if (/^0[79]\d{8}$/.test(phone)) return `+251${phone.slice(1)}`
  if (/^[79]\d{8}$/.test(phone)) return `+251${phone}`
  if (/^251[79]\d{8}$/.test(phone)) return `+${phone}`
  if (/^\+251[79]\d{8}$/.test(phone)) return phone
  if (/^\+?251[79]/.test(phone)) {
    throw new HttpError(400, 'Enter a complete Ethiopian mobile number with 9 digits after the country code.')
  }
  if (/^\+[1-9]\d{7,14}$/.test(phone)) return phone
  throw new HttpError(400, 'Enter an Ethiopian mobile number (09… or +251…) or an international number with country code.')
}

async function createSession(response, userId) {
  const token = randomBytes(32).toString('base64url')
  database.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hashToken(token), userId, Date.now() + sessionDuration)
  setSessionCookie(response, token)
}

function authenticate(request, response, next) {
  const token = readCookie(request, cookieName)
  if (!token) {
    response.status(401).json({ error: 'Sign in to continue.' })
    return
  }
  const session = database.prepare(`
    SELECT users.id, users.name, users.username, users.phone, sessions.token_hash AS tokenHash,
      sessions.expires_at AS expiresAt
    FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?
  `).get(hashToken(token))
  if (!session || session.expiresAt <= Date.now()) {
    if (session) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(session.tokenHash)
    clearSessionCookie(response)
    response.status(401).json({ error: 'Your session expired. Please sign in again.' })
    return
  }
  request.user = publicUser(session)
  next()
}

function validateLocation(value) {
  if (!value || typeof value !== 'object') return null
  const latitude = Number(value.latitude)
  const longitude = Number(value.longitude)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new HttpError(400, 'Location coordinates are invalid.')
  }
  return { latitude, longitude }
}

function serializeAlert(alert) {
  if (!alert) return null
  return {
    ...alert,
    sentCount: alert.deliveries.filter((delivery) => delivery.status === 'sent').length,
    totalCount: alert.deliveries.length,
  }
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

app.post('/api/auth/signup', rateLimit((req) => `signup:${req.ip}`, 5, 15 * 60 * 1000), endpoint(async (req, res) => {
  const name = String(req.body.name || '').trim()
  const username = String(req.body.username || '').trim()
  const password = String(req.body.password || '')
  if (name.length < 1 || name.length > 80) throw new HttpError(400, 'Enter a name up to 80 characters.')
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) throw new HttpError(400, 'Use a username with 3–30 letters, numbers, or underscores.')
  if (password.length < 10 || password.length > 200) throw new HttpError(400, 'Use a password between 10 and 200 characters.')
  if (database.prepare('SELECT id FROM users WHERE username = ?').get(username)) throw new HttpError(409, 'That username is already in use.')
  const salt = randomBytes(16)
  const passwordHash = await scrypt(password, salt, 64)
  const result = database.prepare(`
    INSERT INTO users (name, username, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)
  `).run(name, username, salt.toString('hex'), Buffer.from(passwordHash).toString('hex'), Date.now())
  await createSession(res, Number(result.lastInsertRowid))
  res.status(201).json({
    user: { id: Number(result.lastInsertRowid), name, username, phone: null },
    contacts: [],
    timer: getTimer(Number(result.lastInsertRowid)),
    location: null,
    smsConfigured: isSmsConfigured(),
    latestAlert: null,
  })
}))

app.post('/api/auth/login', rateLimit((req) => `login:${req.ip}`, 10, 15 * 60 * 1000), endpoint(async (req, res) => {
  const identifier = String(req.body.identifier ?? req.body.username ?? '').trim()
  if (!identifier) throw new HttpError(400, 'Enter your username or phone number.')
  const phone = identifier.startsWith('+') || /^\d[\d\s().-]{7,}$/.test(identifier)
    ? normalizePhone(identifier)
    : null
  const username = phone ? null : identifier.toLowerCase()
  const phoneToSave = normalizePhone(req.body.phone)
  const password = String(req.body.password || '')
  let user = database.prepare('SELECT * FROM users WHERE username = ? OR phone = ?').get(username, phone)
  const salt = user ? Buffer.from(user.password_salt, 'hex') : randomBytes(16)
  const expected = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64)
  const candidate = Buffer.from(await scrypt(password, salt, 64))
  if (!timingSafeEqual(expected, candidate) || !user) throw new HttpError(401, 'Username, phone number, or password is incorrect.')
  if (phoneToSave) {
    const existing = database.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').get(phoneToSave, user.id)
    if (existing) throw new HttpError(409, 'That phone number is already linked to another account.')
    database.prepare('UPDATE users SET phone = ? WHERE id = ?').run(phoneToSave, user.id)
    user = database.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
  }
  await createSession(res, user.id)
  res.json({
    user: publicUser(user),
    contacts: getContacts(user.id),
    timer: getTimer(user.id),
    location: getCurrentLocation(user.id),
    smsConfigured: isSmsConfigured(),
    latestAlert: serializeAlert(getLatestAlert(user.id)),
  })
}))

app.get('/api/me', authenticate, (req, res) => {
  const location = getCurrentLocation(req.user.id)
  res.json({
    user: req.user,
    contacts: getContacts(req.user.id),
    timer: getTimer(req.user.id),
    location,
    smsConfigured: isSmsConfigured(),
    latestAlert: serializeAlert(getLatestAlert(req.user.id)),
  })
})

app.post('/api/auth/logout', authenticate, (req, res) => {
  const token = readCookie(req, cookieName)
  database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
  clearSessionCookie(res)
  res.status(204).end()
})

app.get('/api/contacts', authenticate, (req, res) => {
  res.json({ contacts: getContacts(req.user.id) })
})

app.post('/api/contacts', authenticate, endpoint(async (req, res) => {
  const { name, phone, relationship, consentConfirmed } = req.body
  const cleanName = String(name || '').trim()
  const cleanPhone = normalizePhone(phone)
  const cleanRelationship = String(relationship || 'Friend').trim().slice(0, 40)
  if (!cleanName || cleanName.length > 80) throw new HttpError(400, 'Enter a contact name up to 80 characters.')
  if (!cleanPhone) throw new HttpError(400, 'Enter an Ethiopian mobile number (09… or +251…) or an international number with country code.')
  if (consentConfirmed !== true) throw new HttpError(400, 'Confirm that this person agreed to receive SOS text messages.')
  const count = database.prepare('SELECT COUNT(*) AS count FROM contacts WHERE user_id = ?').get(req.user.id).count
  if (count >= 5) throw new HttpError(409, 'You can add up to five trusted contacts.')
  const rank = count + 1
  const result = database.prepare(`
    INSERT INTO contacts (user_id, name, phone, relationship, rank, consent_confirmed, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `).run(req.user.id, cleanName, cleanPhone, cleanRelationship, rank, Date.now())
  res.status(201).json({ contacts: getContacts(req.user.id), contactId: Number(result.lastInsertRowid) })
}))

app.put('/api/contacts/:id', authenticate, endpoint(async (req, res) => {
  const id = Number(req.params.id)
  const { name, phone, relationship, consentConfirmed } = req.body
  const cleanName = String(name || '').trim()
  const cleanPhone = normalizePhone(phone)
  if (!Number.isInteger(id) || !cleanName || cleanName.length > 80) throw new HttpError(400, 'Contact details are invalid.')
  if (!cleanPhone) throw new HttpError(400, 'Enter an Ethiopian mobile number (09… or +251…) or an international number with country code.')
  if (consentConfirmed !== true) throw new HttpError(400, 'Confirm that this person agreed to receive SOS text messages.')
  const result = database.prepare(`
    UPDATE contacts SET name = ?, phone = ?, relationship = ?, consent_confirmed = 1
    WHERE id = ? AND user_id = ?
  `).run(cleanName, cleanPhone, String(relationship || 'Friend').trim().slice(0, 40), id, req.user.id)
  if (!result.changes) throw new HttpError(404, 'Contact not found.')
  res.json({ contacts: getContacts(req.user.id) })
}))

app.patch('/api/contacts/order', authenticate, (req, res) => {
  const ids = req.body.ids
  const contacts = getContacts(req.user.id)
  if (!Array.isArray(ids) || ids.length !== contacts.length || new Set(ids).size !== contacts.length
    || ids.some((id) => !contacts.some((contact) => contact.id === id))) {
    throw new HttpError(400, 'Contact order is invalid.')
  }
  database.exec('BEGIN IMMEDIATE')
  try {
    const updateRank = database.prepare('UPDATE contacts SET rank = ? WHERE id = ? AND user_id = ?')
    ids.forEach((id, index) => updateRank.run(-(index + 1), id, req.user.id))
    ids.forEach((id, index) => updateRank.run(index + 1, id, req.user.id))
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
  res.json({ contacts: getContacts(req.user.id) })
})

app.delete('/api/contacts/:id', authenticate, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) throw new HttpError(400, 'Contact ID is invalid.')
  database.exec('BEGIN IMMEDIATE')
  try {
    const contact = database.prepare('SELECT id, rank FROM contacts WHERE id = ? AND user_id = ?').get(id, req.user.id)
    if (!contact) throw new HttpError(404, 'Contact not found.')
    database.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?').run(id, req.user.id)
    const remaining = getContacts(req.user.id)
    const updateRank = database.prepare('UPDATE contacts SET rank = ? WHERE id = ? AND user_id = ?')
    remaining.forEach((item, index) => updateRank.run(-(index + 1), item.id, req.user.id))
    remaining.forEach((item, index) => updateRank.run(index + 1, item.id, req.user.id))
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
  res.json({ contacts: getContacts(req.user.id) })
})

app.put('/api/location', authenticate, (req, res) => {
  const location = validateLocation(req.body)
  if (!location) throw new HttpError(400, 'Location coordinates are required.')
  const updatedAt = Date.now()
  database.prepare(`
    INSERT INTO locations (user_id, latitude, longitude, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET latitude = excluded.latitude, longitude = excluded.longitude, updated_at = excluded.updated_at
  `).run(req.user.id, location.latitude, location.longitude, updatedAt)
  res.json({ location: { ...location, updatedAt } })
})

app.get('/api/timer', authenticate, (req, res) => {
  res.json({ timer: getTimer(req.user.id), latestAlert: serializeAlert(getLatestAlert(req.user.id)) })
})

app.post('/api/timer', authenticate, (req, res) => {
  const duration = Number(req.body.duration)
  if (!Number.isInteger(duration) || duration < 1 || duration > 180) throw new HttpError(400, 'Timer duration must be from 1 to 180 minutes.')
  const note = String(req.body.note || '').trim().slice(0, 500)
  const now = Date.now()
  const runId = randomUUID()
  const durationSeconds = duration * 60
  database.prepare(`
    INSERT INTO timers (user_id, status, duration_seconds, remaining_seconds, due_at, note, run_id, updated_at)
    VALUES (?, 'running', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET status = 'running', duration_seconds = excluded.duration_seconds,
      remaining_seconds = excluded.remaining_seconds, due_at = excluded.due_at, note = excluded.note,
      run_id = excluded.run_id, updated_at = excluded.updated_at
  `).run(req.user.id, durationSeconds, durationSeconds, now + durationSeconds * 1000, note, runId, now)
  res.status(201).json({ timer: getTimer(req.user.id) })
})

app.patch('/api/timer', authenticate, (req, res) => {
  const timer = database.prepare('SELECT * FROM timers WHERE user_id = ?').get(req.user.id)
  if (!timer) throw new HttpError(404, 'No timer is active.')
  const now = Date.now()
  const action = req.body.action
  if (action === 'pause' && timer.status === 'running') {
    const remaining = Math.max(0, Math.ceil((timer.due_at - now) / 1000))
    database.prepare("UPDATE timers SET status = 'paused', remaining_seconds = ?, due_at = NULL, updated_at = ? WHERE user_id = ?")
      .run(remaining, now, req.user.id)
  } else if (action === 'resume' && timer.status === 'paused' && timer.remaining_seconds > 0) {
    database.prepare("UPDATE timers SET status = 'running', due_at = ?, updated_at = ? WHERE user_id = ?")
      .run(now + timer.remaining_seconds * 1000, now, req.user.id)
  } else if (action === 'add' && ['running', 'paused'].includes(timer.status)) {
    if (timer.duration_seconds + 300 > 10800) throw new HttpError(409, 'The timer has reached its maximum duration.')
    if (timer.status === 'running') {
      database.prepare('UPDATE timers SET due_at = due_at + 300000, duration_seconds = duration_seconds + 300, updated_at = ? WHERE user_id = ?')
        .run(now, req.user.id)
    } else {
      database.prepare('UPDATE timers SET remaining_seconds = remaining_seconds + 300, duration_seconds = duration_seconds + 300, updated_at = ? WHERE user_id = ?')
        .run(now, req.user.id)
    }
  } else if (action === 'extend' && timer.status === 'grace') {
    if (timer.duration_seconds + 300 > 10800) throw new HttpError(409, 'The timer has reached its maximum duration.')
    database.prepare(`
      UPDATE timers SET status = 'running', remaining_seconds = 300, duration_seconds = duration_seconds + 300,
        due_at = ?, run_id = ?, updated_at = ? WHERE user_id = ?
    `).run(now + 300_000, randomUUID(), now, req.user.id)
  } else {
    throw new HttpError(409, 'That timer action is not available now.')
  }
  res.json({ timer: getTimer(req.user.id) })
})

app.post('/api/alerts/:id/stop', authenticate, (req, res) => {
  const result = database.prepare(`
    UPDATE alerts SET status = 'stopped', updated_at = ?
    WHERE id = ? AND user_id = ? AND status IN ('queued', 'sending', 'sent', 'partial', 'failed')
  `).run(Date.now(), Number(req.params.id), req.user.id)
  if (!result.changes) throw new HttpError(404, 'Alert not found or already stopped.')
  res.json({ alert: serializeAlert(getAlertSummary(Number(req.params.id))) })
})

app.delete('/api/timer', authenticate, (req, res) => {
  database.prepare("UPDATE timers SET status = 'cancelled', remaining_seconds = 0, due_at = NULL, updated_at = ? WHERE user_id = ?")
    .run(Date.now(), req.user.id)
  res.json({ timer: getTimer(req.user.id) })
})

app.get('/api/alerts/latest', authenticate, (req, res) => {
  res.json({ alert: serializeAlert(getLatestAlert(req.user.id)) })
})

app.post('/api/sos', authenticate, rateLimit((req) => `sos:${req.user.id}`, 5, 60 * 60 * 1000), endpoint(async (req, res) => {
  if (!isSmsConfigured()) throw new HttpError(503, 'SOS texts are not configured on the server yet.')
  const contacts = getContacts(req.user.id)
  if (!contacts.length) throw new HttpError(409, 'Add a trusted contact who agreed to receive SOS texts first.')
  const suppliedLocation = validateLocation(req.body.location)
  if (suppliedLocation) {
    const updatedAt = Date.now()
    database.prepare(`
      INSERT INTO locations (user_id, latitude, longitude, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET latitude = excluded.latitude, longitude = excluded.longitude, updated_at = excluded.updated_at
    `).run(req.user.id, suppliedLocation.latitude, suppliedLocation.longitude, updatedAt)
  }
  const alert = await createAndSendAlert(req.user.id, 'manual')
  res.status(alert.status === 'sent' ? 200 : 502).json({ alert: serializeAlert(alert) })
}))

app.get('/api/alerts/:id', authenticate, (req, res) => {
  const alert = getAlertSummary(Number(req.params.id))
  if (!alert) throw new HttpError(404, 'Alert not found.')
  const belongsToUser = database.prepare('SELECT id FROM alerts WHERE id = ? AND user_id = ?').get(alert.id, req.user.id)
  if (!belongsToUser) throw new HttpError(404, 'Alert not found.')
  res.json({ alert: serializeAlert(alert) })
})

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found.' })
})

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error)
    return
  }
  if (!(error instanceof HttpError)) {
    console.error('Request failed', { path: req.path, code: error.code || 'INTERNAL_ERROR' })
  }
  res.status(error.status || 500).json({ error: error.status ? error.message : 'The server could not complete this request.' })
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist'), { index: false }))
  const indexHtml = fileURLToPath(new URL('../dist/index.html', import.meta.url))
  app.get('/{*path}', (req, res) => res.sendFile(indexHtml))
} else {
  const { createServer } = await import('vite')
  const vite = await createServer({ server: { middlewareMode: true, host: true }, appType: 'spa' })
  app.use(vite.middlewares)
}

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Tila server listening on port ${port}`)
  if (!isSmsConfigured()) console.warn('Twilio is not configured; real SOS texts are disabled.')
})

const processTimers = () => {
  processExpiredTimers().catch((error) => {
    console.error('Timer scheduler failed', { code: error.code || 'SCHEDULER_ERROR' })
  })
}
processTimers()
const scheduler = setInterval(processTimers, 1000)

function shutdown() {
  clearInterval(scheduler)
  server.close(() => {
    database.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
