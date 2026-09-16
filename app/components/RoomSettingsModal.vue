<script setup lang="ts">
import type { RoomDTO } from '#shared/types'

/** Owner-only room settings: rename and re-describe. Deleting lives in the menu. */
const props = defineProps<{ room: RoomDTO }>()
const open = defineModel<boolean>('open', { default: false })

const api = useApi()
const router = useRouter()
const roomState = useRoom()

const name = ref('')
const description = ref('')
const busy = ref(false)
const fieldErrors = ref<Record<string, string>>({})

const descriptionLimit = 280

watch(open, (value) => {
  if (!value)
    return
  name.value = props.room.name
  description.value = props.room.description ?? ''
  fieldErrors.value = {}
})

async function save(): Promise<void> {
  if (busy.value)
    return

  const nextName = name.value.trim()
  if (nextName.length < 2) {
    fieldErrors.value = { name: 'Room names need at least 2 characters.' }
    return
  }

  busy.value = true
  fieldErrors.value = {}

  try {
    const result = await api.patch<{ room: RoomDTO }>(
      `/api/rooms/${encodeURIComponent(props.room.code)}`,
      {
        name: nextName,
        description: description.value.trim() || null,
      },
    )

    roomState.setRoom(result.room)
    api.success('Room updated')

    // Renaming can change the slug; keep the address bar canonical.
    if (result.room.slug !== props.room.slug) {
      await router.replace(`/room/${encodeURIComponent(result.room.slug)}`)
    }

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
    title="Room settings"
    description="Only the room owner can change these."
    :ui="{ content: 'max-w-md' }"
  >
    <template #body>
      <form class="space-y-5" @submit.prevent="save">
        <UFormField label="Room name" :error="fieldErrors.name" name="settings-name" required>
          <UInput
            id="settings-name"
            v-model="name"
            size="lg"
            maxlength="60"
            class="w-full"
            autofocus
          />
        </UFormField>

        <UFormField
          label="Description"
          :error="fieldErrors.description"
          name="settings-description"
          :hint="`${description.length}/${descriptionLimit}`"
        >
          <UTextarea
            id="settings-description"
            v-model="description"
            :rows="3"
            :maxlength="descriptionLimit"
            placeholder="What is this room for?"
            class="w-full resize-none"
          />
        </UFormField>

        <div class="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-raised/40 px-3 py-2.5">
          <div class="min-w-0">
            <p class="text-[11px] font-medium uppercase tracking-[0.14em] text-ash">Room code</p>
            <p class="numeric mt-0.5 font-mono text-sm tracking-[0.2em] text-chalk">{{ room.code }}</p>
          </div>
          <p class="max-w-[10rem] text-end text-[11px] leading-relaxed text-ash">
            The code and link never change.
          </p>
        </div>
      </form>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
        <UButton label="Save changes" color="primary" :loading="busy" @click="save" />
      </div>
    </template>
  </UModal>
</template>
