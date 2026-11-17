/**
 * 契约类型测试（编译期，无运行时断言）。
 *
 * 这个文件由 `pnpm type-check`（vue-tsc）编译：任何一条 `Expect<...>` 不成立，
 * 类型检查就会失败。它证明 `schema.d.ts` 与 `openapi-fetch` 消费端的类型
 * 与后端 OpenAPI 契约一致（D65 / V17），而不是「能生成就算数」。
 */
import type { components, operations } from './schema'
import type { checkPurchase, fetchProductList } from './client'
import type { describePurchaseResult } from './purchase-result'

/** 标准「类型相等」判定：双向条件类型，避免 any / never 的误判。 */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

type Schemas = components['schemas']
type ProductListResponse = Schemas['ProductListResponse']
type ProductListItem = Schemas['ProductListItem']
type PurchaseCheckResponse = Schemas['PurchaseCheckResponse']

// —— 分页字段：page / pageSize / total / totalPages / items ——
type _Page = Expect<Equal<ProductListResponse['page'], number>>
type _PageSize = Expect<Equal<ProductListResponse['pageSize'], number>>
type _Total = Expect<Equal<ProductListResponse['total'], number>>
type _TotalPages = Expect<Equal<ProductListResponse['totalPages'], number>>
type _Items = Expect<Equal<ProductListResponse['items'], ProductListItem[]>>

// —— 金额是整数分（number），不是格式化字符串 ——
type _DisplayPrice = Expect<Equal<ProductListItem['displayPriceCents'], number>>
type _DisplayOriginalPrice = Expect<Equal<ProductListItem['displayOriginalPriceCents'], number>>

// —— 购买校验三分支：result 两个取值，blocked 下按 reason 再分两支 ——
type _ResultTags = Expect<Equal<PurchaseCheckResponse['result'], 'purchasable' | 'blocked'>>
type BlockedBranch = Extract<PurchaseCheckResponse, { result: 'blocked' }>
type _ReasonTags = Expect<Equal<BlockedBranch['reason'], 'INSUFFICIENT_STOCK' | 'PRICE_CHANGED'>>
type PriceChangedBranch = Extract<PurchaseCheckResponse, { reason: 'PRICE_CHANGED' }>
type _RequestedPrice = Expect<Equal<PriceChangedBranch['requestedUnitPriceCents'], number>>
type PurchasableBranch = Extract<PurchaseCheckResponse, { result: 'purchasable' }>
type _PurchasablePriceChanged = Expect<Equal<PurchasableBranch['priceChanged'], false>>

// —— 客户端按路径调用，返回类型来自 schema.d.ts ——
type _ListReturn = Expect<Equal<Awaited<ReturnType<typeof fetchProductList>>, ProductListResponse>>
type _PurchaseReturn = Expect<Equal<Awaited<ReturnType<typeof checkPurchase>>, PurchaseCheckResponse>>

type PurchaseBody = operations['checkPurchase']['requestBody']['content']['application/json']
type _PurchaseArg = Expect<Equal<Parameters<typeof checkPurchase>[0], PurchaseBody>>

type ListQuery = NonNullable<operations['listProducts']['parameters']['query']>
type _ListArg = Expect<Equal<Parameters<typeof fetchProductList>[0], ListQuery>>

// —— 穷尽检查的返回类型 ——
type _Summary = Expect<Equal<ReturnType<typeof describePurchaseResult>, string>>

/**
 * 汇总所有断言。本项目未开 `noUnusedLocals`，显式导出是为了让这些别名
 * 在编辑器与检索里可见，而不是被当成死代码。
 */
export type ContractTypeTests =
  | _Page
  | _PageSize
  | _Total
  | _TotalPages
  | _Items
  | _DisplayPrice
  | _DisplayOriginalPrice
  | _ResultTags
  | _ReasonTags
  | _RequestedPrice
  | _PurchasablePriceChanged
  | _ListReturn
  | _PurchaseReturn
  | _PurchaseArg
  | _ListArg
  | _Summary
