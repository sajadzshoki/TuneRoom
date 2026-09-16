<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { SongDTO } from '#shared/types'

/**
 * One song in the library.
 *
 * `grid` is the desktop card, `row` is the compact list used on small screens.
 * The card reads playback and favorite state from the shared composables and
 * performs the simple actions itself; destructive actions are emitted so the
 * room page owns their confirmation dialogs.
 */
const props = withDefaults(
  defineProps<{
    song: SongDTO
    variant?: 'grid' | 'row'
  }>(),
  { variant: 'grid' },
)

const emit = defineEmits<{ edit: [song: SongDTO], delete: [song: SongDTO] }>()

const player = usePlayer()
const room = useRoom()

const isCurrent = computed(() => player.isCurrent(props.song.id))
const isPlaying = computed(() => player.isPlaying(props.song.id))
const isFavorite = computed(() => room.isFavorite(props.song.id))
const queuePosition = computed(() =>
  player.state.value.queue.findIndex(item => item.id === props.song.id),
)
const inQueue = computed(() => queuePosition.value !== -1)
const toggleLabel = computed(() =>
  `${isPlaying.value ? 'Pause' : 'Play'} ${props.song.title}`,
)
const addedBy = computed(() => `Added by ${props.song.uploader.name}`)

function togglePlay(): void {
  if (isCurrent.value) {
    player.toggle()
    return
  }

  // Play from the list the visitor is looking at, so next/previous keep walking
  // through it (respecting shuffle and repeat).
  const list = room.visibleSongs.value
  const index = list.findIndex(item => item.id === props.song.id)
  if (index >= 0)
    player.playContext(list, index)
  else
    player.playSong(props.song)
}

function toggleQueue(): void {
  if (inQueue.value)
    player.removeFromQueue(queuePosition.value)
  else player.enqueue(props.song)
}

function playNext(): void {
  player.enqueue(props.song, { next: true })
}

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const groups: DropdownMenuItem[][] = [
    [
      {
        label: isPlaying.value ? 'Pause' : 'Play now',
        icon: isPlaying.value ? 'i-lucide-pause' : 'i-lucide-play',
        onSelect: () => togglePlay(),
      },
      inQueue.value
        ? {
            label: 'Remove from queue',
            icon: 'i-lucide-list-minus',
            onSelect: () => toggleQueue(),
          }
        : {
            label: 'Add to queue',
            icon: 'i-lucide-list-plus',
            onSelect: () => toggleQueue(),
          },
      { label: 'Play next', icon: 'i-lucide-list-start', onSelect: () => playNext() },
    ],
    [
      {
        label: isFavorite.value ? 'Remove from favorites' : 'Add to favorites',
        icon: 'i-lucide-heart',
        onSelect: () => room.toggleFavorite(props.song),
      },
      { label: 'Download', icon: 'i-lucide-download', to: props.song.downloadUrl },
    ],
  ]

  if (props.song.canManage) {
    groups.push([
      { label: 'Edit details', icon: 'i-lucide-pencil', onSelect: () => emit('edit', props.song) },
      {
        label: 'Delete song',
        icon: 'i-lucide-trash',
        color: 'error',
        onSelect: () => emit('delete', props.song),
      },
    ])
  }

  return groups
})
</script>

<template>
  <!-- ------------------------------------------------------------ grid card -->
  <article v-if="variant === 'grid'" class="group relative flex flex-col">
    <div
      class="relative aspect-square w-full overflow-hidden rounded-xl bg-raised ring-1 ring-hairline transition-[box-shadow] duration-200"
      :class="isCurrent ? 'shadow-[0_0_0_1px_rgba(245,158,11,0.45)]' : ''"
    >
      <CoverArt :song="song" />

      <!-- Play / pause covers the artwork so the whole card is the target. -->
      <button
        type="button"
        class="absolute inset-0 flex items-center justify-center outline-none"
        :aria-label="toggleLabel"
        @click="togglePlay"
      >
        <span
          class="absolute inset-0 bg-ink-950/55 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
          :class="isCurrent ? 'opacity-100' : ''"
          aria-hidden="true"
        />
        <span
          class="relative grid size-12 scale-90 place-items-center rounded-full bg-brand-400 text-ink-950 opacity-0 shadow-lg shadow-black/40 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100 hover:bg-brand-300"
          :class="isCurrent ? 'scale-100 opacity-100' : ''"
          aria-hidden="true"
        >
          <UIcon
            :name="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
            class="size-6"
            :class="isPlaying ? '' : 'translate-x-[1px]'"
          />
        </span>
      </button>

      <button
        type="button"
        class="absolute top-2 end-2 grid size-8 place-items-center rounded-full bg-ink-950/70 text-chalk transition-all duration-200 hover:bg-ink-950 hover:text-brand-300"
        :class="isFavorite
          ? 'text-brand-400 opacity-100'
          : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'"
        :aria-label="isFavorite ? `Remove ${song.title} from favorites` : `Add ${song.title} to favorites`"
        :aria-pressed="isFavorite"
        @click.stop="room.toggleFavorite(song)"
      >
        <UIcon name="i-lucide-heart" class="size-4" :class="isFavorite ? 'fill-current' : ''" />
      </button>

      <span
        v-if="inQueue"
        class="absolute top-2 start-2 rounded-full bg-ink-950/80 px-2 py-0.5 text-[10.5px] font-medium tabular-nums text-mist"
        :title="`Number ${queuePosition + 1} in your queue`"
      >
        #{{ queuePosition + 1 }}
      </span>

      <span
        v-if="isCurrent && isPlaying"
        class="absolute bottom-2 start-2 flex h-6 items-center rounded-full bg-ink-950/80 px-2"
      >
        <EqualizerBars />
      </span>
      <span
        v-else
        class="absolute end-2 bottom-2 rounded bg-ink-950/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-mist"
      >
        {{ formatDuration(song.duration) }}
      </span>
    </div>

    <div class="mt-2.5 flex items-start gap-1.5">
      <div class="min-w-0 flex-1">
        <button
          type="button"
          class="block w-full truncate text-start text-[13.5px] font-medium leading-tight transition-colors hover:text-brand-300"
          :class="isCurrent ? 'text-brand-400' : 'text-chalk'"
          :title="song.title"
          @click="togglePlay"
        >
          {{ song.title }}
        </button>
        <p class="mt-1 truncate text-xs text-mist" :title="song.artist">
          {{ song.artist }}
        </p>
      </div>

      <PersonAvatar
        :name="song.uploader.name"
        :avatar="song.uploader.avatar"
        :size="18"
        class="mt-0.5 shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
        :title="addedBy"
      />

      <UDropdownMenu :items="menuItems" :content="{ align: 'end' }" :ui="{ content: 'w-56' }">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          square
          icon="i-lucide-ellipsis"
          :aria-label="`More actions for ${song.title}`"
          class="-me-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          @click.stop
        />
      </UDropdownMenu>
    </div>
  </article>

  <!-- ------------------------------------------------------------- list row -->
  <article
    v-else
    class="group relative grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-raised/70 sm:gap-4 sm:px-3"
    :class="isCurrent ? 'bg-brand-400/[0.06]' : ''"
  >
    <div
      class="relative size-11 shrink-0 overflow-hidden rounded-lg bg-raised ring-1 ring-hairline"
      :class="isCurrent ? 'ring-brand-400/50' : ''"
    >
      <CoverArt :song="song" />
      <button
        type="button"
        class="absolute inset-0 grid place-items-center bg-ink-950/60 opacity-0 outline-none transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        :class="isCurrent ? 'opacity-100' : ''"
        :aria-label="toggleLabel"
        @click="togglePlay"
      >
        <UIcon
          :name="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
          class="size-4 text-chalk"
          :class="isPlaying ? '' : 'translate-x-[1px]'"
        />
      </button>
    </div>

    <div class="min-w-0">
      <button
        type="button"
        class="block w-full truncate text-start text-[13.5px] font-medium leading-tight transition-colors hover:text-brand-300"
        :class="isCurrent ? 'text-brand-400' : 'text-chalk'"
        :title="song.title"
        @click="togglePlay"
      >
        {{ song.title }}
      </button>
      <p class="mt-0.5 flex items-center gap-1.5 text-xs text-mist">
        <span class="truncate">{{ song.artist }}</span>
        <span class="shrink-0 text-ash">·</span>
        <PersonAvatar
          :name="song.uploader.name"
          :avatar="song.uploader.avatar"
          :size="14"
          class="shrink-0 opacity-70"
          :title="addedBy"
        />
        <span class="truncate text-ash">{{ song.uploader.name }}</span>
      </p>
    </div>

    <div class="flex shrink-0 items-center gap-1 sm:gap-1.5">
      <span
        v-if="inQueue"
        class="hidden rounded-full bg-raised px-2 py-0.5 text-[10.5px] font-medium tabular-nums text-mist sm:block"
      >
        #{{ queuePosition + 1 }}
      </span>

      <span class="hidden w-11 text-end text-xs tabular-nums text-ash sm:block">
        {{ formatDuration(song.duration) }}
      </span>

      <button
        type="button"
        class="grid size-8 place-items-center rounded-lg text-mist transition-colors hover:bg-raised hover:text-brand-300"
        :class="isFavorite
          ? 'text-brand-400 opacity-100'
          : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'"
        :aria-label="isFavorite ? `Remove ${song.title} from favorites` : `Add ${song.title} to favorites`"
        :aria-pressed="isFavorite"
        @click.stop="room.toggleFavorite(song)"
      >
        <UIcon name="i-lucide-heart" class="size-4" :class="isFavorite ? 'fill-current' : ''" />
      </button>

      <UDropdownMenu :items="menuItems" :content="{ align: 'end' }" :ui="{ content: 'w-56' }">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          square
          icon="i-lucide-ellipsis"
          :aria-label="`More actions for ${song.title}`"
          class="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          @click.stop
        />
      </UDropdownMenu>
    </div>
  </article>
</template>
