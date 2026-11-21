<template>
  <v-app>
    <!--
      灵动岛顶替原 AppHeader（D106）：固定悬浮、不参与布局；
      顶部为收起态预留 64px（D107），展开时正文不位移。
    -->
    <FloatingNav />

    <v-main class="pt-16">
      <router-view />
    </v-main>

    <!--
      购物车悬浮窗挂在应用外壳层：两个页面共用同一份状态，不参与页面布局。
      摘要（#21）是收起态入口；面板（#22）是它展开后的模态抽屉。
    -->
    <CartSummary />
    <CartPanel />
  </v-app>
</template>

<script lang="ts" setup>
  import { onMounted } from 'vue'
  import CartPanel from '@/components/CartPanel.vue'
  import CartSummary from '@/components/CartSummary.vue'
  import FloatingNav from '@/components/FloatingNav.vue'
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
