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

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL

export const apiBaseUrl: string =
  typeof configuredBaseUrl === 'string' && configuredBaseUrl.length > 0 ? configuredBaseUrl : DEFAULT_BASE_URL

const client = createClient<paths>({ baseUrl: apiBaseUrl })

type ProductListQuery = NonNullable<operations['listProducts']['parameters']['query']>
type ProductListResponse = components['schemas']['ProductListResponse']
type PurchaseCheckRequest = operations['checkPurchase']['requestBody']['content']['application/json']
type PurchaseCheckResponse = components['schemas']['PurchaseCheckResponse']

/** 后端错误信封：`{ error: { code, message, details? } }`（七码枚举）。 */
type ApiErrorResponse = components['schemas']['ErrorResponse']

/** openapi-fetch 的返回形状：成功取 `data`，失败取 `error`（错误信封）。 */
type ApiResult<T> = {
  data?: T
  error?: ApiErrorResponse
  response: Response
}

export class ApiError extends Error {
  readonly status: number
  readonly error: ApiErrorResponse | undefined

  constructor(status: number, message: string, error?: ApiErrorResponse) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.error = error
  }
}

/** 两个端点共用的「解包 + 判空 + 抛错」，避免重复实现。 */
function unwrap<T>(result: ApiResult<T>, label: string): T {
  if (result.data) {
    return result.data
  }
  const detail = result.error?.error
  const reason = detail?.message
    ? `${detail.message}（HTTP ${result.response.status}）`
    : `HTTP ${result.response.status}`
  throw new ApiError(result.response.status, `${label}请求失败：${reason}`, result.error)
}

/** GET /api/products —— 商品列表（分页 + 筛选 + 排序）。 */
export async function fetchProductList(query: ProductListQuery): Promise<ProductListResponse> {
  return unwrap(await client.GET('/api/products', { params: { query } }), '商品列表')
}

/** POST /api/purchase-check —— 购买校验（只校验，不写库）。 */
export async function checkPurchase(body: PurchaseCheckRequest): Promise<PurchaseCheckResponse> {
  return unwrap(await client.POST('/api/purchase-check', { body }), '购买校验')
}
