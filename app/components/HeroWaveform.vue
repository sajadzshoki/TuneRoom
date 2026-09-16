<script setup lang="ts">
/**
 * Decorative waveform for the landing page.
 * Heights are computed from a fixed formula, so the server render and the client
 * render are byte-identical (no hydration mismatch, no layout shift).
 */
const bars = Array.from({ length: 48 }, (_, index) => {
  const t = index / 47
  const shape = Math.abs(Math.sin(t * Math.PI * 1.6)) ** 0.7
  const detail = Math.abs(Math.sin(t * 23.7)) * 0.35 + Math.abs(Math.sin(t * 9.1)) * 0.25
  return Math.round(8 + (shape * 0.72 + detail * 0.5) * 88)
})
</script>

<template>
  <div class="flex h-20 w-full items-end gap-[3px] sm:h-24" aria-hidden="true">
    <span
      v-for="(height, index) in bars"
      :key="index"
      class="w-full min-w-[2px] flex-1 rounded-full bg-gradient-to-t from-brand-400/5 to-brand-400/60"
      :style="{ height: `${height}%` }"
    />
  </div>
</template>
