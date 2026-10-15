import 'reflect-metadata'

import '@renderer-shared/assets/css/tailwind.css'

import '@renderer-shared/assets/css/base-styles.css'
import '@renderer-shared/assets/css/theme-system.css'
import { i18next } from '@renderer-shared/i18n'
import I18nextVue from 'i18next-vue'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import NaiveUIProviderApp from './NaiveUIProviderApp.vue'
import './assets/css/styles.css'
import { manager } from './shards'

const app = createApp(NaiveUIProviderApp)
  .use(createPinia())
  .use(I18nextVue, { i18next })
  .use(manager)

await manager.setup()
app.mount('#app')
