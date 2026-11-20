/**
 * src/utils/cart-startup.ts
 *
 * 启动恢复的编排（#23）：读存档 → 结构校验 → 立即用快照渲染 → 逐商品复核 →
 * 一次性提交。UI 只负责调用这里，不在组件里重复拼流程。
 *
 * 失败语义：
 * - 任一详情请求超时 / 服务错误 → `verifyCartItems` 返回 `unverified`，store 原样
 *   保留存档、不写盘，摘要提供重试；
 * - 商品 404 不是请求失败：按「商品不存在」移除对应行；
 * - 存储读取被拒 → 空购物车 + 存储不可用（与「未核对」分开提示）。
 */
import { ApiError, getProduct } from '@/api/client'
import { useCartStore } from '@/stores/cart'
import type { CartItem } from '@/stores/cart'
import { verifyCartItems } from '@/utils/cart-recovery'
import type { ProductDetailSnapshot } from '@/utils/cart-recovery'
import { loadCartArchive } from '@/utils/cart-storage'

type CartStore = ReturnType<typeof useCartStore>

/** 单次详情请求的时限；超时与网络错误一样按「未核对」处理。 */
const RECOVERY_TIMEOUT_MS = 8000

/**
 * 查一个商品；404 视为「商品不存在」，其余错误继续抛出以触发整份保留。
 * 每个请求独立计时并 abort，避免个别慢请求把整个恢复拖死。
 */
async function lookupProduct(slug: string): Promise<ProductDetailSnapshot | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RECOVERY_TIMEOUT_MS)
  try {
    return await getProduct(slug, controller.signal)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** 用当前内存条目跑一次复核并提交；空车直接成功，不发请求。 */
async function runVerification(cart: CartStore): Promise<void> {
  const snapshot: CartItem[] = cart.items.map(item => ({ ...item }))
  if (snapshot.length === 0) {
    cart.completeRecovery({ status: 'verified', items: [], changes: { removed: 0, adjusted: 0 } })
    return
  }

  const result = await verifyCartItems(snapshot, lookupProduct)
  cart.completeRecovery(result)
}

/**
 * 应用启动时调用一次：读存档、回填快照、进入「核对中」，随后异步复核。
 * store 的 `recoveryStarted` 保证重复调用直接返回，不重复读盘或发请求。
 */
export async function startCartRecovery(cart: CartStore): Promise<void> {
  if (!cart.beginRecovery()) {
    return
  }

  const archive = loadCartArchive()
  cart.setStorageAvailable(archive.available)
  cart.hydrate(archive.items)

  await runVerification(cart)
}

/** 「未核对」摘要里的重试：沿用内存原存档，不重新读盘。 */
export async function retryCartRecovery(cart: CartStore): Promise<void> {
  if (!cart.beginRetry()) {
    return
  }

  await runVerification(cart)
}
