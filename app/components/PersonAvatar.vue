<script setup lang="ts">
/** A person: generated circular avatar from their chosen preset. */
const props = withDefaults(
  defineProps<{
    name: string
    avatar?: string | null
    size?: number
    ring?: boolean
  }>(),
  { size: 32, ring: true, avatar: null },
)

const src = computed(() => avatarFor(props.avatar))
</script>

<template>
  <img
    :src="src"
    :alt="name"
    :title="name"
    :style="{ width: `${size}px`, height: `${size}px` }"
    class="shrink-0 rounded-full object-cover select-none"
    :class="ring ? 'ring-1 ring-hairline/80' : ''"
    loading="lazy"
    decoding="async"
  >
</template>
