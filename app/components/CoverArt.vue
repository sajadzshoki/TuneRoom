<script setup lang="ts">
import type { SongDTO } from '#shared/types'

/**
 * Song artwork. Falls back to a deterministic generated tile when the track has
 * no embedded cover, or when the stored artwork fails to load.
 */
const props = defineProps<{
  song: Pick<SongDTO, 'id' | 'title' | 'artist' | 'coverUrl'>
}>()

const failed = ref(false)
watch(() => props.song.coverUrl, () => {
  failed.value = false
})

const src = computed(() =>
  props.song.coverUrl && !failed.value
    ? props.song.coverUrl
    : artworkFor(`${props.song.title}·${props.song.artist}`),
)
</script>

<template>
  <img
    :src="src"
    :alt="`Artwork for ${song.title}`"
    loading="lazy"
    class="size-full rounded-[inherit] object-cover select-none"
    draggable="false"
    decoding="async"
    @error="failed = true"
  >
</template>
