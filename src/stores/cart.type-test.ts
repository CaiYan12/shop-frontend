/**
 * 购物车 store 的类型测试（编译期，无运行时断言）(#6)。
 *
 * 规格要求「类型导出完整，Phase 8 的单测可直接调用」，并且拒绝时必须**返回失败
 * 原因**而不是静默返回 `void`。此文件把这些事实钉在类型上：
 * - 条目字段与顺序无关，但集合恰好是 `sku` / `slug` / `name` / `unitPriceCents` /
 *   `quantity` / `stock` 六个，且都是只读；
 * - 四个动作统一返回 `CartActionResult`，失败分支必有 `reason`，越界分支还带
 *   `limit`；`CartActionResult` 不是 `void`；
 * - 失败原因码只有五支，与运行时构造的失败对象一致；
 * - getters 是 `number`，可直接参与金额汇总。
 *
 * 不覆盖：合并、拒绝、清空等运行时行为——本文件只钉住类型，不验证运行时。
 */
import type {
  AddCartItemInput,
  CartActionResult,
  CartFailure,
  CartFailureReason,
  CartItem,
  CartSuccess,
} from '@/stores/cart'
import { CART_QUANTITY_LIMIT, useCartStore } from '@/stores/cart'

/** 标准「类型相等」判定：双向条件类型，避免 any / never 的误判。 */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

/** 实例化后的 store 类型，模拟 Phase 8 从 `useCartStore()` 拿到的东西。 */
type CartStore = ReturnType<typeof useCartStore>

// —— 条目形状：恰好六个只读字段，`quantity` 由 store 维护 ——
type _CartItem = Expect<
  Equal<
    CartItem,
    {
      readonly sku: string
      readonly slug: string
      readonly name: string
      readonly unitPriceCents: number
      readonly quantity: number
      readonly stock: number
    }
  >
>
type _CartItemFields = Expect<
  Equal<keyof CartItem, 'sku' | 'slug' | 'name' | 'unitPriceCents' | 'quantity' | 'stock'>
>
type _AddInputFields = Expect<
  Equal<keyof AddCartItemInput, 'sku' | 'slug' | 'name' | 'unitPriceCents' | 'stock'>
>
type _AddInputOmitsQuantity = Expect<Equal<'quantity' extends keyof AddCartItemInput ? true : false, false>>

// —— 返回值：成功无载荷，失败必带原因；整体不是 void ——
type _Success = Expect<Equal<CartSuccess, { readonly ok: true }>>
type _ResultIsUnion = Expect<Equal<CartActionResult, CartSuccess | CartFailure>>
type _FailureReason = Expect<Equal<CartFailure['reason'], CartFailureReason>>
type _FailureHasMessage = Expect<Equal<CartFailure['message'], string>>
type _ReasonUnion = Expect<
  Equal<
    CartFailureReason,
    'INVALID_QUANTITY' | 'INVALID_ITEM' | 'OUT_OF_STOCK' | 'QUANTITY_LIMIT_EXCEEDED' | 'NOT_IN_CART'
  >
>
type _LimitOnlyOnOverflow = Expect<
  Equal<Extract<CartFailure, { reason: 'QUANTITY_LIMIT_EXCEEDED' }>['limit'], number>
>
type _NoLimitOnInvalidItem = Expect<
  Equal<'limit' extends keyof Extract<CartFailure, { reason: 'INVALID_ITEM' }> ? true : false, false>
>
type _NoLimitOnInvalid = Expect<
  Equal<'limit' extends keyof Extract<CartFailure, { reason: 'INVALID_QUANTITY' }> ? true : false, false>
>

// —— 四个动作的返回类型：一律 CartActionResult，绝不是 void ——
type _AddReturn = Expect<Equal<ReturnType<CartStore['add']>, CartActionResult>>
type _RemoveReturn = Expect<Equal<ReturnType<CartStore['remove']>, CartActionResult>>
type _UpdateReturn = Expect<Equal<ReturnType<CartStore['updateQuantity']>, CartActionResult>>
type _ClearReturn = Expect<Equal<ReturnType<CartStore['clear']>, CartActionResult>>
type _NotVoid = Expect<Equal<CartActionResult extends void ? true : false, false>>
type _NotUndefined = Expect<Equal<undefined extends CartActionResult ? true : false, false>>

// —— 参数：add 收条目快照 + 可选数量；updateQuantity 收 sku + 绝对数量 ——
type _AddFirst = Expect<Equal<Parameters<CartStore['add']>[0], AddCartItemInput>>
type _AddSecond = Expect<Equal<Parameters<CartStore['add']>[1], number | undefined>>
type _RemoveParameter = Expect<Equal<Parameters<CartStore['remove']>[0], string>>
type _UpdateParameters = Expect<
  Equal<Parameters<CartStore['updateQuantity']>, [sku: string, quantity: number]>
>
type _ClearParameters = Expect<Equal<Parameters<CartStore['clear']>, []>>

// —— getters 与 state：数字汇总、条目数组 ——
type _TotalQuantity = Expect<Equal<CartStore['totalQuantity'], number>>
type _TotalAmountCents = Expect<Equal<CartStore['totalAmountCents'], number>>
type _Items = Expect<Equal<CartStore['items'], CartItem[]>>

// —— 静态上限与后端口径一致 ——
type _Limit = Expect<Equal<typeof CART_QUANTITY_LIMIT, 999>>
