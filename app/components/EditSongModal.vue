<script setup lang="ts">
import { IMAGE_ACCEPT } from '#shared/audio'
import type { SongDTO } from '#shared/types'

/**
 * Fix a song's details — the fallback for files with missing or wrong tags.
 * Available to whoever added the song and to the room owner.
 */
const props = defineProps<{ song: SongDTO | null, roomCode: string }>()
const open = defineModel<boolean>('open', { default: false })

const api = useApi()
const room = useRoom()
const player = usePlayer()

const title = ref('')
const artist = ref('')
const album = ref('')
const coverFile = ref<File | null>(null)
const coverPreview = ref<string | null>(null)
const coverInput = ref<HTMLInputElement | null>(null)

const busy = ref(false)
const fieldErrors = ref<Record<string, string>>({})

watch(open, (value) => {
  if (!value || !props.song)
    return
  title.value = props.song.title
  artist.value = props.song.artist
  album.value = props.song.album ?? ''
  coverFile.value = null
  coverPreview.value = null
  fieldErrors.value = {}
})

watch(coverFile, (file) => {
  if (coverPreview.value)
    URL.revokeObjectURL(coverPreview.value)
  coverPreview.value = file ? URL.createObjectURL(file) : null
})

onBeforeUnmount(() => {
  if (coverPreview.value)
    URL.revokeObjectURL(coverPreview.value)
})

function pickCover(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  input.value = ''

  if (!file)
    return
  if (!file.type.startsWith('image/')) {
    fieldErrors.value = { cover: 'Choose a JPEG, PNG, WebP or GIF image.' }
    return
  }
  if (file.size > 6 * 1024 * 1024) {
    fieldErrors.value = { cover: 'Cover images must be 6 MB or smaller.' }
    return
  }

  fieldErrors.value = {}
  coverFile.value = file
}

async function save(): Promise<void> {
  if (busy.value || !props.song)
    return

  const nextTitle = title.value.trim()
  if (nextTitle.length === 0) {
    fieldErrors.value = { title: 'A song needs a title.' }
    return
  }

  busy.value = true
  fieldErrors.value = {}

  try {
    const result = await api.patch<{ song: SongDTO }>(
      `/api/rooms/${encodeURIComponent(props.roomCode)}/songs/${props.song.id}`,
      {
        title: nextTitle,
        artist: artist.value.trim() || undefined,
        album: album.value.trim() || undefined,
      },
    )

    let song = result.song

    if (coverFile.value) {
      const body = new FormData()
      body.append('cover', coverFile.value, coverFile.value.name)
      const withCover = await api.post<{ song: SongDTO }>(
        `/api/rooms/${encodeURIComponent(props.roomCode)}/songs/${props.song.id}/cover`,
        body,
      )
      song = withCover.song
    }

    room.replaceSong(song)
    player.updateSong(song)
    api.success('Details saved')
    open.value = false
  }
  catch (failure) {
    const parsed = api.notify(failure)
    fieldErrors.value = parsed.fields ?? {}
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Edit song details"
    description="Useful when a file has no tags, or the tags are wrong."
    :ui="{ content: 'max-w-md' }"
  >
    <template #body>
      <form v-if="song" class="space-y-5" @submit.prevent="save">
        <div class="flex items-start gap-4">
          <div class="relative size-20 shrink-0 overflow-hidden rounded-xl bg-raised ring-1 ring-hairline">
            <img
              v-if="coverPreview"
              :src="coverPreview"
              alt="New cover preview"
              class="size-full object-cover"
            >
            <CoverArt v-else :song="song" />
          </div>

          <div class="min-w-0 flex-1 space-y-2">
            <p class="truncate text-sm font-medium text-chalk">{{ song.title }}</p>
            <p class="truncate text-xs text-mist">
              {{ song.artist }} · {{ formatDuration(song.duration) }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton
                type="button"
                size="xs"
                color="neutral"
                variant="outline"
                icon="i-lucide-image"
                label="Change artwork"
                @click="coverInput?.click()"
              />
              <UButton
                v-if="coverFile"
                type="button"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-x"
                label="Discard"
                @click="coverFile = null"
              />
            </div>
            <input
              ref="coverInput"
              type="file"
              :accept="IMAGE_ACCEPT"
              class="hidden"
              @change="pickCover"
            >
          </div>
        </div>

        <p v-if="fieldErrors.cover" class="text-xs text-error">{{ fieldErrors.cover }}</p>

        <UFormField label="Title" :error="fieldErrors.title" name="song-title" required>
          <UInput
            id="song-title"
            v-model="title"
            size="lg"
            maxlength="200"
            class="w-full"
            autofocus
          />
        </UFormField>

        <UFormField label="Artist" :error="fieldErrors.artist" name="song-artist">
          <UInput id="song-artist" v-model="artist" size="lg" maxlength="200" placeholder="Unknown artist" class="w-full" />
        </UFormField>

        <UFormField label="Album" :error="fieldErrors.album" name="song-album">
          <UInput id="song-album" v-model="album" size="lg" maxlength="200" placeholder="Optional" class="w-full" />
        </UFormField>
      </form>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
        <UButton label="Save changes" color="primary" :loading="busy" :disabled="!song" @click="save" />
      </div>
    </template>
  </UModal>
</template>
