<script setup lang="ts">
const route = useRoute()

useSeoMeta({
  title: 'Join a room · TuneRoom',
  description: 'Enter a room code to join a shared music room.',
})

/** Deep links like /join?code=K7P9Q2 prefill the field. */
const preset = typeof route.query.code === 'string' ? route.query.code.slice(0, 64) : ''
</script>

<template>
  <div class="flex flex-1 flex-col">
    <AppHeader />

    <main class="mx-auto w-full max-w-lg flex-1 px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      <JoinRoomForm :initial-code="preset" />
    </main>
  </div>
</template>
