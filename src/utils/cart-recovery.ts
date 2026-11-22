/**
 * src/utils/cart-recovery.ts
 *
 * 恢复复核的行级规则（#23）。纯逻辑：不碰 Pinia、不直接请求接口。
 *
 * 调用方按商品去重后并发请求详情，把「查到的商品快照或 `null`（不存在）」交给
 * 这里逐行核对。规则（spec「持久化与恢复复核」）：
 * - 商品不存在、规格组合不存在、组合缺货 → 移除该行；
 * - 数量超过最新「数量上限」→ 调整到上限，并记入「调整」列表；
 * - 单价保留存档快照，不提示价差；库存快照刷新为最新值，供后续改量使用；
 * - 任一次请求失败由调用方在这一步之前拦下；这里只处理已拿到的快照。
 */
import type { components } from '@/api/schema'
import { resolveQuantityLimit, type CartItem } from '../stores/cart.ts'

/** 详情接口的返回快照；只依赖 `variants`，其余字段由调用方的契约保证。 */
export type ProductDetailSnapshot = components['schemas']['ProductDetailResponse']

/**
 * 按 `slug` 查详情；返回 `null` 表示商品不存在（404）。
 *
 * `signal` 由本轮复核的共享 `AbortController` 提供：同一轮的所有详情请求共用
 * 它，任一次超时 / 失败都会连带取消其余在途请求。
 */
export type ProductLookup = (slug: string, signal: AbortSignal) => Promise<ProductDetailSnapshot | null>

/** 被移除的条目：带名称与标识，汇总提示据此指出具体行。 */
export interface RecoveryRemovedItem {
  readonly name: string
  readonly slug: string
  readonly sku: string
}

/** 被收敛数量的条目：带名称与标识，并记录调整前后数量。 */
export interface RecoveryAdjustedItem {
  readonly name: string
  readonly sku: string
  readonly from: number
  readonly to: number
}

/** 汇总提示的变更列表，分别对应「移除」与「调整」。 */
export interface RecoveryChanges {
  readonly removed: readonly RecoveryRemovedItem[]
  readonly adjusted: readonly RecoveryAdjustedItem[]
}

/** 复核结果：成功给出一次性提交的条目与变更列表；失败表示整份存档原样保留。 */
export type CartVerificationResult =
  | { readonly status: 'verified', readonly items: CartItem[], readonly changes: RecoveryChanges }
  | { readonly status: 'unverified' }

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
  const removed: RecoveryRemovedItem[] = []
  const adjusted: RecoveryAdjustedItem[] = []

  for (const item of items) {
    const product = products.get(item.slug) ?? null
    if (product === null) {
      removed.push({ name: item.name, slug: item.slug, sku: item.sku })
      continue
    }

    const variant = product.variants.find(candidate => candidate.sku === item.sku)
    if (variant === undefined) {
      removed.push({ name: item.name, slug: item.slug, sku: item.sku })
      continue
    }

    const stock = Number.isFinite(variant.stock) ? Math.max(0, Math.floor(variant.stock)) : 0
    const limit = resolveQuantityLimit(stock)
    if (limit === 0) {
      removed.push({ name: item.name, slug: item.slug, sku: item.sku })
      continue
    }

    const quantity = Math.min(item.quantity, limit)
    if (quantity !== item.quantity) {
      adjusted.push({ name: item.name, sku: item.sku, from: item.quantity, to: quantity })
    }

    // 单价保留快照；库存刷新为最新值，数量按最新上限收敛。
    nextItems.push({ ...item, quantity, stock })
  }

  return { status: 'verified', items: nextItems, changes: { removed, adjusted } }
}

/** 单个详情请求的时限；每个请求各自计时，到点取消整轮。 */
export const RECOVERY_TIMEOUT_MS = 8000

/** `verifyCartItems` 的可选项；目前只开放请求时限，便于测试收窄。 */
export interface VerifyCartOptions {
  /** 单个详情请求的时限（毫秒）；默认 `RECOVERY_TIMEOUT_MS`。 */
  readonly timeoutMs?: number
}

/**
 * 按商品去重、并发请求详情，再套用行级规则。
 *
 * 同一轮的详情请求共用一个 `AbortController`：每个请求各自计时，任一次超时 /
 * 抛错（服务错误、网络错误）都先 abort 这个 controller 取消本轮其余在途请求，
 * 再返回 `unverified`；调用方必须保留原存档、不做部分修复。`lookup` 用
 * `null` 表达「商品不存在」，那是可修复的行级结果，不计入请求失败。
 */
export async function verifyCartItems(
  items: readonly CartItem[],
  lookup: ProductLookup,
  options: VerifyCartOptions = {},
): Promise<CartVerificationResult> {
  const slugs = [...new Set(items.map(item => item.slug))]
  const timeoutMs = options.timeoutMs ?? RECOVERY_TIMEOUT_MS

  // 一轮一个 controller：失败时先取消本轮所有在途请求，再进入「未核对」。
  const controller = new AbortController()
  const timers = new Set<ReturnType<typeof setTimeout>>()

  const request = (slug: string): Promise<ProductDetailSnapshot | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error(`商品详情请求超时（${timeoutMs}ms）`))
      }, timeoutMs)
      timers.add(timer)
    })
    // 别的请求先失败时，本请求不必等自己的计时器到点：round abort 立即结束它。
    const cancelled = new Promise<never>((_resolve, reject) => {
      const onAbort = (): void => reject(new Error('本轮复核已取消'))
      if (controller.signal.aborted) {
        onAbort()
      } else {
        controller.signal.addEventListener('abort', onAbort, { once: true })
      }
    })

    return Promise.race([lookup(slug, controller.signal), timeout, cancelled]).finally(() => {
      if (timer !== undefined) {
        clearTimeout(timer)
        timers.delete(timer)
      }
    })
  }

  let snapshots: Array<ProductDetailSnapshot | null>
  try {
    snapshots = await Promise.all(slugs.map(request))
  } catch {
    // 先取消本轮在途请求，再把「未核对」交给调用方。
    for (const pending of timers) {
      clearTimeout(pending)
    }
    timers.clear()
    controller.abort()
    return { status: 'unverified' }
  }

  const products = new Map<string, ProductDetailSnapshot | null>()
  slugs.forEach((slug, index) => {
    products.set(slug, snapshots[index] ?? null)
  })

  return applyRecoverySnapshots(items, products)
}
