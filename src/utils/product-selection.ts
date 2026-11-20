/**
 * src/utils/product-selection.ts
 *
 * 详情页选择态的纯逻辑（#19）。
 *
 * 选择态只存在于详情页内存中，不写入地址栏；这里不关心 DOM，只回答三件事：
 * - 某个维度里哪些选项还有有效规格组合（另一个维度已选时按已选值过滤）；
 * - 当前选中的规格组合是哪一个；
 * - 由选择态推出的展示价、原价、库存口径与「起」/「售罄」/「缺货」标记。
 *
 * 术语沿用 `GLOSSARY.md`：展示价、原价、规格组合、商品级库存、缺货、售罄、
 * 不可售组合、选择态。金额一律是契约里的整数「分」，格式化交给 `@/utils/price`。
 *
 * #21 复用点：`ProductSelection` 是选择态本身，`resolveProductSelection` 的
 * `variant` 就是加购需要的规格组合对象（含 sku / 单价 / 库存）。
 */
import type { components } from '@/api/schema'

type ProductVariant = components['schemas']['ProductVariant']

/** 一个维度选中的选项值；`null` 表示该维度未选。 */
export type SelectedOptionValue = string | null

/** 选择态：两个规格维度各自选中的选项值，顺序与 `ProductDetailResponse.dimensions` 一致。 */
export type ProductSelection = readonly [SelectedOptionValue, SelectedOptionValue]

/** 一个维度内各规格选项的可售性。 */
export interface OptionAvailability {
  /** 选项值 → 是否还有有效规格组合；不可售组合不算。 */
  readonly byOption: Readonly<Record<string, boolean>>
  /** 是否有至少一个选项不可售，用于渲染不可售说明。 */
  readonly hasUnavailable: boolean
}

/** 推导选择态所需的商品字段；`ProductDetailResponse` 可直接结构适配。 */
export interface ProductSelectionSource {
  readonly displayPriceCents: number
  readonly displayOriginalPriceCents: number
  readonly soldOut: boolean
  readonly stock: number
  readonly variants: readonly ProductVariant[]
}

/** 选择态推导出的展示口径。 */
export interface ProductSelectionView {
  /** 两个维度是否都选了；选齐后仍可能是不可售组合（防御性标记）。 */
  readonly complete: boolean
  /** 所选规格组合；未选齐或组合不存在时为 `null`。 */
  readonly variant: ProductVariant | null
  /** 展示价（分）：未选齐取商品展示价，选齐取所选组合价。 */
  readonly priceCents: number
  /** 原价（分）：与展示价同口径。 */
  readonly originalPriceCents: number
  /** 是否渲染「起」：未选齐且商品未售罄。 */
  readonly showFromLabel: boolean
  /** 商品售罄（全部有效规格组合缺货）：售罄时价格不带「起」。 */
  readonly soldOut: boolean
  /** 库存：未选齐为商品级库存合计，选齐为所选组合库存。 */
  readonly stock: number
  /** 库存口径：`product` = 商品级合计；`variant` = 所选组合。 */
  readonly stockScope: 'product' | 'variant'
  /** 所选组合存在但库存为 0（缺货）。 */
  readonly variantOutOfStock: boolean
  /** 两维选齐但没有对应规格组合（不可售组合）。 */
  readonly unselectable: boolean
}

/** 空选择态：两个维度都未选。 */
export function createEmptySelection(): ProductSelection {
  return [null, null]
}

/**
 * 点选一个规格选项：同一维度再点已选项表示取消，点其它项表示换值；
 * 另一个维度保持不变。选项是否可售由调用方按 `resolveOptionAvailability` 过滤。
 */
export function toggleSelection(
  selection: ProductSelection,
  dimensionIndex: 0 | 1,
  optionValue: string,
): ProductSelection {
  const next: [SelectedOptionValue, SelectedOptionValue] = [selection[0], selection[1]]
  next[dimensionIndex] = next[dimensionIndex] === optionValue ? null : optionValue
  return next
}

/**
 * 计算一个维度内各选项的可售性（两维对称）：
 * 以「另一个维度当前已选值」为条件，看是否存在对应规格组合。
 * 另一个维度未选时，只要该选项在任一组合里出现就算可选。
 */
export function resolveOptionAvailability(
  dimensionIndex: 0 | 1,
  options: readonly string[],
  selection: ProductSelection,
  variants: readonly ProductVariant[],
): OptionAvailability {
  const otherIndex = dimensionIndex === 0 ? 1 : 0
  const otherSelected = selection[otherIndex]

  const byOption: Record<string, boolean> = {}
  let hasUnavailable = false

  for (const option of options) {
    const available = variants.some(
      (variant) =>
        valueOf(variant, dimensionIndex) === option &&
        (otherSelected === null || valueOf(variant, otherIndex) === otherSelected),
    )
    byOption[option] = available
    hasUnavailable = hasUnavailable || !available
  }

  return { byOption, hasUnavailable }
}

/**
 * 由商品字段与选择态推出展示口径。
 *
 * 未选齐：展示价 / 原价取商品字段，库存取商品级合计，未售罄时标「起」；
 * 选齐：换成所选组合自己的价、原价与库存，缺货组合照常返回（只由 `variantOutOfStock`
 * 表达不可加购，回退到商品字段仅用于不可售组合的防御分支）。
 */
export function resolveProductSelection(
  source: ProductSelectionSource,
  selection: ProductSelection,
): ProductSelectionView {
  const [option1, option2] = selection
  const complete = option1 !== null && option2 !== null
  const variant = complete ? findVariant(source.variants, option1, option2) : null

  if (variant !== null) {
    return {
      complete: true,
      variant,
      priceCents: variant.priceCents,
      originalPriceCents: variant.originalPriceCents,
      showFromLabel: false,
      soldOut: source.soldOut,
      stock: variant.stock,
      stockScope: 'variant',
      variantOutOfStock: variant.stock <= 0,
      unselectable: false,
    }
  }

  return {
    complete,
    variant: null,
    priceCents: source.displayPriceCents,
    originalPriceCents: source.displayOriginalPriceCents,
    showFromLabel: !complete && !source.soldOut,
    soldOut: source.soldOut,
    stock: source.stock,
    stockScope: 'product',
    variantOutOfStock: false,
    unselectable: complete,
  }
}

/** 取组合在指定维度上的选项值；维度顺序与 `dimensions` 一致。 */
function valueOf(variant: ProductVariant, dimensionIndex: 0 | 1): string {
  return dimensionIndex === 0 ? variant.option1Value : variant.option2Value
}

/** 按两个维度的已选值找规格组合；未选齐时返回 `null`。 */
function findVariant(
  variants: readonly ProductVariant[],
  option1: string,
  option2: string,
): ProductVariant | null {
  return (
    variants.find(
      (variant) => variant.option1Value === option1 && variant.option2Value === option2,
    ) ?? null
  )
}
