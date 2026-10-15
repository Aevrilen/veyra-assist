<script setup lang="ts">
import { equipmentPresentationHeight } from '@shared/mayhem-assistant/equipment-rules'
import type { Category } from '@shared/mayhem-assistant/model'
import { computed, ref } from 'vue'

import EquipmentControls from '../../overlay/EquipmentControls.vue'
import EquipmentPanel from '../../overlay/EquipmentPanel.vue'
import HoldToSuppress from '../../overlay/hold-to-suppress/HoldToSuppress.vue'
import {
  createEmptyFixture,
  createFixture,
  createUnknownItemFixture,
  type FixtureRole
} from '../fixtures'
import HeroCardPreview from './HeroCardPreview.vue'
import AugmentStatePreview from './AugmentStatePreview.vue'

const tab = ref('equipment')
const loaded = ref(false)
const snapshot = ref(createEmptyFixture())
const role = ref<FixtureRole>('fighter')
const scenario = ref<'normal' | 'unknown'>('normal')
const collapsed = ref(false)
const foreground = ref(true)
let session = 0
const height = computed(() => equipmentPresentationHeight(snapshot.value))
const visible = computed(
  () => loaded.value && foreground.value && snapshot.value.shopVisible && !snapshot.value.suppressed
)
function load() {
  snapshot.value =
    scenario.value === 'unknown'
      ? createUnknownItemFixture(++session, role.value)
      : createFixture(++session, role.value)
  snapshot.value.category = scenario.value === 'unknown' ? 'items' : 'starting'
  loaded.value = true
  collapsed.value = false
  foreground.value = true
}
function category(value: Category) {
  snapshot.value.category = value
  snapshot.value.buildView = 'standard'
}
function toggleShop() {
  snapshot.value.shopVisible = !snapshot.value.shopVisible
  if (!snapshot.value.shopVisible) collapsed.value = false
}
</script>

<template>
  <main class="review-app">
    <header class="review-header">
      <div>
        <span class="review-kicker">AKARI / UI REVIEW</span>
        <h1>悬浮窗交互审查</h1>
      </div>
      <span class="demo-tag">全部为演示数据 · 未连接游戏</span>
    </header>
    <nav class="review-tabs" aria-label="审查场景">
      <button :aria-current="tab === 'equipment' ? 'page' : undefined" @click="tab = 'equipment'">
        装备悬浮窗
      </button>
      <button :aria-current="tab === 'heroes' ? 'page' : undefined" @click="tab = 'heroes'">
        选英雄 · 2→3卡
      </button>
      <button :aria-current="tab === 'augments' ? 'page' : undefined" @click="tab = 'augments'">
        海克斯 · 透明评分区
      </button>
    </nav>
    <template v-if="tab === 'equipment'">
      <div class="review-equipment-grid">
        <aside class="review-sidebar">
          <span class="review-kicker">交互演示</span>
          <h2>减少误触，保留恢复</h2>
          <p>英雄名居中。左上角小 − 临时收起，展开按钮留在原位置，点击后立即恢复当前内容。</p>
          <p>右下角长按一秒后，本局不再显示。短按、释放、移出或失焦会取消。下一局自动恢复。</p>
          <button class="load-demo" @click="load">载入演示数据</button>
          <label
            >示例英雄<select
              v-model="role"
              :disabled="!loaded"
              aria-label="示例英雄"
              @change="load"
            >
              <option value="fighter">战士 · 亚索</option>
              <option value="assassin">物理刺客 · 劫</option>
              <option value="mage">法师 · 阿狸</option>
              <option value="tank">坦克 · 阿利斯塔</option>
              <option value="marksman">射手 · 卢锡安</option>
              <option value="gwen">格温 · 守护者待定</option>
            </select></label
          >
          <label>
            演示用例<select
              v-model="scenario"
              aria-label="演示用例"
              :disabled="!loaded"
              @change="load"
            >
              <option value="normal">正常 · 开局出门装</option>
              <option value="unknown">异常 · 未知装备 123430</option>
            </select>
          </label>
          <div class="review-simulation">
            <button :disabled="!loaded" @click="toggleShop">商店开/关</button>
            <button :disabled="!loaded" @click="foreground = !foreground">
              {{ foreground ? '模拟失焦' : '恢复前台' }}
            </button>
            <button :disabled="!loaded" @click="load">下一局</button>
          </div>
          <span class="review-state" role="status">{{
            !loaded
              ? '请显式载入演示数据'
              : snapshot.suppressed
                ? '本局已隐藏 · 下一局恢复'
                : !foreground
                  ? '已失焦 · 悬浮窗隐藏'
                  : !snapshot.shopVisible
                    ? '商店已关闭'
                    : collapsed
                      ? '暂时收起 · 可随时恢复'
                      : '演示第' + session + '局 · 商店打开'
          }}</span>
          <p class="review-note">
            开局默认模板按
            10月12日用户规则演示：战士、射手、物理刺客为守护者之刃＋长剑；坦克为守护者号角＋红水晶。格温为守护者装备（待定）＋增幅典籍。
          </p>
          <p class="review-note">
            图标为本地官方静态资源，仅作演示。装备编号不代表生产 KIWI 映射。本页不调用 LCU、截图或
            OCR。
          </p>
        </aside>
        <div class="review-stage" :style="{ minHeight: height + 80 + 'px' }">
          <span class="review-stage-label">装备商店右侧 · 离线布局示意</span>
          <div
            v-if="visible && !collapsed"
            class="review-equipment"
            :style="{ height: height + 'px' }"
          >
            <EquipmentPanel :snapshot="snapshot" source-label="演示网站统计 · 未连接接口" />
            <EquipmentControls
              :champion-name="snapshot.championName"
              :category="snapshot.category"
              @category="category"
              @collapse="collapsed = true"
            />
            <div class="equipment-actions-preview">
              <HoldToSuppress
                :key="snapshot.sessionKey || ''"
                @suppress="snapshot.suppressed = true"
              />
            </div>
          </div>
          <div v-else-if="visible && collapsed" class="review-restore">
            <button class="equipment-restore" @click="collapsed = false">恢复装备推荐</button>
          </div>
          <div v-else class="review-stage-empty">
            {{
              !loaded
                ? '载入演示数据后显示装备悬浮窗'
                : snapshot.suppressed
                  ? '装备推荐已在本局隐藏'
                  : '等待商店与前台恢复'
            }}
          </div>
        </div>
      </div>
    </template>
    <HeroCardPreview v-else-if="tab === 'heroes'" />
    <AugmentStatePreview v-else />
    <footer class="review-footer">离线交互预览 · 演示统计与英雄卡片只用于布局审查</footer>
  </main>
</template>

<style>
body {
  overflow: auto;
  background: #0c1421;
}
.review-app {
  min-height: 100vh;
  max-width: 1600px;
  margin: 0 auto;
  background: #101925;
  color: #eee6d2;
}
.review-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 26px 32px 22px;
  border-bottom: 1px solid #354151;
}
.review-kicker {
  color: #a7997c;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 2px;
}
.review-app h1 {
  margin: 8px 0 0;
  font-size: 26px;
  line-height: 36px;
  font-weight: 600;
}
.review-app h2 {
  margin: 8px 0 16px;
  font-size: 24px;
  line-height: 34px;
  font-weight: 600;
}
.demo-tag {
  padding: 7px 12px;
  border: 1px solid #4c4e4d;
  border-radius: 4px;
  color: #c5bda9;
  font-size: 12px;
  white-space: nowrap;
}
.review-tabs {
  display: flex;
  gap: 28px;
  padding: 0 32px;
  border-bottom: 1px solid #354151;
}
.review-tabs button {
  padding: 14px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #aab2bd;
  font-size: 15px;
}
.review-tabs button[aria-current='page'] {
  color: #ead9ae;
  box-shadow: inset 0 -2px #c9a95d;
}
.review-equipment-grid {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
}
.review-sidebar {
  padding: 36px 28px;
  border-right: 1px solid #354151;
}
.review-sidebar p {
  margin: 12px 0;
  color: #acb4bc;
  font-size: 14px;
  line-height: 24px;
}
.review-sidebar .load-demo {
  width: 100%;
  margin: 20px 0 18px;
  border-color: #a58951;
  color: #ead9ae;
  background: #29261f;
}
.review-sidebar label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: #aeb7c0;
  margin-bottom: 14px;
}
.review-simulation {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 18px 0;
}
.review-simulation button {
  padding: 7px 6px;
  font-size: 12px;
}
.review-state {
  display: block;
  padding: 14px;
  border-left: 2px solid #9e8853;
  background: #162230;
  color: #d5c6a7;
  font-size: 13px;
  line-height: 22px;
}
.review-stage {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 48px 26px 32px;
  background: radial-gradient(ellipse at 50% 30%, #23313a, #111d29 80%);
  overflow: auto;
}
.review-stage-label {
  position: absolute;
  top: 17px;
  left: 26px;
  font-size: 12px;
  color: #8e9ba7;
}
.review-equipment {
  position: relative;
  width: 640px;
  flex: none;
}
.review-restore {
  width: 640px;
  flex: none;
}
.review-restore button {
  width: 168px;
  height: 36px;
}
.review-stage-empty {
  align-self: center;
  margin: auto;
  padding: 50px 12px;
  color: #a6b0ba;
  text-align: center;
  font-size: 16px;
}
.review-section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}
.review-section-title h2 {
  margin: 0 0 8px;
}
.review-section-title p {
  margin: 0;
  color: #aeb7c0;
  font-size: 14px;
}
.review-note {
  color: #8b98a6;
  font-size: 12px;
  line-height: 21px;
}
.review-footer {
  padding: 16px 32px;
  border-top: 1px solid #354151;
  color: #83909e;
  font-size: 11px;
}
@media (max-width: 1050px) {
  .review-equipment-grid {
    grid-template-columns: 240px minmax(0, 1fr);
  }
  .review-sidebar {
    padding: 28px 18px;
  }
  .review-stage {
    justify-content: flex-start;
  }
}
@media (max-width: 740px) {
  .review-header {
    padding: 20px 16px;
    flex-wrap: wrap;
    gap: 12px;
  }
  .review-equipment-grid {
    grid-template-columns: 1fr;
  }
  .review-sidebar {
    border: 0;
    padding: 24px 16px;
  }
  .review-stage {
    padding: 48px 12px 24px;
  }
  .review-section-title {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
