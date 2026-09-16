<script setup lang="ts">
/** Header for the landing, create and join screens. */
const { guest } = useIdentity()
const route = useRoute()
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-hairline bg-base">
    <div class="mx-auto flex h-14 w-full max-w-[1100px] items-center justify-between gap-4 px-4 sm:px-6">
      <NuxtLink
        to="/"
        class="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70"
      >
        <LogoMark :size="26" />
        <span class="text-[15px] font-semibold tracking-tight text-chalk">TuneRoom</span>
      </NuxtLink>

      <nav class="flex items-center gap-2">
        <PersonAvatar
          v-if="guest"
          :name="guest.name"
          :avatar="guest.avatar"
          :size="26"
          :ring="false"
        />

        <UButton
          v-if="route.path !== '/create'"
          to="/create"
          color="neutral"
          variant="ghost"
          size="sm"
          label="Create a room"
          icon="i-lucide-plus"
        />
      </nav>
    </div>
  </header>
</template>
