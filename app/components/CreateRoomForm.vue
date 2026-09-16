<script setup lang="ts">
import { DEFAULT_AVATAR } from '#shared/avatars'
import type { RoomDTO } from '#shared/types'

/**
 * Create a room. When the visitor has no identity yet, the same form collects
 * their name and avatar first — one step, one button.
 */
const api = useApi()
const { guest, create } = useIdentity()

const personName = ref('')
const personAvatar = ref<string>(DEFAULT_AVATAR)
const roomName = ref('')
const description = ref('')

const busy = ref(false)
const fieldErrors = ref<Record<string, string>>({})
const identityOpen = ref(false)

const descriptionLimit = 280

onMounted(() => {
  personName.value = guest.value?.name ?? ''
  personAvatar.value = guest.value?.avatar ?? DEFAULT_AVATAR
})

async function submit(): Promise<void> {
  if (busy.value)
    return

  fieldErrors.value = {}

  const name = roomName.value.trim()
  if (name.length < 2) {
    fieldErrors.value = { name: 'Room names need at least 2 characters.' }
    return
  }

  if (!guest.value && personName.value.trim().length === 0) {
    fieldErrors.value = { personName: 'Please enter your name.' }
    return
  }

  busy.value = true
  try {
    if (!guest.value)
      await create(personName.value.trim(), personAvatar.value)

    const result = await api.post<{ room: RoomDTO, url: string }>('/api/rooms', {
      name,
      description: description.value.trim() || undefined,
    })

    api.success('Room created', 'Share the link so people can join.')
    await navigateTo(`${result.url}?share=1`)
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
  <form
    class="rounded-2xl border border-hairline bg-surface p-5 sm:p-7"
    novalidate
    @submit.prevent="submit"
  >
    <h2 class="text-xl font-semibold tracking-tight text-chalk">Create a room</h2>
    <p class="mt-1.5 text-sm leading-relaxed text-mist">
      Anyone with the link can join and add music. Nothing else to set up.
    </p>

    <!-- Identity is collected inline the first time, then remembered. -->
    <div v-if="!guest" class="mt-7 space-y-5">
      <UFormField label="Your name" :error="fieldErrors.personName" name="person-name">
        <UInput
          id="person-name"
          v-model="personName"
          size="lg"
          placeholder="e.g. Sajad"
          maxlength="40"
          autocomplete="nickname"
          class="w-full"
        />
      </UFormField>

      <div class="space-y-2.5">
        <p class="text-xs font-medium text-mist">Your avatar</p>
        <AvatarPicker v-model="personAvatar" />
      </div>

      <USeparator />
    </div>

    <button
      v-else
      type="button"
      class="mt-6 flex w-full items-center gap-3 rounded-xl border border-hairline bg-raised/60 p-3 text-start transition hover:border-hairline-soft hover:bg-raised"
      @click="identityOpen = true"
    >
      <PersonAvatar :name="guest.name" :avatar="guest.avatar" :size="34" />
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium text-chalk">{{ guest.name }}</span>
        <span class="block text-xs text-ash">Creating as you · change</span>
      </span>
      <UIcon name="i-lucide-pencil" class="size-4 shrink-0 text-ash" />
    </button>

    <div class="mt-6 space-y-5">
      <UFormField label="Room name" :error="fieldErrors.name" name="room-name" required>
        <UInput
          id="room-name"
          v-model="roomName"
          size="lg"
          placeholder="Our Office"
          maxlength="60"
          class="w-full"
          autofocus
        />
      </UFormField>

      <UFormField
        label="Description"
        :error="fieldErrors.description"
        name="description"
        :hint="`${description.length}/${descriptionLimit}`"
        help="Optional. What is this room for?"
      >
        <UTextarea
          id="description"
          v-model="description"
          :maxlength="descriptionLimit"
          :rows="2"
          placeholder="The songs we play at the studio."
          class="w-full resize-none"
        />
      </UFormField>
    </div>

    <UButton
      type="submit"
      size="lg"
      color="primary"
      block
      class="mt-7 font-medium"
      :loading="busy"
      label="Create room"
      trailing-icon="i-lucide-arrow-right"
    />
  </form>

  <IdentityDialog
    v-model:open="identityOpen"
    title="Change your name"
    description="This updates how you appear in every room."
  />
</template>
