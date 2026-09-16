<script setup lang="ts">
/**
 * Owns the single `<audio>` element for the whole app.
 * Renderless: it lives in `app.vue`, so navigating never remounts it and the
 * track keeps playing.
 */
const player = usePlayer()
const element = ref<HTMLAudioElement | null>(null)

onMounted(() => {
  if (element.value)
    player.attach(element.value)
})

onBeforeUnmount(() => player.detach())

/** Space toggles playback when nothing focusable is targeted. */
function onKeydown(event: KeyboardEvent) {
  if (event.code !== 'Space' || event.metaKey || event.ctrlKey || event.altKey)
    return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, button, a, [contenteditable="true"], [role="slider"]'))
    return
  if (!player.hasTrack.value)
    return
  event.preventDefault()
  player.toggle()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <audio ref="element" class="hidden" preload="metadata" />
</template>
