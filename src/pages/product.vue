<template>
  <v-container class="py-8 md:py-10">
    <p class="sr-only" role="status">
      {{ state === 'loading' ? '正在加载商品详情…' : '' }}
    </p>

    <!-- 首次加载 / 重试 / 切换商品：详情结构骨架，不用居中转圈（#17）。 -->
    <div
      v-if="state === 'loading'"
      aria-hidden="true"
      class="flex flex-col gap-8"
      data-state="skeleton"
    >
      <div class="grid grid-cols-1 gap-8 min-[840px]:grid-cols-2">
        <v-skeleton-loader class="rounded-xl border border-outline" type="image" />
        <div class="flex flex-col gap-4">
          <v-skeleton-loader class="rounded-xl border border-outline" type="heading" />
          <v-skeleton-loader class="rounded-xl border border-outline" type="text" />
          <v-skeleton-loader class="rounded-xl border border-outline" type="text" />
        </div>
      </div>
      <v-skeleton-loader class="rounded-xl border border-outline" type="paragraph" />
    </div>

    <!-- 商品不存在（404 / PRODUCT_NOT_FOUND）：专属空态 + 返回列表（#17）。 -->
    <v-card
      v-else-if="state === 'not-found'"
      class="mx-auto max-w-xl rounded-xl border border-outline bg-surface p-8 text-center"
      data-state="not-found"
      variant="flat"
    >
      <p class="text-base font-semibold">商品不存在</p>
      <p class="mt-2 text-sm text-muted">
        该商品可能已下架，或商品链接有误。
      </p>
      <v-btn
        class="mt-4"
        color="primary"
        size="small"
        variant="flat"
        :to="{ name: 'home' }"
      >
        返回商品列表
      </v-btn>
    </v-card>

    <!-- 其它请求失败：主内容区重试，重试沿用当前 slug（#17）。 -->
    <v-card
      v-else-if="state === 'error'"
      class="mx-auto max-w-xl rounded-xl border border-error/40 bg-surface p-8 text-center"
      data-state="detail-error"
      variant="flat"
    >
      <p class="text-base font-semibold">商品详情加载失败</p>
      <p class="mt-2 text-sm text-muted">{{ errorMessage }}</p>
      <v-btn class="mt-4" color="primary" size="small" variant="flat" @click="load">
        重试
      </v-btn>
    </v-card>

    <!-- 内容：≥840px 两栏（左轮播位 / 右信息列），<840px 按阅读顺序单列（#17）。 -->
    <div v-else-if="product" class="flex flex-col gap-10" data-state="detail-ready">
      <div class="grid grid-cols-1 gap-8 min-[840px]:grid-cols-2">
        <!--
          轮播占位容器（#18）：这里只放静态封面图占位，后续换成完整轮播主图 +
          缩略图 + 放大查看，容器本身保持负责左栏位置。
        -->
        <div
          class="overflow-hidden rounded-xl border border-outline bg-surface"
          data-state="gallery-slot"
        >
          <v-img
            :alt="product.coverImage.alt"
            :src="product.coverImage.path"
            aspect-ratio="1"
            class="block"
            cover
          />
        </div>

        <div class="flex flex-col gap-4" data-state="info-column">
          <h1 class="break-words text-2xl leading-tight font-bold md:text-3xl">
            {{ product.name }}
          </h1>
          <p class="text-sm text-muted">
            {{ product.brand }}
            <span aria-hidden="true"> · </span>
            {{ product.model }}
          </p>
          <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span>评分 {{ product.rating.toFixed(1) }}</span>
            <span>销量 {{ product.sales }}</span>
          </p>

          <!-- #19：价格 / 原价 / 库存 / 规格 / 数量 / 加购 在此接入；本票只留位置。 -->
        </div>
      </div>

      <!-- 图文详情：按契约顺序渲染文字段落与图片（#20）。 -->
      <section
        aria-labelledby="product-detail-heading"
        class="flex flex-col gap-4"
        data-state="detail-content"
      >
        <h2 id="product-detail-heading" class="text-xl font-semibold">图文详情</h2>
        <div class="flex flex-col gap-4" data-state="detail-blocks">
          <template v-for="(block, index) in product.detail" :key="index">
            <p
              v-if="block.type === 'text'"
              class="break-words text-base leading-relaxed"
            >
              {{ block.text }}
            </p>
            <!-- 图片按内容区宽度显示、保留契约替代文本；`v-img` 默认懒加载（不传 eager）。 -->
            <v-img
              v-else-if="!failedDetailImages.has(block.path)"
              :alt="block.alt"
              :src="block.path"
              class="block w-full overflow-hidden rounded-xl border border-outline"
              @error="markDetailImageFailed(block.path)"
            />
            <!-- 加载失败：中性占位，保留契约替代文本；详情图不提供放大（#20）。 -->
            <div
              v-else
              class="flex min-h-40 w-full items-center justify-center rounded-xl border border-dashed border-outline bg-surface px-4 py-10 text-center text-sm text-muted"
              role="img"
              :aria-label="`${block.alt}（图片暂时无法显示）`"
            >
              图片暂时无法显示
            </div>
          </template>
        </div>
      </section>

      <!--
        相关推荐（#20）：契约最多 4 件，按实际结果渲染；空数组隐藏整块。
        失败只影响本区块：保留标题与「重试」，只重发推荐请求，主内容照常可用。
      -->
      <section
        v-if="showRecommendations"
        aria-labelledby="product-recommendations-heading"
        class="flex flex-col gap-4"
        data-state="recommendations"
      >
        <h2 id="product-recommendations-heading" class="text-xl font-semibold">相关推荐</h2>

        <v-alert
          v-if="recommendationsState === 'error'"
          class="rounded-xl"
          data-state="recommendations-error"
          type="error"
          variant="tonal"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span>{{ recommendationsErrorMessage }}</span>
            <v-btn size="small" variant="text" @click="retryRecommendations">重试</v-btn>
          </div>
        </v-alert>

        <!--
          列数沿用 Vuetify 同源断点：`sm` = 600px → 2 列，`lg` = 1145px → 4 列，
          即 600–1144px 两列、≥1145px 四列、<600px 单列（票 #20）。
          复用列表页卡片组件与既有属性类型（命中高亮为可选，推荐结果不传）。
        -->
        <div
          v-else
          class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          data-state="recommendations-grid"
        >
          <ProductCard
            v-for="item in recommendationItems"
            :key="item.slug"
            :item="item"
          />
        </div>
      </section>
    </div>
  </v-container>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { ApiError, getProduct } from '@/api/client'
  import type { components } from '@/api/schema'
  import ProductCard from '@/components/ProductCard.vue'
  import { useProductRecommendations } from '@/composables/useProductRecommendations'

  type ProductDetail = components['schemas']['ProductDetailResponse']
  type DetailState = 'loading' | 'ready' | 'not-found' | 'error'

  const route = useRoute()

  /** 详情路由参数是 `slug`（后端起主键）；数组形态取第一项。 */
  const slug = computed(() => {
    const value = route.params.slug
    return Array.isArray(value) ? value[0] ?? '' : value
  })

  const product = ref<ProductDetail | null>(null)
  const state = ref<DetailState>('loading')
  const errorMessage = ref('')

  /**
   * 相关推荐是独立区块（#20）：自带请求序号、错误与重试，失败不写主内容状态。
   * 解构成顶层绑定，模板依赖自动解包即可直接读状态与条目。
   */
  const {
    items: recommendationItems,
    state: recommendationsState,
    errorMessage: recommendationsErrorMessage,
    load: loadRecommendations,
    retry: retryRecommendations,
  } = useProductRecommendations()

  /** 图文详情里加载失败的图片路径：只把失败的那几张换成中性占位。 */
  const failedDetailImages = ref<Set<string>>(new Set())

  function markDetailImageFailed(path: string): void {
    failedDetailImages.value.add(path)
  }

  /** 就绪且非空、或本区块失败时才出现；空数组与加载中都不占版面（#20）。 */
  const showRecommendations = computed(
    () => recommendationsState.value === 'error' ||
      (recommendationsState.value === 'ready' && recommendationItems.value.length > 0),
  )

  /**
   * 只允许最新一次请求落盘：切商品或重试时旧响应不得写回。
   * `inFlight` 负责真实断流，`latestRequestId` 兜住「abort 前已 resolve」的竞态。
   */
  let latestRequestId = 0
  let inFlight: AbortController | null = null

  /** 404 / `PRODUCT_NOT_FOUND` 是专属空态，不能落进通用错误态（#17）。 */
  function isProductNotFound(error: unknown): boolean {
    return error instanceof ApiError &&
      (error.status === 404 || error.error?.error?.code === 'PRODUCT_NOT_FOUND')
  }

  function describeRequestError(error: unknown): string {
    if (error instanceof ApiError) {
      return error.message
    }
    return '商品详情加载失败，请检查网络后重试。'
  }

  async function load(): Promise<void> {
    const requestId = ++latestRequestId

    // 发新请求前 abort 上一条；旧请求的 catch / finally 会因序号过期直接退出。
    if (inFlight !== null) {
      inFlight.abort()
      inFlight = null
    }

    const targetSlug = slug.value
    if (targetSlug === '') {
      product.value = null
      errorMessage.value = ''
      state.value = 'not-found'
      return
    }

    const controller = new AbortController()
    inFlight = controller
    state.value = 'loading'
    errorMessage.value = ''

    try {
      const data = await getProduct(targetSlug, controller.signal)
      if (requestId !== latestRequestId || controller.signal.aborted) {
        return
      }
      product.value = data
      state.value = 'ready'
      // 主内容就绪后再拉推荐：404 商品不必白打一次推荐请求，失败也只落在本区块。
      void loadRecommendations(targetSlug)
    } catch (error) {
      // 被 abort 或已过期的响应只是过客：不写错误态、不改当前页面。
      if (requestId !== latestRequestId || controller.signal.aborted) {
        return
      }
      product.value = null
      if (isProductNotFound(error)) {
        state.value = 'not-found'
        errorMessage.value = ''
      } else {
        state.value = 'error'
        errorMessage.value = describeRequestError(error)
      }
    } finally {
      if (requestId === latestRequestId) {
        inFlight = null
      }
    }
  }

  /**
   * 切换商品标识：中止旧详情请求、重置页面状态、滚动置顶，再加载新商品（#17）。
   * 使用同一页面实例（不整页重建），所以这里必须自己把状态清回初始值。
   */
  function onProductSwitch(): void {
    latestRequestId += 1
    if (inFlight !== null) {
      inFlight.abort()
      inFlight = null
    }
    product.value = null
    errorMessage.value = ''
    failedDetailImages.value.clear()
    state.value = 'loading'
    window.scrollTo({ top: 0, behavior: 'auto' })
    void load()
  }

  onMounted(() => {
    void load()
  })

  watch(slug, () => {
    onProductSwitch()
  })

  /** 离开详情页：让在途响应过期并断流，迟到的响应不得再写回已卸载页面。 */
  onBeforeUnmount(() => {
    latestRequestId += 1
    if (inFlight !== null) {
      inFlight.abort()
      inFlight = null
    }
  })
</script>
