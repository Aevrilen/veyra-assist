<template>
  <NConfigProvider
    :theme-overrides="getNaiveUiThemeOverrides(appCommon.themeId)"
    :theme="getNaiveUiTheme(appCommon.colorTheme)"
    :locale="naiveUiLocale.locale"
    :date-locale="naiveUiLocale.dateLocale"
    abstract
    inline-theme-disabled
  >
    <CandidateGrabButton v-if="isCandidateButtonWindow" />
    <App v-else :group="group" />
  </NConfigProvider>
</template>

<script setup lang="ts">
import { useColorThemeAttr } from '@renderer-shared/composables/useColorThemeAttr'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import {
  getNaiveUiLocale,
  getNaiveUiTheme,
  getNaiveUiThemeOverrides
} from '@renderer-shared/theme/naive-ui'
import { NConfigProvider } from 'naive-ui'
import { computed } from 'vue'

import App from './App.vue'
import CandidateGrabButton from './candidate-grab/CandidateGrabButton.vue'
import { isCandidateButtonWindow } from './shards'

const appCommon = useAppCommonStore()
const group =
  new URLSearchParams(window.location.search).get('group') === 'candidates'
    ? 'candidates'
    : 'teammates'
const naiveUiLocale = computed(() => getNaiveUiLocale(appCommon.settings.locale))

useColorThemeAttr(
  () => appCommon.colorTheme,
  () => appCommon.themeId
)
</script>
