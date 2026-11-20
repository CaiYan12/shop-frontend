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
          轮播主图（#18）：不自动播放，箭头 / 缩略图 / 左右方向键共用同一个索引，
          序号与缩略图高亮都从 `activeIndex` 派生；主图本身是可聚焦按钮。
        -->
        <div class="flex flex-col gap-3" data-state="gallery-slot">
          <div class="overflow-hidden rounded-xl border border-outline bg-surface">
            <v-carousel
              v-model="activeIndex"
              :cycle="false"
              :show-arrows="true"
              height="auto"
              hide-delimiters
            >
              <v-window-item
                v-for="(image, index) in galleryImages"
                :key="image.path"
                :value="index"
              >
                <button
                  :ref="(el) => setSlideButtonRef(index, el)"
                  :aria-label="`放大查看第 ${index + 1} 张图片：${image.alt}`"
                  class="block w-full cursor-zoom-in appearance-none border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  type="button"
                  @click="zoomOpen = true"
                  @keydown="onGalleryKeydown"
                >
                  <v-img
                    :alt="image.alt"
                    :src="image.path"
                    aspect-ratio="1"
                    class="block"
                    cover
                  />
                </button>
              </v-window-item>
            </v-carousel>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2">
            <div aria-label="缩略图" class="flex flex-wrap gap-2" role="group">
              <button
                v-for="(image, index) in galleryImages"
                :key="image.path"
                :aria-current="index === activeIndex ? 'true' : undefined"
                :aria-label="`第 ${index + 1} 张图片：${image.alt}`"
                class="appearance-none overflow-hidden rounded-md border-2 bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                :class="index === activeIndex ? 'border-primary' : 'border-outline hover:border-primary'"
                type="button"
                @click="activeIndex = index"
              >
                <v-img
                  :alt="image.alt"
                  :src="image.path"
                  aspect-ratio="1"
                  class="block w-14"
                  cover
                />
              </button>
            </div>
            <p
              aria-live="polite"
              class="text-sm text-muted tabular-nums"
              data-gallery-counter
            >
              {{ activeIndex + 1 }} / {{ galleryImages.length }}
            </p>
          </div>
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

      <!-- #20：图文详情与相关推荐在两栏下方、整宽；本票只留结构位。 -->
      <section
        aria-labelledby="product-detail-heading"
        class="flex flex-col gap-3"
        data-state="detail-slot"
      >
        <h2 id="product-detail-heading" class="text-xl font-semibold">图文详情</h2>
        <p class="text-sm text-muted">图文详情内容将在后续版本接入。</p>
      </section>

      <section
        aria-labelledby="product-recommendations-heading"
        class="flex flex-col gap-3"
        data-state="recommendations-slot"
      >
        <h2 id="product-recommendations-heading" class="text-xl font-semibold">相关推荐</h2>
        <p class="text-sm text-muted">相关推荐将在后续版本接入。</p>
      </section>

      <!--
        放大查看（#18）：只作用于轮播主图。Esc / 关闭按钮 / 点击遮罩都能退出，
        对话框内可继续切图；关闭动画结束后焦点回到当前主图。
      -->
      <v-dialog
        v-model="zoomOpen"
        max-width="90vw"
        width="min(90vw, 1100px)"
        :content-props="{ tabindex: '-1', onKeydown: onGalleryKeydown }"
        @after-leave="restoreGalleryFocus"
      >
        <div
          v-if="currentImage"
          class="flex flex-col gap-3 rounded-xl border border-outline bg-surface p-3"
          data-state="gallery-zoom"
        >
          <div class="flex items-center justify-between gap-3">
            <p id="gallery-zoom-heading" class="text-sm font-semibold">放大查看</p>
            <div class="flex items-center gap-1">
              <p aria-live="polite" class="text-sm text-muted tabular-nums">
                {{ activeIndex + 1 }} / {{ galleryImages.length }}
              </p>
              <v-btn
                aria-label="关闭放大查看"
                icon="$close"
                size="small"
                variant="text"
                @click="zoomOpen = false"
              />
            </div>
          </div>

          <div class="flex items-center gap-2">
            <v-btn
              aria-label="上一张图片"
              class="shrink-0"
              icon="$prev"
              size="small"
              variant="tonal"
              @click="stepGallery(-1)"
            />
            <!-- VImg 不用 cover 时即 object-fit: contain，等比完整显示、不裁切。 -->
            <v-img
              :alt="currentImage.alt"
              :height="ZOOM_IMAGE_HEIGHT"
              :src="currentImage.path"
              class="min-w-0 flex-1 rounded-lg bg-background"
            />
            <v-btn
              aria-label="下一张图片"
              class="shrink-0"
              icon="$next"
              size="small"
              variant="tonal"
              @click="stepGallery(1)"
            />
          </div>
        </div>
      </v-dialog>
    </div>
  </v-container>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import type { ComponentPublicInstance } from 'vue'
  import { useRoute } from 'vue-router'
  import { ApiError, getProduct } from '@/api/client'
  import type { components } from '@/api/schema'

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

  /** 图集（#18）：契约保证每件 4–5 张；空数组时退回封面，不让轮播空白。 */
  const galleryImages = computed<ProductDetail['images']>(() => {
    const detail = product.value
    if (detail === null) return []
    return detail.images.length > 0 ? detail.images : [detail.coverImage]
  })

  /** 当前索引是唯一真源：箭头、缩略图、方向键都只改它，序号与高亮从它派生。 */
  const activeIndex = ref(0)
  const currentImage = computed<ProductDetail['images'][number] | undefined>(
    () => galleryImages.value[activeIndex.value],
  )

  /** 放大查看开关；切换商品时随页面状态一起复位。 */
  const zoomOpen = ref(false)

  /** 放大图高度：不超过 90vh，并给标题行与切图控件留出空间。 */
  const ZOOM_IMAGE_HEIGHT = 'max(12rem, calc(90vh - 6rem))'

  /** 每个轮播项的主图按钮；关闭放大查看后把焦点还给「当前」这张的主图。 */
  const slideButtons = new Map<number, HTMLButtonElement>()

  function setSlideButtonRef(index: number, el: Element | ComponentPublicInstance | null): void {
    if (el instanceof HTMLButtonElement) {
      slideButtons.set(index, el)
    } else {
      slideButtons.delete(index)
    }
  }

  /** 一次调用只前进一步，序号、缩略图高亮与主图因此永远同步。 */
  function stepGallery(delta: number): void {
    const total = galleryImages.value.length
    if (total < 2) return
    activeIndex.value = (activeIndex.value + delta + total) % total
  }

  /**
   * 轮播主图与放大查看共用：只消费左右方向键并阻止默认滚动，
   * Enter / Space / Esc 仍交回按钮与对话框的原生行为（#18）。
   */
  function onGalleryKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    stepGallery(event.key === 'ArrowLeft' ? -1 : 1)
  }

  /** 关闭动画结束后再移焦点，避免被对话框的焦点陷阱抢回。 */
  function restoreGalleryFocus(): void {
    slideButtons.get(activeIndex.value)?.focus({ preventScroll: true })
  }

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
    // 换商品时轮播索引与放大查看都回到初始状态，不把上一件的图片带过来（#18）。
    activeIndex.value = 0
    zoomOpen.value = false
    slideButtons.clear()
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
