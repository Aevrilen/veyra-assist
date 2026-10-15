<script setup lang="ts">
import { type Candidate, percentage } from '@shared/mayhem-assistant/model'

defineProps<{ candidate: Candidate | null; backgroundOpacity?: number }>()
</script>

<template>
  <div
    v-if="
      candidate && (candidate.tier || candidate.winRate !== null || candidate.pickRate !== null)
    "
    class="augment-bar"
    :style="{ '--augment-background-opacity': backgroundOpacity ?? 0.65 }"
    :class="[candidate.rarity, 'tier-' + (candidate.tier || 'unknown')]"
    :aria-label="`胜率 ${percentage(candidate.winRate)}，选取率 ${percentage(candidate.pickRate)}`"
  >
    <div class="win-stat">
      <small>胜率</small><strong>{{ percentage(candidate.winRate) }}</strong>
    </div>
    <div class="pick-stat">
      <small>选取率</small><span>{{ percentage(candidate.pickRate) }}</span>
    </div>
    <b v-if="candidate?.tier" class="tier" :aria-label="`评级 ${candidate.tier}`">{{
      candidate.tier
    }}</b>
  </div>
</template>

<style scoped>
.augment-bar {
  box-sizing: border-box;
  pointer-events: none;
  --tone: 196, 159, 84;
  --bg: 43, 32, 18;
  --strength: 0.45;
  --rank-tone: 139, 149, 164;
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 72px;
  padding: 8px 20px;
  border: 1px solid rgba(var(--tone), var(--strength));
  border-top: 3px solid rgba(var(--rank-tone), var(--strength));
  border-radius: 7px;
  background: rgba(var(--bg), var(--augment-background-opacity, 0.65));
  box-shadow: inset 0 1px 16px rgba(var(--tone), 0.045);
  font-variant-numeric: tabular-nums;
}
.augment-bar.unknown {
  --tone: 139, 149, 164;
  --bg: 18, 25, 35;
}
.augment-bar.silver {
  --tone: 164, 187, 210;
  --bg: 25, 34, 46;
}
.augment-bar.prismatic {
  --tone: 166, 156, 236;
  --bg: 36, 31, 63;
}
.augment-bar.tier-S {
  --rank-tone: 111, 219, 246;
  --strength: 0.95;
  box-shadow:
    inset 0 1px 16px rgba(var(--rank-tone), 0.06),
    0 0 12px rgba(var(--rank-tone), 0.12);
}
.augment-bar.tier-A {
  --rank-tone: 141, 180, 221;
  --strength: 0.68;
}
.augment-bar.tier-B {
  --strength: 0.4;
}
.win-stat {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.win-stat small,
.pick-stat small {
  font-size: 17px;
  color: #bcb8ad;
  font-weight: 400;
}
.win-stat strong {
  font-size: 34px;
  line-height: 42px;
  color: #f5edde;
  font-weight: 700;
  letter-spacing: -1px;
}
.pick-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-left: auto;
  margin-right: 20px;
}
.pick-stat span {
  font-size: 23px;
  line-height: 28px;
  color: #d2caba;
}
.tier {
  box-sizing: border-box;
  position: absolute;
  top: 7px;
  right: 7px;
  width: 21px;
  height: 21px;
  display: grid;
  place-items: center;
  border-radius: 3px;
  border: 1px solid rgba(var(--rank-tone), 0.55);
  background: rgba(var(--rank-tone), 0.1);
  color: #a3adb8;
  font-size: 14px;
  line-height: 21px;
}
.tier-S .tier {
  border-color: rgba(111, 219, 246, 0.8);
  background: rgba(34, 139, 174, 0.2);
  color: #97e9ff;
}
.tier-A .tier {
  background: rgba(113, 143, 169, 0.15);
  color: #b3c7d9;
}
.tier-B .tier {
  background: rgba(136, 150, 166, 0.1);
  color: #a3adb8;
}

.tier-S .tier {
  font-weight: 800;
  box-shadow: 0 0 7px rgba(var(--rank-tone), 0.28);
}
</style>
