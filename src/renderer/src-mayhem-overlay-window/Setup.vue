<script setup lang="ts">
import { matchAugmentName } from '@shared/mayhem-assistant/data-adapter'
import {
  CARD_RECTS,
  TITLE_RECTS,
  SHOP_RECT,
  isCalibration,
  isRect,
  type Rect,
  type OverlaySnapshot,
  type AugmentRecognition,
  type AutomaticLocationSample
} from '@shared/mayhem-assistant/model'
import { computed, ref, onMounted, onUnmounted } from 'vue'
import FallbackSetup from '@renderer-shared/components/fallback-calibration/FallbackSetup.vue'

const props = defineProps<{ call: (name: string, ...args: unknown[]) => Promise<any> }>()
type Info = {
  snapshot: OverlaySnapshot
  revision: number
  titleRevision: number
  recognition?: AugmentRecognition[]
  displays: Array<{ id: string; width: number; height: number; scale: number }>
  dictionary: Array<{ id: number; name: string }>
  calibration: unknown
  automaticLocation?: boolean
  locationMethods?: Record<'cards' | 'shop', 'automatic' | 'fallback' | null>
  automaticSample?: AutomaticLocationSample
  preferences?: { augmentBackgroundOpacity: number; path: string; error: string | null }
}
type ImageKey = 'shopOpen' | 'cardsOpen' | 'closed'
type BindingToken = { sessionKey: string | null; revision: number; titleRevision: number }
type Operation = 'import' | 'save' | 'bind' | 'restore' | 'appearance' | 'sample'
const imageLabels: Record<ImageKey, string> = {
  shopOpen: '商店打开',
  cardsOpen: '三卡界面',
  closed: '正常战斗'
}
const cardLabels = ['左卡', '中卡', '右卡']
const operationLabels: Record<Operation, string> = {
  import: '正在读取截图…',
  save: '正在保存校准…',
  bind: '正在绑定名称…',
  restore: '正在恢复本局装备显示…',
  appearance: '正在保存显示设置…',
  sample: '正在准备自动定位…'
}
const info = ref<Info | null>(null)
const message = ref('')
const refreshError = ref('')
const busy = ref<Operation | null>(null)
const displayId = ref('')
const active = ref<ImageKey>('shopOpen')
const images = ref<Record<ImageKey, string>>({ shopOpen: '', cardsOpen: '', closed: '' })
const decodedImages: Partial<Record<ImageKey, HTMLImageElement>> = {}
const shopMarkers = ref<Rect[]>([])
const cardMarkers = ref<Rect[]>([])
const canvas = ref<HTMLCanvasElement>()
const names = ref(['', '', ''])
const bindingToken = ref<BindingToken | null>(null)
const loadedCalibration = ref(false)
const backgroundOpacity = ref(0.65)
const coordinates = ref(
  JSON.stringify({ cardRects: CARD_RECTS, titleRects: TITLE_RECTS, shopRect: SHOP_RECT }, null, 2)
)
const formLocked = computed(() => busy.value !== null || !info.value)
let initialized = false
let disposed = false
let timer: ReturnType<typeof setInterval> | null = null
let refreshRequest: Promise<void> | null = null
let cancelImageRead: (() => void) | null = null

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
function copyRect(rect: Rect): Rect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}
function copyBindingToken(): BindingToken | null {
  const current = info.value
  return current &&
    isCalibration(current.calibration) &&
    current.snapshot.sessionKey &&
    current.titleRevision > 0
    ? {
        sessionKey: current.snapshot.sessionKey,
        revision: current.revision,
        titleRevision: current.titleRevision
      }
    : null
}
function initializeForm(current: Info) {
  if (initialized) return
  backgroundOpacity.value = current.preferences?.augmentBackgroundOpacity ?? 0.65
  const calibration = current.calibration
  if (isCalibration(calibration)) {
    displayId.value = calibration.displayId
    coordinates.value = JSON.stringify(
      {
        cardRects: calibration.cardRects.map(copyRect),
        titleRects: calibration.titleRects.map(copyRect),
        shopRect: copyRect(calibration.shopRect)
      },
      null,
      2
    )
    shopMarkers.value = calibration.shop.map((marker) => copyRect(marker.rect))
    cardMarkers.value = calibration.cards.map((marker) => copyRect(marker.rect))
    loadedCalibration.value = true
  } else {
    displayId.value =
      current.displays.find((d) => d.width === 2560 && d.height === 1440 && d.scale === 1)?.id ?? ''
  }
  initialized = true
}
function refresh(duringOperation = false): Promise<void> {
  if (disposed || (busy.value && !duringOperation)) return Promise.resolve()
  if (refreshRequest) return refreshRequest
  refreshRequest = (async () => {
    try {
      const current = (await props.call('setupInfo')) as Info | null
      if (disposed) return
      if (
        !current?.snapshot ||
        !Array.isArray(current.displays) ||
        !Array.isArray(current.dictionary)
      )
        throw new Error('无法读取校准状态，请在应用设置窗口重试。')
      initializeForm(current)
      info.value = current
      loadedCalibration.value = isCalibration(current.calibration)
      refreshError.value = ''
    } catch (error) {
      if (!disposed) refreshError.value = `状态更新失败：${errorMessage(error)}`
    }
  })().finally(() => {
    refreshRequest = null
  })
  return refreshRequest
}
async function runOperation(operation: Operation, action: () => Promise<void>) {
  if (busy.value || disposed) return
  busy.value = operation
  message.value = ''
  try {
    // A status request already in flight must finish before a mutation starts.
    await refreshRequest
    if (!disposed) await action()
  } catch (error) {
    if (!disposed) message.value = errorMessage(error)
  } finally {
    if (!disposed) busy.value = null
  }
}
async function sampleLocation(scene: 'cards' | 'shop' | null) {
  await runOperation('sample', async () => {
    await props.call('sampleAutomaticLocation', scene)
    await refresh(true)
  })
}
onMounted(() => {
  void refresh()
  timer = setInterval(() => void refresh(), 1000)
})
onUnmounted(() => {
  disposed = true
  if (timer) clearInterval(timer)
  cancelImageRead?.()
})
function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const finish = (error?: Error) => {
      reader.onload = reader.onerror = reader.onabort = null
      cancelImageRead = null
      if (error) reject(error)
      else if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('截图读取失败，请重新选择文件。'))
    }
    reader.onload = () => finish()
    reader.onerror = () => finish(new Error('截图读取失败，请检查文件是否可访问。'))
    reader.onabort = () => finish(new Error('截图读取已取消。'))
    cancelImageRead = () => reader.abort()
    try {
      reader.readAsDataURL(file)
    } catch (error) {
      finish(new Error(`截图读取失败：${errorMessage(error)}`))
    }
  })
}
function decodeImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const finish = (error?: Error) => {
      image.onload = image.onerror = null
      cancelImageRead = null
      if (error) reject(error)
      else resolve(image)
    }
    image.onload = () =>
      finish(
        image.naturalWidth === 2560 && image.naturalHeight === 1440
          ? undefined
          : new Error(
              `截图必须为原始 2560×1440，当前为 ${image.naturalWidth}×${image.naturalHeight}。`
            )
      )
    image.onerror = () => finish(new Error('无法解码截图，请使用有效的 PNG 或 JPEG 文件。'))
    cancelImageRead = () => {
      finish(new Error('截图读取已取消。'))
      image.src = ''
    }
    image.src = source
  })
}
async function load(event: Event, key: ImageKey) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || formLocked.value) return
  await runOperation('import', async () => {
    if (file.type && !['image/png', 'image/jpeg'].includes(file.type))
      throw new Error('请导入 PNG 或 JPEG 原始截图。')
    const source = await readFile(file)
    if (disposed) return
    const image = await decodeImage(source)
    if (disposed) return
    // Only commit a fully decoded image to the label captured by this import.
    images.value[key] = source
    decodedImages[key] = image
    active.value = key
    if (draw()) message.value = `已导入${imageLabels[key]}截图，请核对特征位置。`
  })
}
function draw() {
  const c = canvas.value
  if (!c) return false
  const key = active.value
  const image = decodedImages[key]
  try {
    c.width = 2560
    c.height = 1440
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('截图预览不可用，请重新打开设置窗口。')
    ctx.clearRect(0, 0, c.width, c.height)
    if (!image) return false
    ctx.drawImage(image, 0, 0)
    const markers =
      key === 'shopOpen' ? shopMarkers.value : key === 'cardsOpen' ? cardMarkers.value : []
    ctx.strokeStyle = '#ffd67a'
    ctx.lineWidth = 4
    markers.forEach((rect) => ctx.strokeRect(rect.x, rect.y, rect.width, rect.height))
    return true
  } catch (error) {
    message.value = `${imageLabels[key]}截图预览失败：${errorMessage(error)}`
    return false
  }
}
function showImage(key: ImageKey) {
  if (formLocked.value || !images.value[key]) return
  active.value = key
  draw()
}
function pick(event: MouseEvent) {
  if (formLocked.value || active.value === 'closed' || !decodedImages[active.value]) return
  const c = canvas.value
  if (!c) return
  const bounds = c.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return
  const markers = active.value === 'shopOpen' ? shopMarkers : cardMarkers
  if (markers.value.length === 2) markers.value = []
  markers.value.push({
    x: Math.min(
      2536,
      Math.max(0, Math.round(((event.clientX - bounds.left) * 2560) / bounds.width) - 12)
    ),
    y: Math.min(
      1416,
      Math.max(0, Math.round(((event.clientY - bounds.top) * 1440) / bounds.height) - 12)
    ),
    width: 24,
    height: 24
  })
  draw()
}
function readLayout() {
  let layout: unknown
  try {
    layout = JSON.parse(coordinates.value)
  } catch {
    throw new Error('坐标格式无效，请输入完整的 JSON 对象。')
  }
  if (!layout || typeof layout !== 'object' || Array.isArray(layout))
    throw new Error('坐标必须是包含卡片、标题和商店区域的 JSON 对象。')
  const value = layout as Record<string, unknown>
  if (
    !Array.isArray(value.cardRects) ||
    value.cardRects.length !== 3 ||
    !value.cardRects.every(isRect) ||
    !Array.isArray(value.titleRects) ||
    value.titleRects.length !== 3 ||
    !value.titleRects.every(isRect) ||
    !isRect(value.shopRect)
  )
    throw new Error(
      '需提供三个卡片区域、三个标题区域和一个商店区域；坐标须为整数且位于 2560×1440 内。'
    )
  return {
    cardRects: value.cardRects.map(copyRect),
    titleRects: value.titleRects.map(copyRect),
    shopRect: copyRect(value.shopRect)
  }
}
async function save() {
  if (formLocked.value) return
  await runOperation('save', async () => {
    const display = info.value?.displays.find((d) => d.id === displayId.value)
    if (!display || display.width !== 2560 || display.height !== 1440 || display.scale !== 1)
      throw new Error('请选择 2560×1440、Windows 100% 缩放的显示器。')
    const missing = (Object.keys(imageLabels) as ImageKey[]).filter((key) => !images.value[key])
    if (missing.length)
      throw new Error(`请先导入${missing.map((key) => imageLabels[key]).join('、')}原始截图。`)
    if (![shopMarkers.value, cardMarkers.value].every((markers) => markers.length === 2))
      throw new Error('请分别在商店和三卡截图上选择两个特征区域。')
    const result = await props.call('calibrate', {
      ...readLayout(),
      displayId: displayId.value,
      ...images.value,
      shopMarkers: shopMarkers.value.map(copyRect),
      cardMarkers: cardMarkers.value.map(copyRect)
    })
    if (disposed) return
    if (result !== true) throw new Error('校准未保存，请重试。')
    loadedCalibration.value = true
    bindingToken.value = null
    message.value = '校准已保存。回到游戏后连续确认画面再显示。'
    await refresh(true)
  })
}
function startNameEdit() {
  if (!bindingToken.value) bindingToken.value = copyBindingToken()
}
function resetNames() {
  if (formLocked.value) return
  names.value = ['', '', '']
  bindingToken.value = null
  message.value = '名称已清空。请确认游戏中的三卡画面后重新填写。'
}
async function bind() {
  if (formLocked.value) return
  const submittedNames = names.value.map((name) => name.trim())
  await runOperation('bind', async () => {
    if (!isCalibration(info.value?.calibration))
      throw new Error('手工名称诊断需要先保存手工位置校准。已填写的名称会保留。')
    if (!info.value?.snapshot.sessionKey)
      throw new Error('当前没有可绑定的对局。已填写的名称会保留，请等待本局状态恢复。')
    const token = bindingToken.value ? { ...bindingToken.value } : copyBindingToken()
    if (!token?.sessionKey)
      throw new Error('尚未采集到可绑定的三卡画面。请回到游戏显示三卡至少 1 秒，再核对名称后绑定。')
    const dictionary =
      info.value?.dictionary.map((entry) => ({ id: entry.id, name: entry.name })) ?? []
    if (!dictionary.length) throw new Error('海克斯名称字典尚未加载，请稍后重试。')
    const invalid = submittedNames.flatMap((name, index) =>
      !name || matchAugmentName(name, dictionary) === null ? [index] : []
    )
    if (invalid.length)
      throw new Error(
        `无法确认${invalid.map((index) => `${cardLabels[index]}「${submittedNames[index] || '未填写'}」`).join('、')}，请从名称列表选择完整且唯一的名称。`
      )
    const ok = await props.call(
      'bindNames',
      token.sessionKey,
      token.revision,
      token.titleRevision,
      submittedNames
    )
    if (disposed) return
    if (ok !== true) bindingToken.value = null
    message.value =
      ok === true
        ? '名称已绑定到最近三卡画面，回到游戏复核后显示。'
        : '三卡画面已变化或不可用，已填写的名称会保留。请回到游戏重新采集，核对左中右名称后再次绑定。'
    await refresh(true)
  })
}
async function restore() {
  if (formLocked.value) return
  const sessionKey = info.value?.snapshot.sessionKey
  await runOperation('restore', async () => {
    if (!sessionKey) throw new Error('当前没有可恢复的对局。')
    const ok = await props.call('restore', sessionKey)
    if (disposed) return
    message.value =
      ok === true
        ? '已恢复本局装备显示，回到游戏打开商店后显示。'
        : '恢复失败：本局身份已变化，请等待状态更新后重试。'
    await refresh(true)
  })
}
async function saveAppearance() {
  if (formLocked.value) return
  await runOperation('appearance', async () => {
    await props.call('backgroundOpacity', backgroundOpacity.value)
    message.value = '评分背景不透明度已保存；文字保持清晰。'
    await refresh(true)
  })
}
</script>
<template>
  <main class="setup" :aria-busy="busy !== null">
    <h1>游戏内辅助设置</h1>
    <p>Windows 自动定位支持 1920×1080 与 2560×1440。进入游戏后自动识别商店和三卡。</p>
    <section>
      <h2>自动定位</h2>
      <p>首次使用无需导入截图。如尚未找到界面，选择当前场景，再回到游戏保持界面可见。</p>
      <p>
        {{
          info
            ? Object.values(info.locationMethods ?? {}).includes('fallback')
              ? '当前画面通过框选备用定位'
              : info.automaticLocation
                ? '当前使用自动定位'
                : '当前使用手工诊断定位'
            : '正在读取状态…'
        }}
      </p>
      <div class="setup-actions">
        <button :disabled="formLocked" @click="sampleLocation('shop')">确认商店位置</button>
        <button :disabled="formLocked" @click="sampleLocation('cards')">确认三卡位置</button>
        <button :disabled="formLocked" @click="sampleLocation(null)">恢复自动定位</button>
      </div>
      <p role="status" aria-live="polite">{{ info?.automaticSample?.message }}</p>
    </section>
    <section>
      <h2>当前状态</h2>
      <p>{{ info?.snapshot.diagnostic || '正在读取状态…' }}</p>
      <p v-if="refreshError" class="setup-error" role="alert">{{ refreshError }}</p>
      <p>
        {{ info?.snapshot.championName }} ·
        {{ info?.snapshot.augmentData?.source || '暂无海克斯统计' }} ·
        {{ info?.snapshot.augmentData?.date || '--'
        }}{{ info?.snapshot.augmentData?.cached ? ' · 缓存' : '' }}
      </p>
      <button
        :disabled="formLocked || !info?.snapshot.sessionKey || !info?.snapshot.suppressed"
        @click="restore"
      >
        {{ busy === 'restore' ? '正在恢复…' : '恢复本局装备显示' }}
      </button>
    </section>
    <section>
      <h2>框选备用定位</h2>
      <FallbackSetup :call="call" />
    </section>
    <section class="appearance-controls">
      <h2>评分显示</h2>
      <label
        >背景不透明度 {{ Math.round(backgroundOpacity * 100) }}%
        <input
          v-model.number="backgroundOpacity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          :disabled="formLocked"
          aria-label="评分背景不透明度"
        />
      </label>
      <button :disabled="formLocked" @click="saveAppearance">保存显示设置</button>
      <p>评分放在卡片说明下方留白内，避开刷新按钮。透明度只调整背景，文字不跟随变淡。</p>
      <p v-if="info?.preferences?.error" class="setup-error" role="alert">
        {{ info.preferences.error }}
      </p>
      <p v-if="info?.preferences?.path">
        偏好文件：<code>{{ info.preferences.path }}</code>
      </p>
    </section>
    <details>
      <summary>手工位置诊断（2560×1440、100% 缩放）</summary>
      <section>
        <h2>导入诊断截图</h2>
        <p>
          使用商店打开、海克斯三卡、正常战斗三张截图。同一显示器、分辨率与缩放。截图只在本机处理。
        </p>
        <p v-if="loadedCalibration">当前已有保存的校准；重新保存校准仍需导入三张原始截图。</p>
        <fieldset :disabled="formLocked">
          <label
            >显示器
            <select v-model="displayId">
              <option value="" disabled>请选择支持的显示器</option>
              <option
                v-if="displayId && !info?.displays.some((display) => display.id === displayId)"
                :value="displayId"
                disabled
              >
                {{ displayId }} · 当前不可用
              </option>
              <option
                v-for="display in info?.displays"
                :key="display.id"
                :value="display.id"
                :disabled="display.width !== 2560 || display.height !== 1440 || display.scale !== 1"
              >
                {{ display.id }} · {{ display.width }}×{{ display.height }} ·
                {{ display.scale * 100 }}%
              </option>
            </select>
          </label>
          <div class="file-inputs">
            <label v-for="(title, key) in imageLabels" :key="key">
              {{ title }}
              <input
                type="file"
                accept="image/png,image/jpeg"
                :aria-label="`${title}原始截图，PNG 或 JPEG，2560×1440`"
                :aria-describedby="`calibration-image-status-${key}`"
                @change="load($event, key)"
              />
              <button
                :disabled="!images[key]"
                :aria-pressed="active === key && !!images[key]"
                @click="showImage(key)"
              >
                查看
              </button>
              <span :id="`calibration-image-status-${key}`" aria-live="polite">
                {{ images[key] ? '已导入 · 2560×1440' : '未导入' }}
              </span>
            </label>
          </div>
          <p>已导入的截图可直接点击“查看”；商店和三卡图可继续选择特征，无需重选文件。</p>
          <p>
            分别在商店图、三卡图中点击两个稳定且明显区别于战斗画面的边框/标题区域。避开装备、动画、鼠标、英雄和文字动态数值。再次点击可重选。
          </p>
          <p>商店特征 {{ shopMarkers.length }}/2 · 三卡特征 {{ cardMarkers.length }}/2</p>
          <p>
            {{ images[active] ? `当前截图：${imageLabels[active]}` : '请导入截图后选择特征。' }}
          </p>
          <canvas
            ref="canvas"
            class="calibration-canvas"
            width="2560"
            height="1440"
            :aria-label="`${imageLabels[active]}截图特征校准`"
            @click="pick"
          ></canvas>
          <details>
            <summary>卡片、标题 OCR 区域和商店坐标</summary>
            <textarea
              v-model="coordinates"
              rows="12"
              aria-label="卡片、标题和商店区域 JSON 坐标"
            ></textarea>
          </details>
          <button @click="save">{{ busy === 'save' ? '正在保存…' : '保存校准' }}</button>
        </fieldset>
      </section>
    </details>
    <section>
      <h2>当前三卡识别</h2>
      <p>
        回到游戏显示三卡；连续两次本地识别对应后端门槛达标且名称唯一匹配后，显示对应统计。刷新或识别不可靠时显示“识别未完成”。
      </p>
      <p v-for="(line, index) in info?.recognition" :key="index">
        {{ cardLabels[index] }}：{{ line.text || '未读到文字' }} ·
        {{
          line.backend === 'rapidocr'
            ? `RapidOCR 试验原始分数 ${line.rawScore === null ? '未推理' : line.rawScore.toFixed(5)}（试验门槛0.95，仅当前语料）`
            : `Tesseract 置信度 ${Math.round(line.confidence)}`
        }}
        · {{ line.stable ? `候选 ID ${line.id}` : '识别未完成' }}
      </p>
      <details>
        <summary>手工名称诊断</summary>
        <p v-if="info && !isCalibration(info.calibration)" class="setup-error">
          手工名称诊断需要先保存手工位置校准。已填写的名称会保留。
        </p>
        <p>
          自动识别异常时，可核对三卡标题并手工绑定用于诊断；此结果会标明来自手工诊断，不作为自动识别成功的证据。卡面变化后自动恢复识别。这里不确认已持有海克斯，也不触发条件装备路线。
        </p>
        <fieldset :disabled="formLocked">
          <div class="name-inputs">
            <input
              v-for="(_, index) in names"
              :key="index"
              v-model="names[index]"
              :placeholder="cardLabels[index]"
              :aria-label="`${cardLabels[index]}海克斯名称`"
              list="augments"
              @input="startNameEdit"
            />
            <datalist id="augments">
              <option
                v-for="entry in info?.dictionary"
                :key="entry.id"
                :value="entry.name"
              ></option>
            </datalist>
          </div>
          <p v-if="bindingToken">名称对应开始填写时的三卡画面；卡片变化后请核对并更新名称。</p>
          <div class="setup-actions">
            <button :disabled="!isCalibration(info?.calibration)" @click="bind">
              {{ busy === 'bind' ? '正在绑定…' : '绑定当前三卡' }}
            </button>
            <button @click="resetNames">清空重填</button>
          </div>
        </fieldset>
      </details>
    </section>
    <p class="setup-message" role="status">{{ busy ? operationLabels[busy] : message }}</p>
  </main>
</template>
<style scoped>
fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.setup-actions {
  display: flex;
  gap: 12px;
}
.setup-error {
  color: #f0b6a7;
}
.file-inputs input[type='file'] {
  font-size: 0;
}
.file-inputs input[type='file']::file-selector-button {
  margin: 0;
  padding: 8px 12px;
  border: 1px solid #725c33;
  border-radius: 4px;
  background: #151c28;
  color: #eee6d2;
  font-family: inherit;
  font-size: 16px;
  line-height: 1.4;
  cursor: pointer;
}
.file-inputs input[type='file']:hover:not(:disabled)::file-selector-button {
  background: #283246;
}
.file-inputs input[type='file']:disabled::file-selector-button {
  cursor: not-allowed;
}
.calibration-canvas {
  display: block;
  aspect-ratio: 16 / 9;
  cursor: crosshair;
}
fieldset:disabled .calibration-canvas {
  cursor: wait;
}
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
summary:focus-visible {
  outline: 2px solid #d8b56b;
  outline-offset: 2px;
}
input:disabled,
select:disabled,
textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
