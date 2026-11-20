/**
 * src/utils/cart-feedback.ts
 *
 * 加购失败的行内文案（#21）。
 *
 * store 的失败结果只带原因码与一条通用文案；详情页需要的是「能照着做」的提示：
 * - 累计上限要说明**还可加购几件**：上限减去购物车里该 sku 已有的数量
 *   （含本次输入前的数量，不含本次未写入的部分）；
 * - 组合缺货统一说「该规格已缺货」，商品级售罄由页面上的售罄状态表达。
 *
 * 只做文案映射，不改购物车状态；`inCartQuantity` 由调用方从当前 store 里取。
 */
import type { CartFailure } from '@/stores/cart'

/** 计算累计上限提示所需的上下文。 */
export interface AddFailureContext {
  /** 同一 `sku` 在购物车中已有的数量（不含本次输入）。 */
  readonly inCartQuantity: number
}

/**
 * 把 store 的失败原因翻成行内提示。
 *
 * 只有 `QUANTITY_LIMIT_EXCEEDED` 需要额外算术：`limit` 是单行上限，
 * 减去已在购物车的数量就是本次还能加购的件数；脏数据（负数 / 小数）按 0 兜住，
 * 不显示负数。
 */
export function describeAddFailure(failure: CartFailure, context: AddFailureContext): string {
  switch (failure.reason) {
    case 'QUANTITY_LIMIT_EXCEEDED': {
      const inCart = Number.isFinite(context.inCartQuantity)
        ? Math.max(0, Math.floor(context.inCartQuantity))
        : 0
      const remaining = Math.max(0, failure.limit - inCart)
      return `数量超出上限：还可加购 ${remaining} 件。`
    }
    case 'INVALID_ITEM':
      return '商品信息有误，请刷新页面后重试。'
    case 'OUT_OF_STOCK':
    case 'INVALID_QUANTITY':
    case 'NOT_IN_CART':
      return failure.message
  }
}
