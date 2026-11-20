<template>
  <v-app>
    <AppHeader />
    <v-main>
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
  import AppHeader from '@/components/AppHeader.vue'
  import CartPanel from '@/components/CartPanel.vue'
  import CartSummary from '@/components/CartSummary.vue'
</script>
