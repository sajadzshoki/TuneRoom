<script setup lang="ts">
import { AUDIO_ACCEPT, hasAudioExtension } from '#shared/audio'
import type { SongDTO, UploadResultDTO } from '#shared/types'

/**
 * Add music to the room: upload files (with real per-file progress) or paste a
 * direct audio link. Both paths store the audio server side, so playback is
 * identical no matter how a song arrived.
 */
const props = defineProps<{ roomCode: string }>()
const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{ added: [songs: SongDTO[]], review: [song: SongDTO] }>()

type JobStatus = 'queued' | 'uploading' | 'processing' | 'done' | 'error'

interface Job {
  id: string
  file: File
  name: string
  size: number
  status: JobStatus
  progress: number
  message: string | null
  song: SongDTO | null
  needsMetadata: boolean
}

const api = useApi()
const runtimeConfig = useRuntimeConfig()

const maxBytes = computed(
  () => Number(runtimeConfig.public.maxUploadMb ?? 60) * 1024 * 1024,
)
const maxLabel = computed(() => `${runtimeConfig.public.maxUploadMb ?? 60} MB`)

const tab = ref<string>('upload')
const jobs = ref<Job[]>([])
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const running = ref(false)

/** Kept out of reactive state: proxied AbortControllers throw on `.abort()`. */
const controllers = new Map<string, AbortController>()

const pendingReview = computed(() =>
  jobs.value.filter(job => job.status === 'done' && job.needsMetadata),
)
const doneCount = computed(() => jobs.value.filter(job => job.status === 'done').length)
const failedCount = computed(() => jobs.value.filter(job => job.status === 'error').length)
const isBusy = computed(() => jobs.value.some(job => job.status === 'queued' || job.status === 'uploading' || job.status === 'processing'))

/* ------------------------------------------------------------------ uploads */

let jobSeq = 0

function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || hasAudioExtension(file.name)
}

function addFiles(list: FileList | File[] | null): void {
  if (!list || list.length === 0)
    return

  const next: Job[] = []

  for (const file of Array.from(list)) {
    const duplicate = jobs.value.some(job => job.name === file.name && job.size === file.size)
    if (duplicate)
      continue

    const base: Omit<Job, 'status' | 'progress' | 'message' | 'song' | 'needsMetadata'> = {
      id: `job-${Date.now()}-${jobSeq++}`,
      file,
      name: file.name,
      size: file.size,
    }

    if (!isAudioFile(file)) {
      next.push({
        ...base,
        status: 'error',
        progress: 0,
        message: 'Not an audio file. Use MP3, WAV, M4A, OGG, OPUS, FLAC or AAC.',
        song: null,
        needsMetadata: false,
      })
      continue
    }

    if (file.size === 0) {
      next.push({
        ...base,
        status: 'error',
        progress: 0,
        message: 'That file is empty.',
        song: null,
        needsMetadata: false,
      })
      continue
    }

    if (file.size > maxBytes.value) {
      next.push({
        ...base,
        status: 'error',
        progress: 0,
        message: `Larger than the ${maxLabel.value} limit (${formatBytes(file.size)}).`,
        song: null,
        needsMetadata: false,
      })
      continue
    }

    next.push({ ...base, status: 'queued', progress: 0, message: null, song: null, needsMetadata: false })
  }

  if (next.length === 0)
    return

  jobs.value = [...jobs.value, ...next]
  void processQueue()
}

/** Uploads one file at a time: predictable progress and no burst of requests. */
async function processQueue(): Promise<void> {
  if (running.value)
    return
  running.value = true

  try {
    while (true) {
      const job = jobs.value.find(candidate => candidate.status === 'queued')
      if (!job)
        break
      await runJob(job)
    }
  }
  finally {
    running.value = false
  }
}

async function runJob(job: Job): Promise<void> {
  const controller = new AbortController()
  controllers.set(job.id, controller)

  const body = new FormData()
  body.append('file', job.file, job.name)

  job.status = 'uploading'
  job.progress = 0
  job.message = null

  try {
    const result = await uploadFile<UploadResultDTO>(
      `/api/rooms/${encodeURIComponent(props.roomCode)}/songs/upload`,
      body,
      {
        signal: controller.signal,
        onProgress: (progress) => {
          job.progress = progress.percent
          if (progress.percent >= 100)
            job.status = 'processing'
        },
      },
    )

    job.song = result.song
    job.needsMetadata = result.needsMetadata
    job.status = 'done'
    job.progress = 100
    emit('added', [result.song])
  }
  catch (failure) {
    const parsed = parseApiError(failure)
    job.status = 'error'
    job.message = parsed.code === 'ABORTED' ? 'Cancelled.' : parsed.message
  }
  finally {
    controllers.delete(job.id)
  }
}

function cancelJob(job: Job): void {
  if (job.status === 'queued') {
    job.status = 'error'
    job.message = 'Cancelled.'
    return
  }
  controllers.get(job.id)?.abort()
}

function clearFinished(): void {
  jobs.value = jobs.value.filter(job => job.status === 'queued' || job.status === 'uploading' || job.status === 'processing')
}

function reset(): void {
  for (const controller of controllers.values())
    controller.abort()
  controllers.clear()
  jobs.value = []
  url.value = ''
  urlTitle.value = ''
  urlArtist.value = ''
  urlAlbum.value = ''
  urlError.value = null
  showUrlDetails.value = false
  pendingLinkReview.value = null
  running.value = false
}

/* ------------------------------------------------------------- add by link */

const url = ref('')
const urlTitle = ref('')
const urlArtist = ref('')
const urlAlbum = ref('')
const urlBusy = ref(false)
const urlError = ref<string | null>(null)
const showUrlDetails = ref(false)
/** A link with no readable tags needs the same review step as an upload. */
const pendingLinkReview = ref<SongDTO | null>(null)

async function addFromUrl(): Promise<void> {
  if (urlBusy.value)
    return

  const target = url.value.trim()
  if (target.length === 0) {
    urlError.value = 'Paste a direct link to an audio file.'
    return
  }

  urlBusy.value = true
  urlError.value = null

  try {
    const result = await api.post<UploadResultDTO>(`/api/rooms/${encodeURIComponent(props.roomCode)}/songs`, {
      url: target,
      title: urlTitle.value.trim() || undefined,
      artist: urlArtist.value.trim() || undefined,
      album: urlAlbum.value.trim() || undefined,
    })

    emit('added', [result.song])
    url.value = ''
    urlTitle.value = ''
    urlArtist.value = ''
    urlAlbum.value = ''
    showUrlDetails.value = false

    if (result.needsMetadata) {
      pendingLinkReview.value = result.song
    }
    else {
      api.success('Song added', `“${result.song.title}” is in the room.`)
    }
  }
  catch (failure) {
    const parsed = api.notify(failure)
    urlError.value = parsed.message
  }
  finally {
    urlBusy.value = false
  }
}

function reviewSong(song: SongDTO): void {
  emit('review', song)
}

/* --------------------------------------------------------------- drop zone */

let dragDepth = 0

function onDragEnter(event: DragEvent): void {
  if (!hasFiles(event))
    return
  dragDepth += 1
  dragging.value = true
}

function onDragLeave(): void {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0)
    dragging.value = false
}

function onDrop(event: DragEvent): void {
  dragDepth = 0
  dragging.value = false
  if (!hasFiles(event))
    return
  event.preventDefault()
  addFiles(event.dataTransfer?.files ?? null)
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function onPicked(event: Event): void {
  const input = event.target as HTMLInputElement
  addFiles(input.files)
  input.value = ''
}

/* -------------------------------------------------------------------- misc */

function statusLabel(job: Job): string {
  switch (job.status) {
    case 'queued':
      return 'Waiting…'
    case 'uploading':
      return `Uploading · ${job.progress}%`
    case 'processing':
      return 'Reading tags…'
    case 'done':
      return job.song ? `Added as “${job.song.title}”` : 'Added'
    default:
      return job.message ?? 'Failed'
  }
}

function jobIcon(job: Job): string {
  switch (job.status) {
    case 'done':
      return 'i-lucide-check'
    case 'error':
      return 'i-lucide-triangle-alert'
    case 'processing':
      return 'i-lucide-audio-lines'
    default:
      return 'i-lucide-file-audio'
  }
}

function tryClose(): void {
  if (isBusy.value) {
    for (const job of jobs.value)
      cancelJob(job)
  }
  open.value = false
}

watch(open, (value) => {
  if (!value)
    reset()
})

onBeforeUnmount(() => {
  for (const controller of controllers.values())
    controller.abort()
  controllers.clear()
})
</script>

<template>
  <UModal
    v-model:open="open"
    title="Add music"
    :dismissible="!isBusy"
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <UTabs
        v-model="tab"
        :items="[
          { label: 'Upload files', value: 'upload', icon: 'i-lucide-upload' },
          { label: 'Add a link', value: 'link', icon: 'i-lucide-link' },
        ]"
        variant="pill"
        size="sm"
        class="mb-5"
      >
        <template #content>
          <!-- ------------------------------------------------------- upload -->
          <div v-if="tab === 'upload'" class="space-y-4">
            <div
              role="button"
              tabindex="0"
              class="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-9 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
              :class="dragging ? 'border-brand-400 bg-brand-400/[0.07]' : 'border-hairline bg-raised/40 hover:border-hairline-soft hover:bg-raised/70'"
              @click="fileInput?.click()"
              @keydown.enter.prevent="fileInput?.click()"
              @keydown.space.prevent="fileInput?.click()"
              @dragenter.prevent="onDragEnter"
              @dragover.prevent
              @dragleave.prevent="onDragLeave"
              @drop.prevent="onDrop"
            >
              <UIcon
                name="i-lucide-cloud-upload"
                class="size-7 transition-colors"
                :class="dragging ? 'text-brand-400' : 'text-ash'"
              />
              <p class="mt-3 text-sm font-medium text-chalk">
                {{ dragging ? 'Drop to add' : 'Drop audio files here' }}
              </p>
              <p class="mt-1 text-xs text-ash">
                or click to browse · MP3, WAV, M4A, OGG, FLAC · up to {{ maxLabel }} each
              </p>
            </div>

            <input
              ref="fileInput"
              type="file"
              :accept="AUDIO_ACCEPT"
              multiple
              class="hidden"
              @change="onPicked"
            >

            <ul v-if="jobs.length > 0" class="space-y-1.5">
              <li
                v-for="job in jobs"
                :key="job.id"
                class="rounded-xl border border-hairline bg-raised/40 p-3"
              >
                <div class="flex items-center gap-3">
                  <span
                    class="grid size-9 shrink-0 place-items-center rounded-lg bg-ink-950"
                    :class="job.status === 'error' ? 'text-error' : job.status === 'done' ? 'text-success' : 'text-mist'"
                  >
                    <UIcon :name="jobIcon(job)" class="size-4" />
                  </span>

                  <div class="min-w-0 flex-1">
                    <p class="truncate text-[13px] font-medium text-chalk">{{ job.name }}</p>
                    <p
                      class="truncate text-[11.5px]"
                      :class="job.status === 'error' ? 'text-error' : 'text-ash'"
                    >
                      {{ statusLabel(job) }}
                    </p>
                  </div>

                  <span class="shrink-0 text-[11px] tabular-nums text-ash">
                    {{ formatBytes(job.size) }}
                  </span>

                  <UButton
                    v-if="job.status === 'queued' || job.status === 'uploading' || job.status === 'processing'"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    square
                    icon="i-lucide-x"
                    :aria-label="`Cancel ${job.name}`"
                    @click="cancelJob(job)"
                  />
                  <UButton
                    v-else-if="job.needsMetadata && job.song"
                    color="warning"
                    variant="soft"
                    size="xs"
                    label="Details"
                    @click="reviewSong(job.song!)"
                  />
                </div>

                <div
                  v-if="job.status === 'uploading' || job.status === 'processing'"
                  class="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-hairline"
                  role="progressbar"
                  :aria-valuenow="job.progress"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  :aria-label="`Uploading ${job.name}`"
                >
                  <div
                    class="h-full rounded-full bg-brand-400 transition-[width] duration-200 ease-out"
                    :class="job.status === 'processing' ? 'animate-pulse' : ''"
                    :style="{ width: `${Math.max(job.progress, job.status === 'processing' ? 100 : 4)}%` }"
                  />
                </div>
              </li>
            </ul>

            <div
              v-if="pendingReview.length > 0"
              class="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/[0.07] p-3"
            >
              <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0 text-warning" />
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-medium text-chalk">
                  We could not read tags in {{ pendingReview.length }}
                  {{ pendingReview.length === 1 ? 'file' : 'files' }}
                </p>
                <p class="mt-0.5 text-xs leading-relaxed text-mist">
                  Add the title and artist so the song is easy to find in the room.
                </p>
              </div>
              <UButton
                color="warning"
                variant="soft"
                size="sm"
                label="Fix details"
                class="shrink-0"
                @click="reviewSong(pendingReview[0]!.song!)"
              />
            </div>
          </div>

          <!-- ---------------------------------------------------------- link -->
          <div v-else class="space-y-4">
            <div class="space-y-1.5">
              <UFormField
                label="Direct audio link"
                :error="urlError ?? undefined"
                name="song-url"
                help="Must point straight at an audio file (MP3, WAV, M4A, OGG, FLAC) on a public server."
              >
                <UInput
                  id="song-url"
                  v-model="url"
                  size="lg"
                  type="url"
                  inputmode="url"
                  placeholder="https://example.com/track.mp3"
                  autocomplete="off"
                  spellcheck="false"
                  class="w-full"
                  @input="urlError = null"
                />
              </UFormField>
            </div>

            <div v-if="pendingLinkReview" class="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/[0.07] p-3">
              <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0 text-warning" />
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-medium text-chalk">Added, but we could not read its tags</p>
                <p class="mt-0.5 text-xs leading-relaxed text-mist">
                  Give it a title and artist so people can find it.
                </p>
              </div>
              <UButton
                color="warning"
                variant="soft"
                size="sm"
                label="Fix details"
                class="shrink-0"
                @click="reviewSong(pendingLinkReview)"
              />
            </div>

            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              :label="showUrlDetails ? 'Hide details' : 'Add details (optional)'"
              :icon="showUrlDetails ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="-ms-2"
              @click="showUrlDetails = !showUrlDetails"
            />

            <div v-if="showUrlDetails" class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Title" name="url-title">
                <UInput id="url-title" v-model="urlTitle" size="lg" maxlength="120" placeholder="Song title" class="w-full" />
              </UFormField>
              <UFormField label="Artist" name="url-artist">
                <UInput id="url-artist" v-model="urlArtist" size="lg" maxlength="120" placeholder="Artist name" class="w-full" />
              </UFormField>
              <UFormField label="Album" name="url-album" class="sm:col-span-2">
                <UInput id="url-album" v-model="urlAlbum" size="lg" maxlength="120" placeholder="Album (optional)" class="w-full" />
              </UFormField>
            </div>

            <p class="text-xs leading-relaxed text-ash">
              Streaming links (YouTube, SoundCloud, Spotify) cannot be played here — the file is
              fetched once and stored in the room.
            </p>
          </div>
        </template>
      </UTabs>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <p class="min-w-0 truncate text-xs text-ash">
          <template v-if="doneCount > 0">
            {{ doneCount }} added{{ failedCount > 0 ? ` · ${failedCount} failed` : '' }}
          </template>
          <template v-else-if="urlBusy">
            Fetching the file…
          </template>
          <template v-else>
            Everyone in the room can play what you add.
          </template>
        </p>

        <div class="flex shrink-0 items-center gap-2">
          <UButton
            v-if="jobs.length > 0"
            color="neutral"
            variant="ghost"
            size="sm"
            label="Clear"
            :disabled="isBusy"
            @click="clearFinished"
          />
          <UButton
            v-if="tab === 'link'"
            color="primary"
            size="sm"
            label="Add song"
            icon="i-lucide-plus"
            :loading="urlBusy"
            :disabled="url.trim().length === 0"
            @click="addFromUrl"
          />
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            :label="isBusy ? 'Cancel uploads' : doneCount > 0 ? 'Done' : 'Close'"
            @click="tryClose"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
