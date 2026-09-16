<script setup lang="ts">
useSeoMeta({
  title: 'TuneRoom — your group\'s music, in one room',
  description:
    'Create a room, share the link, add your music and listen together. No accounts, no feeds, no setup.',
})
</script>

<template>
  <div class="flex flex-1 flex-col">
    <AppHeader />

    <main class="mx-auto flex w-full max-w-[1100px] flex-1 flex-col justify-center px-4 sm:px-6">
      <section class="pb-10 pt-16 sm:pb-14 sm:pt-24">
        <p
          class="mb-6 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-mist"
        >
          <span class="inline-flex size-1.5 rounded-full bg-brand-400" />
          Shared music rooms
        </p>

        <h1
          class="max-w-3xl text-balance text-[2.5rem] font-semibold leading-[1.04] tracking-[-0.035em] text-chalk sm:text-6xl lg:text-[4.25rem]"
        >
          Your group's music,<br class="hidden sm:block">
          <span class="text-brand-400">in one room.</span>
        </h1>

        <p class="mt-6 max-w-lg text-[15px] leading-relaxed text-mist sm:text-[17px]">
          Create a room. Share the link. Add your music. Listen together.
        </p>

        <div class="mt-9 flex flex-wrap items-center gap-3">
          <UButton
            to="/create"
            size="lg"
            color="primary"
            variant="solid"
            label="Create a room"
            trailing-icon="i-lucide-arrow-right"
            class="px-5 font-medium"
          />
          <UButton
            to="/join"
            size="lg"
            color="neutral"
            variant="outline"
            label="Join a room"
            class="px-5 font-medium"
          />
        </div>
      </section>

      <HeroWaveform class="opacity-80" />

      <p class="pb-10 pt-6 text-[13px] text-ash">
        No accounts. No feeds. Just the music your people add.
      </p>
    </main>
  </div>
</template>
