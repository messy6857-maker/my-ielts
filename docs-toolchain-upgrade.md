# Toolchain maintenance

The GitHub workflow uses Node 24 and the repository's pinned pnpm 8.6.10 with a frozen lockfile. The unused Netlify/Node 16 configuration has been removed.

A Vite major-version upgrade is a separate compatibility migration, rather than an unverified package-version sweep. Upgrade Vite and plugin-vue together, then Vue Macros, page generation, UnoCSS and Vitest; validate auto-imported composables, generated routes, lazy JSON chunks, Capacitor's web build and the existing regression suite before replacing the production lockfile. Keep the current lockfile reproducible until that validation passes. No claim of an exploitable vulnerability is based on age alone.

## 2026-11 upgrade

Vite 4 → 8, @vitejs/plugin-vue 4 → 6, Vitest 0.31 → 5, Vue 3.3 → 3.5, vue-tsc 1 → 3, UnoCSS 0.53 → 66,
unplugin-auto-import / unplugin-vue-components / vite-plugin-pages to current, jsdom 22 → 31, @vueuse/core 10 → 15.
Vue Macros was removed: the project only used features now built into Vue 3.5 (defineOptions, defineModel,
props destructure). vue-router stays on 4.x; ESLint is upgraded separately.
