<script setup lang="ts">
/**
 * Shuffle / previous / play / next / repeat.
 * Shared by the desktop dock and the full-screen player so the transport always
 * looks and behaves the same.
 */
withDefaults(defineProps<{ size?: 'sm' | 'lg' }>(), { size: 'sm' })

const { state, toggle, next, previous, toggleShuffle, cycleRepeat } = usePlayer()

const repeatLabel = computed(() => {
  switch (state.value.repeat) {
    case 'one':
      return 'Repeat this song'
    case 'all':
      return 'Repeat the room'
    default:
      return 'Repeat off'
  }
})

const playIcon = computed(() => {
  if (state.value.buffering)
    return 'i-lucide-loader-circle'
  return state.value.playing ? 'i-lucide-pause' : 'i-lucide-play'
})
</script>

<template>
  <div class="flex items-center justify-center" :class="size === 'lg' ? 'gap-4 sm:gap-6' : 'gap-0.5'">
    <UButton
      :color="state.shuffle ? 'primary' : 'neutral'"
      :variant="state.shuffle ? 'soft' : 'ghost'"
      :size="size === 'lg' ? 'lg' : 'sm'"
      square
      icon="i-lucide-shuffle"
      :aria-label="state.shuffle ? 'Shuffle on' : 'Shuffle off'"
      :aria-pressed="state.shuffle"
      :class="state.shuffle ? '' : 'text-mist hover:text-chalk'"
      @click="toggleShuffle"
    />

    <UButton
      color="neutral"
      variant="ghost"
      :size="size === 'lg' ? 'lg' : 'sm'"
      square
      icon="i-lucide-skip-back"
      aria-label="Previous song"
      class="text-chalk hover:text-chalk"
      :class="size === 'lg' ? 'scale-110' : ''"
      @click="previous()"
    />

    <button
      type="button"
      class="grid shrink-0 place-items-center rounded-full bg-chalk text-ink-950 transition-all duration-150 hover:scale-[1.04] hover:bg-white active:scale-95 disabled:opacity-40"
      :class="size === 'lg' ? 'size-16' : 'size-9'"
      :aria-label="state.playing ? 'Pause' : 'Play'"
      @click="toggle"
    >
      <UIcon
        :name="playIcon"
        :class="[
          size === 'lg' ? 'size-7' : 'size-4.5',
          state.buffering ? 'animate-spin' : '',
          state.playing ? '' : 'translate-x-[1px]',
        ]"
      />
    </button>

    <UButton
      color="neutral"
      variant="ghost"
      :size="size === 'lg' ? 'lg' : 'sm'"
      square
      icon="i-lucide-skip-forward"
      aria-label="Next song"
      class="text-chalk hover:text-chalk"
      :class="size === 'lg' ? 'scale-110' : ''"
      @click="next()"
    />

    <UButton
      :color="state.repeat === 'off' ? 'neutral' : 'primary'"
      :variant="state.repeat === 'off' ? 'ghost' : 'soft'"
      :size="size === 'lg' ? 'lg' : 'sm'"
      square
      :icon="state.repeat === 'one' ? 'i-lucide-repeat-1' : 'i-lucide-repeat'"
      :aria-label="repeatLabel"
      :aria-pressed="state.repeat !== 'off'"
      :class="state.repeat === 'off' ? 'text-mist hover:text-chalk' : ''"
      @click="cycleRepeat"
    />
  </div>
</template>
