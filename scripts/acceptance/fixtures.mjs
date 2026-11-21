/**
 * 购买用例的运行时夹具（retro P2-9）。
 *
 * 不把种子价格 / SKU / 规格名写死在断言里：从详情接口取第一个库存 ≥ 2 的规格组合，
 * 价格变化用固定相对增量，断言按实际值格式化。
 */
export async function resolvePurchaseFixture (baseUrl) {
  const response = await fetch(baseUrl + '/api/products/apple-earpods', { signal: AbortSignal.timeout(5000) })
  if (!response.ok) {
    throw new Error('解析购买夹具失败：HTTP ' + response.status)
  }
  const data = await response.json()
  const variant = (data.variants ?? []).find((item) => item.stock >= 2)
  if (!variant) {
    throw new Error('解析购买夹具失败：没有库存 ≥ 2 的规格组合')
  }
  return {
    slug: data.slug,
    sku: variant.sku,
    option1Value: variant.option1Value,
    option2Value: variant.option2Value,
    quantity: 2,
    pagePriceCents: variant.priceCents,
    newPriceCents: variant.priceCents + 1000,
    finalPriceCents: variant.priceCents + 1500,
  }
}

const formatter = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 与前端 `formatPriceCents` 同一格式：整数分 → ¥1,299.00。 */
export function formatCents (cents) {
  return '¥' + formatter.format(cents / 100)
}
