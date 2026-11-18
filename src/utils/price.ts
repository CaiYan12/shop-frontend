/**
 * src/utils/price.ts
 *
 * 金额展示的唯一入口（#8）。
 *
 * 契约里的金额一律是整数「分」；商品卡片与后续的命中高亮渲染都只调用这里的
 * 函数，不各自实现格式化，避免同一页出现两种小数位或两种千分位。
 */

/**
 * 固定两位小数、带千分位：`zh-CN` 的分组与规格示例 `¥2,299.00` 一致。
 * 只做展示，不参与四舍五入以外的业务判断。
 */
const priceFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 整数分 → `¥2,299.00`。 */
export function formatPriceCents (cents: number): string {
  return `¥${priceFormatter.format(cents / 100)}`
}

/**
 * 是否显示划线原价（#8）：只有原价**严格高于**展示价才显示。
 *
 * 两者相等（没有折扣）或原价更低（脏数据）都不显示，避免无意义的划线；
 * 用「分」比较，不经过元的小数换算。
 */
export function shouldShowOriginalPrice (displayPriceCents: number, displayOriginalPriceCents: number): boolean {
  return displayOriginalPriceCents > displayPriceCents
}
