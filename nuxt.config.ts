import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const storageDir = process.env.STORAGE_DIR || '.data/storage'
const pgDataDir = process.env.PGDATA_DIR || '.data/pg'

export default defineNuxtConfig({
  compatibilityDate: '2025-09-14',
  devtools: { enabled: false },

  modules: ['@nuxt/ui', '@nuxt/eslint'],

  // Inter is self-hosted from node_modules: no font CDN requests at build or runtime.
  css: ['@fontsource-variable/inter/index.css', '~/assets/css/main.css'],

  // Dark mode only — TuneRoom has no light theme.
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
    disableTransition: true,
  },

  // Custom palettes consumed by `app.config.ts` (primary -> brand, neutral -> ink).
  ui: {
    theme: {
      colors: ['brand', 'ink', 'secondary', 'success', 'info', 'warning', 'error'],
    },
    // Inter is self-hosted above, so @nuxt/fonts (and its CDN lookups) is off.
    fonts: false,
  },

  icon: {
    collections: ['lucide'],
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  runtimeConfig: {
    /** HMAC secret for guest identity tokens. NUXT_SESSION_SECRET */
    sessionSecret: 'dev-only-insecure-secret',
    /** postgres://… enables the node-postgres driver. DATABASE_URL */
    databaseUrl: '',
    /** Embedded PostgreSQL data directory (used when DATABASE_URL is empty). PGDATA_DIR */
    pgDataDir,
    /** Storage driver id. STORAGE_DRIVER */
    storageDriver: 'local',
    /** Local storage root. STORAGE_DIR */
    storageDir,
    /** MAX_URL_FETCH_MB */
    maxUrlFetchMb: 60,
    /** RATE_LIMIT_ENABLED */
    rateLimitEnabled: true,
    public: {
      /** Absolute origin used for share links / QR codes. NUXT_PUBLIC_APP_URL */
      appUrl: '',
      /** Per-file upload cap, shared with the upload UI. MAX_UPLOAD_MB */
      maxUploadMb: 60,
    },
  },

  nitro: {
    // One JSON error envelope for the whole API (see server/errorHandler.ts).
    errorHandler: resolve(rootDir, 'server/errorHandler.ts'),
    // Keep the database drivers and the audio metadata parser out of the bundle:
    // both ship binary/WASM assets that must be resolved from node_modules.
    externals: {
      external: ['pg', '@electric-sql/pglite', 'music-metadata'],
    },
    routeRules: {
      '/api/**': {
        headers: { 'cache-control': 'no-store' },
      },
    },
  },

  vite: {
    server: {
      // The sandbox preview proxies a foreign host; Vite must accept it.
      allowedHosts: true,
      fs: {
        allow: [fileURLToPath(new URL('.', import.meta.url))],
      },
    },
  },

})
