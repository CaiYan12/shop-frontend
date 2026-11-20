<template>
  <div class="fixed right-6 bottom-6 z-30" data-state="cart-summary">
    <v-card
      class="w-[220px] rounded-xl border border-outline bg-surface px-4 py-3"
      variant="flat"
    >
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs text-muted">购物车</p>
        <!-- 核对中：快照已渲染，复核未完成，入口与购物车操作都只读（#23）。 -->
        <span
          v-if="cart.readonly"
          class="rounded-full border border-outline px-2 py-0.5 text-[11px] text-muted"
          data-state="cart-recovery-checking"
        >
          核对中
        </span>
      </div>

      <p
        aria-live="polite"
        class="mt-1 flex items-baseline gap-1.5 text-lg font-semibold"
        data-state="cart-summary-figures"
      >
        <span class="tabular-nums">{{ totalQuantity }} 件</span>
        <span aria-hidden="true" class="text-muted"> / </span>
        <span class="tabular-nums">{{ formatPriceCents(totalAmountCents) }}</span>
      </p>

      <!-- 未核对：请求失败，整份存档原样保留，只提供重试；与存储不可用分开表达。 -->
      <div
        v-if="cart.recovery === 'unverified'"
        class="mt-2 flex items-center justify-between gap-2"
        data-state="cart-recovery-unverified"
      >
        <span class="text-xs text-warning">未核对</span>
        <v-btn
          size="x-small"
          variant="text"
          color="primary"
          data-state="cart-recovery-retry"
          @click="retry"
        >
          重试
        </v-btn>
      </div>

      <p
        v-if="cart.recoveryNotice !== ''"
        class="mt-2 text-xs text-muted"
        data-state="cart-recovery-notice"
      >
        {{ cart.recoveryNotice }}
      </p>

      <!-- 存储不可用：本次退回内存，只提示一次，不跟「未核对」合并。 -->
      <p
        v-if="cart.storage === 'unavailable'"
        class="mt-2 text-xs text-warning"
        data-state="cart-storage-unavailable"
      >
        本次购物车不会被记住
      </p>

      <v-btn
        class="mt-2"
        block
        color="primary"
        size="small"
        variant="flat"
        :disabled="cart.readonly"
        data-state="cart-summary-entry"
        @click="openPanel"
      >
        查看购物车
      </v-btn>
    </v-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { useCartStore } from '@/stores/cart'
  import { useCartPanelStore } from '@/stores/cart-panel'
  import { retryCartRecovery } from '@/utils/cart-startup'
  import { formatPriceCents } from '@/utils/price'

  /**
   * 购物车摘要（#21）：挂在应用外壳层，两个页面共用同一份 store。
   *
   * 件数 = 各条目数量之和；金额 = 快照单价 × 数量之和；空车也常显「0 件 / ¥0.00」。
   * #23 增加恢复状态：核对中 / 未核对 + 重试 / 存储不可用，三者各自独立显示；
   * 核对期间入口禁用。面板本体由 #22 实现，这里只负责打开面板状态。
   */
  const cart = useCartStore()
  const cartPanel = useCartPanelStore()

  const totalQuantity = computed(() => cart.totalQuantity)
  const totalAmountCents = computed(() => cart.totalAmountCents)

  function retry (): void {
    void retryCartRecovery(cart)
  }

  function openPanel (): void {
    if (cart.readonly) {
      return
    }
    cartPanel.openPanel()
  }
</script>
