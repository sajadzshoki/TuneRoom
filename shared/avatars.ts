/**
 * Generated avatars.
 *
 * TuneRoom has no accounts, so people pick one of a small set of attractive
 * generated avatars. They are drawn as deterministic SVG — no binary assets,
 * no network requests, crisp at any size, and identical on server and client.
 */

export interface AvatarPreset {
  /** Stable identifier stored on the guest row. */
  key: string
  name: string
  bg: string
  fg: string
  mark: string
}

const bars = `<rect x="13" y="30" width="6" height="20" rx="3" fill="{fg}"/><rect x="23" y="16" width="6" height="34" rx="3" fill="{fg}" opacity=".85"/><rect x="33" y="36" width="6" height="14" rx="3" fill="{fg}" opacity=".7"/><rect x="43" y="24" width="6" height="26" rx="3" fill="{fg}" opacity=".9"/>`

const wave = `<path d="M7 32c3-9 6-9 9 0s6 9 9 0 6-9 9 0 6 9 9 0 6-9 9 0" fill="none" stroke="{fg}" stroke-width="4" stroke-linecap="round"/>`

const disc = `<circle cx="32" cy="32" r="22" fill="none" stroke="{fg}" stroke-width="3"/><circle cx="32" cy="32" r="12" fill="none" stroke="{fg}" stroke-width="3" opacity=".6"/><circle cx="32" cy="32" r="3.5" fill="{fg}"/>`

const prism = `<path d="M32 12 52 46H12z" fill="none" stroke="{fg}" stroke-width="3.5" stroke-linejoin="round"/><circle cx="32" cy="36" r="4" fill="{fg}"/>`

const orbit = `<circle cx="32" cy="32" r="8" fill="{fg}"/><ellipse cx="32" cy="32" rx="22" ry="9" fill="none" stroke="{fg}" stroke-width="3" transform="rotate(-28 32 32)"/>`

const grid = `<rect x="14" y="14" width="16" height="16" rx="4.5" fill="{fg}"/><rect x="34" y="14" width="16" height="16" rx="4.5" fill="{fg}" opacity=".6"/><rect x="14" y="34" width="16" height="16" rx="4.5" fill="{fg}" opacity=".6"/><rect x="34" y="34" width="16" height="16" rx="4.5" fill="{fg}" opacity=".85"/>`

const note = `<circle cx="25" cy="43" r="7.5" fill="{fg}"/><rect x="29.5" y="15" width="4" height="28" rx="2" fill="{fg}"/><path d="M33.5 15c6.5 1.6 10.6 4.8 11.6 10-3.2-3.2-7-4.7-11.6-5.1z" fill="{fg}" opacity=".8"/>`

const peak = `<polyline points="10,42 22,21 32,35 42,17 54,33" fill="none" stroke="{fg}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`

const drop = `<path d="M32 12c8 10.5 13 16.6 13 22.4a13 13 0 1 1-26 0C19 28.6 24 22.5 32 12z" fill="{fg}"/>`

const rings = `<circle cx="32" cy="32" r="21" fill="none" stroke="{fg}" stroke-width="3" opacity=".45"/><circle cx="32" cy="32" r="14" fill="none" stroke="{fg}" stroke-width="3" opacity=".7"/><circle cx="32" cy="32" r="6" fill="{fg}"/>`

const diamond = `<rect x="18" y="18" width="28" height="28" rx="6" transform="rotate(45 32 32)" fill="none" stroke="{fg}" stroke-width="3.5"/><rect x="27" y="27" width="10" height="10" rx="3" transform="rotate(45 32 32)" fill="{fg}"/>`

const arc = `<path d="M11 45a21 21 0 0 1 42 0z" fill="{fg}"/><circle cx="32" cy="45" r="4.5" fill="{bg}"/>`

export const AVATARS: AvatarPreset[] = [
  { key: 'amber', name: 'Amber', bg: '#3A2C14', fg: '#F2A93B', mark: disc },
  { key: 'coral', name: 'Coral', bg: '#3A1F1A', fg: '#F2704F', mark: wave },
  { key: 'rose', name: 'Rose', bg: '#3A1A24', fg: '#EC5F7E', mark: drop },
  { key: 'sky', name: 'Sky', bg: '#14293A', fg: '#4FA8E8', mark: orbit },
  { key: 'teal', name: 'Teal', bg: '#10312E', fg: '#38C6B4', mark: rings },
  { key: 'moss', name: 'Moss', bg: '#1E2F18', fg: '#8CC152', mark: peak },
  { key: 'sand', name: 'Sand', bg: '#33291C', fg: '#D8B47C', mark: arc },
  { key: 'slate', name: 'Slate', bg: '#1E2126', fg: '#9AA6B8', mark: grid },
  { key: 'crimson', name: 'Crimson', bg: '#361A1E', fg: '#E05263', mark: prism },
  { key: 'ocean', name: 'Ocean', bg: '#16233A', fg: '#6D8CF5', mark: diamond },
  { key: 'gold', name: 'Gold', bg: '#2E2A12', fg: '#E8D26A', mark: note },
  { key: 'ember', name: 'Ember', bg: '#33210F', fg: '#FF9B45', mark: bars },
]

export const AVATAR_KEYS = AVATARS.map(a => a.key)
export const DEFAULT_AVATAR = 'amber'

export function isAvatarKey(value: unknown): value is string {
  return typeof value === 'string' && AVATAR_KEYS.includes(value)
}

export function resolveAvatar(key: string | null | undefined): AvatarPreset {
  return AVATARS.find(a => a.key === key) ?? AVATARS[0]!
}

export interface AvatarRenderOptions {
  /** Corner radius in viewBox units. Use 0 for full-bleed artwork. */
  radius?: number
  /** Intrinsic pixel size of the generated SVG. */
  size?: number
  /** Accessible label. Pass an empty string to mark it decorative. */
  label?: string
}

/** Raw SVG markup for an avatar preset. */
export function avatarSvg(
  key: string | null | undefined,
  options: AvatarRenderOptions = {},
): string {
  const preset = resolveAvatar(key)
  const radius = options.radius ?? 20
  const size = options.size ?? 64
  const label = options.label ?? `${preset.name} avatar`
  const mark = preset.mark.replaceAll('{fg}', preset.fg).replaceAll('{bg}', preset.bg)
  const a11y = label
    ? `role="img" aria-label="${label}"`
    : `role="presentation" aria-hidden="true"`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" ${a11y}><rect width="64" height="64" rx="${radius}" fill="${preset.bg}"/>${mark}</svg>`
}

/** Self contained data URL — usable directly as an `<img>`/avatar `src`. */
export function avatarUrl(
  key: string | null | undefined,
  options: AvatarRenderOptions = {},
): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(key, options))}`
}

/** Deterministic preset for an arbitrary seed (song titles, room names, …). */
export function avatarKeyForSeed(seed: string): string {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return AVATARS[Math.abs(hash) % AVATARS.length]!.key
}
