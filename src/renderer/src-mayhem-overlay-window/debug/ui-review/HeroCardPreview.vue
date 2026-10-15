<script setup lang="ts">
import { computed, ref } from 'vue'

const stage = ref<'normal' | 'reward'>('normal')
const compare = ref(false)
const selected = ref<number | null>(null)
const heroes = [
  {
    id: 103,
    name: '阿狸',
    title: '九尾妖狐',
    role: '法师',
    mark: '狐',
    winRate: '52.8%',
    pickRate: '8.2%'
  },
  {
    id: 157,
    name: '亚索',
    title: '疾风剑豪',
    role: '战士',
    mark: '风',
    winRate: '51.6%',
    pickRate: '6.9%'
  },
  {
    id: 99,
    name: '拉克丝',
    title: '光辉女郎',
    role: '法师',
    mark: '光',
    winRate: '53.1%',
    pickRate: '9.4%'
  }
]
const layouts = computed(() => (compare.value ? ['normal', 'reward'] : [stage.value]))
function setStage(value: 'normal' | 'reward') {
  stage.value = value
  compare.value = false
  selected.value = null
}
</script>

<template>
  <section class="hero-review" aria-label="英雄卡片布局预览">
    <div class="review-section-title">
      <div>
        <h2>选英雄</h2>
        <p>常规两张，奖励阶段扩展为三张。</p>
      </div>
      <span class="demo-tag">演示数据 · 非游戏实测</span>
    </div>
    <div class="hero-stage-controls" aria-label="卡片数量">
      <button :aria-pressed="!compare && stage === 'normal'" @click="setStage('normal')">
        常规 · 2张
      </button>
      <button :aria-pressed="!compare && stage === 'reward'" @click="setStage('reward')">
        奖励 · 3张
      </button>
      <button :aria-pressed="compare" @click="compare = !compare">并排比较</button>
    </div>
    <div class="hero-layouts" :class="{ comparing: compare }">
      <section v-for="layout in layouts" :key="layout" class="hero-layout" :data-stage="layout">
        <div class="hero-layout-heading">
          <strong>{{ layout === 'normal' ? '常规选英雄' : '奖励英雄选择' }}</strong
          ><span>{{ layout === 'normal' ? 2 : 3 }}张卡片</span>
        </div>
        <div class="hero-card-grid" :style="{ '--hero-count': layout === 'normal' ? 2 : 3 }">
          <button
            v-for="hero in heroes.slice(0, layout === 'normal' ? 2 : 3)"
            :key="hero.id"
            class="hero-choice"
            :class="{ selected: selected === hero.id }"
            :aria-pressed="selected === hero.id"
            :aria-label="`选择${hero.name} · 演示`"
            @click="selected = hero.id"
          >
            <span class="hero-art" :data-hero="hero.id"
              ><span class="hero-mark">{{ hero.mark }}</span
              ><span class="hero-role">{{ hero.role }}</span></span
            >
            <strong class="hero-name">{{ hero.name }}</strong
            ><span class="hero-title">{{ hero.title }}</span>
            <span class="hero-rates"
              ><span
                >胜率<strong>{{ hero.winRate }}</strong></span
              ><span
                >选取率<strong>{{ hero.pickRate }}</strong></span
              ></span
            >
            <span class="hero-selected">{{
              selected === hero.id ? '已选择 · 演示' : '选择英雄 · 演示'
            }}</span>
          </button>
        </div>
      </section>
    </div>
    <p class="review-note" role="status">
      {{
        selected
          ? `演示选择：${heroes.find((hero) => hero.id === selected)!.name}`
          : '此处只验证卡片数量与布局。真实阶段和候选英雄由根线程协调接入。'
      }}
    </p>
  </section>
</template>

<style scoped>
.hero-review {
  padding: 28px 32px;
}
.hero-stage-controls {
  display: flex;
  gap: 10px;
  margin: 26px 0;
}
.hero-stage-controls button[aria-pressed='true'] {
  border-color: #d8b56b;
  color: #f1dfb7;
  background: #30271a;
}
.hero-layouts {
  display: grid;
  gap: 24px;
}
.hero-layouts.comparing {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.hero-layout {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
  background: rgba(9, 16, 27, 0.97);
  border: 1px solid #76603b;
  border-radius: 10px;
}
.hero-layout[data-stage='normal'] {
  max-width: 700px;
}
.hero-layout-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 24px;
}
.hero-layout-heading strong {
  font-size: 22px;
  font-weight: 600;
}
.hero-layout-heading > span {
  color: #a7adae;
  font-size: 13px;
}
.hero-card-grid {
  display: grid;
  grid-template-columns: repeat(var(--hero-count), minmax(0, 1fr));
  gap: 18px;
}
.hero-choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  padding: 0 0 16px;
  overflow: hidden;
  background: #101c2a;
  border: 1px solid #4f5360;
  border-radius: 7px;
  text-align: center;
}
.hero-choice:hover,
.hero-choice.selected {
  background: #142234;
  border-color: #d8b56b;
}
.hero-art {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 190px;
  background: radial-gradient(ellipse at 50% 65%, #364353, #171d2d);
  border-bottom: 1px solid #454855;
}
.hero-art[data-hero='157'] {
  background: radial-gradient(ellipse at 50% 65%, #3d5263, #162534);
}
.hero-art[data-hero='99'] {
  background: radial-gradient(ellipse at 50% 65%, #6a6052, #272634);
}
.hero-mark {
  display: grid;
  place-items: center;
  width: 104px;
  height: 104px;
  border: 1px solid #9e8b6570;
  border-radius: 50%;
  color: #e3d3b5;
  font-size: 44px;
  font-family: serif;
  box-shadow: 0 0 45px #cbb88c10;
}
.hero-role {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 3px 9px;
  border: 1px solid #aca58f50;
  border-radius: 12px;
  background: #111a2790;
  font-size: 12px;
}
.hero-name {
  margin-top: 20px;
  font-size: 26px;
  font-weight: 600;
  line-height: 34px;
}
.hero-title {
  margin-top: 3px;
  color: #aab2b8;
  font-size: 13px;
}
.hero-rates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 100%;
  gap: 8px;
  margin: 24px 0 18px;
  padding: 0 10px;
}
.hero-rates > span {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #9ca8b2;
  font-size: 12px;
}
.hero-rates strong {
  color: #e6d9bf;
  font-size: 21px;
  font-variant-numeric: tabular-nums;
}
.hero-selected {
  color: #b8a982;
  font-size: 12px;
}
.comparing .hero-card-grid {
  gap: 12px;
}
.comparing .hero-art {
  height: 160px;
}
.comparing .hero-name {
  font-size: 22px;
}
.comparing .hero-rates strong {
  font-size: 18px;
}
@media (max-width: 1000px) {
  .hero-layouts.comparing {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 620px) {
  .hero-review {
    padding: 20px 12px;
  }
  .hero-layout {
    padding: 14px;
  }
  .hero-card-grid {
    gap: 8px;
  }
  .hero-art {
    height: 130px;
  }
  .hero-mark {
    width: 68px;
    height: 68px;
    font-size: 30px;
  }
  .hero-name {
    font-size: 21px;
  }
  .hero-rates {
    padding: 0 4px;
  }
  .hero-rates strong {
    font-size: 17px;
  }
}
</style>
