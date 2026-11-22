/**
 * 启动恢复的轮级取消与重试（N6 / D85）。
 *
 * 通过启动编排的公开入口观察行为：同一轮共用一个 \`AbortController\`，任一次
 * 详情请求失败先取消本轮在途请求再进入「未核对」；重试新建 controller，旧轮
 * 迟到结果不写入新轮；失败轮不写存档；商品 404 只移除对应行。
 *
 * 详情请求用 \`vi.mock('@/api/client')\` 替换，不触网、不依赖后端。
 */
import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, getProduct } from '@/api/client'
import { useCartStore, type CartItem } from '@/stores/cart'
import {
  parseCartArchive,
  serializeCartArchive,
  setCartStorage,
  type CartStorageLike,
} from '@/utils/cart-storage'
import { retryCartRecovery, startCartRecovery } from '@/utils/cart-startup'
import { RECOVERY_TIMEOUT_MS, verifyCartItems } from '@/utils/cart-recovery'

vi.mock('@/api/client', () => {
  class MockApiError extends Error {
    readonly status: number

    constructor (status: number, message: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
    }
  }

  return { ApiError: MockApiError, getProduct: vi.fn() }
})

type Detail = Awaited<ReturnType<typeof getProduct>>

/** 详情响应快照：只带复核依赖的 \`variants\`。 */
function detail (sku: string, stock: number): Detail {
  return {
    variants: [
      {
        sku,
        option1Value: 'A',
        option2Value: 'B',
        priceCents: 1000,
        originalPriceCents: 1200,
        stock,
      },
    ],
  } as unknown as Detail
}

const item = (over: Partial<CartItem> = {}): CartItem => ({
  sku: 's1',
  slug: 'p1',
  name: '商品一',
  unitPriceCents: 1000,
  quantity: 2,
  stock: 5,
  ...over,
})

interface FakeStorage {
  value: string | null
  setCalls: number
}

/** 伪存储：初始值给存档原文字节，便于比较「失败轮不动存档」。 */
function installFakeStorage (raw: string | null): FakeStorage {
  const state: FakeStorage = { value: raw, setCalls: 0 }
  const storage: CartStorageLike = {
    getItem: () => state.value,
    setItem: (_key, value) => {
      state.setCalls += 1
      state.value = value
    },
  }
  setCartStorage(storage)
  return state
}

beforeEach(() => {
  setActivePinia(createPinia())
  setCartStorage(null)
  vi.mocked(getProduct).mockReset()
})

test('N6 取消：同一轮共用一个 AbortController，单个请求失败会取消在途请求', async () => {
  installFakeStorage(serializeCartArchive([item(), item({ sku: 's2', slug: 'p2', name: '商品二' })]))
  const cart = useCartStore()

  const signals: Array<AbortSignal | undefined> = []
  vi.mocked(getProduct).mockImplementation((slug, signal) => {
    signals.push(signal)
    if (slug === 'p1') {
      return Promise.reject(new Error('ECONNREFUSED'))
    }
    return new Promise<Detail>((_resolve, reject) => {
      const fallback = setTimeout(() => reject(new Error('late')), 1000)
      signal?.addEventListener('abort', () => {
        clearTimeout(fallback)
        reject(new Error('AbortError'))
      })
    })
  })

  await startCartRecovery(cart)

  assert.equal(cart.recovery, 'unverified')
  assert.equal(signals.length, 2)
  assert.equal(signals[0], signals[1], '同一轮的两个详情请求必须共用一个 AbortController')
  assert.equal(signals[0]?.aborted, true, '任一请求失败后必须先取消本轮在途请求')
})

test('N6 重试：失败后立即重试新建 controller，旧轮迟到结果不写入新轮', async () => {
  installFakeStorage(serializeCartArchive([item()]))
  const cart = useCartStore()

  const signals: Array<AbortSignal | undefined> = []
  let failFirstRound = true
  let resolveRetry: ((value: Detail) => void) | undefined
  vi.mocked(getProduct).mockImplementation((_slug, signal) => {
    signals.push(signal)
    if (failFirstRound) {
      failFirstRound = false
      return Promise.reject(new Error('ECONNREFUSED'))
    }
    return new Promise<Detail>(resolve => {
      resolveRetry = resolve
    })
  })

  await startCartRecovery(cart)

  assert.equal(cart.recovery, 'unverified')
  const failedRound = cart.recoveryRound
  const failedSignal = signals[0]
  assert.equal(failedSignal?.aborted, true, '失败轮必须取消自己的在途请求')

  // 失败后立刻重试：不等待任何退避，新轮用新的 controller。
  const retryPromise = retryCartRecovery(cart)
  const retrySignal = signals[1]
  assert.equal(signals.length, 2)
  assert.notEqual(retrySignal, failedSignal, '重试必须新建 AbortController')
  assert.equal(retrySignal?.aborted, false, '新轮 controller 不得沿用旧轮的中止状态')
  assert.equal(cart.recovery, 'checking')
  assert.equal(cart.recoveryRound, failedRound + 1)

  // 旧轮迟到的「成功」结果带着旧代次，必须被拒收。
  const staleApplied = cart.completeRecovery(
    {
      status: 'verified',
      items: [item({ quantity: 9, stock: 9 })],
      changes: { removed: [], adjusted: [] },
    },
    failedRound,
  )
  assert.equal(staleApplied, false, '旧轮迟到结果不得提交')
  assert.equal(cart.recovery, 'checking')
  assert.deepEqual(cart.items, [item()], '旧轮结果不得改动新轮条目')

  resolveRetry?.(detail('s1', 5))
  await retryPromise

  assert.equal(cart.recovery, 'verified')
  assert.deepEqual(cart.items, [item()])
  assert.equal(cart.recoveryRound, failedRound + 1)
})

test('N6 存档：失败轮不写存档（字节不变），重试成功只写一次', async () => {
  const archive = serializeCartArchive([
    item(),
    item({ sku: 's2', slug: 'p2', name: '商品二' }),
  ])
  const storage = installFakeStorage(archive)
  const cart = useCartStore()

  let failing = true
  vi.mocked(getProduct).mockImplementation((slug) => {
    if (failing) {
      return Promise.reject(new Error('ECONNREFUSED'))
    }
    return Promise.resolve(detail(slug === 'p1' ? 's1' : 's2', 5))
  })

  await startCartRecovery(cart)

  assert.equal(cart.recovery, 'unverified')
  assert.equal(storage.value, archive, '失败轮必须保持存档字节不变')
  assert.equal(storage.setCalls, 0, '失败轮不得写盘')

  // 失败后允许立即重试；只有成功轮才写盘一次。
  failing = false
  await retryCartRecovery(cart)

  assert.equal(cart.recovery, 'verified')
  assert.equal(storage.setCalls, 1, '成功轮只写一次存档')
  assert.equal(parseCartArchive(storage.value).length, 2)
})

test('N6 404：只移除对应商品行，其余行保留', async () => {
  installFakeStorage(
    serializeCartArchive([item(), item({ sku: 's2', slug: 'p2', name: '商品二' })]),
  )
  const cart = useCartStore()
  const signals: Array<AbortSignal | undefined> = []

  vi.mocked(getProduct).mockImplementation((slug, signal) => {
    signals.push(signal)
    if (slug === 'p2') {
      return Promise.reject(new ApiError(404, '商品详情请求失败：HTTP 404'))
    }
    return Promise.resolve(detail('s1', 5))
  })

  await startCartRecovery(cart)

  assert.equal(cart.recovery, 'verified')
  assert.deepEqual(cart.items, [item()], '仅 404 的商品行被移除')
  assert.equal(cart.recoveryNotice, '已移除 1 个商品条目：商品二（SKU：s2）。')
  assert.equal(signals[0]?.aborted, false, '404 是行级结果，不取消本轮在途请求')
})

test('N6 超时：每个详情请求保留 8 秒时限，到点取消整轮', async () => {
  assert.equal(RECOVERY_TIMEOUT_MS, 8000, '每个详情请求的默认时限保持 8 秒')

  const signals: AbortSignal[] = []
  const lookup = async (_slug: string, signal: AbortSignal): Promise<never> => {
    signals.push(signal)
    return new Promise<never>(() => {
      // 忽略 signal 的假请求：验证超时本身也能结束整轮，而不是只靠 abort 传播。
    })
  }

  const result = await verifyCartItems(
    [item(), item({ sku: 's2', slug: 'p2', name: '商品二' })],
    lookup,
    { timeoutMs: 20 },
  )

  assert.deepEqual(result, { status: 'unverified' })
  assert.equal(signals.length, 2)
  assert.equal(signals[0], signals[1], '超时轮同样共用一个 AbortController')
  assert.equal(signals[0]?.aborted, true, '到点先取消整轮在途请求')
})
