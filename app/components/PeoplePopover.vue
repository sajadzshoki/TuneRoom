<script setup lang="ts">
import type { MemberDTO, SongDTO } from '#shared/types'

/** Room presence: who is here, who is away, and how much music they added. */
const props = defineProps<{ members: MemberDTO[], songs?: SongDTO[] }>()

const onlineNow = computed(() => props.members.filter(member => member.online).length)

const songCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  for (const song of props.songs ?? [])
    counts[song.uploader.id] = (counts[song.uploader.id] ?? 0) + 1
  return counts
})

const sorted = computed(() =>
  [...props.members].sort((a, b) => {
    if (a.online !== b.online)
      return a.online ? -1 : 1
    if (a.isOwner !== b.isOwner)
      return a.isOwner ? -1 : 1
    return a.joinedAt.localeCompare(b.joinedAt)
  }),
)

function statusText(member: MemberDTO): string {
  if (member.online)
    return member.isOwner ? 'Owner · here now' : 'Here now'

  const seen = Date.parse(member.lastSeenAt)
  if (Number.isNaN(seen))
    return 'Away'

  const minutes = Math.max(1, Math.round((Date.now() - seen) / 60_000))
  if (minutes < 60)
    return `Away · ${minutes}m ago`
  if (minutes < 60 * 24)
    return `Away · ${Math.round(minutes / 60)}h ago`
  return `Away · ${Math.round(minutes / (60 * 24))}d ago`
}
</script>

<template>
  <UPopover :ui="{ content: 'w-80 rounded-xl' }">
    <UButton
      color="neutral"
      variant="ghost"
      size="sm"
      class="gap-2 px-2"
      :aria-label="`${onlineNow} of ${members.length} people online`"
    >
      <AvatarStack :members="members" :max="3" :size="22" />
      <span class="flex items-center gap-1.5 text-[13px] font-medium text-mist">
        <span class="relative flex size-1.5">
          <span
            v-if="onlineNow > 0"
            class="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-60"
          />
          <span
            class="relative inline-flex size-1.5 rounded-full"
            :class="onlineNow > 0 ? 'bg-brand-400' : 'bg-ash'"
          />
        </span>
        <span class="tabular-nums">{{ onlineNow }}</span>
      </span>
    </UButton>

    <template #content>
      <div class="p-3">
        <div class="mb-2 flex items-baseline justify-between px-1">
          <p class="text-sm font-medium text-chalk">In this room</p>
          <span class="text-xs text-ash">{{ members.length }} total</span>
        </div>

        <UScrollArea class="max-h-[19rem]">
          <ul class="space-y-0.5">
            <li
              v-for="member in sorted"
              :key="member.id"
              class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-raised"
            >
              <span class="relative shrink-0">
                <PersonAvatar :name="member.name" :avatar="member.avatar" :size="30" />
                <span
                  class="absolute -end-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-ink-950"
                  :class="member.online ? 'bg-brand-400' : 'bg-ash/70'"
                />
              </span>

              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-1.5">
                  <span class="truncate text-[13px] font-medium text-chalk">{{ member.name }}</span>
                  <span
                    v-if="member.isYou"
                    class="shrink-0 rounded bg-brand-400/15 px-1 py-px text-[10px] font-medium uppercase tracking-wide text-brand-300"
                  >You</span>
                </span>
                <span class="block text-[11.5px] text-ash">{{ statusText(member) }}</span>
              </span>

              <span class="shrink-0 text-[11.5px] tabular-nums text-ash">
                {{ songCounts[member.id] ?? 0 }}
              </span>
            </li>
          </ul>
        </UScrollArea>
      </div>
    </template>
  </UPopover>
</template>
