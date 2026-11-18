<template>
  <v-container class="py-8 md:py-10">
    <div class="flex flex-col gap-6">
      <header class="flex flex-wrap items-end justify-between gap-2">
        <h1 class="text-2xl font-bold md:text-3xl">商品列表</h1>
        <p v-if="showSummary" class="text-sm text-slate-600">
          共 {{ total }} 件 / {{ totalPages }} 页
        </p>
      </header>

      <p class="sr-only" role="status">
        {{ pending ? '正在加载商品…' : '' }}
      </p>

      <!-- 搜索框常驻在筛选条上方：提交只写 URL，请求由路由变化触发（#10）。 -->
      <ProductSearchBar
        :keyword="listQuery.keyword"
        @select="onSuggestionSelect"
        @submit="onSearchSubmit"
      />

      <!-- 筛选与排序条：URL 是唯一来源，点击即写 URL 并触发请求（#9）。 -->
      <ProductFilterBar
        :state="listQuery"
        @change="onFilterChange"
        @clear="onClearFilters"
      />

      <!--
        非法价格参数（#13）：重复 / 非整数 / 越界 / 下限大于上限时，暂停列表请求，
        提示「清除或重选价格条件」。筛选条就在上方，重选价格档也能脱困。
      -->
      <v-alert
        v-if="priceIssue.invalid"
        class="rounded-xl"
        data-state="invalid-price"
        type="warning"
        variant="tonal"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span>{{ priceIssue.message }}</span>
          <v-btn size="small" variant="text" @click="onClearInvalidPrice">
            清除价格条件
          </v-btn>
        </div>
      </v-alert>

      <!-- 后续筛选 / 翻页：顶部进度条 + 保留旧卡片（#13）。 -->
      <v-progress-linear
        v-if="pending && hasLoadedOnce && !priceIssue.invalid"
        color="primary"
        data-state="progress"
        indeterminate
        rounded
      />

      <!-- 503 且没有成功结果：整块错误态，文案与空态严格区分（#13）。 -->
      <v-card
        v-if="searchUnavailable && !showingStale && !pending"
        class="rounded-xl border border-error/40 bg-surface p-6"
        data-state="search-unavailable"
        variant="flat"
      >
        <p class="text-base font-semibold">
          搜索服务暂时不可用，请稍后重试。
        </p>
        <p class="mt-1 text-sm text-slate-600">
          可以重试当前条件，或清除关键词后继续浏览全部商品。
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <v-btn color="primary" size="small" variant="flat" @click="load">
            重试
          </v-btn>
          <v-btn size="small" variant="outlined" @click="onClearKeyword">
            清除关键词
          </v-btn>
        </div>
      </v-card>

      <!-- 非 503 的整块错误态（没有成功结果时）。 -->
      <v-alert
        v-else-if="errorMessage && !showingStale && !pending"
        class="rounded-xl"
        data-state="error"
        type="error"
        variant="tonal"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span>{{ errorMessage }}</span>
          <v-btn size="small" variant="text" @click="load">重试</v-btn>
        </div>
      </v-alert>

      <!-- 有旧卡片时的降级提示：保留旧卡片，暂时停用旧分页（#13）。 -->
      <v-alert
        v-if="showingStale && errorMessage"
        class="rounded-xl"
        :data-state="searchUnavailable ? 'search-unavailable-stale' : 'error-stale'"
        :type="searchUnavailable ? 'warning' : 'error'"
        variant="tonal"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span>{{ errorMessage }}</span>
          <div class="flex flex-wrap items-center gap-2">
            <v-btn :disabled="pending" size="small" variant="text" @click="load">
              重试
            </v-btn>
            <v-btn
              v-if="searchUnavailable"
              :disabled="pending"
              size="small"
              variant="text"
              @click="onClearKeyword"
            >
              清除关键词
            </v-btn>
          </div>
        </div>
      </v-alert>

      <p
        v-if="showingStale"
        class="text-sm font-medium text-amber-700"
        data-state="stale-label"
      >
        正在显示上次结果
      </p>

      <!-- 首屏 / 无成功结果时重试：8 张骨架卡，避免白屏（#13）。 -->
      <div
        v-if="showSkeleton"
        aria-hidden="true"
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        data-state="skeleton"
      >
        <v-skeleton-loader
          v-for="index in PAGE_SIZE"
          :key="index"
          class="product-skeleton rounded-xl border border-outline"
          type="card"
        />
      </div>

      <div
        v-else-if="items.length > 0"
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        data-state="results"
      >
        <ProductCard
          v-for="item in items"
          :key="item.slug"
          :item="item"
        />
      </div>

      <!-- 空态：只有 total = 0 才出现，且与 503 的文案 / 视觉不同（#13）。 -->
      <v-card
        v-else-if="showEmptyState"
        class="rounded-xl border border-outline bg-surface p-8 text-center"
        data-state="empty"
        variant="flat"
      >
        <p class="text-base font-semibold">没有找到符合条件的商品</p>
        <p class="mt-2 text-sm text-slate-600">
          试试清除关键词或筛选条件，或者换一个关键词。
        </p>
        <v-btn
          v-if="canClearConditions"
          class="mt-4"
          color="primary"
          size="small"
          variant="flat"
          @click="onClearAllConditions"
        >
          清除搜索条件
        </v-btn>
      </v-card>

      <!-- 分页：空态隐藏；有旧结果时暂时停用（#13）。 -->
      <nav
        v-if="showPagination"
        :aria-disabled="paginationDisabled ? 'true' : undefined"
        :class="paginationDisabled ? 'pointer-events-none flex justify-center opacity-50' : 'flex justify-center'"
        aria-label="分页"
        data-state="pagination"
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
    clearPriceRange,
    hasActiveFilters,
    inspectPriceParams,
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

  /** 503 的固定提示：文案由规格「加载、空态与降级」钉死（#13）。 */
  const SEARCH_UNAVAILABLE_MESSAGE = '搜索服务暂时不可用，请稍后重试。'

  type ProductListItem = components['schemas']['ProductSearchListItem']
  type ListErrorKind = 'search-unavailable' | 'generic'

  const route = useRoute()
  const router = useRouter()

  const items = ref<ProductListItem[]>([])
  const total = ref(0)
  const totalPages = ref(1)
  const pending = ref(false)
  /** 最近一次请求是否成功；无结果空态只看它 + `total`。 */
  const loaded = ref(false)
  /** 是否成功渲染过结果：首屏骨架 / 后续进度条的切换依据。 */
  const hasLoadedOnce = ref(false)
  /** 请求失败但保留了上一次成功结果，分页暂时停用。 */
  const showingStale = ref(false)
  const errorMessage = ref('')
  const errorKind = ref<ListErrorKind | null>(null)

  /**
   * URL 是筛选、排序与页码的唯一来源：缺省值即默认值。价格参数另做检查，
   * 非法时不按默认值请求（#13）。
   */
  const listQuery = computed(() => parseListQuery(route.query))
  const priceIssue = computed(() => inspectPriceParams(route.query))

  const currentPage = computed(() => listQuery.value.page)
  const hasKeyword = computed(() => listQuery.value.keyword !== null)
  const hasFilters = computed(() => hasActiveFilters(listQuery.value))
  const canClearConditions = computed(() => hasKeyword.value || hasFilters.value)

  const searchUnavailable = computed(() => errorKind.value === 'search-unavailable')

  const showSummary = computed(
    () => loaded.value && errorMessage.value === '' && !priceIssue.value.invalid,
  )

  /** 首屏（或没有成功结果时重试）：8 张骨架卡。 */
  const showSkeleton = computed(
    () => pending.value && !hasLoadedOnce.value && !priceIssue.value.invalid,
  )

  /** 只有成功响应且 `total = 0` 才是空态；503 与无效参数都不走这里。 */
  const showEmptyState = computed(
    () => loaded.value &&
      !pending.value &&
      errorMessage.value === '' &&
      !priceIssue.value.invalid &&
      total.value === 0,
  )

  /** 空态隐藏分页；没有旧结果可保留时也不显示分页。 */
  const showPagination = computed(
    () => !priceIssue.value.invalid &&
      items.value.length > 0 &&
      totalPages.value > 1 &&
      !(errorMessage.value !== '' && !showingStale.value),
  )

  /** 有旧结果且请求失败时暂停旧分页（#13）。 */
  const paginationDisabled = computed(() => showingStale.value)

  /** 只允许最新一次请求落盘：快速切筛选 / 切页时旧响应不会覆盖新结果。 */
  let latestRequestId = 0

  async function load (): Promise<void> {
    const requestId = ++latestRequestId

    if (priceIssue.value.invalid) {
      // 非法价格参数：暂停请求，不按默认值静默请求；提示由模板呈现。
      pending.value = false
      loaded.value = false
      showingStale.value = false
      errorMessage.value = ''
      errorKind.value = null
      items.value = []
      total.value = 0
      totalPages.value = 1
      return
    }

    pending.value = true

    try {
      const data = await fetchProductList({
        ...toApiQuery(listQuery.value),
        pageSize: PAGE_SIZE,
      })
      if (requestId !== latestRequestId) {
        return
      }

      // 页码越界（total > 0 但超过末页）：replace 回末页，不新增历史（#13）。
      if (data.total > 0 && data.totalPages > 0 && listQuery.value.page > data.totalPages) {
        total.value = data.total
        totalPages.value = data.totalPages
        void router.replace({
          name: 'home',
          query: serializeListQuery({ ...listQuery.value, page: data.totalPages }),
        })
        return
      }

      items.value = data.items
      total.value = data.total
      totalPages.value = data.totalPages
      loaded.value = true
      hasLoadedOnce.value = true
      showingStale.value = false
      errorMessage.value = ''
      errorKind.value = null
    } catch (error) {
      if (requestId !== latestRequestId) {
        return
      }
      const unavailable = isSearchUnavailableError(error)
      errorKind.value = unavailable ? 'search-unavailable' : 'generic'
      errorMessage.value = unavailable
        ? SEARCH_UNAVAILABLE_MESSAGE
        : describeRequestError(error)
      loaded.value = false
      // 有上一次成功结果时保留旧卡片并标注「正在显示上次结果」；
      // 没有成功结果时为整块错误态。
      if (hasLoadedOnce.value && items.value.length > 0) {
        showingStale.value = true
      } else {
        items.value = []
        total.value = 0
        totalPages.value = 1
        showingStale.value = false
      }
    } finally {
      if (requestId === latestRequestId) {
        pending.value = false
      }
    }
  }

  /** 搜索降级只认 503 / `SEARCH_NOT_AVAILABLE`；其它错误走通用错误态。 */
  function isSearchUnavailableError (error: unknown): boolean {
    return error instanceof ApiError &&
      (error.status === 503 || error.error?.error?.code === 'SEARCH_NOT_AVAILABLE')
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

  /** 503 降级里的「清除关键词」：回到普通浏览；本来就没关键词时按重试处理。 */
  function onClearKeyword (): void {
    const current = listQuery.value
    const next = withKeyword(current, null)
    if (isSameListConditions(current, next)) {
      void load()
      return
    }
    pushListQuery(next)
  }

  /**
   * 非法价格参数的「清除价格条件」：用 `replace` 去掉非法参数并触发一次合法请求，
   * 不为一条非法 URL 新增历史。
   */
  function onClearInvalidPrice (): void {
    void router.replace({
      name: 'home',
      query: serializeListQuery(clearPriceRange(listQuery.value)),
    })
  }

  /** 空态的「清除搜索条件」：关键词与三类筛选一起移除，回到第 1 页。 */
  function onClearAllConditions (): void {
    const current = listQuery.value
    const next = withKeyword(clearListFilters(current), null)
    if (isSameSerializedQuery(serializeListQuery(current), serializeListQuery(next))) {
      void load()
      return
    }
    pushListQuery(next)
  }

  /**
   * 选中联想项直达详情（#11）：`push` 到 `/product/{slug}`，不新增列表查询参数。
   * 浏览器返回后列表条件由 URL 原样恢复；联想请求由子组件在跳转前取消。
   */
  function onSuggestionSelect (slug: string): void {
    void router.push({ name: 'product', params: { slug } })
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
