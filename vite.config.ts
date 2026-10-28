/// <reference types="vitest" />

import path from 'node:path'
import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import Pages from 'vite-plugin-pages'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import UnoCSS from 'unocss/vite'
import VueMacros from 'unplugin-vue-macros/vite'

export default defineConfig({
  base: '',
  server: {
    host: '0.0.0.0',
    port: 3333,
  },
  resolve: {
    alias: {
      '~/': `${path.resolve(__dirname, 'src')}/`,
    },
  },
  plugins: [
    VueMacros({
      defineOptions: false,
      defineModels: false,
      plugins: {
        vue: Vue({
          script: {
            propsDestructure: true,
            defineModel: true,
          },
        }),
      },
    }),

    // https://github.com/hannoeru/vite-plugin-pages
    Pages(),

    // https://github.com/antfu/unplugin-auto-import
    AutoImport({
      imports: [
        'vue',
        'vue-router',
        '@vueuse/core',
      ],
      dts: true,
      dirs: [
        './src/composables',
      ],
      vueTemplate: true,
    }),

    // https://github.com/antfu/vite-plugin-components
    Components({
      dts: true,
    }),

    // https://github.com/antfu/unocss
    // see uno.config.ts for config
    UnoCSS(),
  ],

  build: {
    rollupOptions: {
      output: {
        // 词汇数据模块与组件代码拆包：vocabulary.js（词库）与 wordSentences.ts
        // （例句）本身无任何 import，单独成包可避免被并入组件 chunk、随首屏
        // 或任一组件 chunk 重复加载；组件 chunk 只 import 它们，不内联数据。
        manualChunks(id) {
          if (id.includes('pages/vocabulary/vocabulary.'))
            return 'vocabulary-data'
          if (id.includes('pages/vocabulary/wordSentences.'))
            return 'word-sentences-data'
          return undefined
        },
      },
    },
  },

  // https://github.com/vitest-dev/vitest
  test: {
    environment: 'jsdom',
  },
})
