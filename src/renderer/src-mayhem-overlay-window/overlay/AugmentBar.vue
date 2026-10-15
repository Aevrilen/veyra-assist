<script setup lang="ts">
import { type Candidate, percentage } from '@shared/mayhem-assistant/model'

defineProps<{ candidate: Candidate | null; backgroundOpacity?: number }>()
</script>

<template>
  <div
    v-if="candidate"
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
