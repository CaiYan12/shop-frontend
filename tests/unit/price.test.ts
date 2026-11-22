import { describe, expect, it } from 'vitest'
import { formatPriceCents, shouldShowOriginalPrice } from '@/utils/price'

// 金额纯逻辑的验收口径（spec U1）：契约金额是整数分，展示统一走一个格式化入口。
describe('formatPriceCents', () => {
  it('整数分格式化为两位小数、千分位与人民币符号', () => {
    expect(formatPriceCents(229900)).toBe('¥2,299.00')
    expect(formatPriceCents(123456789)).toBe('¥1,234,567.89')
  })

  it('0 分与不足 1 元时补齐两位小数', () => {
    expect(formatPriceCents(0)).toBe('¥0.00')
    expect(formatPriceCents(5)).toBe('¥0.05')
    expect(formatPriceCents(99)).toBe('¥0.99')
  })
})

describe('shouldShowOriginalPrice', () => {
  it('只有原价严格高于展示价才显示划线原价', () => {
    expect(shouldShowOriginalPrice(1200, 1201)).toBe(true)
    expect(shouldShowOriginalPrice(1200, 1200)).toBe(false)
    expect(shouldShowOriginalPrice(1200, 1199)).toBe(false)
    expect(shouldShowOriginalPrice(0, 1)).toBe(true)
  })
})
