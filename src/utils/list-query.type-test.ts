/**
 * URL ↔ 列表查询参数编解码的类型测试（编译期，无运行时断言）(#9)。
 *
 * 规格 Testing Decisions 要求把编解码抽成纯函数并用编译期 seam 钉住：
 * - 默认值：`LIST_QUERY_DEFAULTS` 必须保持全 `null` + `page: 1`（默认值省略的依据）；
 * - 边界映射：价格六档的 19999 / 20000 / 49999 / 50000 / 99999 / 100000 /
 *   199999 / 200000 / 299999 / 300000 分必须逐字成立，首档没有下限；
 * - 选项：类型五项、销量四档、普通浏览三项排序、搜索四项排序，以及 `default`
 *   这个「不写 sort」的模型值。
 *
 * 不覆盖：运行时真的省略了哪些 key——由浏览器验收（URL seam）覆盖。
 */
import type {
  CategorySelection,
  ListFilterSelection,
  ListQueryState,
  PriceBandId,
  PriceParamIssueKind,
  PriceSelection,
  ProductListQuery,
  ProductSort,
  RawQuery,
  SalesSelection,
  SerializedListQuery,
  SortSelection,
  clearListFilters,
  clearPriceRange,
  filterSelectionOf,
  hasActiveFilters,
  inspectPriceParams,
  isSameListConditions,
  isSameSerializedQuery,
  normalizeSort,
  parseListQuery,
  readPriceSelection,
  readSalesSelection,
  readSortSelection,
  serializeListQuery,
  sortOptionsFor,
  toApiQuery,
  withFilterSelection,
  withKeyword,
} from './list-query'
import {
  BROWSE_SORT_OPTIONS,
  CATEGORY_OPTIONS,
  KEYWORD_MAX_LENGTH,
  KNOWN_CATEGORY_SLUGS,
  LIST_QUERY_DEFAULTS,
  PRICE_BANDS,
  PRODUCT_SORTS,
  SALES_TIERS,
  SEARCH_SORT_OPTIONS,
} from './list-query'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

// —— 默认值：全部 null + page 1。`serializeListQuery` 以它为「省略」的唯一依据 ——
type _Defaults = Expect<
  Equal<
    typeof LIST_QUERY_DEFAULTS,
    {
      readonly category: null
      readonly priceMinCents: null
      readonly priceMaxCents: null
      readonly minSales: null
      readonly keyword: null
      readonly sort: null
      readonly page: 1
    }
  >
>

// —— 状态形状：可选条件统一用 null，页码是 number ——
type _State = Expect<
  Equal<
    ListQueryState,
    {
      category: string | null
      priceMinCents: number | null
      priceMaxCents: number | null
      minSales: number | null
      keyword: string | null
      sort: ProductSort | null
      page: number
    }
  >
>
type _ProductSort = Expect<Equal<ProductSort, 'price_asc' | 'price_desc' | 'sales_desc'>>
type _ProductSorts = Expect<Equal<typeof PRODUCT_SORTS, readonly ['price_asc', 'price_desc', 'sales_desc']>>

// —— 商品类型：五项（含全部），slug 是契约原值 ——
type _Categories = Expect<
  Equal<
    typeof CATEGORY_OPTIONS,
    readonly [
      { readonly value: 'all'; readonly label: '全部' },
      { readonly value: 'audio'; readonly label: '音频设备' },
      { readonly value: 'peripherals'; readonly label: '键盘外设' },
      { readonly value: 'displays'; readonly label: '显示设备' },
      { readonly value: 'wearables'; readonly label: '智能穿戴' },
    ]
  >
>
type _KnownCategories = Expect<
  Equal<typeof KNOWN_CATEGORY_SLUGS, readonly ['audio', 'peripherals', 'displays', 'wearables']>
>
type _CategorySelection = Expect<
  Equal<CategorySelection, 'all' | 'audio' | 'peripherals' | 'displays' | 'wearables'>
>

// —— 价格六档：逐档钉死边界，首档只有上限 19999（明确排除 ¥200） ——
type _PriceBands = Expect<
  Equal<
    typeof PRICE_BANDS,
    readonly [
      { readonly id: 'under-200'; readonly label: '低于 ¥200'; readonly minCents: null; readonly maxCents: 19999 },
      { readonly id: '200-499'; readonly label: '¥200–499'; readonly minCents: 20000; readonly maxCents: 49999 },
      { readonly id: '500-999'; readonly label: '¥500–999'; readonly minCents: 50000; readonly maxCents: 99999 },
      {
        readonly id: '1000-1999'
        readonly label: '¥1000–1999'
        readonly minCents: 100000
        readonly maxCents: 199999
      },
      {
        readonly id: '2000-2999'
        readonly label: '¥2000–2999'
        readonly minCents: 200000
        readonly maxCents: 299999
      },
      { readonly id: '3000-plus'; readonly label: '¥3000 以上'; readonly minCents: 300000; readonly maxCents: null },
    ]
  >
>
type _Under200Max = Expect<Equal<typeof PRICE_BANDS[0]['maxCents'], 19999>>
type _Band200Min = Expect<Equal<typeof PRICE_BANDS[1]['minCents'], 20000>>
type _Band200Max = Expect<Equal<typeof PRICE_BANDS[1]['maxCents'], 49999>>
type _Band500Min = Expect<Equal<typeof PRICE_BANDS[2]['minCents'], 50000>>
type _Band500Max = Expect<Equal<typeof PRICE_BANDS[2]['maxCents'], 99999>>
type _Band1000Min = Expect<Equal<typeof PRICE_BANDS[3]['minCents'], 100000>>
type _Band1000Max = Expect<Equal<typeof PRICE_BANDS[3]['maxCents'], 199999>>
type _Band2000Min = Expect<Equal<typeof PRICE_BANDS[4]['minCents'], 200000>>
type _Band2000Max = Expect<Equal<typeof PRICE_BANDS[4]['maxCents'], 299999>>
type _Band3000Min = Expect<Equal<typeof PRICE_BANDS[5]['minCents'], 300000>>
type _Band3000Max = Expect<Equal<typeof PRICE_BANDS[5]['maxCents'], null>>
type _PriceBandId = Expect<
  Equal<PriceBandId, 'under-200' | '200-499' | '500-999' | '1000-1999' | '2000-2999' | '3000-plus'>
>
type _PriceSelection = Expect<Equal<PriceSelection, PriceBandId | 'all' | 'custom'>>

// —— 销量三档 + 不限 ——
type _SalesTiers = Expect<
  Equal<
    typeof SALES_TIERS,
    readonly [
      { readonly id: 'all'; readonly label: '不限'; readonly minSales: null },
      { readonly id: 'gte-500'; readonly label: '≥500'; readonly minSales: 500 },
      { readonly id: 'gte-1000'; readonly label: '≥1000'; readonly minSales: 1000 },
      { readonly id: 'gte-2000'; readonly label: '≥2000'; readonly minSales: 2000 },
    ]
  >
>
type _SalesSelection = Expect<Equal<SalesSelection, 'all' | 'gte-500' | 'gte-1000' | 'gte-2000' | 'custom'>>

// —— 排序：无关键词三项、「default」= 销量降序；有关键词四项、「default」= 相关性 ——
type _BrowseSorts = Expect<
  Equal<
    typeof BROWSE_SORT_OPTIONS,
    readonly [
      { readonly value: 'default'; readonly label: '销量降序' },
      { readonly value: 'price_asc'; readonly label: '价格升序' },
      { readonly value: 'price_desc'; readonly label: '价格降序' },
    ]
  >
>
type _SearchSorts = Expect<
  Equal<
    typeof SEARCH_SORT_OPTIONS,
    readonly [
      { readonly value: 'default'; readonly label: '相关性' },
      { readonly value: 'price_asc'; readonly label: '价格升序' },
      { readonly value: 'price_desc'; readonly label: '价格降序' },
      { readonly value: 'sales_desc'; readonly label: '销量降序' },
    ]
  >
>
type _SortSelection = Expect<Equal<SortSelection, 'default' | ProductSort>>
type _SortOptions = Expect<
  Equal<ReturnType<typeof sortOptionsFor>, typeof BROWSE_SORT_OPTIONS | typeof SEARCH_SORT_OPTIONS>
>
type _DefaultSort = Expect<Equal<typeof LIST_QUERY_DEFAULTS['sort'], null>>

// —— 编解码函数的外部形状 ——
type _SerializeReturn = Expect<Equal<ReturnType<typeof serializeListQuery>, SerializedListQuery>>
type _SerializedKeys = Expect<
  Equal<SerializedListQuery, Record<string, string>>
>
type _ParseReturn = Expect<Equal<ReturnType<typeof parseListQuery>, ListQueryState>>
type _ParseArg = Expect<Equal<Parameters<typeof parseListQuery>, [raw: RawQuery]>>
type _ApiReturn = Expect<Equal<ReturnType<typeof toApiQuery>, ProductListQuery>>
type _SameSerialized = Expect<Equal<ReturnType<typeof isSameSerializedQuery>, boolean>>
type _NormalizeReturn = Expect<Equal<ReturnType<typeof normalizeSort>, ProductSort | null>>
type _PriceRead = Expect<Equal<ReturnType<typeof readPriceSelection>, PriceSelection>>
type _SalesRead = Expect<Equal<ReturnType<typeof readSalesSelection>, SalesSelection>>
type _SortRead = Expect<Equal<ReturnType<typeof readSortSelection>, SortSelection>>

// —— 状态变化函数：合并、比较、清除、判断 ——
type _FilterSelection = Expect<
  Equal<
    ListFilterSelection,
    {
      category: string | null
      priceMinCents: number | null
      priceMaxCents: number | null
      minSales: number | null
      sort: ProductSort | null
    }
  >
>
type _FilterSelectionOf = Expect<Equal<ReturnType<typeof filterSelectionOf>, ListFilterSelection>>
type _WithSelection = Expect<Equal<ReturnType<typeof withFilterSelection>, ListQueryState>>
type _SameConditions = Expect<Equal<ReturnType<typeof isSameListConditions>, boolean>>
type _HasFilters = Expect<Equal<ReturnType<typeof hasActiveFilters>, boolean>>
type _Clear = Expect<Equal<ReturnType<typeof clearListFilters>, ListQueryState>>

// —— 非法价格参数（#13）：检查结果形状、入参形状与清除入口 ——
type _PriceIssueKind = Expect<
  Equal<PriceParamIssueKind, 'duplicate' | 'not-integer' | 'out-of-range' | 'range-reversed'>
>
type _PriceInspection = Expect<
  Equal<
    ReturnType<typeof inspectPriceParams>,
    {
      invalid: boolean
      kind: PriceParamIssueKind | null
      message: string
      priceMinCents: number | null
      priceMaxCents: number | null
    }
  >
>
type _PriceInspectionArg = Expect<Equal<Parameters<typeof inspectPriceParams>, [raw: RawQuery]>>
type _ClearPriceRange = Expect<Equal<ReturnType<typeof clearPriceRange>, ListQueryState>>

// —— 关键词生命周期（#10）：长度上限与提交后的状态迁移 ——
type _KeywordMax = Expect<Equal<typeof KEYWORD_MAX_LENGTH, 100>>
type _WithKeyword = Expect<Equal<ReturnType<typeof withKeyword>, ListQueryState>>
type _WithKeywordArgs = Expect<
  Equal<Parameters<typeof withKeyword>, [state: ListQueryState, keyword: string | null]>
>

/** 显式导出，避免断言别名被当成死代码；本项目未开 `noUnusedLocals`。 */
export type ListQueryTypeTests =
  | _Defaults
  | _State
  | _ProductSort
  | _ProductSorts
  | _Categories
  | _KnownCategories
  | _CategorySelection
  | _PriceBands
  | _Under200Max
  | _Band200Min
  | _Band200Max
  | _Band500Min
  | _Band500Max
  | _Band1000Min
  | _Band1000Max
  | _Band2000Min
  | _Band2000Max
  | _Band3000Min
  | _Band3000Max
  | _PriceBandId
  | _PriceSelection
  | _SalesTiers
  | _SalesSelection
  | _BrowseSorts
  | _SearchSorts
  | _SortSelection
  | _SortOptions
  | _DefaultSort
  | _SerializeReturn
  | _SerializedKeys
  | _ParseReturn
  | _ParseArg
  | _ApiReturn
  | _SameSerialized
  | _NormalizeReturn
  | _PriceRead
  | _SalesRead
  | _SortRead
  | _FilterSelection
  | _FilterSelectionOf
  | _WithSelection
  | _SameConditions
  | _HasFilters
  | _Clear
  | _PriceIssueKind
  | _PriceInspection
  | _PriceInspectionArg
  | _ClearPriceRange
  | _KeywordMax
  | _WithKeyword
  | _WithKeywordArgs
