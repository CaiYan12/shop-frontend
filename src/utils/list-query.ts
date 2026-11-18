/**
 * src/utils/list-query.ts
 *
 * URL ↔ 列表查询参数的唯一编解码（#9 / #10）。
 *
 * 规格「状态与 URL」要求 URL 中已提交的条件是唯一来源：搜索关键词、筛选条、排序、
 * 分页都只通过这里读 `route.query`、写 `router.push`，组件不各自拼参数。把它抽成
 * 纯函数也满足 Testing Decisions 的「为后续单测预留两个纯函数」——本阶段用
 * `list-query.type-test.ts` 在编译期钉住默认值、边界与选项形状。
 *
 * 规则（#9 / #10）：
 * - 默认值不写进 URL：`page=1`、空条件、普通浏览的 `sales_desc`、搜索的相关性
 *   （不传 `sort`）都省略。只有非默认值才写入。
 * - 价格档边界取自台账 R25：20000 / 50000 / 100000 / 200000 / 300000 分；
 *   前一档上限 = 下一档边界 − 1 分，首档只设上限 19999 分（明确排除 ¥200）。
 * - 契约原始值进 URL（`category` / `priceMinCents` / `priceMaxCents` / `minSales`），
 *   不引入档位 id。类型 / 排序的非法值按默认值兜底；价格参数的非法值不静默兜底，
 *   由 `inspectPriceParams` 交给页面暂停请求并提示（#13）。
 */
import type { operations } from '@/api/schema'

/** 列表查询参数（契约类型，来自 `schema.d.ts`）。 */
export type ProductListQuery = NonNullable<operations['listProducts']['parameters']['query']>

/** 契约里的三种排序；缺省由后端按有无关键词选择默认排序。 */
export type ProductSort = NonNullable<ProductListQuery['sort']>

/** 契约允许的排序值，顺序与下拉选项无关。 */
export const PRODUCT_SORTS = ['price_asc', 'price_desc', 'sales_desc'] as const satisfies readonly ProductSort[]

/**
 * 规范化后的页面状态。`null` 表示「不限制」；`page` 恒为正整数。
 * 这是筛选条 / 排序控件 / 请求三者共用的形状。
 */
export interface ListQueryState {
  category: string | null
  priceMinCents: number | null
  priceMaxCents: number | null
  minSales: number | null
  keyword: string | null
  sort: ProductSort | null
  page: number
}

/**
 * 默认值：也是「哪些值不写进 URL」的唯一定义。
 *
 * 普通浏览的默认排序是销量降序，但它由后端缺省承担，所以 `sort` 的默认值是
 * `null`（不传）而不是 `'sales_desc'`。这样「默认值一律省略 sort」在类型上就
 * 没有二义性。
 */
export const LIST_QUERY_DEFAULTS = {
  category: null,
  priceMinCents: null,
  priceMaxCents: null,
  minSales: null,
  keyword: null,
  sort: null,
  page: 1,
} as const satisfies ListQueryState

/** 商品类型 chips（含「全部」）。slug 是契约里的 `category`。 */
export const CATEGORY_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'audio', label: '音频设备' },
  { value: 'peripherals', label: '键盘外设' },
  { value: 'displays', label: '显示设备' },
  { value: 'wearables', label: '智能穿戴' },
] as const

/** 合法的商品类型 slug（用于把 URL 里的脏值按默认值兜底）。 */
export const KNOWN_CATEGORY_SLUGS = ['audio', 'peripherals', 'displays', 'wearables'] as const

/** 商品类型选择值：`all` 表示不限。 */
export type CategorySelection = typeof CATEGORY_OPTIONS[number]['value']

/**
 * 价格六档（台账 R25）。数值单位是「分」，且全部是契约原始值：
 * - `under-200` 只设上限 19999，明确排除 ¥200；
 * - 其余各档下限为边界值，上限为下一档边界 − 1。
 */
export const PRICE_BANDS = [
  { id: 'under-200', label: '低于 ¥200', minCents: null, maxCents: 19999 },
  { id: '200-499', label: '¥200–499', minCents: 20000, maxCents: 49999 },
  { id: '500-999', label: '¥500–999', minCents: 50000, maxCents: 99999 },
  { id: '1000-1999', label: '¥1000–1999', minCents: 100000, maxCents: 199999 },
  { id: '2000-2999', label: '¥2000–2999', minCents: 200000, maxCents: 299999 },
  { id: '3000-plus', label: '¥3000 以上', minCents: 300000, maxCents: null },
] as const

export type PriceBand = typeof PRICE_BANDS[number]
export type PriceBandId = PriceBand['id']

/** 价格下拉的模型值：不限 / 某预设档 / URL 里合法的非预设区间。 */
export type PriceSelection = PriceBandId | 'all' | 'custom'

/** 销量门槛（含「不限」）；`minSales` 是契约原始值。 */
export const SALES_TIERS = [
  { id: 'all', label: '不限', minSales: null },
  { id: 'gte-500', label: '≥500', minSales: 500 },
  { id: 'gte-1000', label: '≥1000', minSales: 1000 },
  { id: 'gte-2000', label: '≥2000', minSales: 2000 },
] as const

export type SalesTier = typeof SALES_TIERS[number]
export type SalesSelection = SalesTier['id'] | 'custom'

/**
 * 排序下拉。`default` 是「不写 `sort`」的模型值：
 * - 无关键词时它显示为「销量降序」（后端默认）；
 * - 有关键词时它显示为「相关性」（不传 `sort`，由后端按相关性排序）。
 */
export const BROWSE_SORT_OPTIONS = [
  { value: 'default', label: '销量降序' },
  { value: 'price_asc', label: '价格升序' },
  { value: 'price_desc', label: '价格降序' },
] as const

export const SEARCH_SORT_OPTIONS = [
  { value: 'default', label: '相关性' },
  { value: 'price_asc', label: '价格升序' },
  { value: 'price_desc', label: '价格降序' },
  { value: 'sales_desc', label: '销量降序' },
] as const

export type SortSelection = typeof BROWSE_SORT_OPTIONS[number]['value'] | typeof SEARCH_SORT_OPTIONS[number]['value']

/** 筛选条一次提交的五项条件（排序也由筛选条承载）。 */
export interface ListFilterSelection {
  category: string | null
  priceMinCents: number | null
  priceMaxCents: number | null
  minSales: number | null
  sort: ProductSort | null
}

/** `route.query` 的宽松形状：只关心字符串与重复参数，不依赖 vue-router 类型。 */
export type RawQueryValue = string | null | undefined | readonly (string | null | undefined)[]
export type RawQuery = Record<string, RawQueryValue>

/** 写回 URL 的形状：全部是字符串，默认值已被省略。 */
export type SerializedListQuery = Record<string, string>

/** 价格 / 销量上限直接取后端契约的边界，越界值按默认值兜底。 */
const PRICE_MAX_CENTS = 9_999_999_999
const SALES_MAX = 1_000_000
const PAGE_MAX = 200

/** 价格参数非法的原因；`null` 表示合法。 */
export type PriceParamIssueKind = 'duplicate' | 'not-integer' | 'out-of-range' | 'range-reversed'

/**
 * 一次价格参数检查的结果（#13）。`invalid` 为真时列表页必须暂停请求，
 * 不能按默认值静默请求；四种原因都要包含「清除或重选价格条件」的提示。
 */
export interface PriceParamInspection {
  invalid: boolean
  kind: PriceParamIssueKind | null
  /** 面向用户的提示；合法时为空串。 */
  message: string
  priceMinCents: number | null
  priceMaxCents: number | null
}

type ParsedPriceParam =
  | { ok: true, value: number | null }
  | { ok: false, kind: PriceParamIssueKind, message: string }

/**
 * 单个价格参数：缺失 / 空串视为未设置；重复、非整数、越界都是非法（#13）。
 * 与 `parseBoundedInteger` 的差别是这里把「为什么非法」带出来给页面提示。
 */
function readPriceParam (value: RawQueryValue): ParsedPriceParam {
  if (value === undefined || value === null) {
    return { ok: true, value: null }
  }
  const list = Array.isArray(value) ? value : [value]
  if (list.length > 1) {
    return { ok: false, kind: 'duplicate', message: '价格参数重复，请清除或重选价格条件。' }
  }
  const raw = list[0]
  if (typeof raw !== 'string') {
    return { ok: true, value: null }
  }
  const text = raw.trim()
  if (text.length === 0) {
    return { ok: true, value: null }
  }
  if (!/^\d+$/.test(text)) {
    return { ok: false, kind: 'not-integer', message: '价格参数不是整数，请清除或重选价格条件。' }
  }
  const parsed = Number(text)
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > PRICE_MAX_CENTS) {
    return {
      ok: false,
      kind: 'out-of-range',
      message: `价格参数超出允许范围（0–${PRICE_MAX_CENTS} 分），请清除或重选价格条件。`,
    }
  }
  return { ok: true, value: parsed }
}

/**
 * 检查 URL 里的两个价格参数（#13）：重复参数、非整数、越界、下限大于上限。
 *
 * 与其它字段「非法即按默认值兜底」不同，价格参数非法时不能假装用户没写条件，
 * 否则会静默发出一个不符合 URL 的请求。这里把两端一起置为 `null` 并返回提示，
 * 由列表页暂停请求；用户点击「清除价格条件」或重选价格档后恢复。
 */
export function inspectPriceParams (raw: RawQuery): PriceParamInspection {
  const min = readPriceParam(raw.priceMinCents)
  if (!min.ok) {
    return { invalid: true, kind: min.kind, message: min.message, priceMinCents: null, priceMaxCents: null }
  }
  const max = readPriceParam(raw.priceMaxCents)
  if (!max.ok) {
    return { invalid: true, kind: max.kind, message: max.message, priceMinCents: null, priceMaxCents: null }
  }
  if (min.value !== null && max.value !== null && min.value > max.value) {
    return {
      invalid: true,
      kind: 'range-reversed',
      message: '价格下限大于上限，请清除或重选价格条件。',
      priceMinCents: null,
      priceMaxCents: null,
    }
  }
  return { invalid: false, kind: null, message: '', priceMinCents: min.value, priceMaxCents: max.value }
}

/** 关键词长度上限：与后端契约一致，`trim` 后 1–100 才接受（#10）。 */
export const KEYWORD_MAX_LENGTH = 100

/** 只取重复参数的第一条；其余形式（数字、布尔、空）都视为缺失。 */
function firstRaw(value: RawQueryValue): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' ? raw : null
}

/** 严格十进制整数解析：`+1` / `1.0` / `1e3` / 空白都不接受。 */
function parseBoundedInteger(value: RawQueryValue, min: number, max: number): number | null {
  const text = firstRaw(value)?.trim()
  if (text === undefined || text === null || text === '' || !/^\d+$/.test(text)) {
    return null
  }
  const parsed = Number(text)
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null
}

/** 关键词：与后端一致先 trim；空串或超过 100 字符按无关键词兜底。 */
function parseKeyword(value: RawQueryValue): string | null {
  const text = firstRaw(value)?.trim()
  if (text === undefined || text === null || text.length === 0 || text.length > KEYWORD_MAX_LENGTH) {
    return null
  }
  return text
}

function parseCategory(value: RawQueryValue): string | null {
  const text = firstRaw(value)?.trim()
  if (text === undefined || text === null) {
    return null
  }
  return (KNOWN_CATEGORY_SLUGS as readonly string[]).includes(text) ? text : null
}

function parseSort(value: RawQueryValue): ProductSort | null {
  const text = firstRaw(value)
  return (PRODUCT_SORTS as readonly string[]).includes(text ?? '') ? (text as ProductSort) : null
}

/**
 * 普通浏览的 `sales_desc` 是后端默认，等价于不写 `sort`；
 * 搜索路径必须显式传 `sales_desc` 才能覆盖相关性。这里把两种「默认」统一成
 * `null`，避免同一个条件在 URL 里出现两种等价写法。
 */
export function normalizeSort(sort: ProductSort | null, keyword: string | null): ProductSort | null {
  if (sort === null) {
    return null
  }
  return keyword === null && sort === 'sales_desc' ? null : sort
}

/**
 * URL → 页面状态。类型 / 排序 / 页码的非法值按默认值兜底；价格参数由
 * `inspectPriceParams` 先行检查（#13），非法时两端一起按未设置处理，
 * 页面据检查结果暂停请求并提示，而不是静默按默认值请求。
 * - 重复参数取第一条（价格参数除外，见上）；
 * - 非十进制整数、超出契约范围的数值按缺失处理；
 * - 未知 `category` 与未知 `sort` 按缺失处理；
 * - 普通浏览里显式的 `sales_desc` 归一为「缺省」。
 */
export function parseListQuery(raw: RawQuery): ListQueryState {
  const keyword = parseKeyword(raw.keyword)
  const price = inspectPriceParams(raw)

  return {
    category: parseCategory(raw.category),
    priceMinCents: price.priceMinCents,
    priceMaxCents: price.priceMaxCents,
    minSales: parseBoundedInteger(raw.minSales, 0, SALES_MAX),
    keyword,
    sort: normalizeSort(parseSort(raw.sort), keyword),
    page: parseBoundedInteger(raw.page, 1, PAGE_MAX) ?? LIST_QUERY_DEFAULTS.page,
  }
}

/** 页面状态 → URL。默认值全部省略；输出只含字符串，可直接交给 `router.push`。 */
export function serializeListQuery(state: ListQueryState): SerializedListQuery {  const query: SerializedListQuery = {}
  if (state.category !== null) {
    query.category = state.category
  }
  if (state.priceMinCents !== null) {
    query.priceMinCents = String(state.priceMinCents)
  }
  if (state.priceMaxCents !== null) {
    query.priceMaxCents = String(state.priceMaxCents)
  }
  if (state.minSales !== null) {
    query.minSales = String(state.minSales)
  }
  if (state.keyword !== null) {
    query.keyword = state.keyword
  }
  const sort = normalizeSort(state.sort, state.keyword)
  if (sort !== null) {
    query.sort = sort
  }
  if (state.page > LIST_QUERY_DEFAULTS.page) {
    query.page = String(state.page)
  }
  return query
}

/** 两个序列化结果是否相同：相同条件（含页码）不重复 push。 */
export function isSameSerializedQuery(a: SerializedListQuery, b: SerializedListQuery): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) {
    return false
  }
  return keys.every(key => a[key] === b[key])
}

/** 页面状态 → API 查询（不含 `pageSize`，由列表页固定传 8）。 */
export function toApiQuery(state: ListQueryState): ProductListQuery {
  const query: ProductListQuery = { page: state.page }
  if (state.category !== null) {
    query.category = state.category
  }
  if (state.priceMinCents !== null) {
    query.priceMinCents = state.priceMinCents
  }
  if (state.priceMaxCents !== null) {
    query.priceMaxCents = state.priceMaxCents
  }
  if (state.minSales !== null) {
    query.minSales = state.minSales
  }
  if (state.keyword !== null) {
    query.keyword = state.keyword
  }
  const sort = normalizeSort(state.sort, state.keyword)
  if (sort !== null) {
    query.sort = sort
  }
  return query
}

/** 从页面状态取筛选条需要的五项条件。 */
export function filterSelectionOf(state: ListQueryState): ListFilterSelection {
  return {
    category: state.category,
    priceMinCents: state.priceMinCents,
    priceMaxCents: state.priceMaxCents,
    minSales: state.minSales,
    sort: state.sort,
  }
}

/** 把筛选条的一次提交合并进状态；页码由调用方在「确实有变化」后重置。 */
export function withFilterSelection(state: ListQueryState, selection: ListFilterSelection): ListQueryState {
  return { ...state, ...selection }
}

/**
 * 提交关键词的状态迁移（#10）：`keyword` 由搜索框按「`trim` 后 1–100」校验后传入，
 * `null` 表示空提交 / 点「×」清除。
 *
 * - 任何一次有效提交都回到第 1 页（页码从 URL 移除）；
 * - 非空 → 非空时保留用户已选的显式排序；
 * - 清除关键词时显式 `sales_desc` 回落为普通浏览默认值（不写 `sort`），
 *   两个价格排序保留（规格「排序与分页」）；
 * - 条件是否真的变化由调用方用 `isSameListConditions` 判断，未变不 push。
 */
export function withKeyword (state: ListQueryState, keyword: string | null): ListQueryState {
  const nextKeyword = keyword === null || keyword.trim().length === 0 ? null : keyword.trim()
  return {
    ...state,
    keyword: nextKeyword,
    sort: normalizeSort(state.sort, nextKeyword),
    page: LIST_QUERY_DEFAULTS.page,
  }
}

/**
 * 条件是否相同（页码不参与）。用于「条件值未变不新增历史」：
 * 在页码为 3 时重复点同一个条件，不应产生一条把页码重置的历史。
 */
export function isSameListConditions(a: ListQueryState, b: ListQueryState): boolean {
  return (
    a.category === b.category &&
    a.priceMinCents === b.priceMinCents &&
    a.priceMaxCents === b.priceMaxCents &&
    a.minSales === b.minSales &&
    a.keyword === b.keyword &&
    normalizeSort(a.sort, a.keyword) === normalizeSort(b.sort, b.keyword)
  )
}

/** 是否有任意一条筛选条件（商品类型 / 价格 / 销量）。排序与关键词不算。 */
export function hasActiveFilters(state: ListQueryState): boolean {
  return (
    state.category !== null ||
    state.priceMinCents !== null ||
    state.priceMaxCents !== null ||
    state.minSales !== null
  )
}

/**
 * 「清除筛选」：只移除商品类型、价格档、销量门槛，保留关键词与排序，并回到第 1 页。
 * 是否真的有条件可清由 `hasActiveFilters` 判断，避免空点击产生历史。
 */
export function clearListFilters(state: ListQueryState): ListQueryState {
  return {
    ...state,
    category: null,
    priceMinCents: null,
    priceMaxCents: null,
    minSales: null,
    page: LIST_QUERY_DEFAULTS.page,
  }
}

/** 清除价格条件（#13 非法参数的脱困入口）：两端一起移除并回到第 1 页。 */
export function clearPriceRange(state: ListQueryState): ListQueryState {
  return {
    ...state,
    priceMinCents: null,
    priceMaxCents: null,
    page: LIST_QUERY_DEFAULTS.page,
  }
}

/** URL 里的合法非预设价格区间 → `custom`；两端都没有时返回 `all`。 */
export function readPriceSelection(state: ListQueryState): PriceSelection {
  if (state.priceMinCents === null && state.priceMaxCents === null) {
    return 'all'
  }
  const band = PRICE_BANDS.find(
    item => item.minCents === state.priceMinCents && item.maxCents === state.priceMaxCents,
  )
  return band?.id ?? 'custom'
}

/** 销量门槛：命中预设档，否则显示为 `custom`（合法但非预设的值）。 */
export function readSalesSelection(state: ListQueryState): SalesSelection {
  const tier = SALES_TIERS.find(item => item.minSales === state.minSales)
  return tier?.id ?? 'custom'
}

/** 排序当前值：缺省统一映射为 `default`。 */
export function readSortSelection(state: ListQueryState): SortSelection {
  return normalizeSort(state.sort, state.keyword) ?? 'default'
}

/** 有关键词时四项（相关性默认），无关键词时三项（销量降序默认）。 */
export function sortOptionsFor(keyword: string | null): typeof BROWSE_SORT_OPTIONS | typeof SEARCH_SORT_OPTIONS {
  return keyword === null ? BROWSE_SORT_OPTIONS : SEARCH_SORT_OPTIONS
}
