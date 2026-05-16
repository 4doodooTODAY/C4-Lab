/**
 * Convert a HH:MM or HH:MM:SS time string to 12-hour AM/PM format.
 * e.g. '14:30' → '2:30 PM', '09:00' → '9:00 AM'
 */
export function fmtTime(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}
