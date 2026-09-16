<script setup lang="ts">
/**
 * The persistent player.
 *
 * Desktop: a full control bar. Mobile: a mini bar that expands to the
 * full-screen player. It is mounted once in `app.vue`, so navigating never
 * interrupts playback.
 */
const player = usePlayer()
const { state, current, toggle, next, seek, setVolume, toggleMute } = player
const room = useRoom()

const isFavorite = computed(() =>
  current.value ? room.isFavorite(current.value.id) : false,
)

function toggleFavorite(): void {
  if (current.value)
    void room.toggleFavorite(current.value)
}

const volumeIcon = computed(() => {
  if (state.value.muted || state.value.volume === 0)
    return 'i-lucide-volume-x'
  return state.value.volume < 0.5 ? 'i-lucide-volume-1' : 'i-lucide-volume-2'
})

const volumeLabel = computed(() =>
  state.value.muted || state.value.volume === 0 ? 'Unmute' : 'Mute',
)

const positionText = computed(() => formatDuration(state.value.position))
const durationText = computed(() => formatDuration(state.value.duration))
const seekText = computed(() => `${positionText.value} of ${durationText.value}`)

function expand(): void {
  state.value.expanded = true
}

function openQueue(): void {
  state.value.queueOpen = true
}

function dismissError(): void {
  state.value.error = null
}
</script>

<template>
  <div
    v-if="current"
    class="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface"
    :style="{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }"
  >
    <!-- A playback failure is always visible, never silently swallowed. -->
    <div
      v-if="state.error"
      class="flex items-center gap-2 border-b border-error/25 bg-error/10 px-4 py-1.5"
      role="status"
    >
      <UIcon name="i-lucide-triangle-alert" class="size-3.5 shrink-0 text-error" />
      <p class="min-w-0 flex-1 truncate text-xs text-error">{{ state.error }}</p>
      <UButton
        color="error"
        variant="ghost"
        size="xs"
        square
        icon="i-lucide-x"
        aria-label="Dismiss"
        @click="dismissError"
      />
    </div>

    <!-- ------------------------------------------------------- mobile: mini -->
    <div class="md:hidden">
      <div class="h-0.5 w-full bg-hairline" aria-hidden="true">
        <div
          class="h-full bg-brand-400 transition-[width] duration-200 ease-linear"
          :style="{ width: `${state.duration > 0 ? (state.position / state.duration) * 100 : 0}%` }"
        />
      </div>

      <div class="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-3 text-start outline-none"
          aria-label="Open full-screen player"
          @click="expand"
        >
          <span class="relative size-11 shrink-0 overflow-hidden rounded-lg bg-raised ring-1 ring-hairline">
            <CoverArt :song="current" />
            <span v-if="state.playing" class="absolute inset-0 grid place-items-center bg-ink-950/55">
              <EqualizerBars />
            </span>
          </span>
          <span class="min-w-0 flex-1">
            <span
              class="block truncate text-[13.5px] font-medium text-chalk"
              dir="auto"
            >{{ current.title }}</span>
            <span class="block truncate text-[11.5px] text-mist" dir="auto">{{ current.artist }}</span>
          </span>
        </button>

        <button
          type="button"
          class="grid size-10 shrink-0 place-items-center rounded-full text-chalk transition-colors hover:bg-raised active:scale-95"
          :aria-label="state.playing ? 'Pause' : 'Play'"
          @click="toggle"
        >
          <UIcon
            :name="state.buffering ? 'i-lucide-loader-circle' : state.playing ? 'i-lucide-pause' : 'i-lucide-play'"
            class="size-5"
            :class="[
              state.buffering ? 'animate-spin' : '',
              state.playing ? '' : 'translate-x-[1px]',
            ]"
          />
        </button>

        <button
          type="button"
          class="grid size-10 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-raised hover:text-chalk active:scale-95"
          aria-label="Next song"
          @click="next()"
        >
          <UIcon name="i-lucide-skip-forward" class="size-5" />
        </button>
      </div>
    </div>

    <!-- ----------------------------------------------------- desktop: full -->
    <div class="hidden h-[76px] items-center gap-4 px-4 md:flex">
      <!-- Now playing -->
      <div class="flex max-w-[26%] min-w-0 flex-1 items-center gap-3">
        <span class="relative size-12 shrink-0 overflow-hidden rounded-lg bg-raised ring-1 ring-hairline">
          <CoverArt :song="current" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-chalk" dir="auto">{{ current.title }}</span>
          <span class="block truncate text-xs text-mist" dir="auto">
            {{ current.artist }}<template v-if="current.album"> · {{ current.album }}</template>
          </span>
        </span>
        <button
          type="button"
          class="grid size-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-raised"
          :class="isFavorite ? 'text-brand-400' : 'text-mist hover:text-chalk'"
          :aria-label="isFavorite ? 'Remove from favorites' : 'Add to favorites'"
          :aria-pressed="isFavorite"
          @click="toggleFavorite"
        >
          <UIcon name="i-lucide-heart" class="size-4" :class="isFavorite ? 'fill-current' : ''" />
        </button>
      </div>

      <!-- Transport + seek -->
      <div class="flex w-full max-w-[620px] flex-[1.6] flex-col items-center gap-1">
        <TransportControls size="sm" />
        <div class="flex w-full items-center gap-2">
          <span class="numeric hidden w-10 shrink-0 text-end text-[11px] text-ash lg:block">
            {{ positionText }}
          </span>
          <SeekSlider
            class="flex-1"
            :value="state.position"
            :max="state.duration || 0"
            :step="1"
            :value-text="seekText"
            :label="`Seek ${current.title}`"
            @change="seek"
          />
          <span class="numeric hidden w-10 shrink-0 text-[11px] text-ash lg:block">
            {{ durationText }}
          </span>
        </div>
      </div>

      <!-- Right cluster -->
      <div class="flex max-w-[26%] min-w-0 flex-1 items-center justify-end gap-1">
        <button
          type="button"
          class="relative grid size-8 shrink-0 place-items-center rounded-lg text-mist transition-colors hover:bg-raised hover:text-chalk"
          :aria-label="state.queue.length > 0
            ? `Queue, ${state.queue.length} songs`
            : 'Queue, empty'"
          @click="openQueue"
        >
          <UIcon name="i-lucide-list-music" class="size-4" />
          <span
            v-if="state.queue.length > 0"
            class="numeric absolute -top-1 -end-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-400 px-1 text-[10px] font-semibold text-ink-950"
          >{{ state.queue.length }}</span>
        </button>

        <span class="hidden items-center gap-1.5 xl:flex">
          <button
            type="button"
            class="grid size-8 place-items-center rounded-lg text-mist transition-colors hover:bg-raised hover:text-chalk"
            :aria-label="volumeLabel"
            @click="toggleMute"
          >
            <UIcon :name="volumeIcon" class="size-4" />
          </button>
          <SeekSlider
            class="w-24"
            size="xs"
            :value="state.muted ? 0 : state.volume"
            :max="1"
            :step="0.05"
            label="Volume"
            :value-text="`${Math.round((state.muted ? 0 : state.volume) * 100)}%`"
            @change="setVolume"
          />
        </span>

        <a
          :href="current.downloadUrl"
          class="grid size-8 shrink-0 place-items-center rounded-lg text-mist transition-colors hover:bg-raised hover:text-chalk"
          :aria-label="`Download ${current.title}`"
        >
          <UIcon name="i-lucide-download" class="size-4" />
        </a>

        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          square
          icon="i-lucide-maximize"
          aria-label="Full-screen player"
          @click="expand"
        />
      </div>
    </div>
  </div>

  <FullScreenPlayer v-if="current" />
</template>
