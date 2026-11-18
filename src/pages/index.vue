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

      <!-- 搜索框常驻在筛选条上方：提交只写 URL，请求由路由变化触发（#10）。 -->
      <ProductSearchBar
        :keyword="listQuery.keyword"
        @submit="onSearchSubmit"
      />

      <!-- 筛选与排序条：URL 是唯一来源，点击即写 URL 并触发请求（#9）。 -->
      <ProductFilterBar
        :state="listQuery"
        @change="onFilterChange"
        @clear="onClearFilters"
      />

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
        <ProductCard
          v-for="item in items"
          :key="item.slug"
          :item="item"
        />
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
  import ProductCard from '@/components/ProductCard.vue'
  import ProductFilterBar from '@/components/ProductFilterBar.vue'
  import ProductSearchBar from '@/components/ProductSearchBar.vue'
  import {
    clearListFilters,
    hasActiveFilters,
    isSameListConditions,
    isSameSerializedQuery,
    parseListQuery,
    serializeListQuery,
    toApiQuery,
    withFilterSelection,
    withKeyword,
  } from '@/utils/list-query'
  import type { ListFilterSelection, ListQueryState } from '@/utils/list-query'

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
   * URL 是筛选、排序与页码的唯一来源：缺省值即默认值，非法值由编解码
   * 按默认值兜底（完整提示归 #13）。`page` 缺省时是第 1 页。
   */
  const listQuery = computed(() => parseListQuery(route.query))

  const currentPage = computed(() => listQuery.value.page)

  /** 只允许最新一次请求落盘：快速切筛选 / 切页时旧响应不会覆盖新结果。 */
  let latestRequestId = 0

  async function load (): Promise<void> {
    const requestId = ++latestRequestId
    pending.value = true
    errorMessage.value = ''

    try {
      const data = await fetchProductList({
        ...toApiQuery(listQuery.value),
        pageSize: PAGE_SIZE,
      })
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

  /** 只写 URL；路由变化再由 `watch` 触发请求，保证 URL 是唯一来源。 */
  function pushListQuery (next: ListQueryState): void {
    const nextQuery = serializeListQuery(next)
    if (isSameSerializedQuery(nextQuery, serializeListQuery(listQuery.value))) {
      return
    }
    void router.push({ name: 'home', query: nextQuery })
  }

  /**
   * 筛选 / 排序即时生效：条件没变时不产生历史（即使当前在第 2 页），
   * 有变化时只 push 一条并回到第 1 页。
   */
  function onFilterChange (selection: ListFilterSelection): void {
    const current = listQuery.value
    const next = withFilterSelection(current, selection)
    if (isSameListConditions(current, next)) {
      return
    }
    pushListQuery({ ...next, page: 1 })
  }

  /** 清除筛选：保留关键词与排序，移除三类条件并回到第 1 页。 */
  function onClearFilters (): void {
    const current = listQuery.value
    if (!hasActiveFilters(current)) {
      return
    }
    pushListQuery(clearListFilters(current))
  }

  /**
   * 搜索提交（#10）：子组件已完成 `trim` 与 1–100 校验，`null` 表示清除关键词。
   * 条件有变化时只 `push` URL，请求交给下面的路由 `watch`——即使请求返回 503，
   * URL 仍保留用户提交的关键词；条件未变时不新增历史、不重复请求。
   */
  function onSearchSubmit (keyword: string | null): void {
    const current = listQuery.value
    const next = withKeyword(current, keyword)
    if (isSameListConditions(current, next)) {
      return
    }
    pushListQuery(next)
  }

  /** 切页只改 URL；第 1 页是默认值，移除 `page` 而不是写成 `page=1`。 */
  function goToPage (next: number): void {
    if (next === currentPage.value) {
      return
    }
    pushListQuery({ ...listQuery.value, page: next })
  }

  watch(listQuery, () => { void load() }, { immediate: true })
</script>
