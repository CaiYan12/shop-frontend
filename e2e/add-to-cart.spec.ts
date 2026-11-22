import { expect, test } from '@playwright/test'
import {
  addToCartThroughUi,
  fetchProduct,
  formatCents,
  openCartPanel,
  openProduct,
  pickPurchasableVariant,
  readArchive,
  resetApp,
  selectVariant,
  summaryFigures,
} from './support/app'

test.describe('加购', () => {
  test('选规格与数量后加购，摘要、面板与购物车存档一致', async ({ page, request }) => {
    await resetApp(page)
    const product = await fetchProduct(request, 'apple-earpods')
    const variant = pickPurchasableVariant(product)
    await openProduct(page, product.slug)
    await selectVariant(page, variant)

    await addToCartThroughUi(page, 2)

    const subtotal = formatCents(variant.priceCents * 2)
    await expect(summaryFigures(page)).toContainText('2 件')
    await expect(summaryFigures(page)).toContainText(subtotal)

    await openCartPanel(page)
    const row = page.locator('[data-state="cart-panel-row"][data-sku="' + variant.sku + '"]')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText(product.name)
    await expect(row.locator('[data-state="cart-panel-subtotal"]')).toHaveText('小计 ' + subtotal)
    await expect(row.locator('[data-state="quantity-input"]')).toHaveValue('2')

    const archive = await readArchive(page)
    expect(archive).not.toBeNull()
    expect(archive?.version).toBe(1)
    expect(archive?.items).toEqual([{
      sku: variant.sku,
      slug: product.slug,
      name: product.name,
      unitPriceCents: variant.priceCents,
      quantity: 2,
      stock: variant.stock,
    }])
  })
})
