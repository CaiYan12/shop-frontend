/**
 * 购买校验结果的穷尽检查（D65 / V17）。
 *
 * 契约里 `PurchaseCheckResponse` 是三分支联合：
 *   - purchasable
 *   - blocked + INSUFFICIENT_STOCK
 *   - blocked + PRICE_CHANGED
 * 任何分支漏写都会让 `assertNever` 收到非 `never` 实参，`pnpm type-check` 失败。
 * 这里不依赖全局 `noImplicitReturns`。
 */
import type { components } from './schema'

type PurchaseCheckResponse = components['schemas']['PurchaseCheckResponse']

/** 编译期兜底：联合类型里出现未处理的分支时，这里会变成类型错误。 */
export function assertNever(value: never): never {
  throw new Error(`未处理的购买校验结果：${JSON.stringify(value)}`)
}

/** 把购买校验结果翻译成可直接展示的中文说明。 */
export function describePurchaseResult(result: PurchaseCheckResponse): string {
  switch (result.result) {
    case 'purchasable':
      return `可购买：${result.quantity} 件，小计 ${result.subtotalCents} 分`
    case 'blocked':
      switch (result.reason) {
        case 'INSUFFICIENT_STOCK':
          return `库存不足：仅剩 ${result.stock} 件`
        case 'PRICE_CHANGED':
          return `价格已变化：当前 ${result.unitPriceCents} 分，请求 ${result.requestedUnitPriceCents} 分`
        default:
          return assertNever(result)
      }
    default:
      return assertNever(result)
  }
}
