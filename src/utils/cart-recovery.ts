/**
 * src/utils/cart-recovery.ts
 *
 * 恢复复核的行级规则（#23）。纯逻辑：不碰 Pinia、不直接请求接口。
 *
 * 调用方按商品去重后并发请求详情，把「查到的商品快照或 `null`（不存在）」交给
 * 这里逐行核对。规则（spec「持久化与恢复复核」）：
 * - 商品不存在、规格组合不存在、组合缺货 → 移除该行；
 * - 数量超过最新「数量上限」→ 调整到上限，并计入「调整」数；
 * - 单价保留存档快照，不提示价差；库存快照刷新为最新值，供后续改量使用；
 * - 任一次请求失败由调用方在这一步之前拦下；这里只处理已拿到的快照。
 */
import type { components } from '@/api/schema'
import { CART_QUANTITY_LIMIT, type CartItem } from '../stores/cart.ts'

/** 详情接口的返回快照；只依赖 `variants`，其余字段由调用方的契约保证。 */
export type ProductDetailSnapshot = components['schemas']['ProductDetailResponse']

/** 按 `slug` 查详情；返回 `null` 表示商品不存在（404）。 */
export type ProductLookup = (slug: string) => Promise<ProductDetailSnapshot | null>

/** 汇总提示里的两个计数，分别对应「移除」与「调整」。 */
export interface RecoveryChanges {
  readonly removed: number
  readonly adjusted: number
}

/** 复核结果：成功给出一次性提交的条目与变更计数；失败表示整份存档原样保留。 */
export type CartVerificationResult =
  | { readonly status: 'verified', readonly items: CartItem[], readonly changes: RecoveryChanges }
  | { readonly status: 'unverified' }

/** 组合库存转数量上限：`min(999, 组合库存)`，脏数据按 0（缺货）兜住。 */
function resolveQuantityLimit(stock: number): number {
  if (!Number.isFinite(stock) || stock <= 0) {
    return 0
  }
  return Math.min(CART_QUANTITY_LIMIT, Math.floor(stock))
}

/**
 * 复核购物车条目。
 *
 * 请求阶段由调用方并发完成；这里收到的 `products` 一旦有缺失或规格组合对不上，
 * 就按行移除。任何异常都不会在这里发生——失败语义由调用方在请求阶段短路。
 */
export function applyRecoverySnapshots(
  items: readonly CartItem[],
  products: ReadonlyMap<string, ProductDetailSnapshot | null>,
): CartVerificationResult {
  const nextItems: CartItem[] = []
  let removed = 0
  let adjusted = 0

  for (const item of items) {
    const product = products.get(item.slug) ?? null
    if (product === null) {
      removed += 1
      continue
    }

    const variant = product.variants.find(candidate => candidate.sku === item.sku)
    if (variant === undefined) {
      removed += 1
      continue
    }

    const stock = Number.isFinite(variant.stock) ? Math.max(0, Math.floor(variant.stock)) : 0
    const limit = resolveQuantityLimit(stock)
    if (limit === 0) {
      removed += 1
      continue
    }

    const quantity = Math.min(item.quantity, limit)
    if (quantity !== item.quantity) {
      adjusted += 1
    }

    // 单价保留快照；库存刷新为最新值，数量按最新上限收敛。
    nextItems.push({ ...item, quantity, stock })
  }

  return { status: 'verified', items: nextItems, changes: { removed, adjusted } }
}

/**
 * 按商品去重、并发请求详情，再套用行级规则。
 *
 * 任一次请求超时 / 抛错（服务错误、网络错误）→ 返回 `unverified`，调用方必须
 * 保留原存档、不做部分修复。`lookup` 用 `null` 表达「商品不存在」，那是可修复
 * 的行级结果，不计入请求失败。
 */
export async function verifyCartItems(
  items: readonly CartItem[],
  lookup: ProductLookup,
): Promise<CartVerificationResult> {
  const slugs = [...new Set(items.map(item => item.slug))]

  let snapshots: Array<ProductDetailSnapshot | null>
  try {
    snapshots = await Promise.all(slugs.map(slug => lookup(slug)))
  } catch {
    return { status: 'unverified' }
  }

  const products = new Map<string, ProductDetailSnapshot | null>()
  slugs.forEach((slug, index) => {
    products.set(slug, snapshots[index] ?? null)
  })

  return applyRecoverySnapshots(items, products)
}
