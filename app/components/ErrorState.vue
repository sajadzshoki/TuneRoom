<script setup lang="ts">
/**
 * Shared "this is not here / this broke" panel, used by the 404 catch-all route
 * and by `error.vue`, so a bad address and a failed render look the same.
 */
withDefaults(
  defineProps<{
    /** Small label above the title, e.g. `404`. */
    status?: string
    title: string
    message: string
    icon?: string
    tone?: 'brand' | 'error'
  }>(),
  { status: undefined, icon: 'i-lucide-compass', tone: 'brand' },
)
</script>

<template>
  <div class="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:py-24">
    <span
      class="grid size-14 place-items-center rounded-2xl border border-hairline bg-raised"
      aria-hidden="true"
    >
      <UIcon :name="icon" class="size-6" :class="tone === 'error' ? 'text-error' : 'text-brand-400'" />
    </span>

    <p
      v-if="status"
      class="numeric mt-7 text-[11px] font-semibold uppercase tracking-[0.2em] text-ash"
    >
      {{ status }}
    </p>

    <h1 class="mt-3 text-2xl font-semibold tracking-tight text-chalk sm:text-3xl">
      {{ title }}
    </h1>

    <p class="mt-3 max-w-md text-sm leading-relaxed text-mist" dir="auto">
      {{ message }}
    </p>

    <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
      <slot name="actions">
        <UButton
          to="/"
          size="lg"
          color="primary"
          variant="solid"
          label="Back to TuneRoom"
          icon="i-lucide-home"
        />
      </slot>
    </div>
  </div>
</template>
