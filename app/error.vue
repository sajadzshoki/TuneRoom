<script setup lang="ts">
import { clearError, type NuxtError } from '#app'

/**
 * Rendered instead of the app shell when a page cannot be rendered at all.
 * It repeats the dark head configuration because `app.vue` — which normally
 * sets it — is not mounted here.
 */
const props = defineProps<{ error: NuxtError }>()

useHead({
  htmlAttrs: { lang: 'en', class: 'dark' },
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
    { name: 'theme-color', content: '#09090B' },
    { name: 'color-scheme', content: 'dark' },
    { name: 'robots', content: 'noindex, nofollow' },
  ],
  link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
})

const isNotFound = computed(() => props.error.statusCode === 404)

const title = computed(() =>
  isNotFound.value ? 'This page does not exist.' : 'Something went wrong on our side.',
)

const message = computed(() => {
  if (isNotFound.value)
    return 'The address you followed does not match a room or a page on TuneRoom.'
  return props.error.statusMessage
    || 'The page could not be rendered. Your rooms and music are untouched — try again in a moment.'
})

/** Leaving the error state goes home instead of re-rendering a broken page. */
function recover(): void {
  void clearError({ redirect: '/' })
}

function reload(): void {
  window.location.reload()
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-base text-chalk">
    <header class="border-b border-hairline bg-base">
      <div class="mx-auto w-full max-w-[1100px] px-4 sm:px-6">
        <NuxtLink
          to="/"
          class="flex h-14 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70"
          aria-label="TuneRoom home"
        >
          <LogoMark class="size-6 text-brand-400" />
          <span class="text-[15px] font-semibold tracking-tight">TuneRoom</span>
        </NuxtLink>
      </div>
    </header>

    <main class="mx-auto flex w-full max-w-[1100px] flex-1 flex-col px-4 sm:px-6">
      <ErrorState
        :status="String(error.statusCode)"
        :title="title"
        :message="message"
        :icon="isNotFound ? 'i-lucide-compass' : 'i-lucide-triangle-alert'"
        :tone="isNotFound ? 'brand' : 'error'"
      >
        <template #actions>
          <UButton
            size="lg"
            color="primary"
            variant="solid"
            label="Back to TuneRoom"
            icon="i-lucide-home"
            @click="recover"
          />
          <UButton
            v-if="!isNotFound"
            size="lg"
            color="neutral"
            variant="outline"
            label="Reload this page"
            icon="i-lucide-rotate-cw"
            @click="reload"
          />
        </template>
      </ErrorState>
    </main>
  </div>
</template>
