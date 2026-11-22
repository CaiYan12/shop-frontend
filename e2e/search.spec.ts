import { expect, test } from '@playwright/test'
import { resetApp } from './support/app'

test.describe('搜索', () => {
  test('联想直达详情，提交关键词后列表与 API 一致', async ({ page, request }) => {
    await resetApp(page)

    const combobox = page.locator('#product-search')
    const listbox = page.locator('[role="listbox"]')
    const options = listbox.locator('[role="option"]')

    await combobox.fill('sony')
    await expect(listbox).toBeVisible()
    await expect(options.first()).toBeVisible()
    expect(await options.count()).toBeGreaterThan(0)
    expect((await options.first().innerText()).toLowerCase()).toContain('sony')

    await options.first().click()
    await expect(page).toHaveURL(/\/product\/sony-[a-z0-9-]+$/)
    await expect(page.locator('h1')).toBeVisible()

    await page.goto('/')
    await expect(page.locator('#product-search')).toBeVisible()
    await page.locator('#product-search').fill('sony')
    await page.locator('#product-search').press('Enter')

    await expect(page).toHaveURL(/keyword=sony/)
    await expect(page.locator('[data-state="results"]')).toBeVisible()

    const response = await request.get('/api/products', { params: { keyword: 'sony', pageSize: 8 } })
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    expect(body.items.length).toBeGreaterThan(0)

    const cardLinks = page.locator('[data-state="results"] a[href^="/product/"]')
    await expect(cardLinks).toHaveCount(body.items.length)
    const slugs = await cardLinks.evaluateAll(nodes => nodes.map(node => node.getAttribute('href')?.replace('/product/', '') ?? ''))
    expect(slugs).toEqual(body.items.map((item: { slug: string }) => item.slug))

    await expect(page.getByText(`共 ${body.total} 件 / ${body.totalPages} 页`)).toBeVisible()
    await expect(page.locator('[data-state="results"] em').first()).toBeVisible()
  })
})
