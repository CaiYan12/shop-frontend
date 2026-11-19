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
 *   不引入档位 id。类型 / 排序的非法值按默认值兜底；**存在非法参数时**由
 *   `inspectListParams` 交给页面暂停请求并提示，绝不静默请求或静默改写 URL（#13）。
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

/** 商品类型选择值：`all` 表示不限。 */
export type CategorySelection = typeof CATEGORY_OPTIONS[number]['value']

/**
 * 合法的商品类型 slug（用于把 URL 里的脏值按默认值兜底）。
 * 从上面 chips 的非「全部」项派生，保证展示项与白名单只有一份事实来源。
 */
export const KNOWN_CATEGORY_SLUGS = [
  CATEGORY_OPTIONS[1].value,
  CATEGORY_OPTIONS[2].value,
  CATEGORY_OPTIONS[3].value,
  CATEGORY_OPTIONS[4].value,
] as const

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

/**
 * 保留原始形态的查询形状：用于「清除无效条件 / 修复单个维度」。
 *
 * 与 `SerializedListQuery` 不同，这里不按页面状态重写 URL，而是保留 `route.query`
 * 里的重复参数（数组）与无值参数（`null`），只增删目标 key。
 */
export type ListQueryOutput = Record<string, string | null | (string | null)[]>

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
function readPriceParam(value: RawQueryValue): ParsedPriceParam {
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
export function inspectPriceParams(raw: RawQuery): PriceParamInspection {
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

/**
 * 非法的列表参数类别（#13）：价格四种原因，加上商品类型与销量门槛。
 * 与价格不同，后两者合法时能还原成状态，非法时只影响「提示 + 暂停请求」。
 */
export type ListParamIssueKind = PriceParamIssueKind | 'category' | 'min-sales'

/** 一次「全部列表参数」检查的结果；`invalid` 为真时列表页必须暂停请求。 */
export interface ListParamInspection {
  invalid: boolean
  kind: ListParamIssueKind | null
  /** 面向用户的第一条提示；合法时为空串。 */
  message: string
  /** 需要一并清除的原始参数名；「清除无效条件」按钮据此改写 URL。 */
  invalidKeys: readonly string[]
}

type ParsedTextParam =
  | { ok: true, value: string | null }
  | { ok: false }

/** 重复参数（数组长度 > 1）在有歧义的字段上一律视为非法。 */
function isDuplicateParam(value: RawQueryValue): boolean {
  return Array.isArray(value) && value.length > 1
}

/**
 * 商品类型：缺失 / 空串视为未设置；重复或不在白名单里的值非法（#13）。
 * 与 `parseCategory` 的差别是这里保留「非法」这一事实，供页面提示并暂停请求。
 */
function readCategoryParam(value: RawQueryValue): ParsedTextParam {
  if (value === undefined || value === null) {
    return { ok: true, value: null }
  }
  if (isDuplicateParam(value)) {
    return { ok: false }
  }
  const text = firstRaw(value)?.trim()
  if (text === undefined || text === null || text.length === 0) {
    return { ok: true, value: null }
  }
  return (KNOWN_CATEGORY_SLUGS as readonly string[]).includes(text)
    ? { ok: true, value: text }
    : { ok: false }
}

/** 销量门槛：缺失 / 空串视为未设置；重复、非整数、越界都非法（#13）。 */
function isMinSalesParamValid(value: RawQueryValue): boolean {
  if (value === undefined || value === null) {
    return true
  }
  if (isDuplicateParam(value)) {
    return false
  }
  const text = firstRaw(value)?.trim()
  if (text === undefined || text === null || text.length === 0) {
    return true
  }
  if (!/^\d+$/.test(text)) {
    return false
  }
  const parsed = Number(text)
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= SALES_MAX
}

/** 价格非法时具体要清除哪些 key；两端各自非法时都要收集，不能只报一端。 */
function invalidPriceKeys(raw: RawQuery): string[] {
  const min = readPriceParam(raw.priceMinCents)
  const max = readPriceParam(raw.priceMaxCents)
  const keys: string[] = []
  if (!min.ok) {
    keys.push('priceMinCents')
  }
  if (!max.ok) {
    keys.push('priceMaxCents')
  }
  if (min.ok && max.ok && min.value !== null && max.value !== null && min.value > max.value) {
    keys.push('priceMinCents', 'priceMaxCents')
  }
  return keys
}

/**
 * 检查 URL 里的全部列表参数（#13）：商品类型、价格两端、销量门槛。
 *
 * 与 `parseListQuery` 的「非法即按默认值兜底」不同，这里把非法事实带出来，
 * 由列表页暂停请求并提示。**存在非法参数时页面不得用解析后的状态重写 URL**：
 * 提交关键词、清除筛选等操作都必须先让用户点「清除无效条件」，否则非法参数
 * 会被静默删掉（本次修复的核心）。
 *
 * 多条非法时返回第一条提示，但 `invalidKeys` 汇总全部需要清除的 key，
 * 保证一次点击能脱困。
 */
export function inspectListParams(raw: RawQuery): ListParamInspection {
  const issues: { kind: ListParamIssueKind, message: string, keys: string[] }[] = []

  const category = readCategoryParam(raw.category)
  if (!category.ok) {
    issues.push({
      kind: 'category',
      message: `商品类型参数无效（可选：${KNOWN_CATEGORY_SLUGS.join(' / ')}），请清除或重选商品类型。`,
      keys: ['category'],
    })
  }

  const price = inspectPriceParams(raw)
  if (price.invalid && price.kind !== null) {
    issues.push({ kind: price.kind, message: price.message, keys: invalidPriceKeys(raw) })
  }

  const minSalesValid = isMinSalesParamValid(raw.minSales)
  if (!minSalesValid) {
    issues.push({
      kind: 'min-sales',
      message: `销量参数无效（需为 0–${SALES_MAX} 的整数），请清除或重选销量条件。`,
      keys: ['minSales'],
    })
  }

  if (issues.length === 0) {
    return { invalid: false, kind: null, message: '', invalidKeys: [] }
  }
  return {
    invalid: true,
    kind: issues[0].kind,
    message: issues[0].message,
    invalidKeys: issues.flatMap(issue => issue.keys),
  }
}

/** 把 `route.query` 的原始值按原形态复制：数组仍是数组，无值参数仍是 `null`。 */
function preserveRawValue(value: RawQueryValue): string | null | (string | null)[] | undefined {
  if (Array.isArray(value)) {
    return value.map(entry => (typeof entry === 'string' ? entry : null))
  }
  if (typeof value === 'string' || value === null) {
    return value
  }
  return undefined
}

/** 复制整份原始查询，保留重复参数与无值参数的形态。 */
function preserveRawQuery(raw: RawQuery): ListQueryOutput {
  const query: ListQueryOutput = {}
  for (const [key, value] of Object.entries(raw)) {
    const preserved = preserveRawValue(value)
    if (preserved !== undefined) {
      query[key] = preserved
    }
  }
  return query
}

/**
 * 「清除无效条件」的 URL 形状：只删掉非法 key，其余参数（含重复数组、无值参数、
 * 页面不认识的参数）保持原样，由页面 `router.replace` 触发一次合法请求（#13）。
 */
export function clearInvalidListParams(raw: RawQuery): ListQueryOutput {
  const issues = inspectListParams(raw)
  const query: ListQueryOutput = {}
  for (const [key, value] of Object.entries(raw)) {
    if (issues.invalidKeys.includes(key)) {
      continue
    }
    const preserved = preserveRawValue(value)
    if (preserved !== undefined) {
      query[key] = preserved
    }
  }
  return query
}

/** 筛选条能独立修复的维度；与 `inspectListParams` 的 `invalidKeys` 一一对应。 */
type FilterDimension = 'category' | 'price' | 'min-sales'

function dimensionsOfInvalidKeys(keys: readonly string[]): Set<FilterDimension> {
  const dimensions = new Set<FilterDimension>()
  for (const key of keys) {
    if (key === 'category') {
      dimensions.add('category')
    } else if (key === 'minSales') {
      dimensions.add('min-sales')
    } else if (key === 'priceMinCents' || key === 'priceMaxCents') {
      dimensions.add('price')
    }
  }
  return dimensions
}

/** 一次筛选提交相对当前解析状态真正改动了哪些维度；改到关键词 / 排序时返回 `null`。 */
function changedFilterDimensions(
  current: ListQueryState,
  next: ListQueryState,
): FilterDimension[] | null {
  if (next.keyword !== current.keyword) {
    return null
  }
  if (normalizeSort(next.sort, next.keyword) !== normalizeSort(current.sort, current.keyword)) {
    return null
  }
  const changed: FilterDimension[] = []
  if (next.category !== current.category) {
    changed.push('category')
  }
  if (next.priceMinCents !== current.priceMinCents || next.priceMaxCents !== current.priceMaxCents) {
    changed.push('price')
  }
  if (next.minSales !== current.minSales) {
    changed.push('min-sales')
  }
  return changed
}

/**
 * 修复值必须来自合法选项：不接受非预设的自定义值，避免用新的非法值「修」旧非法值。
 * 当前解析态对非法维度一律是 `null`，因此没有真正变化的提交不会走到这里。
 */
function isRepairableSelection(dimension: FilterDimension, next: ListQueryState): boolean {
  if (dimension === 'category') {
    return next.category === null ||
      (KNOWN_CATEGORY_SLUGS as readonly string[]).includes(next.category)
  }
  if (dimension === 'min-sales') {
    return next.minSales === null || SALES_TIERS.some(tier => tier.minSales === next.minSales)
  }
  if (next.priceMinCents === null && next.priceMaxCents === null) {
    return true
  }
  return PRICE_BANDS.some(
    band => band.minCents === next.priceMinCents && band.maxCents === next.priceMaxCents,
  )
}

/**
 * 非法参数下的「修复对应维度」（#13）。
 *
 * 只允许一次提交修复**非法维度**：非法 `price*` 时重选价格档、非法 `category`
 * 时重选类型、非法 `minSales` 时重选销量。被修复的维度只重写它自己的 key，
 * 其余原始参数（重复数组、无值参数、关键词 / 排序 / 未知参数）保持原形态；
 * 改排序、改无关筛选等一律返回 `null`，由页面忽略，不得改写 URL。
 */
export function repairInvalidListParams(
  raw: RawQuery,
  selection: ListFilterSelection,
): ListQueryOutput | null {
  const issues = inspectListParams(raw)
  if (!issues.invalid) {
    return null
  }
  const current = parseListQuery(raw)
  const next = withFilterSelection(current, selection)
  const changed = changedFilterDimensions(current, next)
  if (changed === null || changed.length === 0) {
    return null
  }
  const invalidDimensions = dimensionsOfInvalidKeys(issues.invalidKeys)
  if (!changed.every(dimension => invalidDimensions.has(dimension))) {
    return null
  }
  if (!changed.every(dimension => isRepairableSelection(dimension, next))) {
    return null
  }

  const query = preserveRawQuery(raw)
  for (const dimension of changed) {
    if (dimension === 'category') {
      delete query.category
      if (next.category !== null) {
        query.category = next.category
      }
    } else if (dimension === 'min-sales') {
      delete query.minSales
      if (next.minSales !== null) {
        query.minSales = String(next.minSales)
      }
    } else {
      delete query.priceMinCents
      delete query.priceMaxCents
      if (next.priceMinCents !== null) {
        query.priceMinCents = String(next.priceMinCents)
      }
      if (next.priceMaxCents !== null) {
        query.priceMaxCents = String(next.priceMaxCents)
      }
    }
  }
  return query
}

/** 关键词长度上限：与后端契约一致，`trim` 后 1–100 才接受（#10）。 */
export const KEYWORD_MAX_LENGTH = 100

/**
 * 关键词长度：按 **Unicode 码点** 计数，与后端 JSON Schema 的 `maxLength` 一致（#10）。
 *
 * JS 的 `.length` 数的是 UTF-16 单元，一个 emoji 会算成 2，导致前端把后端接受的
 * 51 个 emoji 误判为超长。统一用 `[...str].length`。
 */
export function keywordLength(text: string): number {
  return [...text].length
}

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

/** 关键词：与后端一致先 trim；空串或超过 100 个码点按无关键词兜底。 */
function parseKeyword(value: RawQueryValue): string | null {
  const text = firstRaw(value)?.trim()
  if (text === undefined || text === null) {
    return null
  }
  const length = keywordLength(text)
  if (length === 0 || length > KEYWORD_MAX_LENGTH) {
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

/**
 * 「非 `null` 才赋值」：默认值不写进 URL，也不出现在 API 查询里。
 * URL 侧的数字先经 `optionalString` 转成字符串，API 侧直接传原值。
 */
function assignWhenPresent<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | null,
): void {
  if (value !== null) {
    target[key] = value
  }
}

/** 数字参数转字符串；`null` 保持 `null`，交给 `assignWhenPresent` 判断是否省略。 */
function optionalString(value: number | null): string | null {
  return value === null ? null : String(value)
}

/** 页面状态 → URL。默认值全部省略；输出只含字符串，可直接交给 `router.push`。 */
export function serializeListQuery(state: ListQueryState): SerializedListQuery {
  const query: SerializedListQuery = {}
  assignWhenPresent(query, 'category', state.category)
  assignWhenPresent(query, 'priceMinCents', optionalString(state.priceMinCents))
  assignWhenPresent(query, 'priceMaxCents', optionalString(state.priceMaxCents))
  assignWhenPresent(query, 'minSales', optionalString(state.minSales))
  assignWhenPresent(query, 'keyword', state.keyword)
  assignWhenPresent(query, 'sort', normalizeSort(state.sort, state.keyword))
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
  assignWhenPresent(query, 'category', state.category)
  assignWhenPresent(query, 'priceMinCents', state.priceMinCents)
  assignWhenPresent(query, 'priceMaxCents', state.priceMaxCents)
  assignWhenPresent(query, 'minSales', state.minSales)
  assignWhenPresent(query, 'keyword', state.keyword)
  assignWhenPresent(query, 'sort', normalizeSort(state.sort, state.keyword))
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
export function withKeyword(state: ListQueryState, keyword: string | null): ListQueryState {
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
