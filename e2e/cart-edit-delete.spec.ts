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

test.describe('修改 / 删除', () => {
  test('面板内改量、删除，摘要与合计、存档同步', async ({ page, request }) => {
    await resetApp(page)
    const product = await fetchProduct(request, 'apple-earpods')
    const variant = pickPurchasableVariant(product, 3)
    await openProduct(page, product.slug)
    await selectVariant(page, variant)
    await addToCartThroughUi(page, 1)
    await openCartPanel(page)

    const row = page.locator('[data-state="cart-panel-row"][data-sku="' + variant.sku + '"]')
    await expect(row).toHaveCount(1)

    await row.locator('[data-state="quantity-input"]').fill('3')
    await expect(row.locator('[data-state="quantity-input"]')).toHaveValue('3')
    await expect(row.locator('[data-state="cart-panel-subtotal"]')).toHaveText('小计 ' + formatCents(variant.priceCents * 3))
    await expect(page.locator('[data-state="cart-panel-total"]')).toHaveText(formatCents(variant.priceCents * 3))
    await expect(summaryFigures(page)).toContainText('3 件')
    await expect(summaryFigures(page)).toContainText(formatCents(variant.priceCents * 3))

    const changed = await readArchive(page)
    expect(changed?.items).toHaveLength(1)
    expect(changed?.items[0]?.quantity).toBe(3)

    await row.locator('[data-state="cart-panel-remove"]').click()
    await expect(page.locator('[data-state="cart-panel-row"]')).toHaveCount(0)
    await expect(page.locator('[data-state="cart-panel-empty"]')).toBeVisible()
    await expect(page.locator('[data-state="cart-panel-count"]')).toHaveText('共 0 件')
    await expect(summaryFigures(page)).toContainText('0 件')
    await expect(summaryFigures(page)).toContainText(formatCents(0))

    const cleared = await readArchive(page)
    expect(cleared?.version).toBe(1)
    expect(cleared?.items).toEqual([])
  })
})
