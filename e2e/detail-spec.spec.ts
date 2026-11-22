import { expect, test } from '@playwright/test'
import { fetchProduct, formatCents, openProduct, pickPurchasableVariant, resetApp, selectVariant } from './support/app'

test.describe('详情规格', () => {
  test('规格名称与选项来自契约，选齐后价格、库存与 SKU 联动', async ({ page, request }) => {
    await resetApp(page)
    const product = await fetchProduct(request, 'apple-earpods')
    const variant = pickPurchasableVariant(product)
    await openProduct(page, product.slug)

    await expect(page.locator('h1')).toHaveText(product.name)

    const dimensions = page.locator('[data-state="dimension"]')
    await expect(dimensions).toHaveCount(product.dimensions.length)
    expect(await dimensions.evaluateAll(nodes => nodes.map(node => ({
      index: node.getAttribute('data-dimension-index'),
      name: node.getAttribute('data-dimension-name'),
    })))).toEqual(product.dimensions.map((dimension, index) => ({
      index: String(index),
      name: dimension.name,
    })))

    for (const [index, dimension] of product.dimensions.entries()) {
      const labels = await page
        .locator('[data-state="dimension"][data-dimension-index="' + index + '"] [data-state="option"]')
        .evaluateAll(nodes => nodes.map(node => node.textContent?.trim() ?? ''))
      expect(labels).toEqual(dimension.options)
    }

    const price = page.locator('[data-state="price"]')
    const selection = page.locator('[data-state="selection"]')
    await expect(price).toHaveAttribute('data-price-scope', 'product')
    await expect(price).toHaveAttribute('data-show-from', 'true')
    await expect(selection).toHaveAttribute('data-complete', 'false')

    await selectVariant(page, variant)

    await expect(selection).toHaveAttribute('data-variant-sku', variant.sku)
    await expect(price).toHaveAttribute('data-price-scope', 'variant')
    await expect(price).toHaveAttribute('data-show-from', 'false')
    await expect(price.locator('span').first()).toHaveText(formatCents(variant.priceCents))
    await expect(page.locator('[data-state="stock"]')).toContainText('库存 ' + variant.stock + ' 件')
  })
})
