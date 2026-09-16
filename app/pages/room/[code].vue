<script setup lang="ts">
import type { SongDTO, SortKey } from '#shared/types'

const route = useRoute()
const router = useRouter()
const api = useApi()
const { guest, create } = useIdentity()

const roomRef = computed(() => String(route.params.code ?? ''))
const { session, preview, join, refresh } = useRoomData(roomRef)
const {
  room,
  songs,
  members,
  onlineCount,
  visibleSongs,
  setView,
  reset,
  addSong,
  removeSongRemote,
  applyDefaultView,
} = useRoom()

/* ------------------------------------------------------------------ meta */

useSeoMeta({
  title: () => {
    if (room.value)
      return `${room.value.name} · TuneRoom`
    if (preview.value)
      return `Join ${preview.value.name} · TuneRoom`
    return 'Room · TuneRoom'
  },
  description: () => room.value?.description ?? 'A shared music room on TuneRoom.',
  robots: 'noindex, nofollow',
})

/* ------------------------------------------------------------- overlays */

const shareOpen = ref(false)
const addOpen = ref(false)
const settingsOpen = ref(false)
const editTarget = ref<SongDTO | null>(null)
const editOpen = ref(false)
const deleteTarget = ref<SongDTO | null>(null)
const deleting = ref(false)
const joining = ref(false)
const joinError = ref<string | null>(null)
const retrying = ref(false)

const deleteOpen = computed({
  get: () => deleteTarget.value !== null,
  set: (value: boolean) => {
    if (!value)
      deleteTarget.value = null
  },
})

onMounted(() => {
  // Applied after hydration so the server render is never contradicted.
  applyDefaultView()

  // `/room/x?share=1` opens the share sheet, then cleans the URL so a refresh
  // does not reopen it.
  if (route.query.share !== undefined) {
    shareOpen.value = true
    void router.replace({ query: {} })
  }
})

onBeforeUnmount(() => reset())

/* -------------------------------------------------------------- actions */

async function onJoin(payload: { name: string, avatar: string }): Promise<void> {
  if (joining.value)
    return

  joining.value = true
  joinError.value = null

  try {
    if (!guest.value)
      await create(payload.name, payload.avatar)
    await join()
  }
  catch (failure) {
    joinError.value = api.notify(failure).message
  }
  finally {
    joining.value = false
  }
}

async function retry(): Promise<void> {
  if (retrying.value)
    return
  retrying.value = true
  try {
    await refresh()
  }
  finally {
    retrying.value = false
  }
}

function onAdded(added: SongDTO[]): void {
  for (const song of added)
    addSong(song)
}

function onReview(song: SongDTO): void {
  addOpen.value = false
  editTarget.value = song
  editOpen.value = true
}

function onEdit(song: SongDTO): void {
  editTarget.value = song
  editOpen.value = true
}

async function confirmDelete(): Promise<void> {
  const song = deleteTarget.value
  if (!song || deleting.value)
    return

  deleting.value = true
  try {
    await removeSongRemote(song)
    deleteTarget.value = null
    api.success('Song deleted', `“${song.title}” was removed from the room.`)
  }
  catch (failure) {
    api.notify(failure)
  }
  finally {
    deleting.value = false
  }
}

/* --------------------------------------------------------- library view */

const sortItems = [
  { label: 'Recently added', value: 'recent' },
  { label: 'Most played', value: 'plays' },
  { label: 'Title A–Z', value: 'title' },
  { label: 'Artist A–Z', value: 'artist' },
]

const search = computed({
  get: () => session.value.search,
  set: (value: string) => {
    session.value.search = value
  },
})

const sort = computed<string>({
  get: () => session.value.sort,
  set: (value: string) => {
    session.value.sort = value as SortKey
  },
})

const favoritesOnly = computed({
  get: () => session.value.favoritesOnly,
  set: (value: boolean) => {
    session.value.favoritesOnly = value
  },
})

const isList = computed(() => session.value.view === 'list')
const isOwner = computed(() => room.value?.isOwner === true)

const emptyVariant = computed<'empty' | 'no-results' | 'no-favorites'>(() => {
  if (favoritesOnly.value)
    return 'no-favorites'
  if (search.value.trim().length > 0)
    return 'no-results'
  return 'empty'
})

function clearFilters(): void {
  search.value = ''
  favoritesOnly.value = false
}
</script>

<template>
  <div class="flex flex-1 flex-col">
    <!-- ------------------------------------------------------- room gone -->
    <template v-if="session.missing">
      <AppHeader />
      <main
        class="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-20 text-center"
      >
        <span
          class="mb-6 grid size-16 place-items-center rounded-2xl border border-hairline bg-surface"
          aria-hidden="true"
        >
          <UIcon name="i-lucide-circle-alert" class="size-7 text-ash" />
        </span>
        <h1 class="text-xl font-semibold tracking-tight text-chalk">This room is gone</h1>
        <p class="mt-2 max-w-sm text-sm leading-relaxed text-mist">
          It may have been deleted by its owner, or the link was mistyped. Nothing
          you added elsewhere is affected.
        </p>
        <div class="mt-7 flex flex-wrap items-center justify-center gap-2">
          <UButton to="/" color="primary" size="lg" label="Back home" class="px-5 font-medium" />
          <UButton
            to="/join"
            color="neutral"
            variant="outline"
            size="lg"
            label="Join another room"
            class="px-5 font-medium"
          />
        </div>
      </main>
    </template>

    <!-- ---------------------------------------------------- join screen -->
    <template v-else-if="session.needsJoin">
      <AppHeader />
      <JoinRoomOverlay :room="preview" :busy="joining" :error="joinError" @join="onJoin" />
    </template>

    <!-- ---------------------------------------------------------- room -->
    <template v-else>
      <RoomHeader
        v-if="room"
        :room="room"
        :members="members"
        :songs="songs"
        :is-owner="isOwner"
        @share="shareOpen = true"
        @settings="settingsOpen = true"
      />
      <AppHeader v-else />

      <main class="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-6 pb-10 sm:px-6 sm:pt-8">
        <!-- Could not load: never leave the visitor staring at a skeleton. -->
        <div
          v-if="!room && session.error"
          class="mx-auto flex max-w-md flex-col items-center py-16 text-center"
        >
          <span
            class="mb-6 grid size-16 place-items-center rounded-2xl border border-hairline bg-surface"
            aria-hidden="true"
          >
            <UIcon name="i-lucide-wifi-off" class="size-7 text-ash" />
          </span>
          <h1 class="text-lg font-semibold tracking-tight text-chalk">Could not open the room</h1>
          <p class="mt-2 text-sm leading-relaxed text-mist">{{ session.error.message }}</p>
          <UButton
            color="primary"
            size="lg"
            icon="i-lucide-refresh-cw"
            label="Try again"
            class="mt-6 px-5 font-medium"
            :loading="retrying"
            @click="retry"
          />
        </div>

        <!-- Loading -->
        <div v-else-if="!room" class="space-y-8">
          <div class="space-y-3">
            <USkeleton class="h-8 w-64 max-w-full rounded-lg" />
            <USkeleton class="h-4 w-96 max-w-full rounded-md" />
          </div>
          <USkeleton class="h-10 w-full rounded-xl" />
          <div class="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            <div v-for="index in 10" :key="index" class="space-y-2.5">
              <USkeleton class="aspect-square w-full rounded-xl" />
              <USkeleton class="h-3.5 w-3/4 rounded" />
              <USkeleton class="h-3 w-1/2 rounded" />
            </div>
          </div>
        </div>

        <!-- Loaded -->
        <template v-else>
          <section class="mb-7 sm:mb-9">
            <h1 class="text-2xl font-semibold tracking-tight text-chalk sm:text-3xl" dir="auto">
              {{ room.name }}
            </h1>
            <p
              v-if="room.description"
              class="mt-2 max-w-2xl text-sm leading-relaxed text-mist"
              dir="auto"
            >
              {{ room.description }}
            </p>
            <p class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ash">
              <span>{{ pluralize(songs.length, 'song') }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ onlineCount }} here now</span>
              <template v-if="room.owner">
                <span aria-hidden="true">·</span>
                <span class="flex items-center gap-1.5">
                  Created by
                  <PersonAvatar :name="room.owner.name" :avatar="room.owner.avatar" :size="16" />
                  <span class="text-mist" dir="auto">{{ room.owner.name }}</span>
                </span>
              </template>
            </p>
          </section>

          <!-- Toolbar -->
          <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div class="flex items-center gap-2">
              <UInput
                v-model="search"
                icon="i-lucide-search"
                placeholder="Search songs, artists, people"
                size="lg"
                autocomplete="off"
                class="w-full min-w-0 sm:w-72"
                aria-label="Search the room library"
              >
                <template v-if="search.length > 0" #trailing>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    square
                    icon="i-lucide-x"
                    aria-label="Clear search"
                    @click="search = ''"
                  />
                </template>
              </UInput>

              <UButton
                color="primary"
                size="lg"
                icon="i-lucide-plus"
                class="shrink-0 font-medium sm:hidden"
                aria-label="Add music"
                @click="addOpen = true"
              />
            </div>

            <div class="flex flex-wrap items-center gap-2 sm:ms-auto">
              <USelect
                v-model="sort"
                :items="sortItems"
                size="lg"
                class="w-44"
                aria-label="Sort songs"
              />

              <UButton
                size="lg"
                :color="favoritesOnly ? 'primary' : 'neutral'"
                :variant="favoritesOnly ? 'soft' : 'outline'"
                icon="i-lucide-heart"
                label="Favorites"
                class="font-medium"
                :aria-pressed="favoritesOnly"
                @click="favoritesOnly = !favoritesOnly"
              />

              <div class="hidden items-center rounded-lg border border-hairline p-0.5 sm:flex">
                <UButton
                  color="neutral"
                  :variant="isList ? 'ghost' : 'soft'"
                  size="sm"
                  square
                  icon="i-lucide-layout-grid"
                  aria-label="Grid view"
                  :aria-pressed="!isList"
                  @click="setView('grid')"
                />
                <UButton
                  color="neutral"
                  :variant="isList ? 'soft' : 'ghost'"
                  size="sm"
                  square
                  icon="i-lucide-list"
                  aria-label="List view"
                  :aria-pressed="isList"
                  @click="setView('list')"
                />
              </div>

              <UButton
                color="primary"
                size="lg"
                icon="i-lucide-plus"
                label="Add music"
                class="hidden shrink-0 font-medium sm:inline-flex"
                @click="addOpen = true"
              />
            </div>
          </div>

          <!-- Library -->
          <template v-if="visibleSongs.length > 0">
            <SongList
              v-if="isList"
              :songs="visibleSongs"
              @edit="onEdit"
              @delete="deleteTarget = $event"
            />
            <SongGrid
              v-else
              :songs="visibleSongs"
              @edit="onEdit"
              @delete="deleteTarget = $event"
            />
          </template>
          <EmptyMusicState
            v-else
            :variant="emptyVariant"
            :query="search.trim()"
            @add="addOpen = true"
            @clear="clearFilters"
          />
        </template>
      </main>
    </template>

    <!-- --------------------------------------------------------- modals -->
    <ShareRoomModal v-if="room" v-model:open="shareOpen" :room="room" />
    <RoomSettingsModal v-if="room" v-model:open="settingsOpen" :room="room" />
    <AddMusicModal
      v-if="room"
      v-model:open="addOpen"
      :room-code="room.code"
      @added="onAdded"
      @review="onReview"
    />
    <EditSongModal v-model:open="editOpen" :song="editTarget" :room-code="room?.code ?? ''" />

    <UModal
      v-model:open="deleteOpen"
      title="Delete this song?"
      :description="deleteTarget
        ? `“${deleteTarget.title}” will be removed from the room for everyone, and its file deleted.`
        : ''"
      :ui="{ content: 'max-w-md' }"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="deleteTarget = null" />
          <UButton
            label="Delete song"
            color="error"
            icon="i-lucide-trash"
            :loading="deleting"
            @click="confirmDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
