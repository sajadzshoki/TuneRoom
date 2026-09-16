<script setup lang="ts">
import { AVATARS, avatarUrl } from '#shared/avatars'

/** Small set of generated avatars — no uploads, no cropping, no friction. */
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function select(key: string) {
  emit('update:modelValue', key)
}
</script>

<template>
  <div
    class="grid grid-cols-6 gap-2 sm:grid-cols-12"
    role="radiogroup"
    aria-label="Choose an avatar"
  >
    <button
      v-for="option in AVATARS"
      :key="option.key"
      type="button"
      role="radio"
      :aria-checked="props.modelValue === option.key"
      :aria-label="option.name"
      :title="option.name"
      class="group relative aspect-square rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-base"
      @click="select(option.key)"
    >
      <img
        :src="avatarUrl(option.key, { radius: 32, size: 96 })"
        :alt="option.name"
        class="size-full rounded-full object-cover transition duration-150 group-hover:brightness-110"
        :class="props.modelValue === option.key
          ? 'ring-2 ring-brand-400 ring-offset-2 ring-offset-base'
          : 'ring-1 ring-hairline group-hover:ring-hairline-soft'"
        loading="lazy"
        decoding="async"
      >
    </button>
  </div>
</template>
