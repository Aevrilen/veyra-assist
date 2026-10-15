<template>
  <component :is="embedded ? 'div' : NScrollbar" :class="{ 'h-full': !embedded }">
    <div class="flex flex-col gap-6">
      <SettingsSection
        setting-id="multi-window.mayhem"
        :title="t('settings.multiWindow.mayhem.title')"
      >
        <SettingsRow
          setting-id="multi-window.mayhem.calibration"
          :label="t('settings.multiWindow.mayhem.calibration.label')"
          :label-width="400"
        >
          <template #labelDescription>
            <div>{{ t('settings.multiWindow.mayhem.calibration.description') }}</div>
            <div class="mt-1">{{ t('settings.multiWindow.mayhem.calibration.anchors') }}</div>
            <div class="mt-1" aria-live="polite">{{ calibrationStatusText }}</div>
            <div v-if="calibrationStatusError || calibrationOpenError" class="mt-1" role="alert">
              <NText type="error">{{ calibrationStatusError || calibrationOpenError }}</NText>
            </div>
          </template>
          <NButton
            size="small"
            type="primary"
            secondary
            :loading="calibrationOpening"
            :disabled="calibrationOpening || calibrationQuerying || !calibrationStatus?.supported"
            @click="openCalibration"
          >
            {{ t('settings.multiWindow.mayhem.calibration.button') }}
          </NButton>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection
        setting-id="multi-window.aux"
        :title="t('settings.multiWindow.auxWindow.title')"
      >
        <SettingsRow
          setting-id="multi-window.aux.enabled"
          :label="t('settings.multiWindow.auxWindow.enabled.label')"
          :label-width="400"
        >
          <template #labelDescription>
            <div>{{ t('settings.multiWindow.auxWindow.enabled.description') }}</div>
            <div>
              <TranslationComponent
                :translation="t('settings.multiWindow.auxWindow.enabled.descriptionWithIcon')"
              >
                <template #icon>
                  <NIcon class="inline-block size-4 align-middle text-black dark:text-white">
                    <Window24FilledIcon />
                  </NIcon>
                </template>
              </TranslationComponent>
            </div>
          </template>
          <NSwitch
            size="small"
            :value="aws.settings.enabled"
            @update:value="(val) => wm.auxWindow.setEnabled(val)"
          />
        </SettingsRow>
        <SettingsRow
          setting-id="multi-window.aux.auto-show"
          :label="t('settings.multiWindow.auxWindow.autoShow.label')"
          :label-description="t('settings.multiWindow.auxWindow.autoShow.description')"
          :label-width="400"
        >
          <NSwitch
            size="small"
            :value="aws.settings.autoShow"
            @update:value="(val) => wm.auxWindow.setAutoShow(val)"
          />
        </SettingsRow>
        <SettingsRow
          setting-id="multi-window.aux.opacity"
          :label="t('settings.multiWindow.auxWindow.opacity.label')"
          :label-description="t('settings.multiWindow.auxWindow.opacity.description')"
          :label-width="400"
        >
          <NSlider
            class="w-48!"
            size=""
            :min="0.3"
            :max="1"
            :step="0.01"
            :format-tooltip="(v) => `${(v * 100).toFixed()}%`"
            @update:value="(val) => wm.auxWindow.setOpacity(val)"
            :value="aws.settings.opacity"
          ></NSlider>
        </SettingsRow>
        <SettingsRow
          setting-id="multi-window.aux.reset-position"
          :label="t('settings.multiWindow.auxWindow.resetWindowPosition.label')"
          :label-description="t('settings.multiWindow.auxWindow.resetWindowPosition.description')"
          :label-width="400"
        >
          <NButton
            size="small"
            type="warning"
            secondary
            @click="() => wm.auxWindow.resetPosition()"
            >{{ t('settings.multiWindow.auxWindow.resetWindowPosition.button') }}</NButton
          >
        </SettingsRow>
      </SettingsSection>
      <SettingsSection
        setting-id="multi-window.ongoing-game"
        :title="
          as.isElevated
            ? t('settings.multiWindow.ongoingGameWindow.title')
            : t('settings.multiWindow.ongoingGameWindow.titleRequireAdmin')
        "
      >
        <SettingsRow
          setting-id="multi-window.ongoing-game.enabled"
          :label="t('settings.multiWindow.ongoingGameWindow.enabled.label')"
          :label-description="t('settings.multiWindow.ongoingGameWindow.enabled.description')"
          :label-width="400"
        >
          <NSwitch
            size="small"
            :value="ogws.settings.enabled"
            @update:value="(val) => wm.ongoingGameWindow.setEnabled(val)"
          />
        </SettingsRow>
        <SettingsRow
          setting-id="multi-window.ongoing-game.shortcut"
          :disabled="!as.nativeSupport.nativeInput.available"
          :label-width="400"
          :label="t('settings.multiWindow.ongoingGameWindow.showShortcut.label')"
          :label-description="t('settings.multiWindow.ongoingGameWindow.showShortcut.description')"
        >
          <ShortcutSelector
            :target-id="AkariOngoingGameWindow.SHOW_WINDOW_SHORTCUT_TARGET_ID"
            :shortcut-id="ogws.settings.showShortcut"
            @update:shortcut-id="(id) => wm.ongoingGameWindow.setShowShortcut(id)"
          />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection
        setting-id="multi-window.cd-timer"
        :title="
          as.isElevated
            ? t('settings.multiWindow.cdTimerWindow.title')
            : t('settings.multiWindow.cdTimerWindow.titleRequireAdmin')
        "
      >
        <SettingsRow
          setting-id="multi-window.cd-timer.enabled"
          :disabled="!as.nativeSupport.nativeInput.available"
          :label="t('settings.multiWindow.cdTimerWindow.enabled.label')"
          :label-description="t('settings.multiWindow.cdTimerWindow.enabled.description')"
          :label-width="400"
        >
          <NSwitch
            size="small"
            :disabled="!as.nativeSupport.nativeInput.available"
            :value="ctws.settings.enabled"
            @update:value="(val) => wm.cdTimerWindow.setEnabled(val)"
          />
        </SettingsRow>
        <SettingsRow
          setting-id="multi-window.cd-timer.shortcut"
          :disabled="!as.nativeSupport.nativeInput.available"
          :label-width="400"
          :label="t('settings.multiWindow.cdTimerWindow.showShortcut.label')"
          :label-description="t('settings.multiWindow.cdTimerWindow.showShortcut.description')"
        >
          <ShortcutSelector
            :target-id="AkariCdTimerWindow.SHOW_WINDOW_SHORTCUT_TARGET_ID"
            :shortcut-id="ctws.settings.showShortcut"
            @update:shortcut-id="(id) => wm.cdTimerWindow.setShowShortcut(id)"
          />
        </SettingsRow>
        <SettingsRow
          setting-id="multi-window.cd-timer.reset-position"
          :disabled="!as.nativeSupport.nativeInput.available"
          :label="t('settings.multiWindow.cdTimerWindow.resetWindowPosition.label')"
          :label-description="
            t('settings.multiWindow.cdTimerWindow.resetWindowPosition.description')
          "
          :label-width="400"
        >
          <NButton
            size="small"
            type="warning"
            secondary
            :disabled="!as.nativeSupport.nativeInput.available"
            @click="() => wm.cdTimerWindow.resetPosition()"
            >{{ t('settings.multiWindow.cdTimerWindow.resetWindowPosition.button') }}</NButton
          >
        </SettingsRow>
        <SettingsRow
          setting-id="multi-window.cd-timer.type"
          :disabled="!as.nativeSupport.nativeInput.available"
          :label="t('settings.multiWindow.cdTimerWindow.timerType.label')"
          :label-description="t('settings.multiWindow.cdTimerWindow.timerType.description')"
          :label-width="400"
        >
          <NRadioGroup
            size="small"
            :disabled="!as.nativeSupport.nativeInput.available"
            :value="ctws.settings.timerType"
            @update:value="(val) => wm.cdTimerWindow.setTimerType(val)"
          >
            <div class="flex flex-wrap justify-end gap-x-3 gap-y-1">
              <NRadio value="countdown">{{
                t('settings.multiWindow.cdTimerWindow.timerType.options.countdown')
              }}</NRadio>
              <NRadio value="countup">{{
                t('settings.multiWindow.cdTimerWindow.timerType.options.countup')
              }}</NRadio>
            </div>
          </NRadioGroup>
        </SettingsRow>
        <SettingsRow
          setting-id="multi-window.cd-timer.reverse-adjustment"
          :disabled="!as.nativeSupport.nativeInput.available"
          :label="t('settings.multiWindow.cdTimerWindow.reverseAdjustmentDirection.label')"
          :label-description="
            t('settings.multiWindow.cdTimerWindow.reverseAdjustmentDirection.description')
          "
          :label-width="400"
        >
          <NSwitch
            size="small"
            :disabled="!as.nativeSupport.nativeInput.available"
            :value="ctws.settings.reverseAdjustmentDirection"
            @update:value="(val) => wm.cdTimerWindow.setReverseAdjustmentDirection(val)"
          />
        </SettingsRow>
        <template #footer>
          <div class="text-[11px] leading-4 text-black/50 dark:text-white/50">
            {{ t('settings.multiWindow.cdTimerWindow.description.lineA') }}
          </div>
          <div
            class="mt-0.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[11px] leading-4"
          >
            <span class="font-medium text-black/65 dark:text-white/65">{{
              t('settings.multiWindow.cdTimerWindow.description.leftClick1')
            }}</span>
            <span>{{ t('settings.multiWindow.cdTimerWindow.description.leftClick2') }}</span>
            <span class="font-medium text-black/65 dark:text-white/65">{{
              t('settings.multiWindow.cdTimerWindow.description.rightDoubleClick1')
            }}</span>
            <span>{{ t('settings.multiWindow.cdTimerWindow.description.rightDoubleClick2') }}</span>
            <span class="font-medium text-black/65 dark:text-white/65">{{
              t('settings.multiWindow.cdTimerWindow.description.wheel1')
            }}</span>
            <span>{{ t('settings.multiWindow.cdTimerWindow.description.wheel2') }}</span>
          </div>
        </template>
      </SettingsSection>
    </div>
  </component>
</template>

<script setup lang="ts">
import SettingsRow from '@main-window/settings-navigation/NavigableSettingsRow.vue'
import SettingsSection from '@main-window/settings-navigation/NavigableSettingsSection.vue'
import { useInstance } from '@renderer-shared/shards'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import { AkariCdTimerWindow, WindowManagerRenderer } from '@renderer-shared/shards/window-manager'
import { AkariOngoingGameWindow } from '@renderer-shared/shards/window-manager'
import {
  useAuxWindowStore,
  useCdTimerWindowStore,
  useOngoingGameWindowStore
} from '@renderer-shared/shards/window-manager/store'
import { Window24Filled as Window24FilledIcon } from '@vicons/fluent'
import { TranslationComponent, useTranslation } from 'i18next-vue'
import { NButton, NIcon, NRadio, NRadioGroup, NScrollbar, NSlider, NSwitch, NText } from 'naive-ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import ShortcutSelector from '@main-window/components/ShortcutSelector.vue'
import { MainWindowUiRenderer } from '@main-window/shards/main-window-ui'

defineProps<{ embedded?: boolean }>()
const { t } = useTranslation()

const as = useAppCommonStore()
const aws = useAuxWindowStore()
const ogws = useOngoingGameWindowStore()
const ctws = useCdTimerWindowStore()

const wm = useInstance(WindowManagerRenderer)
const ui = useInstance(MainWindowUiRenderer)
const calibrationStatus = ref<{ supported: boolean; calibrated: boolean } | null>(null)
const calibrationQuerying = ref(false)
const calibrationOpening = ref(false)
const calibrationStatusError = ref('')
const calibrationOpenError = ref('')
let mounted = false
const calibrationStatusText = computed(() => {
  const key = calibrationQuerying.value
    ? 'loading'
    : !calibrationStatus.value
      ? 'unavailable'
      : !calibrationStatus.value.supported
        ? 'unsupported'
        : calibrationStatus.value.calibrated
          ? 'calibrated'
          : 'uncalibrated'
  return t(`settings.multiWindow.mayhem.calibration.status.${key}`)
})

function calibrationErrorMessage(error: unknown) {
  return error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
    ? error.message
    : String(error)
}

async function refreshCalibrationStatus() {
  if (calibrationQuerying.value || calibrationOpening.value) return
  calibrationQuerying.value = true
  calibrationStatusError.value = ''
  try {
    const status = await ui.getMayhemSetupStatus()
    if (mounted) calibrationStatus.value = status
  } catch (error) {
    if (mounted) {
      calibrationStatus.value = null
      calibrationStatusError.value = t('settings.multiWindow.mayhem.calibration.statusFailed', {
        error: calibrationErrorMessage(error)
      })
    }
  } finally {
    if (mounted) calibrationQuerying.value = false
  }
}

async function openCalibration() {
  if (calibrationOpening.value || calibrationQuerying.value || !calibrationStatus.value?.supported)
    return
  calibrationOpening.value = true
  calibrationOpenError.value = ''
  try {
    await ui.openMayhemSetup()
  } catch (error) {
    if (mounted)
      calibrationOpenError.value = t('settings.multiWindow.mayhem.calibration.openFailed', {
        error: calibrationErrorMessage(error)
      })
  } finally {
    if (mounted) calibrationOpening.value = false
  }
}

onMounted(() => {
  mounted = true
  void refreshCalibrationStatus()
  window.addEventListener('focus', refreshCalibrationStatus)
})
onUnmounted(() => {
  mounted = false
  window.removeEventListener('focus', refreshCalibrationStatus)
})
</script>
