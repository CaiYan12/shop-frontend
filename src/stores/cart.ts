/**
 * src/stores/cart.ts
 *
 * 购物车内存态雏形（#6）。
 *
 * 本期只做纯逻辑：不接 UI、不持久化（无 `localStorage`）、不请求后端。
 * 目的是把 Phase 6 要用的数据结构与规则先钉死，让 Phase 8 的单测可以直接调用。
 *
 * 规则来源（#4 规格「购物车 store 雏形」与决策台账 D68）：
 * - 条目字段固定为 `sku` / `slug` / `name` / `unitPriceCents` / `quantity` / `stock`；
 * - 同一 `sku` 只保留一行，合并前先验证**累计**数量；
 * - 单行上限是 `min(999, stock)`，与购买校验的 `quantity` 上限一致；
 * - 缺货、越界、非法输入一律**拒绝**：不改动任何状态，并返回失败原因，绝不截断数量；
 * - `unitPriceCents` 必须是非负安全整数（分），`stock` 必须是非负整数；
 *   负数、小数、`NaN`、`Infinity` 一律按 `INVALID_ITEM` 拒绝（D43 / D44）；
 * - 数量归零不通过 `updateQuantity`，调用方应改用 `remove`（与 `updateQuantity` 只收正整数一致）。
 */
import { defineStore } from 'pinia'
import type { CartVerificationResult, RecoveryChanges } from '../utils/cart-recovery'
import { saveCartArchive } from '../utils/cart-storage.ts'

/** 单个商品的数量静态上限；与后端 D68 的 `quantity` 1..999 一致。 */
export const CART_QUANTITY_LIMIT = 999

/** 恢复复核状态；`checking` 期间购物车只读（#23）。 */
export type CartRecoveryStatus = 'idle' | 'checking' | 'verified' | 'unverified'

/** 本地存储可用性；`unavailable` 时退回内存购物车且不再尝试写盘。 */
export type CartStorageStatus = 'unknown' | 'available' | 'unavailable'

/** 购物车条目；同一 `sku` 只保留一行。 */
export interface CartItem {
  readonly sku: string
  readonly slug: string
  readonly name: string
  readonly unitPriceCents: number
  readonly quantity: number
  readonly stock: number
}

/** `add` 的入参：条目去掉 `quantity`，数量由第二个参数给出（默认 1）。 */
export type AddCartItemInput = Omit<CartItem, 'quantity'>

/** 失败原因码；沿用后端错误码的 SCREAMING_SNAKE_CASE 风格，便于 UI 直接分支。 */
export type CartFailureReason =
  | 'INVALID_QUANTITY'
  | 'INVALID_ITEM'
  | 'OUT_OF_STOCK'
  | 'QUANTITY_LIMIT_EXCEEDED'
  | 'NOT_IN_CART'
  | 'READONLY'

/** 成功结果；动作成功后调用方直接读 store 的最新状态。 */
export interface CartSuccess {
  readonly ok: true
}

/** 失败结果；`limit` 只在越界时出现，供 UI 提示「最多可买 N 件」。 */
export type CartFailure =
  | { readonly ok: false, readonly reason: 'INVALID_QUANTITY', readonly message: string }
  | { readonly ok: false, readonly reason: 'INVALID_ITEM', readonly message: string }
  | { readonly ok: false, readonly reason: 'OUT_OF_STOCK', readonly message: string }
  | { readonly ok: false, readonly reason: 'QUANTITY_LIMIT_EXCEEDED', readonly message: string, readonly limit: number }
  | { readonly ok: false, readonly reason: 'NOT_IN_CART', readonly message: string }
  | { readonly ok: false, readonly reason: 'READONLY', readonly message: string }

/** 四个动作统一的返回联合：成功无载荷，失败必带原因。 */
export type CartActionResult = CartSuccess | CartFailure

/** 购物车 state；`items` 按首次加入的顺序保存。 */
export interface CartState {
  items: CartItem[]
  /** 恢复复核状态；启动时由 #23 的编排推进。 */
  recovery: CartRecoveryStatus
  /** 本地存储可用性；读写被拒时置为 `unavailable`。 */
  storage: CartStorageStatus
  /** 复核发现条目变更时的一条汇总提示（最多 3 条 + 「等 N 个」）；无变更时为空串。 */
  recoveryNotice: string
  /** 与 `recoveryNotice` 同源的完整清单（不折叠）；超过 3 条时供「查看全部」展开。 */
  recoveryNoticeFull: string
  /** 启动恢复只允许触发一次（App 重复挂载 / HMR 时不重复读盘）。 */
  recoveryStarted: boolean
}

/** 正整数判定：`0`、负数、小数、`NaN`、`Infinity` 全部拒绝（D68）。 */
function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

/**
 * 非负整数判定（金额分 / 库存）：负数、小数、`NaN`、`Infinity` 全部拒绝。
 * 金额与库存都必须是整数（D43 / D44），不做静默取整。
 */
function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

/**
 * 单行上限 = `min(999, stock)`（加购 / 改量与启动复核共用同一口径）。
 *
 * 库存按契约是非负整数（D44）；这里用 `Math.floor` 兜住脏数据，`NaN` / 负数 /
 * 非有限值统一按 0 处理（即缺货），避免比较结果被 `NaN` 静默吞掉。
 */
export function resolveQuantityLimit(stock: number): number {
  if (!Number.isFinite(stock) || stock <= 0) {
    return 0
  }
  return Math.min(CART_QUANTITY_LIMIT, Math.floor(stock))
}

function failInvalidQuantity(): CartFailure {
  return { ok: false, reason: 'INVALID_QUANTITY', message: '数量必须是正整数。' }
}

function failInvalidItem(): CartFailure {
  return {
    ok: false,
    reason: 'INVALID_ITEM',
    message: '商品信息无效：金额必须是非负整数分，库存必须是非负整数。',
  }
}

function failOutOfStock(): CartFailure {
  return { ok: false, reason: 'OUT_OF_STOCK', message: '该规格已缺货。' }
}

function failQuantityLimitExceeded(limit: number): CartFailure {
  return {
    ok: false,
    reason: 'QUANTITY_LIMIT_EXCEEDED',
    message: `数量超出上限：单件商品最多可购买 ${limit} 件。`,
    limit,
  }
}

function failNotInCart(): CartFailure {
  return { ok: false, reason: 'NOT_IN_CART', message: '购物车中没有该商品。' }
}

/** 核对期间所有写动作统一拒绝：入口虽然已禁用，store 层仍必须兜住。 */
function failReadonly(): CartFailure {
  return { ok: false, reason: 'READONLY', message: '购物车核对中，请稍候再操作。' }
}

/** 汇总提示最多列出的条目数；超过时折叠为「等 N 个」（N 为条目总数）。 */
const RECOVERY_NOTICE_LIST_LIMIT = 3

/** 把条目描述折成「A、B、C」或「A、B、C 等 5 个」；`folded` 为 false 时完整列出。 */
function formatRecoveryList(entries: readonly string[], folded: boolean): string {
  if (!folded || entries.length <= RECOVERY_NOTICE_LIST_LIMIT) {
    return entries.join('、')
  }
  return `${entries.slice(0, RECOVERY_NOTICE_LIST_LIMIT).join('、')} 等 ${entries.length} 个`
}

/**
 * 单条展示文本：名称 + SKU。同名不同 SKU 是两条独立条目，只写名称无法区分。
 */
function describeRecoveryEntry(name: string, sku: string, detail = ''): string {
  return detail === '' ? `${name}（SKU：${sku}）` : `${name}（SKU：${sku}，${detail}）`
}

/**
 * 复核汇总文案：移除与调整分别计数，只发一条，不逐行弹提示（#23）。
 *
 * 行数用「个商品条目」计，不用「件」——术语里「件数」指数量之和（GLOSSARY）。
 * 移除项列出名称与 SKU，调整项同时给出前后数量，让买家能识别被改动的具体条目。
 * `folded` 为 true 时最多列 3 条，供短提示；false 时是完整清单，供展开查看。
 */
function formatRecoveryNotice(changes: RecoveryChanges, folded: boolean): string {
  const parts: string[] = []
  const { removed, adjusted } = changes

  if (removed.length > 0) {
    const names = formatRecoveryList(
      removed.map(change => describeRecoveryEntry(change.name, change.sku)),
      folded,
    )
    parts.push(`已移除 ${removed.length} 个商品条目：${names}`)
  }
  if (adjusted.length > 0) {
    const details = formatRecoveryList(
      adjusted.map(change =>
        describeRecoveryEntry(change.name, change.sku, `${change.from} → ${change.to}`),
      ),
      folded,
    )
    parts.push(`${adjusted.length} 个商品条目数量已按库存上限调整：${details}`)
  }

  return parts.length === 0 ? '' : `${parts.join('；')}。`
}

/**
 * 内存态购物车。每个 Pinia 实例一份；#23 起由启动恢复从存档回填。
 */
export const useCartStore = defineStore('cart', {
  state: (): CartState => ({
    items: [],
    recovery: 'idle',
    storage: 'unknown',
    recoveryNotice: '',
    recoveryNoticeFull: '',
    recoveryStarted: false,
  }),
  getters: {
    /** 全部条目的数量之和。 */
    totalQuantity: (state): number => state.items.reduce((sum, item) => sum + item.quantity, 0),
    /** 全部条目的金额之和，单位为「分」（D43）。 */
    totalAmountCents: (state): number =>
      state.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0),
    /**
     * 核对期间购物车只读：加购、改量、删除与清空都由入口按此禁用（#23）。
     * 面板（#22）复用同一个标志，不另造状态。
     */
    readonly: (state): boolean => state.recovery === 'checking',
  },
  actions: {
    /**
     * 加入购物车；同 `sku` 合并为一行。
     *
     * 先用「已存在的数量 + 本次数量」验证上限，再决定是否写入：任何一步失败都
     * 保持原状态。合并成功时只累加数量，并把 `stock` 刷新为本次携带的最新快照；
     * 价格与展示字段保持首次加入时的值，价格变化交给购买校验处理（D63）。
     */
    add (input: AddCartItemInput, quantity = 1): CartActionResult {
      if (this.readonly) {
        return failReadonly()
      }
      if (!isPositiveInteger(quantity)) {
        return failInvalidQuantity()
      }

      // 金额 / 库存是条目快照的一部分：非法时不写入（也不做 `Math.floor` 之类的静默修正）。
      if (!isNonNegativeInteger(input.unitPriceCents) || !isNonNegativeInteger(input.stock)) {
        return failInvalidItem()
      }
      const unitPriceCents = Math.trunc(input.unitPriceCents)
      const stock = Math.trunc(input.stock)

      const limit = resolveQuantityLimit(stock)
      if (limit === 0) {
        return failOutOfStock()
      }

      const index = this.items.findIndex(item => item.sku === input.sku)
      const existing = index === -1 ? undefined : this.items[index]
      const nextQuantity = (existing?.quantity ?? 0) + quantity

      if (nextQuantity > limit) {
        return failQuantityLimitExceeded(limit)
      }

      if (existing) {
        this.items[index] = { ...existing, quantity: nextQuantity, stock }
      } else {
        this.items.push({
          sku: input.sku,
          slug: input.slug,
          name: input.name,
          unitPriceCents,
          quantity,
          stock,
        })
      }

      this.persist()
      return { ok: true }
    },

    /**
     * 删除整行。`sku` 不在购物车时返回 `NOT_IN_CART`，状态不变。
     * 数量归零也只能走这里（`updateQuantity` 只接受正整数）。
     */
    remove (sku: string): CartActionResult {
      if (this.readonly) {
        return failReadonly()
      }
      const index = this.items.findIndex(item => item.sku === sku)
      if (index === -1) {
        return failNotInCart()
      }

      this.items.splice(index, 1)
      this.persist()
      return { ok: true }
    },

    /**
     * 把指定行改为新的数量（绝对值，不是增量）。
     *
     * 上限按该行保存的 `stock` 计算；`sku` 不在购物车或数量非法时拒绝，状态不变。
     */
    updateQuantity (sku: string, quantity: number): CartActionResult {
      if (this.readonly) {
        return failReadonly()
      }
      if (!isPositiveInteger(quantity)) {
        return failInvalidQuantity()
      }

      const index = this.items.findIndex(item => item.sku === sku)
      if (index === -1) {
        return failNotInCart()
      }

      const existing = this.items[index]
      const limit = resolveQuantityLimit(existing.stock)

      if (limit === 0) {
        return failOutOfStock()
      }
      if (quantity > limit) {
        return failQuantityLimitExceeded(limit)
      }

      this.items[index] = { ...existing, quantity }
      this.persist()
      return { ok: true }
    },

    /** 清空购物车；空车调用也返回成功。 */
    clear (): CartActionResult {
      if (this.readonly) {
        return failReadonly()
      }
      this.items = []
      this.persist()
      return { ok: true }
    },

    /**
     * 写盘一次（#23）。核对期间不写；存储不可用时静默跳过，保持内存态。
     * 写入失败时保留上一次成功保存的存档，并把存储标记为不可用，只提示一次。
     *
     * `readonly` 守卫是「检查期的统一写盘入口」：动作层已各自拒绝，但
     * `beginRecovery()` + `hydrate()` 之后直接调用公开的 `persist()` 同样会走到
     * 这里，必须在写盘前拦下，否则 `unverified` 时原存档字节会被改动。
     * `completeRecovery` 先置 `verified` 再调 `persist()`，正常提交不受影响。
     */
    persist (): void {
      if (this.readonly) {
        return
      }
      if (this.storage !== 'available') {
        return
      }
      if (!saveCartArchive(this.items)) {
        this.storage = 'unavailable'
      }
    },

    /** 标记本地存储是否可用；读取被拒时由启动编排调用。 */
    setStorageAvailable (available: boolean): void {
      this.storage = available ? 'available' : 'unavailable'
    },

    /**
     * 用存档快照回填（不写盘）：启动时先渲染摘要，再进入核对。
     */
    hydrate (items: readonly CartItem[]): void {
      this.items = items.map(item => ({ ...item }))
    },

    /**
     * 开始启动恢复；整个应用生命周期只允许一次。
     * @returns 是否真正开始（已开始过返回 `false`，调用方不得再发请求）。
     */
    beginRecovery (): boolean {
      if (this.recoveryStarted) {
        return false
      }
      this.recoveryStarted = true
      this.recovery = 'checking'
      return true
    },

    /**
     * 从「未核对」重试：沿用内存里的原存档，不重新读盘。
     * @returns 是否允许重试（非「未核对」状态返回 `false`）。
     */
    beginRetry (): boolean {
      if (this.recovery !== 'unverified') {
        return false
      }
      this.recovery = 'checking'
      return true
    },

    /**
     * 一次性提交复核结果（#23）。
     *
     * `verified` 用复核后的条目整体替换并写盘一次；`unverified` 原样保留存档、
     * 不写盘，只把状态标为「未核对」，由摘要提供重试。
     */
    completeRecovery (result: CartVerificationResult): void {
      if (result.status === 'unverified') {
        this.recovery = 'unverified'
        return
      }

      this.items = result.items.map(item => ({ ...item }))
      this.recovery = 'verified'
      this.recoveryNotice = formatRecoveryNotice(result.changes, true)
      this.recoveryNoticeFull = formatRecoveryNotice(result.changes, false)
      this.persist()
    },
  },
})
