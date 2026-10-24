import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

const vuePlugin = vue()
const vueTransform = vuePlugin.transform
// These interaction tests mount SFCs with Vue's client render host in Node.
const clientOptions = (id: string, options?: { ssr?: boolean }) =>
  id.split('?')[0].endsWith('/match-inspector/MatchInspector.vue') ||
  id.split('?')[0].endsWith('/startup-quick-settings/StartupQuickSettings.vue')
    ? { ...options, ssr: false }
    : options
if (typeof vueTransform === 'function') {
  vuePlugin.transform = function (code, id, options) {
    return vueTransform.call(this, code, id, clientOptions(id, options))
  }
} else if (vueTransform) {
  vuePlugin.transform = {
    ...vueTransform,
    handler(code, id, options) {
      return vueTransform.handler.call(this, code, id, clientOptions(id, options))
    }
  }
}

export default defineConfig({
  plugins: [
    vuePlugin,
    vueJsx({
      tsTransform: 'built-in',
      babelPlugins: [['@babel/plugin-syntax-decorators', { legacy: true }]]
    })
  ],
  resolve: {
    alias: {
      '@main-window': resolve('src/renderer/src-main-window'),
      '@aux-window': resolve('src/renderer/src-aux-window'),
      '@opgg-window': resolve('src/renderer/src-opgg-window'),
      '@ongoing-game-window': resolve('src/renderer/src-ongoing-game-window'),
      '@cd-timer-window': resolve('src/renderer/src-cd-timer-window'),
      '@shared': resolve('src/shared'),
      '@renderer-shared': resolve('src/renderer-shared'),
      '@main': resolve('src/main')
    }
  },
  test: {
    globals: true,
    environment: 'node'
  }
})
