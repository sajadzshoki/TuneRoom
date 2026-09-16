<script setup lang="ts">
import type { RoomDTO } from '#shared/types'

/** Everything a guest needs to invite someone: link, code, QR, native share. */
const props = defineProps<{ room: RoomDTO }>()
const open = defineModel<boolean>('open', { default: false })

const requestUrl = useRequestURL()
const origin = import.meta.client ? window.location.origin : requestUrl.origin
const shareUrl = computed(() => `${origin}/room/${props.room.slug}`)
const qrUrl = computed(() => `/api/rooms/${props.room.code}/qr`)

const copied = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

onBeforeUnmount(() => clearTimeout(copiedTimer))

function flash(key: string): void {
  copied.value = key
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => (copied.value = null), 1600)
}

async function copy(key: string, value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    flash(key)
  }
  catch {
    // Clipboard is blocked in some contexts — the values stay selectable so the
    // user can copy manually rather than silently failing.
    flash(`${key}:failed`)
  }
}

const canNativeShare = computed(
  () => import.meta.client && typeof navigator.share === 'function',
)

async function nativeShare(): Promise<void> {
  try {
    await navigator.share({
      title: props.room.name,
      text: `Join “${props.room.name}” on TuneRoom and add some music.`,
      url: shareUrl.value,
    })
  }
  catch {
    // The user dismissed the share sheet; nothing to report.
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Share this room"
    description="Anyone with the link can join and add music."
    :ui="{ content: 'max-w-md' }"
  >
    <template #body>
      <div class="space-y-5">
        <div class="space-y-1.5">
          <p class="text-xs font-medium text-mist">Room link</p>
          <div class="flex items-stretch gap-2">
            <UInput
              :model-value="shareUrl"
              readonly
              size="lg"
              class="flex-1"
              :ui="{ base: 'font-mono text-[12.5px]' }"
            />
            <UButton
              size="lg"
              :color="copied === 'link' ? 'success' : 'neutral'"
              :variant="copied === 'link' ? 'soft' : 'outline'"
              :icon="copied === 'link' ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="copied === 'link' ? 'Copied' : 'Copy'"
              @click="copy('link', shareUrl)"
            />
          </div>
          <p v-if="copied === 'link:failed'" class="text-xs text-error">
            Your browser blocked the clipboard — select the link above to copy it.
          </p>
        </div>

        <div class="space-y-1.5">
          <p class="text-xs font-medium text-mist">Room code</p>
          <div class="flex items-stretch gap-2">
            <div
              class="flex flex-1 items-center rounded-lg border border-hairline bg-raised px-4 font-mono text-lg font-medium tracking-[0.3em] text-chalk"
            >
              {{ room.code }}
            </div>
            <UButton
              size="lg"
              :color="copied === 'code' ? 'success' : 'neutral'"
              :variant="copied === 'code' ? 'soft' : 'outline'"
              :icon="copied === 'code' ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="copied === 'code' ? 'Copied' : 'Copy'"
              @click="copy('code', room.code)"
            />
          </div>
        </div>

        <div class="flex items-center gap-5 rounded-xl border border-hairline bg-raised/50 p-4">
          <img
            :src="qrUrl"
            alt="QR code linking to this room"
            class="size-24 shrink-0 rounded-lg bg-white p-1.5"
            width="96"
            height="96"
            loading="lazy"
          >
          <p class="text-[13px] leading-relaxed text-mist">
            Point a phone camera here to open the room. The code never expires.
          </p>
        </div>

        <UButton
          v-if="canNativeShare"
          block
          size="lg"
          color="primary"
          variant="soft"
          icon="i-lucide-share-2"
          label="Share with…"
          class="font-medium"
          @click="nativeShare"
        />
      </div>
    </template>
  </UModal>
</template>
