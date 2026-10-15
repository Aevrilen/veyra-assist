<script setup lang="ts">
import {
  equipmentPresentation,
  equipmentPresentationHeight
} from '@shared/mayhem-assistant/equipment-rules'
import {
  CARD_RECTS,
  EQUIPMENT_PANEL_WIDTH,
  SHOP_RECT,
  TITLE_RECTS,
  type Candidate,
  type Category,
  type EquipmentBuildView,
  type Rarity
} from '@shared/mayhem-assistant/model'
import { computed, ref } from 'vue'

import AugmentBar from '../overlay/AugmentBar.vue'
import EquipmentControls from '../overlay/EquipmentControls.vue'
import EquipmentPanel from '../overlay/EquipmentPanel.vue'
import HoldToSuppress from '../overlay/hold-to-suppress/HoldToSuppress.vue'
import { createEmptyFixture, createFixture, type FixtureRole } from './fixtures'

const snapshot = ref(createEmptyFixture())
const loaded = ref(false)
const scene = ref('equipment')
const rarity = ref<Rarity | 'mixed'>('mixed')
const foreground = ref(true)
const temporarilyHidden = ref(false)
const fixtureRole = ref<FixtureRole>('fighter')
let session = 0
const equipmentView = computed(() => equipmentPresentation(snapshot.value))
const equipmentHeight = computed(() => equipmentPresentationHeight(snapshot.value))
const showEquipment = computed(
  () =>
    foreground.value &&
    snapshot.value.shopVisible &&
    !snapshot.value.suppressed &&
    !temporarilyHidden.value
)
const previewCandidates = computed(() =>
  snapshot.value.candidates.map((candidate): Candidate | null =>
    candidate
      ? { ...candidate, rarity: rarity.value === 'mixed' ? candidate.rarity : rarity.value }
      : null
  )
)

function loadFixture() {
  snapshot.value = createFixture(++session, fixtureRole.value)
  loaded.value = true
  foreground.value = true
  temporarilyHidden.value = false
}
function toggleShop() {
  snapshot.value.shopVisible = !snapshot.value.shopVisible
  if (!snapshot.value.shopVisible) temporarilyHidden.value = false
}
function confirmFixture(ids: number[]) {
  snapshot.value.confirmedSelection = {
    sessionKey: snapshot.value.sessionKey!,
    championId: snapshot.value.championId!,
    ids,
    source: 'offline-fixture'
  }
  snapshot.value.buildView = 'standard'
}
function selectCategory(category: Category) {
  snapshot.value.category = category
  snapshot.value.buildView = 'standard'
}
function selectBuildView(view: EquipmentBuildView) {
  snapshot.value.category = 'items'
  snapshot.value.buildView = view
}
function missingData() {
  snapshot.value.equipment = null
  snapshot.value.candidates = [null, null, null]
  snapshot.value.diagnostic = '离线夹具：本英雄统计暂不可用'
}
function breakIcons() {
  Object.values(snapshot.value.itemAssets).forEach((asset) => {
    asset.icon = 'data:image/png;base64,invalid'
  })
}
</script>

<template>
  <main class="debug">
    <div class="debug-toolbar">
      <div class="debug-heading">
        <strong>离线 Overlay 预览</strong
        ><span>2560×1440 · 全部为测试夹具 · 示例编号不是游戏映射 · 无游戏连接</span>
      </div>
      <button @click="loadFixture">载入演示夹具</button>
      <label
        >示例英雄<select v-model="fixtureRole" aria-label="示例英雄" @change="loadFixture">
          <option value="fighter">战士</option>
          <option value="assassin">刺客</option>
          <option value="marksman">射手</option>
          <option value="mage">法师</option>
          <option value="tank">坦克</option>
          <option value="twisted">卡牌</option>
        </select></label
      >
      <button :disabled="!loaded" @click="confirmFixture([1048])">模拟已选珠光 · 仅离线</button>
      <button :disabled="!loaded || fixtureRole !== 'twisted'" @click="confirmFixture([900003])">
        模拟已选回想条件 · 仅离线
      </button>
      <button :disabled="!loaded" @click="confirmFixture([])">清除已选夹具</button>
      <button
        :disabled="!loaded"
        @click="
          snapshot.equipmentContext!.inventory = { ids: [3031, 900001], observedAt: Date.now() }
        "
      >
        模拟已有无尽／火炬
      </button>
      <label
        >场景
        <select v-model="scene" aria-label="预览场景">
          <option value="equipment">装备</option>
          <option value="cards">海克斯</option>
        </select></label
      >
      <label
        >稀有度
        <select v-model="rarity" aria-label="预览稀有度">
          <option value="mixed">三种稀有度</option>
          <option value="gold">黄金</option>
          <option value="silver">白银</option>
          <option value="prismatic">棱彩</option>
        </select></label
      >
      <button :disabled="!loaded" @click="toggleShop">商店开/关</button>
      <button :disabled="!loaded" @click="snapshot.cardsVisible = !snapshot.cardsVisible">
        三卡开/关
      </button>
      <button :disabled="!loaded" @click="foreground = !foreground">
        {{ foreground ? '模拟失焦' : '恢复前台' }}
      </button>
      <button :disabled="!snapshot.suppressed" @click="snapshot.suppressed = false">
        恢复本局装备显示
      </button>
      <button :disabled="!loaded" @click="loadFixture">下一局</button>
      <button :disabled="!loaded" @click="missingData">缺失数据</button>
      <button :disabled="!loaded" @click="breakIcons">图标失败</button>
      <span class="debug-status" role="status">{{
        !loaded
          ? '尚未载入夹具'
          : snapshot.suppressed
            ? '装备推荐本局已隐藏'
            : !foreground
              ? '模拟失焦，Overlay 已隐藏'
              : '离线演示中'
      }}</span>
    </div>
    <div class="debug-viewport">
      <div class="game-canvas" aria-label="2560×1440 离线游戏画布">
        <div class="debug-canvas-label">离线布局示意 · 2560 × 1440</div>
        <template v-if="scene === 'equipment'">
          <div
            v-if="snapshot.shopVisible"
            class="mock-shop"
            :style="{
              left: SHOP_RECT.x + 'px',
              top: SHOP_RECT.y + 'px',
              width: SHOP_RECT.width + 'px',
              height: SHOP_RECT.height + 'px'
            }"
          >
            <b>装备商店 · 尺寸示意</b>
            <div class="mock-grid"><span v-for="index in 24" :key="index"></span></div>
          </div>
          <div
            v-if="showEquipment"
            class="equipment-preview"
            :style="{
              left: SHOP_RECT.x + SHOP_RECT.width + 28 + 'px',
              top: SHOP_RECT.y + 'px',
              width: EQUIPMENT_PANEL_WIDTH + 'px',
              height: equipmentHeight + 'px'
            }"
          >
            <EquipmentPanel :snapshot="snapshot" />
            <EquipmentControls
              :champion-name="snapshot.championName"
              :category="snapshot.category"
              :build-view="snapshot.buildView"
              :adaptation-available="equipmentView.adaptationAvailable"
              @category="selectCategory"
              @build-view="selectBuildView"
              @collapse="temporarilyHidden = true"
            />
            <div class="equipment-actions-preview">
              <HoldToSuppress @suppress="snapshot.suppressed = true" />
            </div>
          </div>
          <button
            v-if="foreground && snapshot.shopVisible && temporarilyHidden && !snapshot.suppressed"
            class="equipment-restore"
            :style="{
              position: 'absolute',
              left: SHOP_RECT.x + SHOP_RECT.width + 28 + 'px',
              top: SHOP_RECT.y + 'px',
              width: '168px',
              height: '36px'
            }"
            @click="temporarilyHidden = false"
          >
            恢复装备推荐
          </button>
        </template>
        <template v-else-if="snapshot.cardsVisible">
          <template v-for="(rect, index) in CARD_RECTS" :key="index">
            <div
              class="mock-card"
              :class="previewCandidates[index]?.rarity || 'silver'"
              :style="{
                left: rect.x + 'px',
                top: rect.y + 'px',
                width: rect.width + 'px',
                height: rect.height + 'px'
              }"
            >
              <span class="mock-emblem">✧</span
              ><strong :style="{ top: TITLE_RECTS[index].y - rect.y + 'px' }">{{
                ['秘术冲拳', '万用瞄准镜', '珠光护手'][index]
              }}</strong>
              <span class="mock-card-caption">游戏内卡片位置示意</span>
            </div>
            <AugmentBar
              v-if="foreground"
              :candidate="previewCandidates[index]"
              :style="{
                left: rect.x + 'px',
                top: rect.y + rect.height + 12 + 'px',
                width: rect.width + 'px'
              }"
            />
          </template>
        </template>
      </div>
    </div>
  </main>
</template>
