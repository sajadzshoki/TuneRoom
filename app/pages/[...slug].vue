<script setup lang="ts">
/**
 * Catch-all for unknown addresses.
 *
 * Rendering TuneRoom's own 404 (with a real 404 status) keeps a mistyped link
 * on-brand instead of falling through to the framework's generic error page.
 */
const route = useRoute()

/**
 * Unknown `/api/*` addresses must stay JSON: throwing hands them back to the
 * server error handler, which answers every API failure with the same envelope.
 */
if (route.path.startsWith('/api/')) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Not Found',
    fatal: true,
    data: { code: 'NOT_FOUND', message: `No API route at ${route.path}.` },
  })
}

// Server renders must answer 404, not 200, for crawlers and link previews.
const event = useRequestEvent()
if (event)
  setResponseStatus(event, 404)

useSeoMeta({
  title: 'Page not found · TuneRoom',
  description: 'That address does not match a room or a page on TuneRoom.',
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div class="flex flex-1 flex-col">
    <AppHeader />

    <main class="mx-auto flex w-full max-w-[1100px] flex-1 flex-col px-4 sm:px-6">
      <ErrorState
        status="404"
        title="This page does not exist."
        :message="`Nothing is served at “${route.path}”. If you were following a room link, it may have been mistyped, or the room may have been deleted.`"
      >
        <template #actions>
          <UButton
            to="/"
            size="lg"
            color="primary"
            variant="solid"
            label="Back to TuneRoom"
            icon="i-lucide-home"
          />
          <UButton
            to="/join"
            size="lg"
            color="neutral"
            variant="outline"
            label="Join with a code"
            icon="i-lucide-log-in"
          />
        </template>
      </ErrorState>
    </main>
  </div>
</template>
