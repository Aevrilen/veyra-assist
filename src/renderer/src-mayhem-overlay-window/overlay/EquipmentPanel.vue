<script setup lang="ts">
import { equipmentPresentation } from '@shared/mayhem-assistant/equipment-rules'
import {
  EQUIPMENT_CONTROLS_HEIGHT,
  type OverlaySnapshot,
  percentage
} from '@shared/mayhem-assistant/model'
import { computed } from 'vue'

import EquipmentIcon from './EquipmentIcon.vue'

const props = defineProps<{
  snapshot: OverlaySnapshot
  startingTemplate?: Array<{ id: number | null; name: string }>
  startingTemplateMessage?: string
  sourceLabel?: string
}>()
const view = computed(() => equipmentPresentation(props.snapshot))
const startingTemplate = computed(() => props.startingTemplate ?? view.value.startingTemplate)
const startingMessage = computed(
  () =>
    props.startingTemplateMessage ||
    view.value.startingMessage ||
    (!props.snapshot.equipment
      ? '统计加载中或暂不可用'
      : view.value.role.startingStatus === 'configured'
        ? '本定位尚未配置固定出门装'
        : '英雄定位尚未确认，默认出门装暂不可用')
)
const adapted = computed(
  () =>
    props.snapshot.category === 'items' &&
    props.snapshot.buildView === 'augment' &&
    view.value.adaptationAvailable
)
const rows = computed(() =>
  props.snapshot.category === 'items'
    ? view.value.later
    : props.snapshot.category === 'core' && view.value.standardUnavailable
      ? []
      : (props.snapshot.equipment?.categories[props.snapshot.category].slice(0, 6) ?? [])
)
const itemName = (id: number) => props.snapshot.itemAssets[id]?.name || `未知装备 ${id}`
const icon = (id: number | null) => (id === null ? null : props.snapshot.itemAssets[id]?.icon)
</script>

<template>
  <section class="equipment" aria-label="装备推荐">
    <div class="equipment-spacer" :style="{ height: EQUIPMENT_CONTROLS_HEIGHT + 'px' }"></div>
    <template v-if="adapted">
      <div class="build-heading">
        <strong>海克斯适配 · 可选候选</strong><span>标准构筑保持独立</span>
      </div>
      <div class="condition-line">{{ view.conditions.join(' / ') }}</div>
      <div class="column-labels"><span>可选装备</span><span>选取率</span><span>胜率</span></div>
      <div v-for="candidate in view.adapted" :key="candidate.key" class="item-row optional-row">
        <div class="item-description">
          <EquipmentIcon :id="candidate.id" :name="candidate.name" :source="icon(candidate.id)" />
          <div class="item-copy">
            <div class="item-name">{{ candidate.name }}</div>
            <span class="item-reason"
              >{{ candidate.id === null ? '装备映射待核实 · ' : '' }}{{ candidate.reason }}</span
            >
          </div>
        </div>
        <span class="pick">—</span><strong class="win">—</strong>
      </div>
      <div v-if="!view.adapted.length" class="empty" role="status">暂无未拥有的适配候选</div>
      <div class="context-note">相应条件下的统计暂不可用</div>
    </template>
    <template v-else-if="snapshot.category === 'starting'">
      <div class="build-heading"><strong>用户默认模板</strong><span>用户规则 · 不含统计</span></div>
      <div class="starting-template">
        <template v-if="startingTemplate.length">
          <template v-for="(item, index) in startingTemplate" :key="index">
            <span v-if="index" class="plus" aria-hidden="true">+</span>
            <div class="starting-template-piece">
              <EquipmentIcon
                v-if="item.id !== null"
                :id="item.id"
                :name="item.name"
                :source="icon(item.id)"
              />
              <div class="item-copy">
                <div class="item-name">
                  {{ item.name }}<template v-if="item.id !== null"> × 1</template>
                </div>
                <span v-if="item.id === null" class="item-reason">{{ startingMessage }}</span>
              </div>
            </div>
          </template>
        </template>
        <span v-else class="item-reason" role="status">{{ startingMessage }}</span>
      </div>
      <div class="build-heading">
        <strong>网站出门装</strong
        ><span>{{ sourceLabel || snapshot.equipment?.source || '来源暂不可用' }}</span>
      </div>
      <div class="column-labels"><span>网站组合</span><span>选取率</span><span>胜率</span></div>
      <div
        v-for="(row, rowIndex) in rows"
        :key="rowIndex"
        class="item-row item-row-combination starting-website-row"
      >
        <div class="item-description combination">
          <div class="item-icons">
            <template v-for="(id, index) in row.ids" :key="index">
              <span v-if="index" class="plus" aria-hidden="true">+</span>
              <EquipmentIcon :id="id" :name="itemName(id)" :source="icon(id)" />
            </template>
          </div>
          <div class="item-name" :title="row.ids.map(itemName).join(' + ')">
            {{ row.ids.map(itemName).join(' + ') }}
          </div>
        </div>
        <span class="pick">{{ percentage(row.pickRate) }}</span
        ><strong class="win">{{ percentage(row.winRate) }}</strong>
      </div>
      <div v-if="!rows.length" class="empty starting-source-empty" role="status">
        网站出门装统计暂不可用
      </div>
    </template>
    <template v-else>
      <template v-if="snapshot.category === 'items'">
        <div v-if="view.role.tank" class="tank-context">
          <strong>坦克 · 结合本局阵容选择</strong>
          <div v-if="view.teams" class="roster-lines">
            <div>我方：{{ view.teams.allies.map((member) => member.name).join(' · ') }}</div>
            <div>敌方：{{ view.teams.enemies.map((member) => member.name).join(' · ') }}</div>
          </div>
          <div v-else class="context-note">本局阵容暂不可用</div>
          <span class="context-note">不固定标准三件；英雄定位不代表实际伤害比例。</span>
        </div>
        <div v-else class="standard-core">
          <div class="build-heading"><strong>标准核心三件</strong><span>组合统计</span></div>
          <template v-if="view.core">
            <div class="core-tiles">
              <div v-for="(id, index) in view.core.ids" :key="index" class="core-tile">
                <EquipmentIcon :id="id" :name="itemName(id)" :source="icon(id)" />
                <span class="item-name" :title="itemName(id)">{{ itemName(id) }}</span>
              </div>
            </div>
            <div class="core-rates">
              <span
                >选取率 <b>{{ percentage(view.core.pickRate) }}</b></span
              ><span
                >胜率 <strong>{{ percentage(view.core.winRate) }}</strong></span
              >
            </div>
          </template>
          <div v-else class="empty" role="status">
            {{ view.standardUnavailable || '标准核心组合暂不可用' }}
          </div>
        </div>
        <template v-if="view.tankCandidates.length">
          <div class="column-labels">
            <span>防御备选 · 常规统计</span><span>选取率</span><span>胜率</span>
          </div>
          <div
            v-for="candidate in view.tankCandidates"
            :key="candidate.key"
            class="item-row defense-row"
          >
            <div class="item-description">
              <EquipmentIcon
                :id="candidate.id"
                :name="candidate.name"
                :source="icon(candidate.id)"
              />
              <div class="item-copy">
                <div class="item-name">{{ candidate.name }}</div>
                <span class="item-reason">{{ candidate.reason }}</span>
              </div>
            </div>
            <span class="pick">{{ percentage(candidate.row?.pickRate ?? null) }}</span
            ><strong class="win">{{ percentage(candidate.row?.winRate ?? null) }}</strong>
          </div>
        </template>
        <div v-else-if="view.tankMappingPending" class="context-note tank-pending">
          防御装备映射待核实；下方为本英雄常规统计。
        </div>
      </template>
      <div class="column-labels">
        <span>{{
          snapshot.category === 'items'
            ? '后续热门装备'
            : snapshot.category === 'core'
              ? '核心组合统计'
              : '鞋子'
        }}</span
        ><span>选取率</span><span>胜率</span>
      </div>
      <div class="item-list">
        <div
          v-for="(row, rowIndex) in rows"
          :key="`${snapshot.category}-${rowIndex}`"
          class="item-row"
          :class="{
            'item-row-combination': snapshot.category === 'core'
          }"
        >
          <div class="item-description" :class="{ combination: row.ids.length > 1 }">
            <div class="item-icons">
              <template v-for="(id, itemIndex) in row.ids" :key="itemIndex">
                <span v-if="itemIndex" class="plus" aria-hidden="true">+</span>
                <EquipmentIcon :id="id" :name="itemName(id)" :source="icon(id)" />
              </template>
            </div>
            <div class="item-name" :title="row.ids.map(itemName).join(' + ')">
              <template v-for="(id, itemIndex) in row.ids" :key="itemIndex">
                <span v-if="itemIndex" class="name-plus"> + </span><span>{{ itemName(id) }}</span>
              </template>
            </div>
          </div>
          <span class="pick">{{ percentage(row.pickRate) }}</span>
          <strong class="win">{{ percentage(row.winRate) }}</strong>
        </div>
        <div v-if="!rows.length" class="empty" role="status">
          {{ view.standardUnavailable || '暂无本类装备统计' }}
        </div>
      </div>
    </template>
    <div class="source-line">
      <template v-if="snapshot.equipment">
        <span v-if="snapshot.category === 'starting'">网站出门装来源：</span>
        {{ sourceLabel || snapshot.equipment.source }} · {{ snapshot.equipment.date
        }}{{ snapshot.equipment.cached ? ' · 缓存' : '' }}
        <span v-if="snapshot.category === 'items'">
          ·
          {{
            view.inventoryAvailable
              ? '已排除后续候选中的已拥有装备'
              : '背包暂不可用，未排除已拥有装备'
          }}</span
        >
      </template>
      <template v-else>{{ snapshot.diagnostic }}</template>
    </div>
  </section>
</template>
