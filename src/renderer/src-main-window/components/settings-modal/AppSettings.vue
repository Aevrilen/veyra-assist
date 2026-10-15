<template>
  <component :is="embedded ? 'div' : NScrollbar" :class="{ 'h-full': !embedded }">
    <div class="flex flex-col gap-6">
      <div v-if="section === 'appearance'" class="appearance-introduction">
        <p>{{ t('navigation.workspace.appearanceDescription') }}</p>
        <NButton size="small" secondary @click="showBackgroundSettings = true">{{
          t('navigation.workspace.backgroundSettings')
        }}</NButton>
      </div>
      <SettingsSection
        v-if="
          section === 'all' ||
          section === 'data' ||
          section === 'window' ||
          section === 'appearance'
        "
        setting-id="app.basic"
        :title="t('settings.app.basic.title')"
      >
        <SettingsRow
          v-if="section === 'all' || section === 'window'"
          setting-id="app.basic.close-action"
          :label="t('settings.app.basic.mainWindowCloseAction.label')"
          :label-description="t('settings.app.basic.mainWindowCloseAction.description')"
          :label-width="400"
        >
          <NSelect
            class="w-40!"
            size="small"
            :value="mws.settings.closeAction"
            @update:value="(val) => wm.mainWindow.setCloseAction(val)"
            :options="closeActions"
          />
        </SettingsRow>
        <SettingsRow
          v-if="section === 'all' || section === 'data'"
          setting-id="app.basic.locale"
          :label="t('settings.app.basic.locale.label')"
          :label-description="t('settings.app.basic.locale.description')"
          :label-width="400"
        >
          <NSelect
            class="w-40!"
            size="small"
            :value="as.settings.locale"
            @update:value="(val) => app.setLocale(val)"
            :options="locales"
          />
        </SettingsRow>
        <SettingsRow
          v-if="section === 'all' || section === 'data'"
          setting-id="app.basic.preferred-lol-source"
          :label="t('settings.app.basic.preferredLolSource.label')"
          :label-description="t('settings.app.basic.preferredLolSource.description')"
          :label-width="400"
          align="start"
        >
          <div class="flex max-w-full flex-col items-end gap-2">
            <NSelect
              class="w-40!"
              size="small"
              :value="as.settings.preferredLolSource"
              @update:value="(val) => app.setPreferredLolSource(val)"
              :options="lolSourceOptions"
            />
            <div
              v-if="
                sgps.availability.sgpServerId &&
                as.settings.preferredLolSource === 'sgp' &&
                !sgps.availability.serversSupported.matchHistory
              "
              class="max-w-[320px] text-right text-sm font-bold text-orange-500 dark:text-orange-300"
            >
              {{
                t('settings.app.basic.preferredLolSource.unsupported', {
                  server: sgps.availability.sgpServerId
                })
              }}
            </div>
          </div>
        </SettingsRow>
        <SettingsRow
          v-if="section === 'all' || section === 'appearance'"
          setting-id="app.basic.theme"
          :label="t('settings.app.basic.theme.label')"
          :label-description="t('settings.app.basic.theme.description')"
          :label-width="400"
          control-full-line
        >
          <div class="theme-preferences">
            <ThemeChoices :theme-id="as.themeId" @select="(id) => app.setTheme(id)" />
            <NSelect
              class="w-48!"
              size="small"
              :value="as.settings.theme"
              @update:value="(val) => app.setTheme(val)"
              :options="themes"
            />
          </div>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection
        v-if="section === 'all' || section === 'maintenance'"
        setting-id="app.self-update"
        :title="t('settings.app.selfUpdate.title')"
      >
        <SettingsRow
          setting-id="app.self-update.auto-check"
          :label="t('settings.app.selfUpdate.autoCheckUpdates.label')"
          :label-width="400"
          ><NSwitch size="small" disabled :value="false"
        /></SettingsRow>
        <SettingsRow
          setting-id="app.self-update.auto-download"
          :label="t('settings.app.selfUpdate.autoDownloadUpdates.label')"
          :label-width="400"
          ><NSwitch size="small" disabled :value="false"
        /></SettingsRow>
        <SettingsRow
          setting-id="app.self-update.check"
          :label="t('settings.app.selfUpdate.checkUpdates')"
          :label-description="t('veyraSettings.updateUnavailable')"
          :label-width="400"
          ><NButton size="small" disabled>{{
            t('veyraSettings.unavailable')
          }}</NButton></SettingsRow
        >
      </SettingsSection>
      <component
        :is="embedded ? NModal : 'div'"
        v-if="section === 'all' || section === 'appearance'"
        :show="showBackgroundSettings"
        @update:show="showBackgroundSettings = $event"
        preset="card"
        :title="t('navigation.workspace.backgroundSettings')"
        class="background-settings"
        @after-enter="handleBackgroundEntered"
      >
        <SettingsSection
          setting-id="app.main-window-ui"
          :title="t('settings.app.mainWindowUi.title')"
        >
          <SettingsRow
            setting-id="app.main-window-ui.background"
            :label="t('settings.app.mainWindowUi.background.label')"
            :label-description="t('settings.app.mainWindowUi.background.description')"
            :label-width="400"
          >
            <NRadioGroup
              size="small"
              :value="mainWindowBackgroundMode"
              @update:value="handleMainWindowBackgroundModeUpdate"
            >
              <NFlex :size="12">
                <NTooltip
                  v-for="option in mainWindowBackgroundModeOptions"
                  :key="option.value"
                  placement="top"
                  :disabled="!option.tooltip"
                >
                  <template #trigger>
                    <span class="inline-flex">
                      <NRadio :value="option.value" :disabled="option.disabled">{{
                        option.label
                      }}</NRadio>
                    </span>
                  </template>
                  <div v-if="option.tooltip" class="max-w-64 text-xs">
                    {{ option.tooltip }}
                  </div>
                </NTooltip>
              </NFlex>
            </NRadioGroup>
          </SettingsRow>
          <NCollapseTransition :show="mainWindowBackgroundMode === 'custom-image'">
            <SettingsRow
              setting-id="app.main-window-ui.custom-background"
              :label="t('settings.app.mainWindowUi.customBackground.label')"
              :label-description="t('settings.app.mainWindowUi.customBackground.description')"
              control-full-line
              align="start"
            >
              <div class="flex w-full flex-col gap-3">
                <div>
                  <div class="mb-1 text-xs text-black/60 dark:text-white/60">
                    {{ t('settings.app.mainWindowUi.customBackground.filePath') }}
                  </div>
                  <div class="flex gap-2">
                    <NInput
                      class="min-w-0 flex-1"
                      size="small"
                      readonly
                      :value="customBackgroundFilePath"
                      :placeholder="t('settings.app.mainWindowUi.customBackground.filePlaceholder')"
                    />
                    <NButton size="small" secondary @click="() => mui.selectCustomBackgroundFile()">
                      {{ t('settings.app.mainWindowUi.customBackground.browse') }}
                    </NButton>
                  </div>
                </div>
                <div>
                  <div class="mb-1 text-xs text-black/60 dark:text-white/60">
                    {{ t('settings.app.mainWindowUi.customBackground.overlayStrength') }}
                  </div>
                  <NSlider
                    :min="0"
                    :max="1"
                    :step="0.01"
                    :value="customBackgroundOverlayStrength"
                    :format-tooltip="(value) => `${Math.round(value * 100)}%`"
                    @update:value="(value) => mui.setCustomBackgroundOverlayStrength(value)"
                  />
                </div>
              </div>
            </SettingsRow>
          </NCollapseTransition>
        </SettingsSection>
      </component>
      <SettingsSection
        v-if="section === 'all' || section === 'maintenance'"
        setting-id="app.lcu-connection"
        :title="t('settings.app.lcConnection.title')"
      >
        <SettingsRow
          setting-id="app.lcu-connection.auto-connect"
          :label="t('settings.app.lcConnection.autoConnect.label')"
          :label-description="t('settings.app.lcConnection.autoConnect.description')"
          :label-width="400"
        >
          <NSwitch
            size="small"
            :value="lcs.settings.autoConnect"
            @update:value="(val: boolean) => lc.setAutoConnect(val)"
          />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection
        v-if="section === 'all' || section === 'data'"
        setting-id="app.http-proxy"
        :title="t('settings.app.httpProxy.title')"
      >
        <SettingsRow
          setting-id="app.misc.http-proxy.strategy"
          :label="t('settings.app.httpProxy.strategy.label')"
          :label-description="t('settings.app.httpProxy.strategy.description')"
          :label-width="400"
        >
          <NSelect
            :options="httpProxyStrategies"
            class="w-40!"
            size="small"
            :value="networkStore.settings.httpProxy.strategy"
            @update:value="(val) => updateHttpProxySettings({ strategy: val })"
          />
        </SettingsRow>
        <NCollapseTransition :show="networkStore.settings.httpProxy.strategy === 'fixed-servers'">
          <SettingsRow
            setting-id="app.misc.http-proxy.host"
            :label="t('settings.app.httpProxy.host.label')"
            :label-description="t('settings.app.httpProxy.host.description')"
            :label-width="400"
          >
            <NInput
              :value="networkStore.settings.httpProxy.host"
              class="w-40!"
              size="small"
              :placeholder="t('settings.app.httpProxy.host.label')"
              :status="networkStore.settings.httpProxy.host.trim() ? 'success' : 'warning'"
              @update:value="(val) => updateHttpProxySettings({ host: val })"
            />
          </SettingsRow>
          <SettingsRow
            setting-id="app.misc.http-proxy.port"
            :label="t('settings.app.httpProxy.port.label')"
            :label-description="t('settings.app.httpProxy.port.description')"
            :label-width="400"
          >
            <NInputNumber
              :show-button="false"
              :min="1"
              :max="65535"
              :value="networkStore.settings.httpProxy.port"
              class="w-40!"
              size="small"
              @update:value="(val) => updateHttpProxySettings({ port: val || 1 })"
            />
          </SettingsRow>
        </NCollapseTransition>
      </SettingsSection>
      <SettingsSection
        v-if="section === 'all' || section === 'window'"
        setting-id="app.misc"
        :title="t('settings.app.misc.title')"
      >
        <SettingsRow
          v-if="section === 'all' || section === 'window'"
          setting-id="app.misc.disable-hardware-acceleration"
          :label="t('settings.app.misc.disableHardwareAcceleration.label')"
          :label-description="t('settings.app.misc.disableHardwareAcceleration.description')"
          :label-width="400"
        >
          <NSwitch
            size="small"
            :value="as.baseConfig?.disableHardwareAcceleration ?? false"
            @update:value="(val: boolean) => handleDisableHardwareAcceleration(val)"
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  </component>
</template>

<script setup lang="ts">
import SettingsRow from '@main-window/settings-navigation/NavigableSettingsRow.vue'
import SettingsSection from '@main-window/settings-navigation/NavigableSettingsSection.vue'
import { useInstance } from '@renderer-shared/shards'
import { useAkariNavigationStep } from '@renderer-shared/shards/akari-navigation'
import { AppCommonRenderer } from '@renderer-shared/shards/app-common'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import { LeagueClientRenderer } from '@renderer-shared/shards/league-client'
import { useLeagueClientStore } from '@renderer-shared/shards/league-client/store'
import { NetworkRenderer } from '@renderer-shared/shards/network'
import { useNetworkStore } from '@renderer-shared/shards/network/store'
import type { HttpProxySetting } from '@shared/shards/network'
import { useSgpStore } from '@renderer-shared/shards/sgp/store'
import { WindowManagerRenderer } from '@renderer-shared/shards/window-manager'
import {
  useMainWindowStore,
  useWindowManagerStore
} from '@renderer-shared/shards/window-manager/store'
import {
  AppThemeId,
  BUILTIN_DARK_THEME_IDS,
  BUILTIN_LIGHT_THEME_IDS,
  WORKSPACE_THEME_IDS,
  getThemeColorTheme
} from '@shared/types/app-theme'
import { useTranslation } from 'i18next-vue'
import {
  NButton,
  NCollapseTransition,
  NInput,
  NInputNumber,
  NModal,
  NRadio,
  NRadioGroup,
  NScrollbar,
  NSelect,
  NSlider,
  NSwitch,
  NTooltip,
  useDialog
} from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import {
  MainWindowUiRenderer,
  type MainWindowBackgroundMode
} from '@main-window/shards/main-window-ui'

import {
  APP_SETTINGS_NAVIGATION_STEP_KEY,
  type AppSettingsNavigationPayload,
  type SettingsGroup
} from './navigation'
import ThemeChoices from '../ThemeChoices.vue'

const props = withDefaults(defineProps<{ embedded?: boolean; section?: SettingsGroup | 'all' }>(), {
  section: 'all'
})
const { t } = useTranslation()

const lcs = useLeagueClientStore()
const sgps = useSgpStore()
const wms = useWindowManagerStore()
const as = useAppCommonStore()
const networkStore = useNetworkStore()
const mws = useMainWindowStore()
const wm = useInstance(WindowManagerRenderer)
const mui = useInstance(MainWindowUiRenderer)
const app = useInstance(AppCommonRenderer)
const network = useInstance(NetworkRenderer)
const lc = useInstance(LeagueClientRenderer)

const showBackgroundSettings = ref(false)
const backgroundEntered = ref(false)
let backgroundWaiter: (() => void) | null = null
const handleBackgroundEntered = () => {
  backgroundEntered.value = true
  backgroundWaiter?.()
}
watch(showBackgroundSettings, (visible) => {
  if (!visible) backgroundEntered.value = false
})
onBeforeUnmount(() => backgroundWaiter?.())

useAkariNavigationStep<AppSettingsNavigationPayload>({
  key: APP_SETTINGS_NAVIGATION_STEP_KEY,
  activate: async (payload, { signal }) => {
    if (payload === 'background' && props.embedded) {
      showBackgroundSettings.value = true
      await nextTick()
      if (!backgroundEntered.value && !signal.aborted)
        await new Promise<void>((resolve) => {
          const finish = () => {
            backgroundWaiter = null
            signal.removeEventListener('abort', finish)
            resolve()
          }
          backgroundWaiter = finish
          signal.addEventListener('abort', finish, { once: true })
        })
    }
    if (payload === 'windows-only' && !as.isWindows) {
      return { status: 'unavailable', reason: 'windows-only-setting' }
    }
    if (
      payload === 'forced-http-proxy' &&
      networkStore.settings.httpProxy.strategy !== 'fixed-servers'
    ) {
      return { status: 'unavailable', reason: 'http-proxy-fields-hidden' }
    }

    return undefined
  }
})

const closeActions = computed(() => {
  return [
    {
      label: t('settings.app.basic.mainWindowCloseAction.options.minimize-to-tray'),
      value: 'minimize-to-tray'
    },
    { label: t('settings.app.basic.mainWindowCloseAction.options.quit'), value: 'quit' },
    { label: t('settings.app.basic.mainWindowCloseAction.options.ask'), value: 'ask' }
  ]
})

const locales = [
  { label: '中文', value: 'zh-CN' },
  { label: 'English', value: 'en' }
]

const lolSourceOptions = computed(() => [
  { label: t('veyraSettings.onlineHistory'), value: 'sgp' },
  { label: t('veyraSettings.clientHistory'), value: 'lcu' }
])

const themeToneLabel = (id: AppThemeId) => {
  const colorTheme = getThemeColorTheme(id)
  return t(`settings.app.basic.theme.tone.${colorTheme}`)
}

const themeLabel = (id: AppThemeId) => {
  return `${t(`settings.app.basic.theme.options.${id}`, { defaultValue: id })} · ${themeToneLabel(id)}`
}

const themes = computed(() => {
  return [
    {
      type: 'group',
      key: 'workspace',
      label: t('settings.app.basic.theme.groups.workspace'),
      children: WORKSPACE_THEME_IDS.map((id) => ({ label: themeLabel(id), value: id }))
    },
    {
      type: 'group',
      key: 'system',
      label: t('settings.app.basic.theme.groups.system'),
      children: [{ label: t('settings.app.basic.theme.options.default'), value: 'default' }]
    },
    {
      type: 'group',
      key: 'bright-core',
      label: t('settings.app.basic.theme.groups.brightBuiltin'),
      children: BUILTIN_LIGHT_THEME_IDS.filter(
        (id) => !WORKSPACE_THEME_IDS.some((value) => value === id)
      ).map((id) => ({ label: themeLabel(id), value: id }))
    },
    {
      type: 'group',
      key: 'dark-core',
      label: t('settings.app.basic.theme.groups.darkBuiltin'),
      children: BUILTIN_DARK_THEME_IDS.filter(
        (id) => !WORKSPACE_THEME_IDS.some((value) => value === id)
      ).map((id) => ({ label: themeLabel(id), value: id }))
    }
  ]
})

const mainWindowBackgroundMode = mui.useBackgroundMode()
const { filePath: customBackgroundFilePath, overlayStrength: customBackgroundOverlayStrength } =
  mui.useCustomBackgroundSettings()

const mainWindowBackgroundModeOptions = computed(() => {
  return [
    {
      label: t('settings.app.mainWindowUi.background.options.profileSkin'),
      value: 'profile-skin',
      tooltip: t('settings.app.mainWindowUi.background.tooltips.profileSkin')
    },
    {
      label: t('settings.app.mainWindowUi.background.options.customImage'),
      value: 'custom-image'
    },
    {
      label: t('settings.app.mainWindowUi.background.options.none'),
      value: 'none'
    },
    {
      label: t('settings.app.mainWindowUi.background.options.system'),
      value: 'system',
      tooltip: t('settings.app.mainWindowUi.background.tooltips.system'),
      disabled: !wms.supportsSystemBackgroundMaterial
    }
  ]
})

const handleMainWindowBackgroundModeUpdate = (value: string | number | boolean) => {
  void mui.setBackgroundMode(value as MainWindowBackgroundMode)
}

const dialog = useDialog()
const handleDisableHardwareAcceleration = (val: boolean) => {
  dialog.warning({
    title: val
      ? t('settings.app.misc.disableHardwareAccelerationDialog.disableText')
      : t('settings.app.misc.disableHardwareAccelerationDialog.enableText'),
    content: val
      ? t('settings.app.misc.disableHardwareAccelerationDialog.disableConfirmation')
      : t('settings.app.misc.disableHardwareAccelerationDialog.enableConfirmation'),
    positiveText: t('settings.app.misc.disableHardwareAccelerationDialog.positiveText'),
    negativeText: t('settings.app.misc.disableHardwareAccelerationDialog.negativeText'),
    onPositiveClick: async () => {
      await app.setDisableHardwareAcceleration(val)
    }
  })
}

const httpProxyStrategies = computed(() => {
  return [
    {
      label: t('settings.app.httpProxy.strategy.options.system'),
      value: 'system'
    },
    {
      label: t('settings.app.httpProxy.strategy.options.direct'),
      value: 'direct'
    },
    {
      label: t('settings.app.httpProxy.strategy.options.fixed-servers'),
      value: 'fixed-servers'
    }
  ]
})

const updateHttpProxySettings = (obj: Partial<HttpProxySetting>) => {
  network.setHttpProxy({ ...networkStore.settings.httpProxy, ...obj })
}
</script>

<style scoped>
.appearance-introduction p {
  margin: 0 0 12px;
  color: var(--la-workspace-muted);
  font-size: 13px;
  line-height: 1.7;
}
</style>
<style>
.background-settings.n-card {
  width: min(760px, calc(100vw - 48px));
  max-height: 80vh;
  overflow: auto;
}
</style>
<style scoped>
.theme-preferences {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  width: 640px;
  max-width: 100%;
}

@reference '@renderer-shared/assets/css/tailwind.css';

@layer components {
  .hover-text {
    @apply cursor-pointer text-xs text-black/60 transition-[color] duration-300 hover:text-black dark:text-white/60 dark:hover:text-white;
  }

  .step-title {
    @apply text-xs;
  }

  .step-description {
    @apply text-[11px];
  }
}
</style>
