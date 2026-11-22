/**
 * E2E 共享步骤（E1）：只通过真实 UI 与公开 API 观察行为。
 *
 * 断言与夹具不写死种子价格 / 规格名，统一从 /api/products/{slug} 读取。
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test'

export const CART_STORAGE_KEY = 'shop-frontend:cart:v1'

export interface ProductVariant {
  sku: string
  option1Value: string
  option2Value: string
  priceCents: number
  stock: number
}

export interface ProductDetail {
  slug: string
  name: string
  dimensions: Array<{ name: string, options: string[] }>
  variants: ProductVariant[]
}

export interface ProductListItem {
  slug: string
  displayPriceCents: number
}

export function formatCents (cents: number): string {
  return '¥' + new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export async function resetApp (page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/')
  await expect(page.locator('[data-state="floating-nav"]')).toBeVisible()
  await waitForListSettled(page)
}

export async function waitForListSettled (page: Page): Promise<void> {
  await expect(
    page.locator('[data-state="results"], [data-state="empty"], [data-state="search-unavailable"], [data-state="error"]').first(),
  ).toBeVisible()
}

export async function fetchProduct (request: APIRequestContext, slug: string): Promise<ProductDetail> {
  const response = await request.get('/api/products/' + slug)
  expect(response.ok(), 'GET /api/products/' + slug + ' 应成功，实际 HTTP ' + response.status()).toBeTruthy()
  return (await response.json()) as ProductDetail
}

export async function listProducts (
  request: APIRequestContext,
  query: Record<string, string | number> = {},
): Promise<{ items: ProductListItem[], total: number, totalPages: number }> {
  const response = await request.get('/api/products', { params: query })
  expect(response.ok(), 'GET /api/products 应成功，实际 HTTP ' + response.status()).toBeTruthy()
  return (await response.json()) as { items: ProductListItem[], total: number, totalPages: number }
}

/** 取第一个库存 ≥ minStock 的组合：加购 / 购买 / 改量都按需要的数量取夹具。 */
export function pickPurchasableVariant (product: ProductDetail, minStock = 2): ProductVariant {
  const variant = product.variants.find((item) => item.stock >= minStock)
  if (variant === undefined) {
    throw new Error('商品 ' + product.slug + ' 没有库存 ≥ ' + minStock + ' 的规格组合，无法执行加购 / 购买用例')
  }
  return variant
}

export async function openProduct (page: Page, slug: string): Promise<void> {
  await page.goto('/product/' + slug)
  await expect(page.locator('[data-state="selection"]')).toBeVisible()
  await expect(page.locator('[data-state="price"]')).toBeVisible()
}

export async function selectVariant (
  page: Page,
  variant: { option1Value: string, option2Value: string },
): Promise<void> {
  const dimension = (index: 0 | 1) =>
    page.locator('[data-state="dimension"][data-dimension-index="' + index + '"]')

  await dimension(0).getByRole('button', { name: variant.option1Value, exact: true }).click()
  await expect(page.locator('[data-state="selection"]')).toHaveAttribute('data-option-1', variant.option1Value)
  await dimension(1).getByRole('button', { name: variant.option2Value, exact: true }).click()
  await expect(page.locator('[data-state="selection"]')).toHaveAttribute('data-option-2', variant.option2Value)
  await expect(page.locator('[data-state="selection"]')).toHaveAttribute('data-complete', 'true')
}

export async function setDetailQuantity (page: Page, quantity: number): Promise<void> {
  const input = page.locator('[data-state="purchase"] [data-state="quantity-input"]')
  await input.fill(String(quantity))
  await expect(input).toHaveValue(String(quantity))
}

export async function addToCartThroughUi (page: Page, quantity: number): Promise<void> {
  await setDetailQuantity(page, quantity)
  await page.locator('[data-state="add-to-cart"]').click()
  await expect(page.locator('[data-state="add-success"]')).toBeVisible()
}

export async function openCartPanel (page: Page): Promise<void> {
  await page.locator('#cart-summary-trigger').click()
  await expect(page.locator('[data-state="cart-panel"]')).toBeVisible()
}

export async function closeCartPanel (page: Page): Promise<void> {
  if (await page.locator('[data-state="cart-panel"]').count() === 0) return
  await page.locator('[data-state="cart-panel-close"]').click()
  await expect(page.locator('[data-state="cart-panel"]')).toHaveCount(0)
}

export interface CartArchiveItem {
  sku: string
  quantity: number
  unitPriceCents: number
}

export interface CartArchive {
  version: number
  items: CartArchiveItem[]
}

export async function readArchive (page: Page): Promise<CartArchive | null> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), CART_STORAGE_KEY)
  return raw === null ? null : JSON.parse(raw) as CartArchive
}

/** 等启动恢复结束：先等「核对中」消失，再返回；归档为空时也适用。 */
export async function waitForCartRecovery (page: Page): Promise<void> {
  await expect(page.locator('[data-state="cart-recovery-checking"]')).toHaveCount(0, { timeout: 20_000 })
}

export function summaryFigures (page: Page) {
  return page.locator('#cart-summary-trigger [data-state="cart-summary-figures"]')
}
