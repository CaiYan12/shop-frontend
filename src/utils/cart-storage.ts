/**
 * src/utils/cart-storage.ts
 *
 * 购物车存档的读写与结构校验（#23）。
 *
 * 存档是浏览器本地存储里的单键 JSON：`{ version: 1, items: [...] }`，条目沿用
 * `cart.ts` 的六字段快照。这里只做「存档 ↔ 内存」的转换与兜底：
 * - 解析失败、结构不合法、版本不支持一律按空购物车处理，不尝试兼容旧结构；
 * - 读写被拒（隐私模式 / 配额）时返回不可用，由调用方退回内存态；
 * - 写入使用 `setItem` 的原子替换语义，失败时上一次成功保存的值原样保留。
 *
 * 存储句柄可在运行时替换（应用启动用真实 `localStorage`，运行时检查注入伪存储）。
 */
import type { CartItem } from '@/stores/cart'

/** 存档单键；版本号同时写进值里，键名再带一份便于人工排查。 */
export const CART_STORAGE_KEY = 'shop-frontend:cart:v1'

/** 当前支持的存档格式版本；只认这一版，不做迁移。 */
export const CART_STORAGE_VERSION = 1

/** `localStorage` 的最小接口，便于注入伪存储。 */
export interface CartStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** 存档值形状。 */
export interface CartArchive {
  readonly version: typeof CART_STORAGE_VERSION
  readonly items: readonly CartItem[]
}

/** 读取结果；`available` 为 `false` 表示存储本身不可用（而不是没有存档）。 */
export interface LoadedCartArchive {
  readonly items: CartItem[]
  readonly available: boolean
}

/** 当前使用的存储；`undefined` 表示尚未解析过默认值。 */
let activeStorage: CartStorageLike | null | undefined

/** 条目六字段，顺序无关但集合必须完全一致。 */
const CART_ITEM_FIELDS = ['sku', 'slug', 'name', 'unitPriceCents', 'quantity', 'stock'] as const

function defaultStorage(): CartStorageLike | null {
  try {
    const candidate = (globalThis as { localStorage?: CartStorageLike }).localStorage
    return candidate ?? null
  } catch {
    // 访问 `localStorage` 本身就可能抛（隐私模式），按不可用处理。
    return null
  }
}

/** 取当前存储句柄；首次调用时解析 `globalThis.localStorage`。 */
export function getCartStorage(): CartStorageLike | null {
  if (activeStorage === undefined) {
    activeStorage = defaultStorage()
  }
  return activeStorage
}

/** 替换存储句柄（应用启动 / 运行时检查注入伪存储；传 `null` 模拟不可用）。 */
export function setCartStorage(storage: CartStorageLike | null): void {
  activeStorage = storage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/** 严格校验单个条目：恰好六字段、类型与取值合法；不合法返回 `null`。 */
function parseCartItem(value: unknown): CartItem | null {
  if (!isRecord(value)) {
    return null
  }
  if (Object.keys(value).length !== CART_ITEM_FIELDS.length) {
    return null
  }
  for (const field of CART_ITEM_FIELDS) {
    if (!(field in value)) {
      return null
    }
  }

  const { sku, slug, name, unitPriceCents, quantity, stock } = value
  if (!isNonEmptyString(sku) || !isNonEmptyString(slug) || !isNonEmptyString(name)) {
    return null
  }
  if (!isNonNegativeSafeInteger(unitPriceCents) || !isPositiveSafeInteger(quantity)) {
    return null
  }
  if (!isNonNegativeSafeInteger(stock)) {
    return null
  }

  return { sku, slug, name, unitPriceCents, quantity, stock }
}

/**
 * 解析存档值。
 *
 * `null` / 空串表示没有存档，返回空数组；解析失败、结构不合法、版本不支持同样
 * 返回空数组（调用方无需区分「没有」与「坏了」，都从空购物车启动）。
 * 同一 `sku` 出现多行违反「一行一 sku」不变式，整份存档按不合法处理。
 */
export function parseCartArchive(raw: string | null): CartItem[] {
  if (raw === null || raw === '') {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  if (!isRecord(parsed) || parsed.version !== CART_STORAGE_VERSION) {
    return []
  }
  if (!Array.isArray(parsed.items)) {
    return []
  }

  const items: CartItem[] = []
  const seen = new Set<string>()
  for (const entry of parsed.items) {
    const item = parseCartItem(entry)
    if (item === null || seen.has(item.sku)) {
      return []
    }
    seen.add(item.sku)
    items.push(item)
  }

  return items
}

/** 序列化为存档值；只写版本号与条目数组，不夹带其他状态。 */
export function serializeCartArchive(items: readonly CartItem[]): string {
  const archive: CartArchive = { version: CART_STORAGE_VERSION, items }
  return JSON.stringify(archive)
}

/** 读取存档；存储不可用时返回空购物车并标记 `available: false`。 */
export function loadCartArchive(): LoadedCartArchive {
  const storage = getCartStorage()
  if (storage === null) {
    return { items: [], available: false }
  }

  let raw: string | null
  try {
    raw = storage.getItem(CART_STORAGE_KEY)
  } catch {
    return { items: [], available: false }
  }

  return { items: parseCartArchive(raw), available: true }
}

/**
 * 写入存档；成功返回 `true`。
 *
 * 存储不可用或写入抛错时返回 `false`，且不删除既有键，因此上一次成功保存的
 * 存档保持不变。
 */
export function saveCartArchive(items: readonly CartItem[]): boolean {
  const storage = getCartStorage()
  if (storage === null) {
    return false
  }

  try {
    storage.setItem(CART_STORAGE_KEY, serializeCartArchive(items))
    return true
  } catch {
    return false
  }
}
