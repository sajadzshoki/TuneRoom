<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { MemberDTO, RoomDTO, SongDTO } from '#shared/types'

/** Slim sticky bar: where you are, who is here, and the room actions. */
const props = defineProps<{
  room: RoomDTO
  members: MemberDTO[]
  songs: SongDTO[]
  isOwner: boolean
}>()

const emit = defineEmits<{ share: [], settings: [] }>()

const api = useApi()
const { guest } = useIdentity()
const router = useRouter()

const identityOpen = ref(false)
const confirmDelete = ref(false)
const deleting = ref(false)

const shareUrl = computed(() => {
  const origin = import.meta.client
    ? window.location.origin
    : useRequestURL().origin
  return `${origin}/room/${props.room.slug}`
})

async function copyInviteLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    api.success('Invite link copied', shareUrl.value)
  }
  catch {
    api.notify({
      status: 400,
      code: 'CLIPBOARD_BLOCKED',
      message: 'Your browser blocked the clipboard. Use Share to copy the link.',
    })
  }
}

async function deleteRoom(): Promise<void> {
  if (deleting.value)
    return
  deleting.value = true
  try {
    await api.delete(`/api/rooms/${props.room.code}`)
    confirmDelete.value = false
    usePlayer().forgetRoom()
    api.success('Room deleted', `“${props.room.name}” and its music were removed.`)
    await router.push('/')
  }
  catch (failure) {
    api.notify(failure)
  }
  finally {
    deleting.value = false
  }
}

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const groups: DropdownMenuItem[][] = [
    [
      { label: 'Share room', icon: 'i-lucide-share-2', onSelect: () => emit('share') },
      { label: 'Copy invite link', icon: 'i-lucide-link', onSelect: () => copyInviteLink() },
    ],
  ]

  if (guest.value) {
    groups.push([
      {
        label: 'Edit your name',
        icon: 'i-lucide-user-pen',
        onSelect: () => (identityOpen.value = true),
      },
    ])
  }

  if (props.isOwner) {
    groups.push([
      { label: 'Room settings', icon: 'i-lucide-settings-2', onSelect: () => emit('settings') },
    ])
    groups.push([
      {
        label: 'Delete room',
        icon: 'i-lucide-trash',
        color: 'error',
        onSelect: () => (confirmDelete.value = true),
      },
    ])
  }

  return groups
})
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-hairline bg-base">
    <div class="mx-auto w-full max-w-[1400px] px-4 sm:px-6">
      <div class="flex h-14 items-center gap-2 sm:gap-3">
        <NuxtLink
          to="/"
          class="flex shrink-0 items-center rounded-lg p-1 transition-colors hover:bg-raised"
          aria-label="TuneRoom home"
        >
          <LogoMark :size="22" />
        </NuxtLink>

        <span class="hidden h-4 w-px shrink-0 bg-hairline sm:block" />

        <div class="min-w-0 flex-1">
          <p class="truncate text-[15px] font-semibold tracking-tight text-chalk" dir="auto">
            {{ room.name }}
          </p>
        </div>

        <PeoplePopover :members="members" :songs="songs" />

        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          square
          icon="i-lucide-share-2"
          aria-label="Share this room"
          class="hidden sm:inline-flex"
          @click="emit('share')"
        />

        <UButton
          to="/create"
          color="neutral"
          variant="ghost"
          size="sm"
          label="New room"
          class="hidden lg:inline-flex"
        />

        <UDropdownMenu :items="menuItems" :content="{ align: 'end' }" :ui="{ content: 'w-56' }">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            square
            icon="i-lucide-ellipsis"
            aria-label="Room menu"
          />
        </UDropdownMenu>
      </div>
    </div>
  </header>

  <IdentityDialog
    v-model:open="identityOpen"
    title="Edit your name"
    description="This updates how you appear in every room."
    confirm-label="Save"
  />

  <UModal
    v-model:open="confirmDelete"
    title="Delete this room?"
    description="This removes the room, every song in it, and all uploaded files. It cannot be undone."
    :ui="{ content: 'max-w-md' }"
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="confirmDelete = false"
        />
        <UButton
          label="Delete room"
          color="error"
          :loading="deleting"
          icon="i-lucide-trash"
          @click="deleteRoom"
        />
      </div>
    </template>
  </UModal>
</template>
