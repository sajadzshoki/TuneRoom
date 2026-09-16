// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: ['.data/**', '.output/**', 'drizzle/**', 'scripts/**', 'public/**'],
  },
  {
    rules: {
      // TuneRoom is a small app with a single audio engine; a couple of modules
      // intentionally hold app-lifetime state.
      'unicorn/prefer-top-level-await': 'off',
    },
  },
)
