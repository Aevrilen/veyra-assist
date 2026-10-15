<template>
  <section :class="configureOnly ? 'client-configuration-entry' : 'game-launcher'">
    <SettingsSection v-if="configureOnly" :title="t('veyraSettings.clientPath')"
      ><SettingsRow
        :label="t('veyraSettings.clientPath')"
        :label-description="
          savedConfiguration?.executablePath || t('startup.quickLaunch.pathPlaceholder')
        "
        :label-width="400"
        ><NButton size="small" secondary @click="openConfiguration">{{
          t('startup.quickLaunch.modify')
        }}</NButton></SettingsRow
      ></SettingsSection
    >
    <div v-else class="launch-panel">
      <VeyraLogo class="launch-mark" />
      <h1>{{ t('startup.quickLaunch.title') }}</h1>
      <p class="launch-description">{{ t('startup.quickLaunch.description') }}</p>
      <p class="launch-status">{{ status }}</p>
      <div class="launch-actions">
        <NButton type="primary" size="large" :loading="busy" :disabled="busy" @click="handleLaunch">
          <template #icon
            ><NIcon><Play24Filled /></NIcon
          ></template>
          {{ t('startup.quickLaunch.start') }}
        </NButton>
        <NButton
          v-if="savedConfiguration"
          size="large"
          quaternary
          :disabled="busy"
          @click="openConfiguration"
        >
          {{ t('startup.quickLaunch.modify') }}
        </NButton>
      </div>
      <p v-if="savedConfiguration" class="configured-client">
        {{ clientName(savedConfiguration.client) }}<br /><span>{{
          savedConfiguration.executablePath
        }}</span>
      </p>
    </div>
    <NModal v-model:show="showConfiguration" :mask-closable="!busy" :close-on-esc="!busy">
      <NCard
        class="launch-configuration"
        :title="t('startup.quickLaunch.configureTitle')"
        role="dialog"
        aria-modal="true"
        :bordered="false"
      >
        <p class="configuration-description">{{ t('startup.quickLaunch.configureDescription') }}</p>
        <NRadioGroup v-model:value="selection" class="client-options" :disabled="busy">
          <div v-for="item in detectedClients" :key="item.client" class="client-option">
            <NRadio :value="item.client">{{ item.name }}</NRadio>
            <NEllipsis class="client-path">{{ item.path }}</NEllipsis>
          </div>
          <div class="client-option">
            <NRadio value="manual">{{ t('startup.quickLaunch.manual') }}</NRadio>
          </div>
        </NRadioGroup>
        <div v-if="selection === 'manual'" class="manual-fields">
          <label>{{ t('startup.quickLaunch.clientType') }}</label>
          <NSelect v-model:value="manualClient" :options="manualClientOptions" :disabled="busy" />
          <label>{{ t('startup.quickLaunch.path') }}</label>
          <div class="path-picker">
            <NInput
              v-model:value="manualPath"
              :placeholder="t('startup.quickLaunch.pathPlaceholder')"
              :disabled="busy"
            />
            <NButton :loading="picking" :disabled="busy || picking" @click="selectFile">{{
              t('startup.quickLaunch.browse')
            }}</NButton>
          </div>
          <p class="path-hint">{{ t(`startup.quickLaunch.pathHint.${manualClient}`) }}</p>
        </div>
        <NAlert v-if="configurationError" type="error" class="configuration-error">{{
          configurationError
        }}</NAlert>
        <template #footer>
          <NSpace justify="end">
            <NButton :disabled="busy" @click="showConfiguration = false">{{
              t('startup.quickLaunch.cancel')
            }}</NButton>
            <NButton
              type="primary"
              :loading="busy"
              :disabled="busy || picking || !draftConfiguration"
              @click="saveAndLaunch"
              >{{
                t(configureOnly ? 'veyraSettings.save' : 'startup.quickLaunch.saveAndLaunch')
              }}</NButton
            >
          </NSpace>
        </template>
      </NCard>
    </NModal>
  </section>
</template>

<script setup lang="ts">
import SettingsSection from '@main-window/settings-navigation/NavigableSettingsSection.vue'
import SettingsRow from '@main-window/settings-navigation/NavigableSettingsRow.vue'
import VeyraLogo from '@renderer-shared/assets/icon/VeyraLogo.vue'
import { useInstance } from '@renderer-shared/shards'
import { useAppCommonStore } from '@renderer-shared/shards/app-common/store'
import { ClientInstallationRenderer } from '@renderer-shared/shards/client-installation'
import type { ClientLaunchConfiguration } from '@shared/shards/client-installation'
import { Play24Filled } from '@vicons/fluent'
import { useTranslation } from 'i18next-vue'
import {
  NAlert,
  NButton,
  NCard,
  NEllipsis,
  NIcon,
  NInput,
  NModal,
  NRadio,
  NRadioGroup,
  NSelect,
  NSpace,
  useMessage
} from 'naive-ui'
import { computed, ref } from 'vue'
import { MainWindowUiRenderer } from '@main-window/shards/main-window-ui'
import { useMainWindowUiStore } from '@main-window/shards/main-window-ui/store'
import { useDetectedClientLaunchItems } from './useDetectedClientLaunchItems'

const props = defineProps<{ status: string; configureOnly?: boolean }>()
const { t } = useTranslation()
const message = useMessage()
const installation = useInstance(ClientInstallationRenderer)
const ui = useInstance(MainWindowUiRenderer)
const store = useMainWindowUiStore()
const common = useAppCommonStore()
const detectedClients = useDetectedClientLaunchItems()
const savedConfiguration = computed(() => store.frontendSettings.clientLaunchConfiguration)
const busy = ref(false)
const picking = ref(false)
const showConfiguration = ref(false)
const selection = ref('manual')
const manualClient = ref<ClientLaunchConfiguration['client']>('tcls')
const manualPath = ref('')
const configurationError = ref('')
const clientName = (client: ClientLaunchConfiguration['client']) =>
  t(
    `startup.launcher.${client === 'tcls' ? 'tcls' : client === 'wegame' ? 'weGame' : 'riotClient'}`
  )
const manualClientOptions = computed(() =>
  (common.platform === 'darwin' ? (['riot'] as const) : (['tcls', 'wegame', 'riot'] as const)).map(
    (client) => ({ value: client, label: clientName(client) })
  )
)
const draftConfiguration = computed<ClientLaunchConfiguration | null>(() => {
  if (selection.value === 'manual')
    return manualPath.value.trim()
      ? { client: manualClient.value, executablePath: manualPath.value.trim() }
      : null
  const item = detectedClients.value.find((item) => item.client === selection.value)
  return item ? { client: item.client, executablePath: item.path } : null
})
const openConfiguration = () => {
  configurationError.value = ''
  const saved = savedConfiguration.value
  const detected =
    saved &&
    detectedClients.value.find(
      (item) => item.client === saved.client && item.path === saved.executablePath
    )
  selection.value =
    detected?.client ?? (saved ? 'manual' : (detectedClients.value[0]?.client ?? 'manual'))
  manualClient.value = saved?.client ?? (common.platform === 'darwin' ? 'riot' : 'tcls')
  manualPath.value = saved?.executablePath ?? ''
  showConfiguration.value = true
}
const selectFile = async () => {
  picking.value = true
  try {
    const path = await ui.selectClientExecutable(manualPath.value || undefined)
    if (path) manualPath.value = path
  } catch (cause) {
    configurationError.value = String((cause as Error)?.message ?? cause)
  } finally {
    picking.value = false
  }
}
const start = async (configuration: ClientLaunchConfiguration) => {
  const result = await installation.launchConfiguredClient(configuration)
  if (result === 'invalid-path' || result === 'unsupported-platform') {
    openConfiguration()
    configurationError.value = t(
      `startup.quickLaunch.${result === 'invalid-path' ? 'invalidPath' : 'unsupportedPlatform'}`
    )
  } else if (result === 'already-starting') message.info(t('startup.quickLaunch.alreadyStarting'))
  else message.success(t('startup.quickLaunch.started', { name: clientName(configuration.client) }))
}
const handleLaunch = async () => {
  if (busy.value) return
  if (!savedConfiguration.value) {
    openConfiguration()
    return
  }
  busy.value = true
  try {
    await start(savedConfiguration.value)
  } catch (cause) {
    message.error(String((cause as Error)?.message ?? cause))
  } finally {
    busy.value = false
  }
}
const saveAndLaunch = async () => {
  if (busy.value || picking.value || !draftConfiguration.value) return
  const configuration = draftConfiguration.value
  busy.value = true
  configurationError.value = ''
  try {
    const validation = await installation.validateLaunchConfiguration(configuration)
    if (validation !== 'valid') {
      configurationError.value = t(
        `startup.quickLaunch.${validation === 'invalid-path' ? 'invalidPath' : 'unsupportedPlatform'}`
      )
      return
    }
    await ui.setClientLaunchConfiguration(configuration)
    showConfiguration.value = false
    if (!props.configureOnly) await start(configuration)
  } catch (cause) {
    configurationError.value = String((cause as Error)?.message ?? cause)
    showConfiguration.value = true
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.game-launcher {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 32px 24px;
  box-sizing: border-box;
}
.launch-panel {
  width: min(100%, 640px);
  padding: 36px 40px;
  text-align: center;
  border: 1px solid var(--la-workspace-border);
  border-radius: 16px;
  background: var(--la-workspace-panel);
}
.launch-mark {
  width: 64px;
  height: 64px;
  color: var(--la-color-link);
  margin-bottom: 18px;
}
h1 {
  font-size: 26px;
  line-height: 1.4;
  font-weight: 600;
  margin: 0 0 12px;
}
.launch-description {
  margin: 0;
  color: var(--la-workspace-muted);
  line-height: 1.7;
}
.launch-status {
  font-size: 12px;
  color: var(--la-workspace-muted);
  margin: 16px 0 24px;
}
.launch-actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
}
.configured-client {
  margin: 22px 0 0;
  font-size: 13px;
  color: var(--la-workspace-muted);
}
.configured-client span {
  display: block;
  overflow-wrap: anywhere;
  font-size: 11px;
  margin-top: 4px;
}
.launch-configuration {
  width: 600px;
  max-width: calc(100vw - 40px);
  border-radius: 14px;
}
.configuration-description {
  margin: 0 0 20px;
  color: var(--la-workspace-muted);
  line-height: 1.7;
}
.client-options {
  display: grid;
  gap: 10px;
}
.client-option {
  display: grid;
  gap: 5px;
  padding: 12px 14px;
  border: 1px solid var(--la-workspace-border);
  border-radius: 8px;
}
.client-path {
  font-size: 11px;
  color: var(--la-workspace-muted);
  margin-left: 24px;
  max-width: 100%;
}
.manual-fields {
  display: grid;
  gap: 8px;
  margin-top: 18px;
}
.manual-fields label {
  font-size: 13px;
}
.path-picker {
  display: flex;
  gap: 8px;
}
.path-hint {
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
  color: var(--la-workspace-muted);
}
.configuration-error {
  margin-top: 16px;
}
@media (max-width: 760px) {
  .game-launcher {
    padding: 20px 16px;
  }
  .launch-panel {
    padding: 28px 20px;
  }
}
</style>
