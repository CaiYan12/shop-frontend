<template>
  <v-container class="py-8 md:py-10">
    <div class="flex flex-col gap-6">
      <header class="flex flex-wrap items-end justify-between gap-2">
        <h1 class="text-2xl font-bold md:text-3xl">商品列表</h1>
        <p v-if="loaded && !errorMessage" class="text-sm text-slate-600">
          共 {{ total }} 件 / {{ totalPages }} 页
        </p>
      </header>

      <p class="sr-only" role="status">
        {{ pending ? '正在加载商品…' : '' }}
      </p>

      <v-progress-linear
        v-if="pending && items.length > 0"
        color="primary"
        indeterminate
        rounded
      />

      <v-alert
        v-if="errorMessage"
        class="rounded-xl"
        type="error"
        variant="tonal"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span>{{ errorMessage }}</span>
          <v-btn size="small" variant="text" @click="load">重试</v-btn>
        </div>
      </v-alert>

      <!-- 首屏 / 重试时用 8 张骨架卡片占位，避免白屏。 -->
      <div
        v-if="pending && items.length === 0"
        aria-hidden="true"
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      >
        <v-skeleton-loader
          v-for="index in PAGE_SIZE"
          :key="index"
          class="rounded-xl border border-outline"
          type="card"
        />
      </div>

      <div
        v-else-if="items.length > 0"
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      >
        <v-card
          v-for="item in items"
          :key="item.slug"
          :to="{ name: 'product', params: { slug: item.slug } }"
          class="h-full overflow-hidden rounded-xl border border-outline bg-surface"
          variant="flat"
        >
          <v-img
            :alt="item.coverImage.alt"
            :src="item.coverImage.path"
            aspect-ratio="1"
            cover
          />
          <div class="flex flex-col gap-1 p-4">
            <h2 class="line-clamp-2 text-base font-medium leading-snug">{{ item.name }}</h2>
            <p class="text-lg font-semibold text-primary">{{ formatPriceCents(item.displayPriceCents) }}</p>
          </div>
        </v-card>
      </div>

      <v-card
        v-else-if="loaded && !pending"
        class="bg-surface rounded-xl border border-outline"
        variant="flat"
      >
        <p class="p-6 text-sm text-slate-600">没有找到商品。</p>
      </v-card>

      <nav
        v-if="!errorMessage && items.length > 0 && totalPages > 1"
        aria-label="分页"
        class="flex justify-center"
      >
        <v-pagination
          :length="totalPages"
          :model-value="currentPage"
          :total-visible="5"
          @update:model-value="goToPage"
        />
      </nav>
    </div>
  </v-container>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { ApiError, fetchProductList } from '@/api/client'
  import type { components } from '@/api/schema'

  /** 每页固定 8 件（规格「排序与分页」），不暴露每页条数选择器。 */
  const PAGE_SIZE = 8

  type ProductListItem = components['schemas']['ProductSearchListItem']

  const route = useRoute()
  const router = useRouter()

  const items = ref<ProductListItem[]>([])
  const total = ref(0)
  const totalPages = ref(1)
  const pending = ref(false)
  const loaded = ref(false)
  const errorMessage = ref('')

  /**
   * URL 是页码的唯一来源：缺省或非法值都按第 1 页处理。
   * 缺省值不会写回 URL（只有 `goToPage` 写入非默认页）。
   */
  function parsePage (raw: unknown): number {
    const value = Array.isArray(raw) ? raw[0] : raw
    if (typeof value !== 'string') {
      return 1
    }
    const page = Number(value)
    return Number.isInteger(page) && page >= 1 ? page : 1
  }

  const currentPage = computed(() => parsePage(route.query.page))

  /** 只允许最新一次请求落盘：快速切页时旧响应不会覆盖新结果。 */
  let latestRequestId = 0

  async function load (): Promise<void> {
    const requestId = ++latestRequestId
    pending.value = true
    errorMessage.value = ''

    try {
      const data = await fetchProductList({ page: currentPage.value, pageSize: PAGE_SIZE })
      if (requestId !== latestRequestId) {
        return
      }
      items.value = data.items
      total.value = data.total
      totalPages.value = data.totalPages
      loaded.value = true
    } catch (error) {
      if (requestId !== latestRequestId) {
        return
      }
      // 最小错误态（完整 503 语义归 #13）：清掉旧结果，显示错误与重试。
      items.value = []
      total.value = 0
      totalPages.value = 1
      loaded.value = false
      errorMessage.value = describeRequestError(error)
    } finally {
      if (requestId === latestRequestId) {
        pending.value = false
      }
    }
  }

  function describeRequestError (error: unknown): string {
    if (error instanceof ApiError) {
      return error.message
    }
    return '商品列表加载失败，请检查网络后重试。'
  }

  /** 切页只改 URL；第 1 页是默认值，移除 `page` 而不是写成 `page=1`。 */
  function goToPage (next: number): void {
    if (next === currentPage.value) {
      return
    }
    const query = { ...route.query }
    if (next <= 1) {
      delete query.page
    } else {
      query.page = String(next)
    }
    void router.push({ name: 'home', query })
  }

  const priceFormatter = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  /** 契约里的金额是整数分，卡片只负责展示。 */
  function formatPriceCents (cents: number): string {
    return `¥${priceFormatter.format(cents / 100)}`
  }

  watch(currentPage, () => { void load() }, { immediate: true })
</script>
