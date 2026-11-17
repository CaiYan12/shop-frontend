/**
 * 后端契约的运行时客户端（D65）。
 *
 * 类型全部来自 `schema.d.ts`（由 `tools/openapi` 生成），这里不手写任何
 * 响应字段；契约变化时 `pnpm type-check` 会先红。
 */
import createClient from 'openapi-fetch'
import type { components, operations, paths } from './schema'

/** openapi.json 的 servers[0]；本机开发默认值，可用 VITE_API_BASE_URL 覆盖。 */
const DEFAULT_BASE_URL = 'http://127.0.0.1:3001'

const configuredBaseUrl: unknown = import.meta.env.VITE_API_BASE_URL

export const apiBaseUrl: string =
  typeof configuredBaseUrl === 'string' && configuredBaseUrl.length > 0 ? configuredBaseUrl : DEFAULT_BASE_URL

export const client = createClient<paths>({ baseUrl: apiBaseUrl })

export type ProductListQuery = NonNullable<operations['listProducts']['parameters']['query']>
export type ProductListResponse = components['schemas']['ProductListResponse']
export type ProductListItem = components['schemas']['ProductListItem']
export type PurchaseCheckRequest = operations['checkPurchase']['requestBody']['content']['application/json']
export type PurchaseCheckResponse = components['schemas']['PurchaseCheckResponse']

/** 后端未在 OpenAPI 里声明错误响应体，客户端只能拿到状态码。 */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** GET /api/products —— 商品列表（分页 + 筛选 + 排序）。 */
export async function fetchProductList(query: ProductListQuery): Promise<ProductListResponse> {
  const { data, response } = await client.GET('/api/products', { params: { query } })
  if (!data) {
    throw new ApiError(response.status, `商品列表请求失败：HTTP ${response.status}`)
  }
  return data
}

/** POST /api/purchase-check —— 购买校验（只校验，不写库）。 */
export async function checkPurchase(body: PurchaseCheckRequest): Promise<PurchaseCheckResponse> {
  const { data, response } = await client.POST('/api/purchase-check', { body })
  if (!data) {
    throw new ApiError(response.status, `购买校验请求失败：HTTP ${response.status}`)
  }
  return data
}
