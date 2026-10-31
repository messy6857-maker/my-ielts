# Toolchain maintenance

The GitHub workflow uses Node 24 and the repository's pinned pnpm 8.6.10 with a frozen lockfile. The unused Netlify/Node 16 configuration has been removed.

A Vite major-version upgrade is a separate compatibility migration, rather than an unverified package-version sweep. Upgrade Vite and plugin-vue together, then Vue Macros, page generation, UnoCSS and Vitest; validate auto-imported composables, generated routes, lazy JSON chunks, Capacitor's web build and the existing regression suite before replacing the production lockfile. Keep the current lockfile reproducible until that validation passes. No claim of an exploitable vulnerability is based on age alone.
