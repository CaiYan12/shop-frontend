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

    <!--
      加购成功提示（#21）：含商品名与「查看购物车」；后者只打开面板状态，
      面板本身由 #22 渲染。
    -->
    <v-snackbar v-model="snackbarOpen" :timeout="5000" data-state="add-success">
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
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import type { ComponentPublicInstance } from 'vue'
  import { useRoute } from 'vue-router'
  import { ApiError, getProduct } from '@/api/client'
  import type { components } from '@/api/schema'
  import ProductCard from '@/components/ProductCard.vue'
  import QuantityInput from '@/components/QuantityInput.vue'
  import { useProductRecommendations } from '@/composables/useProductRecommendations'
  import { CART_QUANTITY_LIMIT, useCartStore } from '@/stores/cart'
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

  const quantityLimit = computed(() => {
    const view = selectionView.value
    if (view === null || view.variant === null) {
      return 0
    }
    return Math.min(CART_QUANTITY_LIMIT, Math.max(0, Math.floor(view.variant.stock)))
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
  })
</script>
