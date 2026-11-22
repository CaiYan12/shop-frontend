/**
 * src/utils/cart-startup.ts
 *
 * 启动恢复的编排（#23）：读存档 → 结构校验 → 立即用快照渲染 → 逐商品复核 →
 * 一次性提交。UI 只负责调用这里，不在组件里重复拼流程。
 *
 * 失败语义：
 * - 任一详情请求超时 / 网络 / 服务错误 → 先取消本轮在途请求，`verifyCartItems`
 *   返回 `unverified`；store 原样保留存档、不写盘，摘要提供立即重试；
 * - 每轮复核一个代次；旧轮迟到的结果按代次拒收，不覆盖新轮；
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

/**
 * 查一个商品；404 视为「商品不存在」，其余错误继续抛出以触发整轮取消。
 * 请求时限与轮级 controller 由 `verifyCartItems` 统一管理。
 */
async function lookupProduct(
  slug: string,
  signal: AbortSignal,
): Promise<ProductDetailSnapshot | null> {
  try {
    return await getProduct(slug, signal)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

/**
 * 用当前内存条目跑一次复核并提交；空车直接成功，不发请求。
 *
 * `round` 是本轮代次：结果只在代次仍然当前时提交，旧轮迟到结果由 store 拒收。
 */
async function runVerification(cart: CartStore, round: number): Promise<void> {
  const snapshot: CartItem[] = cart.items.map(item => ({ ...item }))
  if (snapshot.length === 0) {
    cart.completeRecovery(
      { status: 'verified', items: [], changes: { removed: [], adjusted: [] } },
      round,
    )
    return
  }

  const result = await verifyCartItems(snapshot, lookupProduct)
  cart.completeRecovery(result, round)
}

/**
 * 应用启动时调用一次：读存档、回填快照、进入「核对中」，随后异步复核。
 * store 的 `recoveryStarted` 保证重复调用直接返回，不重复读盘或发请求。
 */
export async function startCartRecovery(cart: CartStore): Promise<void> {
  if (!cart.beginRecovery()) {
    return
  }
  const round = cart.recoveryRound

  const archive = loadCartArchive()
  cart.setStorageAvailable(archive.available)
  cart.hydrate(archive.items)

  await runVerification(cart, round)
}

/** 「未核对」摘要里的重试：沿用内存原存档，不重新读盘。 */
export async function retryCartRecovery(cart: CartStore): Promise<void> {
  if (!cart.beginRetry()) {
    return
  }

  await runVerification(cart, cart.recoveryRound)
}
