<script setup lang="ts">
/** The three ways a library can be empty — each says something different. */
const props = withDefaults(
  defineProps<{
    variant?: 'empty' | 'no-results' | 'no-favorites'
    query?: string
    canAdd?: boolean
  }>(),
  { variant: 'empty', query: '', canAdd: true },
)

const emit = defineEmits<{ add: [], clear: [] }>()

const copy = computed(() => {
  switch (props.variant) {
    case 'no-results':
      return {
        title: 'No music found.',
        body: `Nothing in this room matches “${props.query}”.`,
      }
    case 'no-favorites':
      return {
        title: 'Your favorites will appear here.',
        body: 'Tap the heart on any song and it is kept here for you.',
      }
    default:
      return {
        title: 'This room is quiet.',
        body: 'Add the first song — upload a file or paste a link.',
      }
  }
})
</script>

<template>
  <div class="flex flex-col items-center justify-center px-6 py-20 text-center sm:py-28">
    <span
      class="mb-6 grid size-16 place-items-center rounded-2xl border border-hairline bg-surface"
      aria-hidden="true"
    >
      <UIcon name="i-lucide-audio-lines" class="size-7 text-ash" />
    </span>

    <h3 class="text-lg font-semibold tracking-tight text-chalk">{{ copy.title }}</h3>
    <p class="mt-1.5 max-w-sm text-sm leading-relaxed text-mist">{{ copy.body }}</p>

    <div class="mt-6 flex flex-wrap items-center justify-center gap-2">
      <UButton
        v-if="variant === 'empty' && canAdd"
        color="primary"
        size="lg"
        icon="i-lucide-plus"
        label="Add music"
        class="px-5 font-medium"
        @click="emit('add')"
      />
      <UButton
        v-else-if="variant !== 'empty'"
        color="neutral"
        variant="outline"
        size="lg"
        icon="i-lucide-x"
        label="Clear filters"
        class="px-5 font-medium"
        @click="emit('clear')"
      />
    </div>
  </div>
</template>
