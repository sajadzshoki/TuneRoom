<script setup lang="ts">
import type { MemberDTO } from '#shared/types'

/** Overlapping avatar stack used in the room header and the join overlay. */
const props = withDefaults(
  defineProps<{
    members: MemberDTO[]
    max?: number
    size?: number
  }>(),
  { max: 3, size: 24 },
)

const shown = computed(() => props.members.slice(0, props.max))
const hidden = computed(() => Math.max(0, props.members.length - shown.value.length))
</script>

<template>
  <span class="flex items-center">
    <span
      v-for="(member, index) in shown"
      :key="member.id"
      class="relative rounded-full ring-2 ring-ink-950"
      :style="{ marginLeft: index === 0 ? 0 : `${-Math.round(size * 0.28)}px`, zIndex: shown.length - index }"
    >
      <PersonAvatar :name="member.name" :avatar="member.avatar" :size="size" />
    </span>
    <span v-if="hidden > 0" class="ms-1.5 text-xs font-medium text-mist">+{{ hidden }}</span>
  </span>
</template>
