<script setup lang="ts">
/**
 * The expanded player.
 *
 * Rendered as a full-screen dialog so focus trapping, Escape, scroll locking and
 * stacking above the dock all come from the same primitive as every other modal.
 */
const { state, current, seek, setVolume, toggleMute } = usePlayer()
// Destructured so the computed unwraps in the template.
const { room: activeRoom, isFavorite: isFavoriteOf, toggleFavorite: toggleFavoriteOf } = useRoom()

const open = computed({
  get: () => state.value.expanded && current.value !== null,
  set: (value: boolean) => {
    state.value.expanded = value
  },
})

const isFavorite = computed(() =>
  current.value ? isFavoriteOf(current.value.id) : false,
)

function toggleFavorite(): void {
  if (current.value)
    void toggleFavoriteOf(current.value)
}

const positionText = computed(() => formatDuration(state.value.position))
const durationText = computed(() => formatDuration(state.value.duration))
const seekText = computed(() => `${positionText.value} of ${durationText.value}`)

const volumeIcon = computed(() => {
  if (state.value.muted || state.value.volume === 0)
    return 'i-lucide-volume-x'
  return state.value.volume < 0.5 ? 'i-lucide-volume-1' : 'i-lucide-volume-2'
})

const volumeLabel = computed(() =>
  state.value.muted || state.value.volume === 0 ? 'Unmute' : 'Mute',
)

function openQueue(): void {
  state.value.queueOpen = true
}
</script>

<template>
  <UModal
    v-model:open="open"
    fullscreen
    :close="false"
    :ui="{
      content: 'bg-base data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out',
      body: 'p-0',
    }"
  >
    <template #body>
      <div
        v-if="current"
        class="flex h-full flex-col px-5 sm:px-10"
        :style="{
          paddingTop: 'max(1rem, env(safe-area-inset-top, 1rem))',
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))',
        }"
      >
        <!-- Top bar -->
        <div class="flex items-center justify-between gap-3">
          <UButton
            color="neutral"
            variant="ghost"
            size="lg"
            square
            icon="i-lucide-chevron-down"
            aria-label="Close full-screen player"
            class="-ms-2"
            @click="open = false"
          />

          <div class="min-w-0 text-center">
            <p class="text-[10.5px] font-medium uppercase tracking-[0.2em] text-ash">
              Now playing
            </p>
            <p v-if="activeRoom" class="truncate text-xs text-mist">
              in {{ activeRoom.name }}
            </p>
          </div>

          <button
            type="button"
            class="relative -me-2 grid size-10 place-items-center rounded-lg text-mist transition-colors hover:bg-raised hover:text-chalk"
            :aria-label="state.queue.length > 0
              ? `Queue, ${state.queue.length} songs`
              : 'Queue, empty'"
            @click="openQueue"
          >
            <UIcon name="i-lucide-list-music" class="size-5" />
            <span
              v-if="state.queue.length > 0"
              class="numeric absolute top-0.5 end-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-400 px-1 text-[10px] font-semibold text-ink-950"
            >{{ state.queue.length }}</span>
          </button>
        </div>

        <!-- Artwork -->
        <div class="flex min-h-0 flex-1 items-center justify-center py-6 sm:py-10">
          <div
            class="relative aspect-square w-full max-w-[min(76vw,21rem)] overflow-hidden rounded-2xl bg-raised shadow-2xl shadow-black/60 ring-1 ring-hairline"
          >
            <CoverArt :song="current" />
            <span
              v-if="state.playing"
              class="absolute bottom-3 start-3 flex h-7 items-center rounded-full bg-ink-950/75 px-2.5"
            >
              <EqualizerBars />
            </span>
          </div>
        </div>

        <!-- Meta -->
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-xl font-semibold tracking-tight text-chalk sm:text-2xl" dir="auto">
              {{ current.title }}
            </h2>
            <p class="mt-1 truncate text-sm text-mist" dir="auto">
              {{ current.artist }}
              <template v-if="current.album"> · {{ current.album }}</template>
            </p>
            <p class="mt-2 flex items-center gap-1.5 text-xs text-ash">
              <PersonAvatar
                :name="current.uploader.name"
                :avatar="current.uploader.avatar"
                :size="16"
                class="shrink-0"
              />
              <span class="truncate">Added by {{ current.uploader.name }}</span>
            </p>
          </div>

          <button
            type="button"
            class="grid size-10 shrink-0 place-items-center rounded-lg transition-colors hover:bg-raised"
            :class="isFavorite ? 'text-brand-400' : 'text-mist hover:text-chalk'"
            :aria-label="isFavorite ? 'Remove from favorites' : 'Add to favorites'"
            :aria-pressed="isFavorite"
            @click="toggleFavorite"
          >
            <UIcon name="i-lucide-heart" class="size-5" :class="isFavorite ? 'fill-current' : ''" />
          </button>
        </div>

        <!-- Seek -->
        <div class="mt-5">
          <SeekSlider
            :value="state.position"
            :max="state.duration || 0"
            :step="1"
            :value-text="seekText"
            :label="`Seek ${current.title}`"
            @change="seek"
          />
          <div class="mt-1 flex items-center justify-between text-[11px] text-ash">
            <span class="numeric">{{ positionText }}</span>
            <span v-if="state.error" class="truncate px-2 text-error" role="status">{{ state.error }}</span>
            <span class="numeric">{{ durationText }}</span>
          </div>
        </div>

        <!-- Transport -->
        <TransportControls size="lg" class="mt-5 sm:mt-7" />

        <!-- Bottom row -->
        <div class="mt-6 flex items-center justify-between gap-4 sm:mt-8">
          <a
            :href="current.downloadUrl"
            class="grid size-10 shrink-0 place-items-center rounded-lg text-mist transition-colors hover:bg-raised hover:text-chalk"
            :aria-label="`Download ${current.title}`"
          >
            <UIcon name="i-lucide-download" class="size-5" />
          </a>

          <div class="flex max-w-[12rem] flex-1 items-center justify-end gap-2">
            <button
              type="button"
              class="grid size-10 shrink-0 place-items-center rounded-lg text-mist transition-colors hover:bg-raised hover:text-chalk"
              :aria-label="volumeLabel"
              @click="toggleMute"
            >
              <UIcon :name="volumeIcon" class="size-5" />
            </button>
            <SeekSlider
              class="w-full max-w-[9rem]"
              size="xs"
              :value="state.muted ? 0 : state.volume"
              :max="1"
              :step="0.05"
              label="Volume"
              :value-text="`${Math.round((state.muted ? 0 : state.volume) * 100)}%`"
              @change="setVolume"
            />
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
