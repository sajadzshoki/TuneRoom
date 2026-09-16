<script setup lang="ts">
import type { SongDTO } from '#shared/types'

/** Mobile (and dense desktop) library layout: compact rows. */
defineProps<{ songs: SongDTO[] }>()

const emit = defineEmits<{ edit: [song: SongDTO], delete: [song: SongDTO] }>()
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <SongCard
      v-for="song in songs"
      :key="song.id"
      :song="song"
      variant="row"
      @edit="emit('edit', $event)"
      @delete="emit('delete', $event)"
    />
  </div>
</template>
