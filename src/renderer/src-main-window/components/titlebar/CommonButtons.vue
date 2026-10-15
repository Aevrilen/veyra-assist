<template>
  <div class="common-buttons" :class="{ blurred: mws.focus === 'blurred' }">
    <!-- aux window -->
    <HorizontalExpand :show="aws.settings.enabled" class="h-full">
      <NTooltip :z-index="TITLE_BAR_TOOLTIP_Z_INDEX">
        <template #trigger>
          <div class="common-button-outer" @click="handleShowAuxWindow">
            <div class="common-button-inner">
              <NIcon><Window24Filled /></NIcon>
            </div>
          </div>
        </template>
        {{ t('titlebar.actions.auxWindow') }}
      </NTooltip>
    </HorizontalExpand>
  </div>
</template>

<script setup lang="ts">
import HorizontalExpand from '@renderer-shared/components/HorizontalExpand.vue'
import { useInstance } from '@renderer-shared/shards'
import { WindowManagerRenderer } from '@renderer-shared/shards/window-manager'
import { useAuxWindowStore, useMainWindowStore } from '@renderer-shared/shards/window-manager/store'
import { Window24Filled } from '@vicons/fluent'
import { useTranslation } from 'i18next-vue'
import { NIcon, NTooltip } from 'naive-ui'

const { t } = useTranslation()

const mws = useMainWindowStore()
const aws = useAuxWindowStore()
const wm = useInstance(WindowManagerRenderer)

const TITLE_BAR_TOOLTIP_Z_INDEX = 75000

const handleShowAuxWindow = () => {
  wm.auxWindow.show()
}
</script>

<style scoped>
.common-buttons {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-around;

  &.blurred {
    filter: brightness(0.8);
  }

  .common-button-outer {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 32px;
    height: 100%;
    cursor: pointer;
    -webkit-app-region: no-drag;
  }

  .common-button-inner {
    padding: 4px;
    border-radius: 2px;
    transition:
      background-color 0.3s,
      color 0.3s;
    font-size: 16px;

    i {
      display: block;
    }
  }

  .common-button-inner-img {
    width: 16px;
    height: 16px;
  }
}

[data-theme='dark'] {
  .common-buttons {
    .common-button-outer:hover .common-button-inner {
      background-color: rgba(255, 255, 255, 0.15);
      color: rgba(255, 255, 255, 1);
    }

    .common-button-outer:active .common-button-inner {
      background-color: rgba(255, 255, 255, 0.1);
    }

    .common-button-inner {
      color: rgba(255, 255, 255, 0.86);
    }
  }
}

[data-theme='light'] {
  .common-buttons {
    .common-button-outer:hover .common-button-inner {
      background-color: rgba(0, 0, 0, 0.15);
      color: rgba(0, 0, 0, 1);
    }

    .common-button-outer:active .common-button-inner {
      background-color: rgba(0, 0, 0, 0.1);
    }

    .common-button-inner {
      color: rgba(0, 0, 0, 0.86);
    }
  }
}

[data-theme-id='dark'] {
  .common-buttons {
    .common-button-outer:hover .common-button-inner {
      background-color: rgba(255, 255, 255, 0.15);
      color: rgba(255, 255, 255, 1);
    }

    .common-button-outer:active .common-button-inner {
      background-color: rgba(255, 255, 255, 0.1);
    }

    .common-button-inner {
      color: rgba(255, 255, 255, 0.86);
    }
  }
}

[data-theme-id]:not([data-theme-id='light']):not([data-theme-id='dark']) {
  .common-buttons {
    .common-button-outer:hover .common-button-inner {
      background-color: color-mix(in oklch, var(--la-color-link) 18%, transparent);
      color: var(--la-color-text-themed);
    }

    .common-button-outer:active .common-button-inner {
      background-color: color-mix(in oklch, var(--la-color-link) 12%, transparent);
    }

    .common-button-inner {
      color: color-mix(in oklch, var(--la-color-text-themed) 92%, transparent);
    }
  }
}

[data-theme-id='graphite'] {
  .common-buttons {
    .common-button-outer:hover .common-button-inner {
      background-color: rgba(105, 202, 255, 0.2);
      color: #e2edf7;
    }

    .common-button-outer:active .common-button-inner {
      background-color: rgba(105, 202, 255, 0.14);
    }

    .common-button-inner {
      color: rgba(226, 237, 247, 0.9);
    }
  }
}

[data-theme-id='sakura'] {
  .common-buttons {
    .common-button-outer:hover .common-button-inner {
      background-color: rgba(212, 90, 134, 0.18);
      color: rgba(49, 44, 52, 0.95);
    }

    .common-button-outer:active .common-button-inner {
      background-color: rgba(212, 90, 134, 0.12);
    }

    .common-button-inner {
      color: rgba(49, 44, 52, 0.86);
    }
  }
}

[data-theme-id='mint'] {
  .common-buttons {
    .common-button-outer:hover .common-button-inner {
      background-color: rgba(36, 136, 115, 0.16);
      color: rgba(33, 45, 42, 0.95);
    }

    .common-button-outer:active .common-button-inner {
      background-color: rgba(36, 136, 115, 0.12);
    }

    .common-button-inner {
      color: rgba(33, 45, 42, 0.88);
    }
  }
}

[data-theme-id='aurora'] {
  .common-buttons {
    .common-button-outer:hover .common-button-inner {
      background-color: rgba(193, 168, 255, 0.2);
      color: #f3f2f8;
    }

    .common-button-outer:active .common-button-inner {
      background-color: rgba(193, 168, 255, 0.14);
    }

    .common-button-inner {
      color: rgba(243, 242, 248, 0.88);
    }
  }
}

[data-theme-id='butter'] {
  .common-buttons {
    .common-button-outer:hover .common-button-inner {
      background-color: rgba(194, 127, 34, 0.16);
      color: rgba(66, 57, 48, 0.95);
    }

    .common-button-outer:active .common-button-inner {
      background-color: rgba(194, 127, 34, 0.12);
    }

    .common-button-inner {
      color: rgba(66, 57, 48, 0.88);
    }
  }
}
</style>
