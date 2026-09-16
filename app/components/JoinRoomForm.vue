<script setup lang="ts">
import type { RoomDTO } from '#shared/types'

/** Join by code — or paste a full room link and it still resolves. */
const props = defineProps<{ initialCode?: string }>()
const api = useApi()
const code = ref(props.initialCode ?? '')
const busy = ref(false)
const error = ref<string | null>(null)

/** Pulls a room reference out of a pasted URL like https://tuneroom.app/room/K7P9Q2 */
function normaliseRef(raw: string): string {
  const value = raw.trim()
  const match = value.match(/\/room\/([^/?#]+)/i)
  return match ? decodeURIComponent(match[1]!) : value
}

async function submit(): Promise<void> {
  if (busy.value)
    return

  const roomRef = normaliseRef(code.value)
  if (roomRef.length === 0) {
    error.value = 'Enter a room code.'
    return
  }

  busy.value = true
  error.value = null

  try {
    const result = await api.get<{ room: RoomDTO }>(`/api/rooms/${encodeURIComponent(roomRef)}`)
    await navigateTo(`/room/${encodeURIComponent(result.room.slug)}`)
  }
  catch (failure) {
    const parsed = api.notify(failure)
    error.value
      = parsed.status === 404
        ? 'We could not find a room with that code.'
        : parsed.message
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <form
    class="rounded-2xl border border-hairline bg-surface p-5 sm:p-7"
    novalidate
    @submit.prevent="submit"
  >
    <h2 class="text-xl font-semibold tracking-tight text-chalk">Join a room</h2>
    <p class="mt-1.5 text-sm leading-relaxed text-mist">
      Enter the 6-character code your friend shared, or paste the full link.
    </p>

    <UFormField label="Room code" :error="error ?? undefined" name="code" class="mt-7 block">
      <div class="flex gap-2">
        <UInput
          id="code"
          v-model="code"
          size="xl"
          placeholder="K7P9Q2"
          maxlength="64"
          autocomplete="off"
          spellcheck="false"
          class="flex-1 font-mono uppercase"
          @input="error = null"
        />
        <UButton
          type="submit"
          size="xl"
          color="primary"
          label="Join"
          :loading="busy"
          class="px-6 font-medium"
        />
      </div>
    </UFormField>

    <p class="mt-4 text-xs text-ash">
      No account needed — you will pick a name and an avatar when you enter.
    </p>
  </form>
</template>
