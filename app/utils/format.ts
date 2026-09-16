/** Small formatting helpers shared by every screen. */

/** 225 -> "3:45", 3725 -> "1:02:05". */
export function formatDuration(totalSeconds: number | null | undefined): string {
  const seconds = Number(totalSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0)
    return '0:00'

  const whole = Math.floor(seconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = whole % 60

  if (hours > 0)
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`

  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/** 1 -> "1 song", 12 -> "12 songs". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** Byte sizes for upload feedback. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0)
    return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`
}
