<template>
  <v-container class="py-10">
    <div class="flex flex-col gap-4 md:gap-6">
      <h1 class="text-2xl font-bold md:text-3xl">商品列表（占位）</h1>
      <p class="text-sm text-slate-600 md:text-base">
        骨架页：Vuetify 组件、Tailwind 工具类、Pinia、Vue Router 均已接入。
      </p>

      <v-card class="p-4" rounded="xl" variant="outlined">
        <div class="flex flex-wrap items-center gap-3">
          <v-chip color="primary">Vuetify chip</v-chip>
          <span class="rounded-pill bg-emerald-500 px-3 py-1 text-white">Tailwind pill</span>
        </div>
      </v-card>

      <div class="flex flex-wrap items-center gap-3">
        <v-btn color="primary" @click="store.increment()">点击计数</v-btn>
        <v-chip>计数：{{ store.clicks }}</v-chip>
        <v-btn variant="text" :to="{ name: 'product', params: { id: 1 } }">
          进入详情占位
        </v-btn>
      </div>
    </div>
  </v-container>
</template>

<script lang="ts" setup>
  import { useDemoStore } from '@/stores/demo'

  const store = useDemoStore()
</script>
