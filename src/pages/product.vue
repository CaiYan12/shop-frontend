<template>
  <v-container class="py-10">
    <div class="flex flex-col gap-4">
      <h1 class="text-2xl font-bold">商品详情（占位）</h1>
      <p class="text-sm text-slate-600">路由参数 id：{{ route.params.id }}</p>
      <v-btn variant="text" :to="{ name: 'home' }">返回列表</v-btn>
    </div>
  </v-container>
</template>

<script lang="ts" setup>
  import { useRoute } from 'vue-router'

  const route = useRoute()
</script>
