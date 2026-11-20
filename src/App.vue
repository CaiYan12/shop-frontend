<template>
  <v-app>
    <AppHeader />
    <v-main>
      <router-view />
    </v-main>

    <!-- 购物车摘要挂在应用外壳层：两个页面共用同一份状态，不参与页面布局（#21）。 -->
    <CartSummary />
  </v-app>
</template>

<script lang="ts" setup>
  import { onMounted } from 'vue'
  import AppHeader from '@/components/AppHeader.vue'
  import CartSummary from '@/components/CartSummary.vue'
  import { useCartStore } from '@/stores/cart'
  import { startCartRecovery } from '@/utils/cart-startup'

  /**
   * 启动恢复（#23）：整个应用只触发一次；store 里的 `recoveryStarted` 兜住
   * 重复挂载 / HMR，重复调用不会重复读盘或重复请求。
   */
  const cart = useCartStore()

  onMounted(() => {
    void startCartRecovery(cart)
  })
</script>
