<script setup lang="ts">
useSeoMeta({
  title: 'Create a room · TuneRoom',
  description: 'Make a shared music room. Share the link, add your music, listen together.',
})
</script>

<template>
  <div class="flex flex-1 flex-col">
    <AppHeader />

    <main class="mx-auto w-full max-w-lg flex-1 px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      <CreateRoomForm />
    </main>
  </div>
</template>
