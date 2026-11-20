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
  import AppHeader from '@/components/AppHeader.vue'
  import CartSummary from '@/components/CartSummary.vue'
</script>
