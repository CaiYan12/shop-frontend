<template>
  <div :class="layout === 'vertical' ? 'flex flex-col gap-5' : 'flex flex-wrap items-center gap-x-6 gap-y-3'">
    <div
      ref="categoryGroup"
      :aria-label="`${ariaPrefix}商品类型`"
      :id="`${idPrefix}-category`"
      :class="layout === 'vertical' ? 'filter-chips' : 'filter-chips min-w-[18rem] flex-1'"
      role="radiogroup"
    >
      <v-chip
        v-for="(option, index) in CATEGORY_OPTIONS"
        :key="option.value"
        :aria-checked="categorySelection === option.value"
        :color="categorySelection === option.value ? 'primary' : undefined"
        :tabindex="index === rovingCategoryIndex ? 0 : -1"
        :variant="categorySelection === option.value ? 'flat' : 'outlined'"
        link
        role="radio"
        size="small"
        @click="onCategoryUpdate(option.value)"
        @keydown="onCategoryKeydown($event, index)"
      >
        {{ option.label }}
      </v-chip>
    </div>

    <div :class="layout === 'vertical' ? 'flex flex-col gap-4' : 'flex flex-wrap items-center gap-3'">
      <v-select
        :id="`${idPrefix}-price-band`"
        :items="priceItems"
        :model-value="priceSelection"
        :name="`${idPrefix}-price-band`"
        :class="layout === 'vertical' ? 'w-full' : 'w-40'"
        density="comfortable"
        hide-details
        item-title="title"
        item-value="value"
        label="价格档"
        variant="outlined"
        @update:model-value="onPriceUpdate"
      />

      <v-select
        :id="`${idPrefix}-min-sales`"
        :items="salesItems"
        :model-value="salesSelection"
        :name="`${idPrefix}-min-sales`"
        :class="layout === 'vertical' ? 'w-full' : 'w-32'"
        density="comfortable"
        hide-details
        item-title="title"
        item-value="value"
        label="销量"
        variant="outlined"
        @update:model-value="onSalesUpdate"
      />

      <v-select
        :id="`${idPrefix}-sort`"
        :items="sortItems"
        :model-value="sortSelection"
        :name="`${idPrefix}-sort`"
        :class="layout === 'vertical' ? 'w-full' : 'w-36'"
        density="comfortable"
        hide-details
        item-title="title"
        item-value="value"
        label="排序"
        variant="outlined"
        @update:model-value="onSortUpdate"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import {
    CATEGORY_OPTIONS,
    PRICE_BANDS,
    PRODUCT_SORTS,
    SALES_TIERS,
    filterSelectionOf,
    readPriceSelection,
    readSalesSelection,
    readSortSelection,
    sortOptionsFor,
  } from '@/utils/list-query'
  import type {
    CategorySelection,
    ListFilterSelection,
    ListQueryState,
    PriceSelection,
    ProductSort,
    SalesSelection,
    SortSelection,
  } from '@/utils/list-query'
  import { formatPriceCents } from '@/utils/price'

  interface SelectItem<T extends string> {
    title: string
    value: T
    props?: { disabled: boolean }
  }

  const props = withDefaults(defineProps<{
    state: ListQueryState
    /** 桌面横排；底部抽屉内竖排。 */
    layout?: 'horizontal' | 'vertical'
    /** 两处控件实例（桌面 / 抽屉）共存的 DOM id 前缀。 */
    idPrefix?: string
    /** 读屏文案前缀，让两处实例可区分。 */
    ariaPrefix?: string
  }>(), {
    layout: 'horizontal',
    idPrefix: 'filter',
    ariaPrefix: '',
  })

  /** 一次提交筛选条的全部五项条件；页码重置由页面在确有变化时处理。 */
  const emit = defineEmits<{ change: [selection: ListFilterSelection] }>()

  const categorySelection = computed<CategorySelection>(
    () => (props.state.category ?? 'all') as CategorySelection,
  )

  /** 商品类型 chips 的容器；方向键移动后按索引聚焦对应项。 */
  const categoryGroup = ref<HTMLElement | null>(null)

  /**
   * roving tabindex 的落点：选中项 `0`、其余 `-1`；没有选中时第一项 `0`。
   * 这样整组只占一个 Tab 停留点，组内移动交给方向键（WAI-ARIA 单选组）。
   */
  const rovingCategoryIndex = computed(() => {
    const index = CATEGORY_OPTIONS.findIndex(option => option.value === categorySelection.value)
    return index === -1 ? 0 : index
  })

  const priceSelection = computed<PriceSelection>(() => readPriceSelection(props.state))

  const salesSelection = computed<SalesSelection>(() => readSalesSelection(props.state))

  /** 有关键词时四项（相关性默认），无关键词时三项（销量降序默认）。 */
  const sortItems = computed(() => {
    const options: readonly { readonly value: SortSelection, readonly label: string }[] =
      sortOptionsFor(props.state.keyword)
    return options.map(option => ({ title: option.label, value: option.value }))
  })

  const sortSelection = computed<SortSelection>(() => readSortSelection(props.state))

  /** 非预设但合法的价格区间显示为只读项，展示实际金额，便于用户知道 URL 里是什么。 */
  function describePriceRange(state: ListQueryState): string {
    // 契约是闭区间（含端点）：只有上限时不能说「低于」，否则 ¥129.00 的结果会被误解。
    if (state.priceMinCents !== null && state.priceMaxCents !== null) {
      return `${formatPriceCents(state.priceMinCents)}–${formatPriceCents(state.priceMaxCents)}（含）`
    }
    if (state.priceMinCents !== null) {
      return `${formatPriceCents(state.priceMinCents)} 及以上`
    }
    if (state.priceMaxCents !== null) {
      return `不高于 ${formatPriceCents(state.priceMaxCents)}`
    }
    return ''
  }

  const priceItems = computed<SelectItem<PriceSelection>[]>(() => {
    const items: SelectItem<PriceSelection>[] = [
      { title: '不限', value: 'all' },
      ...PRICE_BANDS.map(band => ({ title: band.label, value: band.id })),
    ]
    if (priceSelection.value === 'custom') {
      items.push({
        title: `自定义区间（${describePriceRange(props.state)}）`,
        value: 'custom',
        props: { disabled: true },
      })
    }
    return items
  })

  const salesItems = computed<SelectItem<SalesSelection>[]>(() => {
    const items: SelectItem<SalesSelection>[] = SALES_TIERS.map(tier => ({
      title: tier.label,
      value: tier.id,
    }))
    if (salesSelection.value === 'custom') {
      items.push({
        title: `≥${props.state.minSales ?? 0}（自定义）`,
        value: 'custom',
        props: { disabled: true },
      })
    }
    return items
  })

  function emitSelection(patch: Partial<ListFilterSelection>): void {
    emit('change', { ...filterSelectionOf(props.state), ...patch })
  }

  function onCategoryUpdate(value: unknown): void {
    const next = typeof value === 'string' ? value : 'all'
    if (next === categorySelection.value) {
      return
    }
    emitSelection({ category: next === 'all' ? null : next })
  }

  /** 把焦点移到组内第 `index` 个 chip（DOM 顺序与 `CATEGORY_OPTIONS` 一致）。 */
  function focusCategoryChip(index: number): void {
    const chips = categoryGroup.value?.querySelectorAll<HTMLElement>('[role="radio"]')
    chips?.[index]?.focus()
  }

  /**
   * 单选组的方向键：←→ / ↑↓ 循环移动，焦点跟随并即时切换选中。
   * Enter / Space 仍由 chip 自身的键盘处理（触发 click），这里不拦截。
   */
  function onCategoryKeydown(event: KeyboardEvent, index: number): void {
    const count = CATEGORY_OPTIONS.length
    let next: number
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (index - 1 + count) % count
        break
      case 'ArrowRight':
      case 'ArrowDown':
        next = (index + 1) % count
        break
      default:
        return
    }
    event.preventDefault()
    focusCategoryChip(next)
    onCategoryUpdate(CATEGORY_OPTIONS[next].value)
  }

  function onPriceUpdate(value: unknown): void {
    if (typeof value !== 'string' || value === priceSelection.value) {
      return
    }
    if (value === 'all') {
      emitSelection({ priceMinCents: null, priceMaxCents: null })
      return
    }
    const band = PRICE_BANDS.find(item => item.id === value)
    if (band !== undefined) {
      emitSelection({ priceMinCents: band.minCents, priceMaxCents: band.maxCents })
    }
  }

  function onSalesUpdate(value: unknown): void {
    if (typeof value !== 'string' || value === salesSelection.value) {
      return
    }
    const tier = SALES_TIERS.find(item => item.id === value)
    if (tier !== undefined) {
      emitSelection({ minSales: tier.minSales })
    }
  }

  function onSortUpdate(value: unknown): void {
    if (typeof value !== 'string' || value === sortSelection.value) {
      return
    }
    if (value === 'default') {
      emitSelection({ sort: null })
      return
    }
    if ((PRODUCT_SORTS as readonly string[]).includes(value)) {
      emitSelection({ sort: value as ProductSort })
    }
  }
</script>

<style scoped>
  .filter-chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
</style>
