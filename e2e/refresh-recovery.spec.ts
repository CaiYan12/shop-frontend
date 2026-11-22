import { expect, test } from '@playwright/test'
import { CART_STORAGE_KEY, addToCartThroughUi, fetchProduct, formatCents, openCartPanel, openProduct, pickPurchasableVariant, resetApp, selectVariant, summaryFigures, waitForCartRecovery } from './support/app'

test.describe('刷新恢复', () => {
  test('刷新后从购物车存档恢复，并完成恢复复核', async ({ page, request }) => {
    await resetApp(page)
    const product = await fetchProduct(request, 'apple-earpods')
    const variant = pickPurchasableVariant(product, 2)
    await openProduct(page, product.slug)
    await selectVariant(page, variant)
    await addToCartThroughUi(page, 2)

    const beforeRaw = await page.evaluate((key) => localStorage.getItem(key), CART_STORAGE_KEY)
    expect(beforeRaw).not.toBeNull()

    const recoveryResponse = page.waitForResponse(
      (response) => response.request().method() === 'GET' &&
        new URL(response.url()).pathname === '/api/products/' + product.slug,
    )
    await page.reload()
    await recoveryResponse
    await waitForCartRecovery(page)

    await expect(summaryFigures(page)).toContainText('2 件')
    await expect(summaryFigures(page)).toContainText(formatCents(variant.priceCents * 2))
    await expect(page.locator('[data-state="cart-recovery-notice"]')).toHaveCount(0)
    await expect(page.locator('[data-state="cart-recovery-unverified"]')).toHaveCount(0)

    const afterRaw = await page.evaluate((key) => localStorage.getItem(key), CART_STORAGE_KEY)
    expect(afterRaw).toBe(beforeRaw)

    await openCartPanel(page)
    const row = page.locator('[data-state="cart-panel-row"][data-sku="' + variant.sku + '"]')
    await expect(row).toHaveCount(1)
    await expect(row.locator('[data-state="quantity-input"]')).toHaveValue('2')
    await expect(row.locator('[data-state="cart-panel-subtotal"]')).toHaveText('小计 ' + formatCents(variant.priceCents * 2))
  })
})
