<script setup lang="ts">
import type { SongDTO } from '#shared/types'

/** Desktop library layout: a responsive grid of cover cards. */
defineProps<{ songs: SongDTO[] }>()

const emit = defineEmits<{ edit: [song: SongDTO], delete: [song: SongDTO] }>()
</script>

<template>
  <div
    class="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
  >
    <SongCard
      v-for="song in songs"
      :key="song.id"
      :song="song"
      variant="grid"
      @edit="emit('edit', $event)"
      @delete="emit('delete', $event)"
    />
  </div>
</template>
