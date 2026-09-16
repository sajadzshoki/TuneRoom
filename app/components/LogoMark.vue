<script setup lang="ts">
/** The TuneRoom mark: three amber bars on a charcoal tile. */
withDefaults(defineProps<{ size?: number }>(), { size: 28 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    aria-hidden="true"
    class="shrink-0"
  >
    <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="#101014" stroke="#2A2A33" />
    <rect x="9" y="15" width="3" height="8" rx="1.5" fill="#F6B445" />
    <rect x="14.5" y="10" width="3" height="13" rx="1.5" fill="#F6B445" opacity="0.85" />
    <rect x="20" y="13" width="3" height="10" rx="1.5" fill="#F6B445" opacity="0.6" />
  </svg>
</template>
