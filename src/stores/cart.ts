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
 * - 数量归零不通过 `updateQuantity`，调用方应改用 `remove`（与 `updateQuantity` 只收正整数一致）。
 */
import { defineStore } from 'pinia'

/** 单个商品的数量静态上限；与后端 D68 的 `quantity` 1..999 一致。 */
export const CART_QUANTITY_LIMIT = 999

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
  | 'OUT_OF_STOCK'
  | 'QUANTITY_LIMIT_EXCEEDED'
  | 'NOT_IN_CART'

/** 成功结果；动作成功后调用方直接读 store 的最新状态。 */
export interface CartSuccess {
  readonly ok: true
}

/** 失败结果；`limit` 只在越界时出现，供 UI 提示「最多可买 N 件」。 */
export type CartFailure =
  | { readonly ok: false, readonly reason: 'INVALID_QUANTITY', readonly message: string }
  | { readonly ok: false, readonly reason: 'OUT_OF_STOCK', readonly message: string }
  | { readonly ok: false, readonly reason: 'QUANTITY_LIMIT_EXCEEDED', readonly message: string, readonly limit: number }
  | { readonly ok: false, readonly reason: 'NOT_IN_CART', readonly message: string }

/** 四个动作统一的返回联合：成功无载荷，失败必带原因。 */
export type CartActionResult = CartSuccess | CartFailure

/** 购物车 state；`items` 按首次加入的顺序保存。 */
export interface CartState {
  items: CartItem[]
}

/** 正整数判定：`0`、负数、小数、`NaN`、`Infinity` 全部拒绝（D68）。 */
function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

/**
 * 单行上限 = `min(999, stock)`。
 *
 * 库存按契约是非负整数（D44）；这里用 `Math.floor` 兜住脏数据，`NaN` / 负数 /
 * 非有限值统一按 0 处理（即缺货），避免比较结果被 `NaN` 静默吞掉。
 */
function resolveQuantityLimit(stock: number): number {
  if (!Number.isFinite(stock) || stock <= 0) {
    return 0
  }
  return Math.min(CART_QUANTITY_LIMIT, Math.floor(stock))
}

function failInvalidQuantity(): CartFailure {
  return { ok: false, reason: 'INVALID_QUANTITY', message: '数量必须是正整数。' }
}

function failOutOfStock(): CartFailure {
  return { ok: false, reason: 'OUT_OF_STOCK', message: '该商品已售罄，无法加入购物车。' }
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

/**
 * 内存态购物车。每个 Pinia 实例一份，刷新页面不会恢复（本期明确不持久化）。
 */
export const useCartStore = defineStore('cart', {
  state: (): CartState => ({
    items: [],
  }),
  getters: {
    /** 全部条目的数量之和。 */
    totalQuantity: (state): number => state.items.reduce((sum, item) => sum + item.quantity, 0),
    /** 全部条目的金额之和，单位为「分」（D43）。 */
    totalAmountCents: (state): number =>
      state.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0),
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
      if (!isPositiveInteger(quantity)) {
        return failInvalidQuantity()
      }

      const limit = resolveQuantityLimit(input.stock)
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
        this.items[index] = { ...existing, quantity: nextQuantity, stock: input.stock }
      } else {
        this.items.push({
          sku: input.sku,
          slug: input.slug,
          name: input.name,
          unitPriceCents: input.unitPriceCents,
          quantity,
          stock: input.stock,
        })
      }

      return { ok: true }
    },

    /**
     * 删除整行。`sku` 不在购物车时返回 `NOT_IN_CART`，状态不变。
     * 数量归零也只能走这里（`updateQuantity` 只接受正整数）。
     */
    remove (sku: string): CartActionResult {
      const index = this.items.findIndex(item => item.sku === sku)
      if (index === -1) {
        return failNotInCart()
      }

      this.items.splice(index, 1)
      return { ok: true }
    },

    /**
     * 把指定行改为新的数量（绝对值，不是增量）。
     *
     * 上限按该行保存的 `stock` 计算；`sku` 不在购物车或数量非法时拒绝，状态不变。
     */
    updateQuantity (sku: string, quantity: number): CartActionResult {
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
      return { ok: true }
    },

    /** 清空购物车；空车调用也返回成功。 */
    clear (): CartActionResult {
      this.items = []
      return { ok: true }
    },
  },
})
