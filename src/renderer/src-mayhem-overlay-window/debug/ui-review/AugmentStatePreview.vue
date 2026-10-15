<script setup lang="ts">
import type { Candidate } from '@shared/mayhem-assistant/model'
import { computed, ref } from 'vue'

import AugmentBar from '../../overlay/AugmentBar.vue'

const confirmed: Candidate[] = [
  { id: 1, rarity: 'gold', tier: 'A', winRate: 0.544, pickRate: 0.093 },
  { id: 2, rarity: 'silver', tier: 'B', winRate: 0.508, pickRate: 0.14 },
  { id: 1048, rarity: 'prismatic', tier: 'S', winRate: 0.603, pickRate: 0.118 }
]
const candidates = ref<Array<Candidate | null>>([null, null, null])
const count = computed(() => candidates.value.filter(Boolean).length)
const names = ['秘术冲拳', '万用瞄准镜', '珠光护手']
</script>

<template>
  <section class="augment-state-review" aria-label="海克斯透明评分区域预览">
    <div class="review-section-title">
      <div>
        <h2>海克斯评分区域</h2>
        <p>未确认槽位完全透明，已确认槽位独立保留。</p>
      </div>
      <span class="demo-tag">演示状态 · 无识别调用</span>
    </div>
    <div class="augment-scenario-controls">
      <button @click="candidates = [null, null, null]">全部未确认</button>
      <button @click="candidates = [confirmed[0], null, confirmed[2]]">部分确认</button>
      <button @click="candidates = [...confirmed]">全部确认</button>
      <button @click="candidates[1] = null">刷新中间槽位</button>
      <button @click="candidates[1] = confirmed[1]">确认中间槽位</button>
    </div>
    <div class="augment-preview-stage">
      <div
        v-for="(name, index) in names"
        :key="index"
        class="augment-demo-card"
        :class="confirmed[index].rarity"
      >
        <span class="augment-demo-emblem" aria-hidden="true">✧</span><strong>{{ name }}</strong>
        <span class="augment-demo-caption">卡片位置示意 · 演示</span>
        <div class="augment-score-area" :data-slot="index">
          <AugmentBar :candidate="candidates[index]" />
        </div>
        <button
          class="augment-refresh-demo"
          :aria-label="`刷新第${index + 1}槽 · 演示`"
          @click="candidates[index] = null"
        >
          ↻
        </button>
      </div>
    </div>
    <p class="review-note" role="status">
      {{ count }}/3 槽已确认 · 未确认区域不渲染内容，也不拦鼠标。此预览只显式切换已有状态，不模拟
      OCR 计时。
    </p>
  </section>
</template>

<style scoped>
.augment-state-review {
  padding: 28px 32px;
}
.augment-scenario-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 26px 0;
}
.augment-preview-stage {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 44px;
  max-width: 1360px;
  margin: 0 auto;
  padding: 30px;
  background: radial-gradient(ellipse at 50% 40%, #27303b, #14202c);
  border: 1px solid #354151;
  border-radius: 8px;
}
.augment-demo-card {
  position: relative;
  min-width: 0;
  height: 500px;
  border: 2px solid #967f4a;
  border-radius: 14px;
  background: linear-gradient(#343123, #11151b);
  text-align: center;
}
.augment-demo-card.silver {
  border-color: #8496a8;
  background: linear-gradient(#313b44, #141a25);
}
.augment-demo-card.prismatic {
  border-color: #9985be;
  background: linear-gradient(#3a2f4c, #1b1629);
}
.augment-demo-emblem {
  display: block;
  margin-top: 58px;
  font-size: 110px;
  color: #b8a26b;
  line-height: 160px;
}
.augment-demo-card > strong {
  display: block;
  margin-top: 35px;
  color: #eee5c6;
  font-size: 28px;
  font-weight: 600;
}
.augment-demo-caption {
  display: block;
  margin-top: 14px;
  font-size: 13px;
  color: #91969b;
}
.augment-score-area {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 54px;
  height: 72px;
  pointer-events: none;
}
.augment-refresh-demo {
  position: absolute;
  bottom: 12px;
  left: calc(50% - 16px);
  width: 32px;
  height: 30px;
  padding: 0;
  border: 1px solid #776d56;
  background: #151c28;
  color: #c3b799;
  font-size: 21px;
  line-height: 28px;
}
@media (max-width: 1000px) {
  .augment-preview-stage {
    gap: 16px;
    padding: 18px;
  }
  .augment-demo-card > strong {
    font-size: 22px;
  }
  .augment-score-area {
    left: 4px;
    right: 4px;
  }
}
</style>
