<script setup lang="ts">
const colorMode = useColorMode()

// TuneRoom is dark-only; this guarantees the class even before hydration.
watchEffect(() => {
  if (colorMode.value !== 'dark')
    colorMode.preference = 'dark'
})

useHead({
  htmlAttrs: { lang: 'en', class: 'dark' },
  meta: [
    // viewport-fit=cover lets the dark shell run edge to edge on notched
    // phones; the dock and dialogs pad themselves with env(safe-area-inset-*).
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
    { name: 'theme-color', content: '#09090B' },
    { name: 'color-scheme', content: 'dark' },
  ],
  link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
})

// The shell reserves room for the dock so the library is never hidden behind it.
const { hasTrack } = usePlayer()
</script>

<template>
  <UApp :toaster="{ position: 'top-center' }">
    <div
      class="relative flex min-h-dvh flex-col bg-base text-chalk"
      :class="hasTrack ? 'pb-dock' : ''"
    >
      <NuxtPage />
    </div>

    <!-- Mounted once for the lifetime of the app: navigation never restarts audio. -->
    <ClientOnly>
      <AudioEngine />
    </ClientOnly>

    <PlayerDock />
    <QueueDrawer />
  </UApp>
</template>
