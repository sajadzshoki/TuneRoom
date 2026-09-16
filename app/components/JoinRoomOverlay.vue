<script setup lang="ts">
import { DEFAULT_AVATAR } from '#shared/avatars'
import type { RoomDTO } from '#shared/types'

/**
 * Shown instead of the library when the visitor has not joined the room yet.
 * Joining is a name and an avatar — nothing else, ever.
 */
const props = withDefaults(
  defineProps<{
    /** Public room card; null while it is still being fetched. */
    room: RoomDTO | null
    busy?: boolean
    error?: string | null
  }>(),
  { busy: false, error: null },
)

const emit = defineEmits<{
  (event: 'join', payload: { name: string, avatar: string }): void
}>()

const { guest } = useIdentity()

const name = ref('')
const avatar = ref<string>(DEFAULT_AVATAR)
const nameError = ref<string | null>(null)

function submit(): void {
  if (props.busy)
    return

  if (!guest.value) {
    const trimmed = name.value.trim()
    if (trimmed.length === 0) {
      nameError.value = 'Please enter a name.'
      return
    }
    nameError.value = null
    emit('join', { name: trimmed, avatar: avatar.value })
    return
  }

  emit('join', { name: guest.value.name, avatar: guest.value.avatar })
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
    <div class="animate-fade-up rounded-2xl border border-hairline bg-surface p-6 sm:p-8">
      <div class="flex items-center gap-3">
        <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-400/12 text-brand-400">
          <UIcon name="i-lucide-music" class="size-5" />
        </span>
        <div class="min-w-0">
          <p class="text-[11px] font-medium uppercase tracking-[0.18em] text-ash">
            You are invited
          </p>
          <h1 class="truncate text-lg font-semibold tracking-tight text-chalk" dir="auto">
            {{ room?.name ?? 'This room' }}
          </h1>
        </div>
      </div>

      <p v-if="room?.description" class="mt-4 text-sm leading-relaxed text-mist" dir="auto">
        {{ room.description }}
      </p>

      <p v-if="room" class="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ash">
        <span class="flex items-center gap-1.5">
          <UIcon name="i-lucide-users" class="size-3.5" />
          {{ room.onlineCount }} here now
        </span>
        <span aria-hidden="true">·</span>
        <span class="flex items-center gap-1.5">
          <UIcon name="i-lucide-music" class="size-3.5" />
          {{ pluralize(room.songCount, 'song') }}
        </span>
      </p>

      <USeparator class="my-6" />

      <form class="space-y-5" novalidate @submit.prevent="submit">
        <template v-if="!guest">
          <UFormField label="Your name" :error="nameError ?? error ?? undefined" name="join-name">
            <UInput
              id="join-name"
              v-model="name"
              size="lg"
              placeholder="e.g. Sajad"
              maxlength="40"
              autocomplete="nickname"
              class="w-full"
              autofocus
              @input="nameError = null"
            />
          </UFormField>

          <div class="space-y-2.5">
            <p class="text-xs font-medium text-mist">Pick an avatar</p>
            <AvatarPicker v-model="avatar" />
          </div>
        </template>

        <div v-else class="flex items-center gap-3 rounded-xl border border-hairline bg-raised/50 p-3">
          <PersonAvatar :name="guest.name" :avatar="guest.avatar" :size="36" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-chalk" dir="auto">{{ guest.name }}</p>
            <p class="text-xs text-ash">Joining as you</p>
          </div>
        </div>

        <p v-if="guest && error" class="text-xs text-error" role="alert">{{ error }}</p>

        <UButton
          type="submit"
          size="lg"
          color="primary"
          block
          class="font-medium"
          :loading="busy"
          :label="guest ? 'Enter room' : 'Join room'"
          trailing-icon="i-lucide-arrow-right"
        />
      </form>

      <p class="mt-4 text-center text-[11.5px] leading-relaxed text-ash">
        No account, no password. Your name is stored in this browser only.
      </p>
    </div>
  </div>
</template>
