<template>
  <v-container class="py-10">
    <div class="flex flex-col gap-4">
      <h1 class="text-2xl font-bold">商品详情</h1>
      <p class="text-sm text-muted">slug：{{ slug }}</p>
      <p class="text-sm text-muted">详情页 Phase 6 实现。</p>
      <v-btn variant="text" :to="{ name: 'home' }">返回列表</v-btn>
    </div>
  </v-container>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { useRoute } from 'vue-router'

  const route = useRoute()

  /** 详情路由参数是 `slug`（后端起主键），占位页原样显示以便验收。 */
  const slug = computed(() => {
    const value = route.params.slug
    return Array.isArray(value) ? value[0] ?? '' : value
  })
</script>
