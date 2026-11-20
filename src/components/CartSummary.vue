<template>
  <!--
    摘要（#21）与紧凑入口（#22）合用一个按钮：
    - ≥1145px 是右下角摘要卡（约 220px），点击展开右侧抽屉；
    - <1145px 收成一个同时显示件数与总金额的紧凑入口，点击展开底部抽屉。
  -->
  <button
    id="cart-summary-trigger"
    :aria-controls="PANEL_ID"
    :aria-expanded="cartPanel.panelOpen ? 'true' : 'false'"
    aria-haspopup="dialog"
    :aria-label="triggerLabel"
    :class="[
      'summary-trigger fixed right-4 bottom-4 z-30 rounded-xl border border-outline bg-surface text-left shadow-sm transition-colors',
      'hover:border-primary',
      isCompact ? 'px-4 py-2.5' : 'w-[220px] px-4 py-3',
    ]"
    :data-form="isCompact ? 'compact' : 'card'"
    data-state="cart-summary"
    type="button"
    @click="openPanel"
  >
    <span v-if="isCompact" class="flex items-baseline gap-1.5 text-sm font-semibold" data-state="cart-summary-figures">
      <span class="tabular-nums">{{ totalQuantity }} 件</span>
      <span aria-hidden="true" class="text-muted">·</span>
      <span class="tabular-nums">{{ formatPriceCents(totalAmountCents) }}</span>
    </span>
    <template v-else>
      <span class="block text-xs text-muted">购物车</span>
      <span class="mt-1 flex items-baseline gap-1.5 text-lg font-semibold" data-state="cart-summary-figures">
        <span class="tabular-nums">{{ totalQuantity }} 件</span>
        <span aria-hidden="true" class="text-muted"> / </span>
        <span class="tabular-nums">{{ formatPriceCents(totalAmountCents) }}</span>
      </span>
    </template>
  </button>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import { useCartPanelStore } from '@/stores/cart-panel'
  import { useCartStore } from '@/stores/cart'
  import { formatPriceCents } from '@/utils/price'

  /**
   * 购物车摘要 / 紧凑入口（#21 摘要口径，#22 入口与响应式形态）。
   *
   * 件数 = 各条目数量之和；金额 = 快照单价 × 数量之和；空车也常显「0 件 / ¥0.00」。
   * 打开时把触发元素交给面板 store，关闭后焦点回到这里。
   */
  const MOBILE_BREAKPOINT = 1145
  const PANEL_ID = 'cart-panel'

  const cart = useCartStore()
  const cartPanel = useCartPanelStore()
  const display = useDisplay()

  const totalQuantity = computed(() => cart.totalQuantity)
  const totalAmountCents = computed(() => cart.totalAmountCents)

  /** 与 Tailwind / Vuetify 的 `lg` 同源：<1145px 用紧凑入口。 */
  const isCompact = computed(() => display.width.value < MOBILE_BREAKPOINT)

  const triggerLabel = computed(
    () =>
      `购物车，共 ${totalQuantity.value} 件，合计 ${formatPriceCents(totalAmountCents.value)}，打开购物车面板`,
  )

  function openPanel(event: MouseEvent): void {
    const target = event.currentTarget
    cartPanel.openPanel(target instanceof HTMLElement ? target : null)
  }
</script>

<style scoped>
  .summary-trigger:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
  }
</style>
