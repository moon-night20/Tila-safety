export function normalizePhoneNumber(value) {
  const phone = String(value || '').trim().replace(/[\s().-]/g, '')
  if (!phone) return ''
  if (/^0[79]\d{8}$/.test(phone)) return `+251${phone.slice(1)}`
  if (/^[79]\d{8}$/.test(phone)) return `+251${phone}`
  if (/^251[79]\d{8}$/.test(phone)) return `+${phone}`
  if (/^\+251[79]\d{8}$/.test(phone)) return phone
  if (/^\+?251[79]/.test(phone)) return null
  if (/^\+[1-9]\d{7,14}$/.test(phone)) return phone
  return null
}
