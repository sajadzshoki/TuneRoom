<script setup lang="ts">
import { DEFAULT_AVATAR } from '#shared/avatars'

/**
 * The whole onboarding flow: a name and an avatar. Used to create an identity
 * and to change it later — no accounts, no email, no password.
 */
const props = withDefaults(
  defineProps<{
    title?: string
    description?: string
    confirmLabel?: string
  }>(),
  {
    title: 'What’s your name?',
    description: 'This is how the room will show your songs.',
    confirmLabel: 'Save',
  },
)

const open = defineModel<boolean>('open', { default: false })

const { guest, create, update } = useIdentity()
const api = useApi()

const name = ref('')
const avatar = ref<string>(DEFAULT_AVATAR)
const busy = ref(false)
const error = ref<string | null>(null)

watch(open, (value) => {
  if (!value)
    return
  name.value = guest.value?.name ?? ''
  avatar.value = guest.value?.avatar ?? DEFAULT_AVATAR
  error.value = null
})

async function save(): Promise<void> {
  if (busy.value)
    return

  const trimmed = name.value.trim()
  if (trimmed.length === 0) {
    error.value = 'Please enter a name.'
    return
  }

  busy.value = true
  error.value = null

  try {
    if (guest.value)
      await update({ name: trimmed, avatar: avatar.value })
    else
      await create(trimmed, avatar.value)

    open.value = false
  }
  catch (failure) {
    error.value = api.notify(failure).message
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="props.title"
    :description="props.description"
    :ui="{ content: 'max-w-[27rem]' }"
  >
    <template #body>
      <form class="space-y-5" @submit.prevent="save">
        <UFormField label="Name" :error="error ?? undefined" name="name">
          <UInput
            id="name"
            v-model="name"
            size="lg"
            placeholder="e.g. Sajad"
            maxlength="40"
            autocomplete="nickname"
            autofocus
            class="w-full"
            @keydown.enter.prevent="save"
          />
        </UFormField>

        <div class="space-y-2.5">
          <p class="text-xs font-medium text-mist">Avatar</p>
          <AvatarPicker v-model="avatar" />
        </div>
      </form>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton
          v-if="guest"
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="open = false"
        />
        <UButton
          :label="guest ? props.confirmLabel : 'Continue'"
          color="primary"
          :loading="busy"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
