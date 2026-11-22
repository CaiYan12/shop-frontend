import { describe, expect, it } from 'vitest'
import type { components } from '@/api/schema'
import {
  createEmptySelection,
  resolveOptionAvailability,
  resolveProductSelection,
  toggleSelection,
} from '@/utils/product-selection'

type ProductVariant = components['schemas']['ProductVariant']

const variant = (over: Partial<ProductVariant>): ProductVariant => ({
  sku: 's1',
  option1Value: '黑',
  option2Value: '标准版',
  priceCents: 1000,
  originalPriceCents: 1200,
  stock: 5,
  ...over,
})

const source = (over: Partial<Parameters<typeof resolveProductSelection>[0]> = {}) => ({
  displayPriceCents: 999,
  displayOriginalPriceCents: 1299,
  soldOut: false,
  stock: 7,
  variants: [
    variant({}),
    variant({ sku: 's2', option1Value: '白', option2Value: '标准版' }),
    variant({ sku: 's3', option1Value: '黑', option2Value: '降噪版', priceCents: 1500 }),
  ],
  ...over,
})

// 规格纯逻辑的验收口径（spec U1）：两个维度各自的选择、可售性与展示口径。
describe('选择态切换', () => {
  it('空选择态是两个维度都未选', () => {
    expect(createEmptySelection()).toEqual([null, null])
  })

  it('点选同维度其他项换值、再点已选项取消，另一维度保持不变', () => {
    expect(toggleSelection(['黑', '标准版'], 0, '白')).toEqual(['白', '标准版'])
    expect(toggleSelection(['黑', '标准版'], 0, '黑')).toEqual([null, '标准版'])
    expect(toggleSelection(['黑', null], 1, '降噪版')).toEqual(['黑', '降噪版'])
  })
})

describe('resolveOptionAvailability', () => {
  it('另一维度未选时，任一组合里出现过的选项都可选', () => {
    const result = resolveOptionAvailability(0, ['黑', '白', '蓝'], [null, null], source().variants)
    expect(result).toEqual({ byOption: { 黑: true, 白: true, 蓝: false }, hasUnavailable: true })
  })

  it('另一维度已选时只按对应组合过滤，并标出全部不可售的情况', () => {
    const result = resolveOptionAvailability(0, ['黑', '白'], [null, '降噪版'], source().variants)
    expect(result).toEqual({ byOption: { 黑: true, 白: false }, hasUnavailable: true })

    const none = resolveOptionAvailability(1, ['标准版'], ['蓝', null], source().variants)
    expect(none).toEqual({ byOption: { 标准版: false }, hasUnavailable: true })
  })
})

describe('resolveProductSelection', () => {
  it('未选齐时用商品级价格、库存合计与「起」标记', () => {
    expect(resolveProductSelection(source(), [null, null])).toEqual({
      complete: false,
      variant: null,
      priceCents: 999,
      originalPriceCents: 1299,
      showFromLabel: true,
      soldOut: false,
      stock: 7,
      stockScope: 'product',
      variantOutOfStock: false,
      unselectable: false,
    })
  })

  it('选齐且组合存在时换成组合价格与库存口径', () => {
    const result = resolveProductSelection(source(), ['黑', '降噪版'])
    expect(result).toMatchObject({
      complete: true,
      variant: source().variants[2],
      priceCents: 1500,
      originalPriceCents: 1200,
      showFromLabel: false,
      stock: 5,
      stockScope: 'variant',
      variantOutOfStock: false,
      unselectable: false,
    })
  })

  it('所选组合库存为 0 时保留组合并标记缺货', () => {
    const result = resolveProductSelection(
      source({ variants: [variant({ stock: 0 })] }),
      ['黑', '标准版'],
    )
    expect(result).toMatchObject({
      complete: true,
      stock: 0,
      stockScope: 'variant',
      variantOutOfStock: true,
      unselectable: false,
    })
    expect(result.variant?.sku).toBe('s1')
  })

  it('选齐但没有对应组合时回退商品字段并标记不可售', () => {
    expect(resolveProductSelection(source(), ['白', '降噪版'])).toMatchObject({
      complete: true,
      variant: null,
      priceCents: 999,
      showFromLabel: false,
      stockScope: 'product',
      unselectable: true,
    })
  })

  it('商品售罄时未选齐也不显示「起」', () => {
    expect(resolveProductSelection(source({ soldOut: true }), [null, null])).toMatchObject({
      soldOut: true,
      showFromLabel: false,
    })
  })
})
