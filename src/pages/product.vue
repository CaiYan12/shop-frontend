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

    <!-- 内容：≥840px 两栏（左轮播位 / 右信息列），<840px 按阅读顺序单列（#17、#19）。 -->
    <div v-else-if="product && selectionView" class="flex flex-col gap-10" data-state="detail-ready">
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
                  class="gallery-slide block w-full cursor-zoom-in appearance-none border-0 bg-transparent p-0 focus-visible:outline-none"
                  :tabindex="index === activeIndex ? 0 : -1"
                  type="button"
                  @click="openZoom(index)"
                  @keydown="onSlideKeydown"
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
          <!-- C31：评分 / 销量为契约演示字段，在本页信息列明确标注，不逐卡重复。 -->
          <p class="text-xs text-muted" data-state="demo-metrics-note">评分与销量为演示数据</p>

          <!-- 价格 / 原价 / 库存随选择态联动；选择态只存在内存，不写地址栏（#19）。 -->
          <div
            class="flex flex-col gap-1"
            data-state="price"
            :data-price-scope="selectionView.variant === null ? 'product' : 'variant'"
            :data-sold-out="selectionView.soldOut ? 'true' : 'false'"
            :data-show-from="selectionView.showFromLabel ? 'true' : 'false'"
          >
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span class="text-3xl font-bold text-primary">{{ formatPriceCents(selectionView.priceCents) }}</span>
              <span v-if="selectionView.showFromLabel" class="text-sm text-muted" data-state="from-label">起</span>
              <span v-if="showOriginalPrice" class="text-base text-muted line-through">
                <span class="sr-only">原价 </span>{{ formatPriceCents(selectionView.originalPriceCents) }}
              </span>
              <span
                v-if="selectionView.soldOut"
                class="rounded-full bg-slate-900/85 px-2.5 py-1 text-xs font-semibold text-white"
                data-state="sold-out"
              >售罄</span>
            </div>

            <p
              class="text-sm text-muted"
              data-state="stock"
              :data-stock-scope="selectionView.stockScope"
              :data-stock-out="selectionView.stock <= 0 ? 'true' : 'false'"
            >
              <template v-if="selectionView.stockScope === 'product'">
                库存 <span class="font-medium">合计</span> {{ selectionView.stock }} 件
              </template>
              <template v-else>
                库存 {{ selectionView.stock }} 件
                <v-chip
                  v-if="selectionView.variantOutOfStock"
                  class="ml-1"
                  color="error"
                  data-state="variant-out-of-stock"
                  size="x-small"
                  variant="flat"
                >缺货</v-chip>
              </template>
            </p>
          </div>

          <!-- 规格选择：两维对称联动，已选项再点一次取消（#19）。 -->
          <div
            class="flex flex-col gap-3"
            data-state="selection"
            :data-complete="selectionView.complete ? 'true' : 'false'"
            :data-option-1="selection[0] ?? ''"
            :data-option-2="selection[1] ?? ''"
            :data-variant-sku="selectionView.variant?.sku ?? ''"
            :data-variant-out-of-stock="selectionView.variantOutOfStock ? 'true' : 'false'"
            :data-unselectable="selectionView.unselectable ? 'true' : 'false'"
          >
            <p class="text-sm font-semibold">
              规格选择
              <span class="font-normal text-muted">（已选项再点一次可取消）</span>
            </p>

            <div
              v-for="dimension in dimensionViews"
              :key="dimension.name"
              :aria-labelledby="`product-dimension-${dimension.index}`"
              class="flex flex-col gap-2"
              data-state="dimension"
              :data-dimension-index="dimension.index"
              :data-dimension-name="dimension.name"
              role="group"
            >
              <p :id="`product-dimension-${dimension.index}`" class="text-sm text-muted">{{ dimension.name }}</p>
              <div class="flex flex-wrap gap-2">
                <v-btn
                  v-for="option in dimension.options"
                  :key="option.value"
                  :aria-pressed="option.selected"
                  :color="option.selected ? 'primary' : undefined"
                  :data-available="option.available ? 'true' : 'false'"
                  :data-option-value="option.value"
                  :data-selected="option.selected ? 'true' : 'false'"
                  :disabled="!option.available"
                  :title="option.selected ? '再次点击可取消选择' : option.available ? undefined : '与已选条件没有对应的规格组合，不可售'"
                  :variant="option.selected ? 'flat' : 'outlined'"
                  class="normal-case"
                  data-state="option"
                  size="small"
                  @click="selectOption(dimension.index, option.value)"
                >
                  {{ option.value }}
                </v-btn>
              </div>
              <p
                v-if="dimension.hasUnavailable"
                class="text-xs text-muted"
                data-state="unavailable-note"
              >
                灰显选项与已选条件没有对应的规格组合，不可售。
              </p>
            </div>

            <!--
              数量与加购（#21）：规格选齐且组合有库存后才可用；数量不合法时点击加购
              不触发写入，行内提示保留用户输入。
            -->
            <div class="flex flex-col gap-3" data-state="purchase">
              <QuantityInput
                ref="quantityInputRef"
                v-model="quantityText"
                :disabled="quantityDisabled"
                :limit="quantityLimit"
              />

              <v-btn
                block
                color="primary"
                :disabled="quantityDisabled"
                data-state="add-to-cart"
                size="large"
                variant="flat"
                @click="addToCart"
              >
                加入购物车
              </v-btn>

              <p
                v-if="addError !== ''"
                class="text-sm text-error"
                data-state="add-error"
                role="alert"
              >
                {{ addError }}
              </p>
            </div>
          </div>
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

      <!--
        放大查看（#18）：只作用于轮播主图。Esc / 关闭按钮 / 点击遮罩都能退出，
        对话框内用独立的 `zoomIndex` 切图，不回写主图索引；关闭动画结束后
        焦点回到「打开浮层的那个主图按钮」。
      -->
      <v-dialog
        v-model="zoomOpen"
        :fullscreen="zoomFullscreen"
        aria-labelledby="gallery-zoom-heading"
        :max-width="zoomFullscreen ? undefined : '90vw'"
        :width="zoomFullscreen ? undefined : 'min(90vw, 1100px)'"
        :content-props="{ tabindex: '-1', onKeydown: onZoomKeydown }"
        @after-leave="restoreGalleryFocus"
      >
        <div
          v-if="zoomImage"
          class="flex flex-col gap-3 bg-surface p-3"
          :class="zoomFullscreen ? 'h-full w-full' : 'rounded-xl border border-outline'"
          data-state="gallery-zoom"
        >
          <div class="flex items-center justify-between gap-3">
            <p id="gallery-zoom-heading" class="text-sm font-semibold">放大查看</p>
            <div class="flex items-center gap-1">
              <p aria-live="polite" class="text-sm text-muted tabular-nums">
                {{ zoomIndex + 1 }} / {{ galleryImages.length }}
              </p>
              <v-btn
                aria-label="2× 放大"
                :aria-pressed="zoomScale === 2"
                class="text-xs font-semibold tabular-nums"
                size="small"
                variant="tonal"
                @click="toggleZoom"
              >
                2×
              </v-btn>
              <v-btn
                aria-label="关闭放大查看"
                icon="$close"
                size="small"
                variant="text"
                @click="zoomOpen = false"
              />
            </div>
          </div>

          <div class="flex min-h-0 flex-1 flex-col gap-2 min-[960px]:flex-row min-[960px]:items-center">
            <!--
              R26 试接：OverlayScrollbars 只替换放大图滚动区，双轴滚动条由组件生成；
              `role` / `tabindex` / `aria-label` 在 `os-initialized` 时补到生成视口上。
            -->
            <OverlayScrollbarsComponent
              ref="zoomScroll"
              class="zoom-scroll order-1 min-h-0 min-w-0 flex-1 rounded-lg bg-background min-[960px]:order-2"
              element="div"
              :options="zoomScrollOptions"
              :style="{ height: zoomFullscreen ? undefined : ZOOM_IMAGE_HEIGHT }"
              @osInitialized="onZoomScrollInitialized"
            >
              <img
                :alt="zoomImage.alt"
                :src="zoomImage.path"
                class="block object-contain"
                data-zoom-image
                draggable="false"
                :style="zoomImageStyle"
              >
            </OverlayScrollbarsComponent>

            <div class="order-2 flex shrink-0 items-center justify-center gap-2 min-[960px]:contents">
              <v-btn
                aria-label="上一张图片"
                class="shrink-0 min-[960px]:order-1"
                icon="$prev"
                size="small"
                variant="tonal"
                @click="stepZoom(-1)"
              />
              <v-btn
                aria-label="下一张图片"
                class="shrink-0 min-[960px]:order-3"
                icon="$next"
                size="small"
                variant="tonal"
                @click="stepZoom(1)"
              />
            </div>
          </div>
        </div>
      </v-dialog>
    </div>

    <!--
      加购成功提示（#21）：含商品名与「查看购物车」；后者只打开面板状态，
      面板本身由 #22 渲染。底部留出摘要 / 面板合计的高度，避免提示盖住购物车入口。
    -->
    <v-snackbar
      v-model="snackbarOpen"
      :style="{ marginBottom: '7rem' }"
      :timeout="5000"
      data-state="add-success"
      location="bottom center"
    >
      <span>已加入购物车：{{ addedProductName }}</span>
      <template #actions>
        <v-btn
          color="primary"
          data-state="snackbar-open-cart"
          variant="text"
          @click="openCartPanel"
        >
          查看购物车
        </v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import type { ComponentPublicInstance } from 'vue'
  import { useRoute } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import type { OverlayScrollbars, PartialOptions } from 'overlayscrollbars'
  import { OverlayScrollbarsComponent } from 'overlayscrollbars-vue'
  import type { OverlayScrollbarsComponentRef } from 'overlayscrollbars-vue'
  import { ApiError, getProduct } from '@/api/client'
  import type { components } from '@/api/schema'
  import ProductCard from '@/components/ProductCard.vue'
  import QuantityInput from '@/components/QuantityInput.vue'
  import { useProductRecommendations } from '@/composables/useProductRecommendations'
  import { resolveQuantityLimit, useCartStore } from '@/stores/cart'
  import { useCartPanelStore } from '@/stores/cart-panel'
  import { describeAddFailure } from '@/utils/cart-feedback'
  import { formatPriceCents, shouldShowOriginalPrice } from '@/utils/price'
  import {
    createEmptySelection,
    resolveOptionAvailability,
    resolveProductSelection,
    toggleSelection,
  } from '@/utils/product-selection'
  import type { ProductSelection } from '@/utils/product-selection'
  import { resolveQuantityInput } from '@/utils/quantity'

  type ProductDetail = components['schemas']['ProductDetailResponse']
  type DetailState = 'loading' | 'ready' | 'not-found' | 'error'

  /** 一个规格选项在页面上需要的派生字段（选中态 + 可售性）。 */
  interface DimensionOptionView {
    readonly value: string
    readonly selected: boolean
    readonly available: boolean
  }

  /** 一个规格维度的渲染模型；`index` 与选择态元组的位置一致。 */
  interface DimensionView {
    readonly name: string
    readonly index: 0 | 1
    readonly hasUnavailable: boolean
    readonly options: readonly DimensionOptionView[]
  }

  const route = useRoute()

  const { width: viewportWidth, height: viewportHeight } = useDisplay()

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

  /** 主图索引是唯一真源：缩略图、箭头、主图方向键都只改它，序号与高亮从它派生。 */
  const activeIndex = ref(0)

  /**
   * 放大查看独立状态（#18）：`zoomIndex` 只服务浮层，浮层内切图不回写主图；
   * `zoomOpenerIndex` 记住打开浮层的那张，关闭后焦点回到它的主图按钮。
   */
  const zoomOpen = ref(false)
  /**
   * 退场中（#18 复审三）：`zoomOpen` 在退场一开始就变 false，但浮层仍在屏幕上，
   * 焦点也还可能在背景主图按钮上。这段时间方向键仍归浮层管，主图不能切页；
   * 由 `restoreGalleryFocus`（`after-leave`）清掉。
   */
  const zoomClosing = ref(false)
  const zoomIndex = ref(0)
  const zoomOpenerIndex = ref<number | null>(null)
  const zoomImage = computed<ProductDetail['images'][number] | undefined>(
    () => galleryImages.value[zoomIndex.value],
  )

  /**
   * 2× 放大（本轮视觉验收）：1 = 适应容器，2 = 以适应态实际绘制尺寸为基准放大一倍。
   * img 元素宽高取容器的 200%，`object-fit: contain` 后的绘制尺寸正好是适应态的 2 倍；
   * 容器 `overflow: auto` 负责平移，不引入手势依赖。
   */
  const zoomScale = ref<1 | 2>(1)
  const zoomViewport = ref<HTMLElement | null>(null)
  const zoomScroll = ref<OverlayScrollbarsComponentRef | null>(null)
  /** R26：滚动条主题名与变量在页面 scoped 样式里定义；autoHide 保证 2× 时可见。 */
  const zoomScrollOptions: PartialOptions = {
    scrollbars: {
      theme: 'os-theme-shop',
      autoHide: 'never',
      dragScroll: true,
      // `'instant'` 不依赖 ClickScrollPlugin：点轨道立即跳到对应位置。
      clickScroll: 'instant',
    },
  }
  /** 2× 的像素基准：1× 时容器的布局宽高（此时没有滚动条占位）。 */
  const zoomBase = ref<{ w: number; h: number } | null>(null)

  /** 把 OverlayScrollbars 生成的视口补成原可聚焦滚动区；重复调用安全。 */
  function prepareZoomViewport(viewport: HTMLElement): void {
    viewport.tabIndex = 0
    viewport.setAttribute('role', 'group')
    viewport.setAttribute('aria-label', '图片查看区域')
    viewport.setAttribute('data-zoom-viewport', '')
  }

  /**
   * 浮层首次挂载时事件可能早于 ref 赋值；以实例 elements.viewport 为准，
   * 并作为后续滚动 / 尺寸测量的唯一 DOM 入口。
   */
  function ensureZoomViewport(): HTMLElement | null {
    const viewport = zoomScroll.value?.osInstance()?.elements().viewport ?? null
    if (viewport !== null) {
      zoomViewport.value = viewport
      prepareZoomViewport(viewport)
    }
    return viewport
  }

  function resolveZoomViewport(): HTMLElement | null {
    return ensureZoomViewport()
  }

  function onZoomScrollInitialized(instance: OverlayScrollbars): void {
    const viewport = instance.elements().viewport
    zoomViewport.value = viewport
    prepareZoomViewport(viewport)
  }

  /**
   * 2× 用显式像素而不是 `200%`：`200%` 按滚动条出现后的内容盒计算，会少一个滚动条宽度。
   * 基准在 1×（无滚动条）时记录，两档都按它算 2 倍。
   */
  const zoomImageStyle = computed(() => {
    const base = zoomBase.value
    if (zoomScale.value === 2 && base !== null) {
      return { width: `${base.w * 2}px`, height: `${base.h * 2}px` }
    }
    return { width: '100%', height: '100%' }
  })

  /** 放大图高度：不超过 90vh，并给标题行与切图控件留出空间。 */
  const ZOOM_IMAGE_HEIGHT = 'max(12rem, calc(90vh - 6rem))'

  /** 960px 只决定浮层布局：窄屏全屏并把切图按钮移到图片下方，桌面沿用原布局。 */
  const zoomFullscreen = computed(() => viewportWidth.value < 960)

  /** 放大后把视口滚到图片中心；`nextTick` 保证 200% 宽高已经落盘。 */
  function centerZoomViewport(): void {
    const viewport = resolveZoomViewport()
    if (viewport === null) return
    viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2
    viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2
  }

  /** 复位到适应态并清滚动位置：切图、还原、关闭、换商品都走这里。 */
  function resetZoomView(): void {
    zoomScale.value = 1
    zoomBase.value = null
    const viewport = resolveZoomViewport()
    if (viewport !== null) {
      viewport.scrollLeft = 0
      viewport.scrollTop = 0
    }
  }

  function toggleZoom(): void {
    if (zoomScale.value === 2) {
      resetZoomView()
      return
    }
    const viewport = resolveZoomViewport()
    if (viewport === null) return
    // 1× 没有滚动条，offsetWidth/Height 就是不受滚动条占位影响的布局基准。
    zoomBase.value = { w: viewport.offsetWidth, h: viewport.offsetHeight }
    zoomScale.value = 2
    void nextTick(centerZoomViewport)
  }

  // 窗口尺寸变化后旧的像素基准作废，直接回适应态，避免 2× 按过期尺寸绘制。
  // 宽度与高度都要监听：只改高度时图片的适应态尺寸同样会变（如 1365×900 → 1365×600）。
  watch([viewportWidth, viewportHeight], () => {
    if (zoomScale.value === 2) resetZoomView()
  })

  /** 每个轮播项的主图按钮；关闭放大查看后把焦点还给「打开浮层」的那张。 */
  const slideButtons = new Map<number, HTMLButtonElement>()

  function setSlideButtonRef(index: number, el: Element | ComponentPublicInstance | null): void {
    if (el instanceof HTMLButtonElement) {
      slideButtons.set(index, el)
    } else {
      slideButtons.delete(index)
    }
  }

  /** 浮层内切图只改独立索引，主图与「打开者」保持不动（#18 复审）；每次先复位 2×。 */
  function stepZoom(delta: number): void {
    const total = galleryImages.value.length
    if (total < 2) return
    resetZoomView()
    zoomIndex.value = (zoomIndex.value + delta + total) % total
  }

  /** 打开浮层：记录当前这张与它的按钮，浮层从这张开始看，并按适应态复位。 */
  function openZoom(index: number): void {
    zoomIndex.value = index
    zoomOpenerIndex.value = index
    // 连着打开时不能带着上一次的退场标记（复审三）。
    zoomClosing.value = false
    resetZoomView()
    zoomOpen.value = true
    // OverlayScrollbars 在子组件挂载后才生成视口；下一帧补齐语义，必要时再补一次。
    void nextTick(() => {
      ensureZoomViewport()
      // OS 初始化可能晚于一帧，并会重写生成视口的 tabindex；两次补写覆盖这段时序。
      setTimeout(ensureZoomViewport, 100)
      setTimeout(ensureZoomViewport, 300)
    })
  }

  /**
   * 抑制一次「关闭即退场」监听（复审四）：商品切换 / 组件卸载时浮层随商品一起消失，
   * `after-leave` 不再触发，这次关闭不能把 `zoomClosing` 置位。
   */
  let suppressZoomClosing = false

  /**
   * 退场开始即置位，直到 `after-leave` 才解除方向键守卫（#18 复审三）。
   * `flush: 'sync'` 让抑制标记的作用范围严格等于这一次赋值，行为确定、无竞态（复审四）。
   */
  watch(
    zoomOpen,
    (open, wasOpen) => {
      if (!open && wasOpen && !suppressZoomClosing) zoomClosing.value = true
    },
    { flush: 'sync' },
  )

  /**
   * 放大相关状态整体复位（复审四）：商品切换 / 卸载都会让浮层直接消失，
   * 不会再有 `after-leave` 来清 `zoomClosing`，必须主动清干净，
   * 否则 `onSlideKeydown` 的守卫会永久拦截主图方向键。
   */
  function resetZoomState(): void {
    suppressZoomClosing = true
    zoomOpen.value = false
    suppressZoomClosing = false
    zoomClosing.value = false
    zoomIndex.value = 0
    zoomOpenerIndex.value = null
    resetZoomView()
  }

  /**
   * 主图切页后把焦点搬到新幻灯片按钮：旧按钮随轮播项隐藏，
   * 不主动搬运焦点会落回 `body`，之后方向键就失效了（#18 复审）。
   */
  function focusSlideButton(index: number): void {
    void nextTick(() => {
      const button = slideButtons.get(index)
      if (button === undefined) return
      button.focus({ preventScroll: true })
      // 切页过渡中按钮可能还不可聚焦；下一帧再补一次，成功后不再重试。
      if (document.activeElement !== button) {
        requestAnimationFrame(() => {
          if (document.activeElement !== button) {
            button.focus({ preventScroll: true })
          }
        })
      }
    })
  }

  /**
   * 主图按钮：只消费左右方向键并阻止页面滚动（#18），
   * 切换后在新幻灯片按钮上恢复焦点，连续按左右仍然有效。
   */
  function onSlideKeydown(event: KeyboardEvent): void {
    // 放大浮层打开 / 进场 / 退场期间，焦点可能还留在背景主图按钮上；
    // 此时方向键归浮层（onZoomKeydown）管，背景轮播不响应。
    // 退场时 `zoomOpen` 已是 false，必须靠 `zoomClosing` 守住最后一段（复审三）。
    if (zoomOpen.value || zoomClosing.value) return
    if (event.defaultPrevented) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const total = galleryImages.value.length
    if (total < 2) return
    const delta = event.key === 'ArrowLeft' ? -1 : 1
    const next = (activeIndex.value + delta + total) % total
    activeIndex.value = next
    focusSlideButton(next)
  }

  /**
   * 放大浮层内：2× 且焦点在图片滚动区时，方向键平移看细节；
   * 其余情况左右键只改 `zoomIndex`，同样阻止页面滚动；
   * Enter / Space / Esc 仍交回按钮与对话框的原生行为。
   */
  function onZoomKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return
    const viewport = resolveZoomViewport()
    if (
      zoomScale.value === 2 &&
      viewport !== null &&
      event.target instanceof Node &&
      viewport.contains(event.target) &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      event.preventDefault()
      const step = 48
      if (event.key === 'ArrowLeft') viewport.scrollLeft -= step
      if (event.key === 'ArrowRight') viewport.scrollLeft += step
      if (event.key === 'ArrowUp') viewport.scrollTop -= step
      if (event.key === 'ArrowDown') viewport.scrollTop += step
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    stepZoom(event.key === 'ArrowLeft' ? -1 : 1)
  }

  /** 可见的幻灯片按钮；`offsetParent === null` 说明它还随轮播项隐藏着。 */
  function visibleSlideButton(index: number | null): HTMLButtonElement | null {
    if (index === null) return null
    const button = slideButtons.get(index)
    return button !== undefined && button.offsetParent !== null ? button : null
  }

  /**
   * 关闭动画结束后把焦点还给主图：优先「打开浮层的那张」；若它已因轮播切页
   * 隐藏（`offsetParent === null`），退回当前 `activeIndex` 的可见按钮，再兜底
   * 扫一张可见幻灯片 —— 绝不把焦点留在 body（复审二）。
   */
  function restoreGalleryFocus(): void {
    // 退场结束：方向键守卫先解除、缩放复位，再恢复焦点，三者都发生在同一帧（复审三）。
    zoomClosing.value = false
    resetZoomView()
    const opener = zoomOpenerIndex.value
    zoomOpenerIndex.value = null
    const target =
      visibleSlideButton(opener) ??
      visibleSlideButton(activeIndex.value) ??
      [...slideButtons.values()].find((button) => button.offsetParent !== null) ??
      null
    if (target === null) return
    target.focus({ preventScroll: true })
    // 退场末尾偶发不可聚焦；下一帧补一次，成功后不再重试。
    if (document.activeElement !== target) {
      requestAnimationFrame(() => {
        if (document.activeElement !== target) {
          target.focus({ preventScroll: true })
        }
      })
    }
  }

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
    abort: abortRecommendations,
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
   * 选择态（#19）：两个规格维度各自选中的选项值，`null` 表示未选。
   * 只存在页面内存，不写入地址栏；刷新或切换商品由 `resetSelection` 清回未选。
   */
  const selection = ref<ProductSelection>(createEmptySelection())

  /**
   * 由选择态推出的展示口径；`variant` 就是 #21 加购要用的规格组合对象。
   * 商品未就绪时为 `null`，模板与 `product` 一起收窄。
   */
  const selectionView = computed(() =>
    product.value === null ? null : resolveProductSelection(product.value, selection.value),
  )

  /** 划线原价沿用 #8 的判定：只有原价严格高于当前展示价才显示。 */
  const showOriginalPrice = computed(() => {
    const view = selectionView.value
    return view === null ? false : shouldShowOriginalPrice(view.priceCents, view.originalPriceCents)
  })

  /**
   * 两个规格维度的选项可售性与选中态，两维对称：
   * 某维的选项是否存在有效组合，取决于另一个维度当前已选的值。
   * 契约固定两个维度，超出的维度不参与选择态。
   */
  const dimensionViews = computed<readonly DimensionView[]>(() => {
    const current = product.value
    if (current === null) {
      return []
    }

    return current.dimensions.slice(0, 2).map((dimension, index) => {
      const dimensionIndex = index as 0 | 1
      const availability = resolveOptionAvailability(
        dimensionIndex,
        dimension.options,
        selection.value,
        current.variants,
      )
      return {
        name: dimension.name,
        index: dimensionIndex,
        hasUnavailable: availability.hasUnavailable,
        options: dimension.options.map((value) => ({
          value,
          selected: selection.value[dimensionIndex] === value,
          available: availability.byOption[value],
        })),
      }
    })
  })

  /** 点选规格选项：同一维再点已选值即取消，另一维保持不变。 */
  function selectOption(dimensionIndex: 0 | 1, optionValue: string): void {
    selection.value = toggleSelection(selection.value, dimensionIndex, optionValue)
  }

  /** 父级切换商品时的最小重置接口：清回未选规格（#17 的 watch 逻辑调用，供 #21 续用）。 */
  function resetSelection(): void {
    selection.value = createEmptySelection()
  }

  const cart = useCartStore()
  const cartPanel = useCartPanelStore()

  /**
   * 数量与加购（#21）。
   *
   * 数量存**原始文本**，允许输入过程为空；上限由所选组合库存推出（`min(999, 库存)`），
   * 规格未选齐、不可售组合或组合缺货时上限为 0，控件与加购一起禁用。
   */
  const quantityText = ref('1')
  const quantityInputRef = ref<InstanceType<typeof QuantityInput> | null>(null)
  /** 加购失败的行内提示；按 store 的失败原因给出可行动文案。 */
  const addError = ref('')
  /** 加购成功提示（含商品名与「查看购物车」）。 */
  const snackbarOpen = ref(false)
  const addedProductName = ref('')

  // 任一入口（摘要点击 / 键盘 / 「查看购物车」）打开面板时都收起提示，
  // 避免提示留在面板上方盖住底部合计；摘要入口不经过 openCartPanel，必须在这里兜住。
  watch(() => cartPanel.panelOpen, (open) => {
    if (open) snackbarOpen.value = false
  })

  const quantityLimit = computed(() => {
    const view = selectionView.value
    if (view === null || view.variant === null) {
      return 0
    }
    return resolveQuantityLimit(view.variant.stock)
  })

  /** 无上限（未选齐 / 不可售 / 缺货）或购物车核对中（#23 只读）时都不可用。 */
  const quantityDisabled = computed(() => cart.readonly || quantityLimit.value < 1)

  /**
   * 加购：先按「数量上限」校验原始文本，不合法时只亮行内提示、不改 store；
   * 合法才把所选组合的快照交给购物车 store，失败时按原因给可行动提示。
   */
  function addToCart(): void {
    addError.value = ''

    const view = selectionView.value
    const current = product.value
    if (view === null || view.variant === null || current === null || quantityDisabled.value) {
      return
    }

    const quantity = resolveQuantityInput(quantityText.value, quantityLimit.value)
    if (!quantity.valid || quantity.value === null) {
      quantityInputRef.value?.validate()
      return
    }

    const variant = view.variant
    const inCartQuantity = cart.items.find((item) => item.sku === variant.sku)?.quantity ?? 0
    const result = cart.add(
      {
        sku: variant.sku,
        slug: current.slug,
        name: current.name,
        unitPriceCents: variant.priceCents,
        stock: variant.stock,
      },
      quantity.value,
    )

    if (result.ok) {
      quantityText.value = '1'
      quantityInputRef.value?.resetError()
      addedProductName.value = current.name
      snackbarOpen.value = true
      return
    }

    addError.value = describeAddFailure(result, { inCartQuantity })
  }

  /** 「查看购物车」只打开面板状态；面板本身由 #22 渲染。 */
  function openCartPanel(): void {
    cartPanel.openPanel()
    snackbarOpen.value = false
  }

  /** 切换商品时清回数量与加购反馈，规格选择由 `resetSelection` 清空。 */
  function resetPurchaseState(): void {
    quantityText.value = '1'
    addError.value = ''
    snackbarOpen.value = false
    quantityInputRef.value?.resetError()
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
   * 切换商品标识：中止旧详情与推荐请求、重置页面状态、滚动置顶，再加载新商品（#17）。
   * 使用同一页面实例（不整页重建），所以这里必须自己把状态清回初始值。
   */
  function onProductSwitch(): void {
    latestRequestId += 1
    if (inFlight !== null) {
      inFlight.abort()
      inFlight = null
    }
    // 推荐是独立区块（#20）：切商品时一并断流，旧推荐不必等下一次 load 才中止（#16 N3）。
    abortRecommendations()
    product.value = null
    errorMessage.value = ''
    // 换商品时轮播索引与放大查看都回到初始状态，不把上一件的图片带过来（#18）。
    activeIndex.value = 0
    // 浮层随商品卸载、`after-leave` 不再触发：一次性清掉放大三态并抑制这次关闭监听（复审四）。
    resetZoomState()
    slideButtons.clear()
    failedDetailImages.value.clear()
    state.value = 'loading'
    resetSelection()
    resetPurchaseState()
    window.scrollTo({ top: 0, behavior: 'auto' })
    void load()
  }

  // 用户改了数量或规格后，上一次的加购失败提示不再适用于新状态。
  watch([quantityText, selection], () => {
    addError.value = ''
  })

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
    // 防御（复审四）：卸载同样走不完浮层退场，别把 `zoomClosing` 这类标记留在实例上。
    resetZoomState()
  })
</script>

<style scoped>
  /*
   * 主图焦点环（#16 视觉验收）：外描边会被轮播容器的 overflow 裁掉，
   * 内描边又会被 v-img 盖住；改由伪元素覆盖在图片之上，形成可见的内描边。
   * 只作用于主图按钮；缩略图与购物车等不裁切的位置保持原有焦点环。
   */
  .gallery-slide {
    position: relative;
  }

  .gallery-slide:focus-visible::after {
    position: absolute;
    inset: 0;
    z-index: 1;
    content: '';
    border: 2px solid rgb(var(--v-theme-primary));
    border-radius: calc(0.75rem - 1px);
    pointer-events: none;
  }

  /*
   * R26 试接：OverlayScrollbars 的滚动条颜色全部取 Vuetify 主题变量，
   * 浅暗主题随 `.v-theme--*` 自动切换；autoHide 为 never，2× 时两轴都可见。
   */
  .zoom-scroll :deep(.os-theme-shop) {
    --os-size: 12px;
    --os-padding-perpendicular: 2px;
    --os-padding-axis: 2px;
    --os-track-bg: rgba(var(--v-theme-on-surface), 0.08);
    --os-track-bg-hover: rgba(var(--v-theme-on-surface), 0.08);
    --os-track-bg-active: rgba(var(--v-theme-on-surface), 0.08);
    --os-handle-bg: rgba(var(--v-theme-on-surface), 0.35);
    --os-handle-bg-hover: rgba(var(--v-theme-on-surface), 0.5);
    --os-handle-bg-active: rgba(var(--v-theme-on-surface), 0.65);
    --os-handle-border-radius: 999px;
    --os-handle-min-size: 24px;
  }

  .zoom-scroll :deep([data-overlayscrollbars-viewport]) {
    overscroll-behavior: contain;
  }

  /* 视口焦点环用内描边，避免被 OverlayScrollbars 的 overflow 裁掉。 */
  .zoom-scroll :deep([data-overlayscrollbars-viewport]:focus-visible) {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
  }
</style>
