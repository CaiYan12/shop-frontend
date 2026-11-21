/**
 * 选择态纯逻辑的类型测试（编译期，无运行时断言）(#19)。
 *
 * 规格要求把选择态做成「可被后续票（#21 数量与加购）复用的清晰结构」。此文件把
 * 可复用部分钉在类型上：
 * - 选择态是二元组，每格为选项值或 `null`，位置与 `dimensions` 一致；
 * - 推导结果的 `variant` 就是契约里的规格组合（含 `sku` / 价格 / 库存），#21 可直接用；
 * - 展示口径字段固定为十个，库存只有「商品级合计 / 所选组合」两种口径；
 * - 商品契约 `ProductDetailResponse` 能直接作为推导输入；
 * - 可售性查询的入参与出参形状固定。
 *
 * 不覆盖：置灰、联动、价格与库存切换等运行时行为——纯逻辑的运行时检查另行执行。
 */
import type { components } from '@/api/schema'
import {
  createEmptySelection,
  resolveOptionAvailability,
  resolveProductSelection,
  toggleSelection,
} from '@/utils/product-selection'
import type {
  OptionAvailability,
  ProductSelection,
  ProductSelectionSource,
  ProductSelectionView,
} from '@/utils/product-selection'

type ProductDetail = components['schemas']['ProductDetailResponse']
type ProductVariant = components['schemas']['ProductVariant']

/** 标准「类型相等」判定：双向条件类型，避免 any / never 的误判。 */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

// —— 选择态：两个维度、每格 string | null ——
export type _Selection = Expect<Equal<ProductSelection, readonly [string | null, string | null]>>
export type _EmptySelection = Expect<Equal<ReturnType<typeof createEmptySelection>, ProductSelection>>
export type _ToggleParameters = Expect<
  Equal<
    Parameters<typeof toggleSelection>,
    [selection: ProductSelection, dimensionIndex: 0 | 1, optionValue: string]
  >
>
export type _ToggleReturn = Expect<Equal<ReturnType<typeof toggleSelection>, ProductSelection>>

// —— 可售性：每个选项一个布尔，另带「是否有不可售选项」的聚合标记 ——
export type _AvailabilityFields = Expect<Equal<keyof OptionAvailability, 'byOption' | 'hasUnavailable'>>
export type _AvailabilityByOption = Expect<
  Equal<OptionAvailability['byOption'], Readonly<Record<string, boolean>>>
>
export type _AvailabilityFlag = Expect<Equal<OptionAvailability['hasUnavailable'], boolean>>
export type _AvailabilityParameters = Expect<
  Equal<
    Parameters<typeof resolveOptionAvailability>,
    [
      dimensionIndex: 0 | 1,
      options: readonly string[],
      selection: ProductSelection,
      variants: readonly ProductVariant[],
    ]
  >
>

// —— 推导结果：十项展示口径，#21 需要的组合对象就是 `variant` ——
export type _ViewFields = Expect<
  Equal<
    keyof ProductSelectionView,
    | 'complete'
    | 'variant'
    | 'priceCents'
    | 'originalPriceCents'
    | 'showFromLabel'
    | 'soldOut'
    | 'stock'
    | 'stockScope'
    | 'variantOutOfStock'
    | 'unselectable'
  >
>
export type _ViewVariant = Expect<Equal<ProductSelectionView['variant'], ProductVariant | null>>
export type _ViewNumbers = Expect<
  Equal<
    Pick<ProductSelectionView, 'priceCents' | 'originalPriceCents' | 'stock'>,
    {
      readonly priceCents: number
      readonly originalPriceCents: number
      readonly stock: number
    }
  >
>
export type _ViewScope = Expect<Equal<ProductSelectionView['stockScope'], 'product' | 'variant'>>
export type _ViewFlags = Expect<
  Equal<
    {
      [K in 'complete' | 'showFromLabel' | 'soldOut' | 'variantOutOfStock' | 'unselectable']: ProductSelectionView[K]
    },
    Record<
      'complete' | 'showFromLabel' | 'soldOut' | 'variantOutOfStock' | 'unselectable',
      boolean
    >
  >
>
export type _VariantSku = Expect<Equal<Extract<ProductSelectionView['variant'], { sku: string }>['sku'], string>>

// —— 推导输入：详情契约可直接作为输入，字段恰好五个 ——
export type _DetailIsSource = Expect<Equal<ProductDetail extends ProductSelectionSource ? true : false, true>>
export type _SourceFields = Expect<
  Equal<
    keyof ProductSelectionSource,
    'displayPriceCents' | 'displayOriginalPriceCents' | 'soldOut' | 'stock' | 'variants'
  >
>
export type _SourceParameters = Expect<
  Equal<
    Parameters<typeof resolveProductSelection>,
    [source: ProductSelectionSource, selection: ProductSelection]
  >
>
