<template>
  <div class="fixed right-6 bottom-6 z-30" data-state="cart-summary">
    <v-card
      class="w-[220px] rounded-xl border border-outline bg-surface px-4 py-3"
      variant="flat"
    >
      <p class="text-xs text-muted">购物车</p>
      <p
        aria-live="polite"
        class="mt-1 flex items-baseline gap-1.5 text-lg font-semibold"
        data-state="cart-summary-figures"
      >
        <span class="tabular-nums">{{ totalQuantity }} 件</span>
        <span aria-hidden="true" class="text-muted"> / </span>
        <span class="tabular-nums">{{ formatPriceCents(totalAmountCents) }}</span>
      </p>
    </v-card>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { useCartStore } from '@/stores/cart'
  import { formatPriceCents } from '@/utils/price'

  /**
   * 购物车摘要（#21）：挂在应用外壳层，两个页面共用同一份 store。
   *
   * 件数 = 各条目数量之和；金额 = 快照单价 × 数量之和；空车也常显「0 件 / ¥0.00」。
   * 面板与紧凑入口由 #22 接入：届时把这里换成摘要入口并复用 `useCartPanelStore`。
   */
  const cart = useCartStore()

  const totalQuantity = computed(() => cart.totalQuantity)
  const totalAmountCents = computed(() => cart.totalAmountCents)
</script>
