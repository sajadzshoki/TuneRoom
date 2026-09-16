<script setup lang="ts">
/**
 * A single slider used for both seeking and volume.
 *
 * Built on a native `<input type="range">` so keyboard control, screen-reader
 * announcements, touch dragging and RTL direction all come for free; the visual
 * track is the `slider` utility in `main.css`.
 */
const props = withDefaults(
  defineProps<{
    /** Current value in the same unit as `max`. */
    value: number
    max: number
    label: string
    /** Keyboard arrow step. */
    step?: number
    /** Larger hit area, thinner track. */
    size?: 'sm' | 'xs'
    /** Spoken instead of the raw number, e.g. "1:23 of 3:45". */
    valueText?: string
    disabled?: boolean
  }>(),
  { step: 1, size: 'sm', valueText: undefined, disabled: false },
)

const emit = defineEmits<{ (event: 'change', value: number): void }>()

/** While dragging we show the drag position, not the (lagging) audio position. */
const pending = ref<number | null>(null)

const shown = computed(() => {
  const value = pending.value ?? props.value
  if (!Number.isFinite(value))
    return 0
  return Math.min(Math.max(value, 0), props.max)
})

const fill = computed(() => {
  if (props.max <= 0)
    return '0%'
  return `${(shown.value / props.max) * 100}%`
})

function commit(rawValue: string): void {
  const next = Number(rawValue)
  if (!Number.isFinite(next))
    return
  pending.value = null
  emit('change', Math.min(Math.max(next, 0), props.max))
}

function onInput(event: Event): void {
  pending.value = Number((event.target as HTMLInputElement).value)
}

function onChange(event: Event): void {
  commit((event.target as HTMLInputElement).value)
}

/**
 * Arrows move further than the native 1-unit step, which is what people expect.
 * In right-to-left text the track runs right to left (see the `slider` utility),
 * so the horizontal arrows flip with it.
 */
function onKeydown(event: KeyboardEvent): void {
  const rtl = getComputedStyle(event.currentTarget as HTMLElement).direction === 'rtl'
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
  const backward = rtl ? 'ArrowRight' : 'ArrowLeft'
  const bigStep = 5
  const hugeStep = 15
  let next: number | null = null

  switch (event.key) {
    case forward:
    case 'ArrowUp':
      next = shown.value + (event.shiftKey ? hugeStep : bigStep)
      break
    case backward:
    case 'ArrowDown':
      next = shown.value - (event.shiftKey ? hugeStep : bigStep)
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = props.max
      break
    default:
      return
  }

  event.preventDefault()
  pending.value = null
  emit('change', Math.min(Math.max(next, 0), props.max))
}
</script>

<template>
  <input
    type="range"
    class="slider"
    :class="size === 'xs' ? 'h-3' : 'h-4'"
    :min="0"
    :max="max"
    :step="step"
    :value="shown"
    :disabled="disabled || max <= 0"
    :aria-label="label"
    :aria-valuetext="valueText"
    :style="{ '--fill': fill }"
    @input="onInput"
    @change="onChange"
    @keydown="onKeydown"
  >
</template>
