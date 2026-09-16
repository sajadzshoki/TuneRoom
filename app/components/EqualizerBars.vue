<script setup lang="ts">
/**
 * Subtle "now playing" indicator. Callers only render it while audio is
 * actually playing, so the bars always mean "sound is coming out".
 */
</script>

<template>
  <span class="flex h-3.5 items-end gap-[2px]" aria-hidden="true">
    <span
      class="h-full w-[2px] origin-bottom animate-eq-1 rounded-sm bg-current"
    />
    <span
      class="h-full w-[2px] origin-bottom animate-eq-2 rounded-sm bg-current"
    />
    <span
      class="h-full w-[2px] origin-bottom animate-eq-3 rounded-sm bg-current"
    />
  </span>
</template>
