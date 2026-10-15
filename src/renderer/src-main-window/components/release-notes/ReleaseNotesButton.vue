<template>
  <NButton secondary type="primary" size="small" @click="openReleaseNotes">
    {{ t('title') }}
    <NTag v-if="unread" size="tiny" type="primary" :bordered="false" class="ml-1">
      {{ t('new') }}
    </NTag>
  </NButton>
  <NModal
    v-model:show="show"
    preset="card"
    :title="t('title')"
    :style="{ width: 'min(640px, calc(100vw - 48px))' }"
  >
    <NScrollbar style="max-height: 65vh">
      <div class="flex flex-col gap-5 pr-3">
        <section v-for="release in BUNDLED_RELEASE_NOTES" :key="release.version">
          <div role="heading" aria-level="2" class="mb-3 flex flex-wrap items-center gap-2">
            <NText strong>v{{ release.version }}</NText>
            <NText depth="3" class="text-xs">{{ release.date }}</NText>
          </div>
          <div v-for="group in release.groups" :key="group.kind" class="mb-3">
            <NTag size="small" :bordered="false">{{ t(`groups.${group.kind}`) }}</NTag>
            <NList :show-divider="false" class="bg-transparent!">
              <NListItem v-for="item in group.items" :key="item">
                {{ t(`items.${item}`) }}
              </NListItem>
            </NList>
          </div>
        </section>
      </div>
    </NScrollbar>
  </NModal>
</template>

<script setup lang="ts">
import { useInstance } from '@renderer-shared/shards'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import { useTranslation } from 'i18next-vue'
import { NButton, NList, NListItem, NModal, NScrollbar, NTag, NText, useMessage } from 'naive-ui'
import { computed, ref } from 'vue'

import { MainWindowUiRenderer } from '@main-window/shards/main-window-ui'
import { useMainWindowUiStore } from '@main-window/shards/main-window-ui/store'

import { BUNDLED_RELEASE_NOTES } from './release-notes'

const { t } = useTranslation(undefined, { keyPrefix: 'releaseNotes' })
const appCommon = useAppCommonStore()
const store = useMainWindowUiStore()
const mainWindowUi = useInstance(MainWindowUiRenderer)
const message = useMessage()
const show = ref(false)
const unread = computed(
  () => store.frontendSettings.lastReadReleaseNotesVersion !== appCommon.version
)

async function openReleaseNotes() {
  show.value = true
  if (!unread.value) return
  try {
    await mainWindowUi.markReleaseNotesRead(appCommon.version)
  } catch {
    message.error(t('saveFailed'))
  }
}
</script>
