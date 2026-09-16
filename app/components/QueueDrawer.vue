<script setup lang="ts">
/**
 * The personal up-next list.
 *
 * Per visitor, persisted per room, and deliberately simple: reorder with the
 * arrows, remove with the cross, play anything immediately with a tap.
 */
const { state, current, removeFromQueue, moveInQueue, clearQueue, playSong } = usePlayer()

const open = computed({
  get: () => state.value.queueOpen,
  set: (value: boolean) => {
    state.value.queueOpen = value
  },
})

const queue = computed(() => state.value.queue)

const description = computed(() => {
  if (queue.value.length === 0)
    return 'Nothing queued yet'
  const total = queue.value.reduce((sum, song) => sum + (song.duration || 0), 0)
  return `${queue.value.length} ${queue.value.length === 1 ? 'song' : 'songs'} · ${formatDuration(total)} left`
})

function playNow(index: number): void {
  const song = queue.value[index]
  if (!song)
    return
  removeFromQueue(index)
  playSong(song)
}

function move(index: number, direction: -1 | 1): void {
  moveInQueue(index, direction)
}

function remove(index: number): void {
  removeFromQueue(index)
}
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Your queue"
    :description="description"
    :ui="{ content: 'w-full max-w-sm bg-surface' }"
  >
    <template #body>
      <div class="space-y-5">
        <!-- What is playing right now, for context. -->
        <div
          v-if="current"
          class="flex items-center gap-3 rounded-xl border border-hairline bg-raised/50 p-2.5"
        >
          <span class="relative size-11 shrink-0 overflow-hidden rounded-lg bg-ink-950">
            <CoverArt :song="current" />
            <span v-if="state.playing" class="absolute inset-0 grid place-items-center bg-ink-950/60">
              <EqualizerBars />
            </span>
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-[10.5px] font-medium uppercase tracking-[0.16em] text-ash">
              Playing now
            </span>
            <span class="block truncate text-[13px] font-medium text-chalk" dir="auto">
              {{ current.title }}
            </span>
            <span class="block truncate text-[11.5px] text-mist" dir="auto">{{ current.artist }}</span>
          </span>
        </div>

        <!-- Up next -->
        <ol v-if="queue.length > 0" class="space-y-1">
          <li
            v-for="(song, index) in queue"
            :key="`${song.id}-${index}`"
            class="group flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-raised/60"
          >
            <span class="numeric w-4 shrink-0 text-center text-[11px] text-ash">
              {{ index + 1 }}
            </span>

            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-2.5 text-start outline-none"
              :aria-label="`Play ${song.title} now`"
              @click="playNow(index)"
            >
              <span class="relative size-9 shrink-0 overflow-hidden rounded-md bg-ink-950 ring-1 ring-hairline">
                <CoverArt :song="song" />
                <span
                  class="absolute inset-0 grid place-items-center bg-ink-950/60 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <UIcon name="i-lucide-play" class="size-3.5 translate-x-px text-chalk" />
                </span>
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[13px] font-medium text-chalk" dir="auto">
                  {{ song.title }}
                </span>
                <span class="block truncate text-[11.5px] text-mist" dir="auto">{{ song.artist }}</span>
              </span>
            </button>

            <span class="numeric shrink-0 text-[11px] text-ash">
              {{ formatDuration(song.duration) }}
            </span>

            <span class="flex shrink-0 items-center">
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                square
                icon="i-lucide-arrow-up"
                :disabled="index === 0"
                :aria-label="`Move ${song.title} earlier`"
                @click="move(index, -1)"
              />
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                square
                icon="i-lucide-arrow-down"
                :disabled="index === queue.length - 1"
                :aria-label="`Move ${song.title} later`"
                @click="move(index, 1)"
              />
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                square
                icon="i-lucide-x"
                :aria-label="`Remove ${song.title} from the queue`"
                @click="remove(index)"
              />
            </span>
          </li>
        </ol>

        <!-- Empty -->
        <div v-else class="flex flex-col items-center px-4 py-14 text-center">
          <span
            class="mb-5 grid size-14 place-items-center rounded-2xl border border-hairline bg-raised/50"
            aria-hidden="true"
          >
            <UIcon name="i-lucide-list-music" class="size-6 text-ash" />
          </span>
          <p class="text-sm font-medium text-chalk">Your queue is empty.</p>
          <p class="mt-1.5 max-w-[16rem] text-xs leading-relaxed text-mist">
            Use “Add to queue” or “Play next” on any song to line it up here.
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <p class="truncate text-xs text-ash">Only you can see your queue.</p>
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-trash"
          label="Clear"
          :disabled="queue.length === 0"
          @click="clearQueue"
        />
      </div>
    </template>
  </USlideover>
</template>
