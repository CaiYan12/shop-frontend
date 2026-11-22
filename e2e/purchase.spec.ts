import { writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { fetchProduct, formatCents, openProduct, pickPurchasableVariant, resetApp, selectVariant, setDetailQuantity } from './support/app'

test.describe('模拟购买', () => {
  test('正常购买经真实 UI 发出未拦截的 POST /api/purchase-check', async ({ page, request }, testInfo) => {
    await resetApp(page)
    const product = await fetchProduct(request, 'apple-earpods')
    const variant = pickPurchasableVariant(product, 2)
    await openProduct(page, product.slug)
    await selectVariant(page, variant)
    await setDetailQuantity(page, 2)

    // 不注册任何 page.route / CDP Fetch 拦截：请求直达预览服务器的 /api 代理。
    const responsePromise = page.waitForResponse((response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/purchase-check')

    await page.locator('[data-state="buy-now"]').click()
    const response = await responsePromise

    expect(response.status()).toBe(200)
    const sent = response.request().postDataJSON() as {
      slug: string
      sku: string
      quantity: number
      expectedUnitPriceCents: number
    }
    expect(sent).toMatchObject({
      slug: product.slug,
      sku: variant.sku,
      quantity: 2,
      expectedUnitPriceCents: variant.priceCents,
    })

    const payload = await response.json() as {
      result: string
      quantity: number
      unitPriceCents: number
      subtotalCents: number
      priceChanged: boolean
      product: { slug: string }
      variant: { sku: string }
    }
    expect(payload.result).toBe('purchasable')
    expect(payload.product.slug).toBe(product.slug)
    expect(payload.variant.sku).toBe(variant.sku)
    expect(payload.quantity).toBe(2)
    expect(payload.unitPriceCents).toBe(variant.priceCents)
    expect(payload.subtotalCents).toBe(variant.priceCents * 2)
    expect(payload.priceChanged).toBe(false)

    const requestPath = testInfo.outputPath('purchase-check-request.json')
    const responsePath = testInfo.outputPath('purchase-check-response.json')
    writeFileSync(requestPath, JSON.stringify(sent, null, 2) + '\n', 'utf8')
    writeFileSync(responsePath, JSON.stringify(payload, null, 2) + '\n', 'utf8')
    await testInfo.attach('purchase-check-request.json', {
      path: requestPath,
      contentType: 'application/json',
    })
    await testInfo.attach('purchase-check-response.json', {
      path: responsePath,
      contentType: 'application/json',
    })

    const dialog = page.locator('[data-state="purchase-dialog"]')
    await expect(dialog).toHaveAttribute('data-phase', 'purchasable')
    await expect(page.locator('[data-state="purchase-purchasable"]')).toBeVisible()
    await expect(page.locator('[data-state="purchase-purchasable"]')).toContainText('可购买')
    await expect(page.locator('[data-state="purchase-quantity"]')).toHaveText('2 件')
    await expect(page.locator('[data-state="purchase-subtotal"]')).toHaveText(formatCents(variant.priceCents * 2))
    await expect(page.locator('[data-state="purchase-notice"]')).toContainText('不会生成订单')
    await expect(page).toHaveURL(new RegExp('/product/' + product.slug + '$'))
  })
})
