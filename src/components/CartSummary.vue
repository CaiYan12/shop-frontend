<template>
  <div
    class="fixed right-4 bottom-4 z-30 flex flex-col items-end gap-2"
    data-state="cart-summary"
  >
    <!-- 未核对：请求失败，存档原样保留，只提供重试（#23）。 -->
    <div
      v-if="cart.recovery === 'unverified'"
      class="flex items-center gap-2 rounded-lg border border-outline bg-surface px-2.5 py-1"
      data-state="cart-recovery-unverified"
    >
      <span class="text-xs text-warning">未核对</span>
      <button
        class="text-xs text-primary underline underline-offset-2"
        data-state="cart-recovery-retry"
        type="button"
        @click="retry"
      >
        重试
      </button>
    </div>

    <!-- 恢复结果汇总与存储降级：两者分开表达（#23）。 -->
    <p
      v-if="cart.recoveryNotice !== ''"
      class="max-w-[220px] rounded-lg border border-outline bg-surface px-2.5 py-1 text-right text-xs text-muted"
      data-state="cart-recovery-notice"
    >
      {{ cart.recoveryNotice }}
    </p>
    <p
      v-if="cart.storage === 'unavailable'"
      class="max-w-[220px] rounded-lg border border-outline bg-surface px-2.5 py-1 text-right text-xs text-warning"
      data-state="cart-storage-unavailable"
    >
      本次购物车不会被记住
    </p>

    <!--
      摘要（#21）与紧凑入口（#22）合用一个按钮：
      - ≥1145px 是右下角摘要卡（约 220px），点击展开右侧抽屉；
      - <1145px 收成一个同时显示件数与总金额的紧凑入口，点击展开底部抽屉。
      核对期间照常打开面板查看快照，面板内的行操作由只读标志禁用（#23）。
    -->
    <button
      id="cart-summary-trigger"
      :aria-controls="PANEL_ID"
      :aria-expanded="cartPanel.panelOpen ? 'true' : 'false'"
      aria-haspopup="dialog"
      :aria-label="triggerLabel"
      :class="[
        'summary-trigger rounded-xl border border-outline bg-surface text-left shadow-sm transition-colors',
        'hover:border-primary',
        isCompact ? 'px-4 py-2.5' : 'w-[220px] px-4 py-3',
      ]"
      :data-form="isCompact ? 'compact' : 'card'"
      data-state="cart-summary-trigger"
      type="button"
      @click="openPanel"
    >
      <!-- 件数与金额是本入口唯一的动态数字：两种形态都挂 aria-live，加购后被播报（#16 N5）。 -->
      <span
        v-if="isCompact"
        aria-live="polite"
        class="flex items-baseline gap-1.5 text-sm font-semibold"
        data-state="cart-summary-figures"
      >
        <span class="tabular-nums">{{ totalQuantity }} 件</span>
        <span aria-hidden="true" class="text-muted">·</span>
        <span class="tabular-nums">{{ formatPriceCents(totalAmountCents) }}</span>
        <span
          v-if="cart.readonly"
          class="ml-1 rounded-full border border-outline px-1.5 py-0.5 text-[11px] font-normal text-muted"
          data-state="cart-recovery-checking"
        >核对中</span>
      </span>
      <template v-else>
        <span class="flex items-center gap-2 text-xs text-muted">
          购物车
          <span
            v-if="cart.readonly"
            class="rounded-full border border-outline px-2 py-0.5 text-[11px]"
            data-state="cart-recovery-checking"
          >核对中</span>
        </span>
        <span
          aria-live="polite"
          class="mt-1 flex items-baseline gap-1.5 text-lg font-semibold"
          data-state="cart-summary-figures"
        >
          <span class="tabular-nums">{{ totalQuantity }} 件</span>
          <span aria-hidden="true" class="text-muted"> / </span>
          <span class="tabular-nums">{{ formatPriceCents(totalAmountCents) }}</span>
        </span>
      </template>
    </button>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { useDisplay } from 'vuetify'
  import { useCartStore } from '@/stores/cart'
  import { useCartPanelStore } from '@/stores/cart-panel'
  import { retryCartRecovery } from '@/utils/cart-startup'
  import { formatPriceCents } from '@/utils/price'

  /**
   * 购物车摘要 / 紧凑入口。
   *
   * 件数 = 各条目数量之和；金额 = 快照单价 × 数量之和；空车也常显「0 件 / ¥0.00」。
   * #22 负责入口与响应式形态（打开时把触发元素交给面板 store，关闭后焦点回到这里）；
   * #23 负责恢复状态：核对中 / 未核对 + 重试 / 存储不可用，三者各自独立显示。
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

  function openPanel (event: MouseEvent): void {
    const target = event.currentTarget
    cartPanel.openPanel(target instanceof HTMLElement ? target : null)
  }

  function retry (): void {
    void retryCartRecovery(cart)
  }
</script>

<style scoped>
  .summary-trigger:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
  }
</style>
