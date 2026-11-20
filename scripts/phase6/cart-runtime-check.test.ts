/**
 * 购物车运行时检查（Node v26 直接跑 TS，无新增依赖）。
 *
 * 运行：pnpm check:cart
 *
 * 只导入仓库内纯逻辑模块；`cart-startup.ts` 依赖 `import.meta.env`，Node 下不可用，
 * 恢复编排由 store 的 `beginRecovery` / `completeRecovery` 直接驱动。
 */
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { useCartStore, type CartItem } from '../../src/stores/cart.ts'
import {
  CART_STORAGE_KEY,
  loadCartArchive,
  parseCartArchive,
  saveCartArchive,
  serializeCartArchive,
  setCartStorage,
  type CartStorageLike,
} from '../../src/utils/cart-storage.ts'
import {
  verifyCartItems,
  type ProductDetailSnapshot,
  type ProductLookup,
} from '../../src/utils/cart-recovery.ts'

interface FakeStorage {
  value: string | null
  setCalls: number
  failWrites: boolean
  failReads: boolean
}

/** 伪存储：记录 `setItem` 调用次数，可切换读 / 写失败。 */
function installFakeStorage(initial: readonly CartItem[] | null): FakeStorage {
  const state: FakeStorage = {
    value: initial === null ? null : serializeCartArchive(initial),
    setCalls: 0,
    failWrites: false,
    failReads: false,
  }
  const storage: CartStorageLike = {
    getItem () {
      if (state.failReads) {
        throw new Error('SecurityError')
      }
      return state.value
    },
    setItem (_key, value) {
      state.setCalls += 1
      if (state.failWrites) {
        throw new Error('QuotaExceededError')
      }
      state.value = value
    },
  }
  setCartStorage(storage)
  return state
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

const product = (over: Record<string, unknown> = {}): ProductDetailSnapshot => ({
  variants: [
    {
      sku: 's1',
      option1Value: 'A',
      option2Value: 'B',
      priceCents: 1000,
      originalPriceCents: 1200,
      stock: 1,
    },
  ],
  ...over,
}) as unknown as ProductDetailSnapshot

const lookupFrom = (
  products: Record<string, ProductDetailSnapshot | null>,
): ProductLookup => async slug => (slug in products ? (products[slug] ?? null) : null)

beforeEach(() => {
  setActivePinia(createPinia())
  setCartStorage(null)
})

test('存档：合法存档往返一致，单键与版本固定', () => {
  const items = [item(), item({ sku: 's2', slug: 'p2', name: '商品二' })]
  assert.deepEqual(parseCartArchive(serializeCartArchive(items)), items)
  assert.equal(CART_STORAGE_KEY, 'shop-frontend:cart:v1')
})

test('存档：坏 JSON / 版本不支持 / 结构非法都整份丢弃', () => {
  const good = item()
  const badRaws = [
    '{oops',
    'null',
    '[]',
    JSON.stringify({ version: 2, items: [good] }),
    JSON.stringify({ version: 0, items: [good] }),
    JSON.stringify({ version: 1 }),
    JSON.stringify({ version: 1, items: {} }),
    JSON.stringify({ version: 1, items: [good, { ...good, sku: '' }] }),
    JSON.stringify({ version: 1, items: [good, { ...good, quantity: 0 }] }),
    JSON.stringify({ version: 1, items: [good, { ...good, quantity: 1.5 }] }),
    JSON.stringify({ version: 1, items: [good, { ...good, unitPriceCents: -1 }] }),
    JSON.stringify({ version: 1, items: [good, { ...good, stock: -1 }] }),
    JSON.stringify({ version: 1, items: [good, good] }),
  ]
  for (const raw of badRaws) {
    assert.deepEqual(parseCartArchive(raw), [], raw.slice(0, 80))
  }
  assert.deepEqual(parseCartArchive(null), [])
  assert.deepEqual(parseCartArchive(''), [])
})

test('存储：写入失败返回 false，旧存档与读取结果保持不变', () => {
  const state = installFakeStorage([item()])
  const first = [item()]
  assert.equal(saveCartArchive(first), true)
  const saved = state.value

  state.failWrites = true
  assert.equal(saveCartArchive([item({ quantity: 5 })]), false)
  assert.equal(state.value, saved, '失败时上一次成功保存的存档必须保留')
  assert.equal(state.setCalls, 2)

  const loaded = loadCartArchive()
  assert.equal(loaded.available, true)
  assert.deepEqual(loaded.items, first)
})

test('存储：读取被拒退回内存，标记不可用且为空车', () => {
  const state = installFakeStorage([item()])
  state.failReads = true
  const loaded = loadCartArchive()
  assert.equal(loaded.available, false)
  assert.deepEqual(loaded.items, [])
  assert.equal(state.setCalls, 0)
})

test('复核：不存在 / 组合不存在 / 缺货移除，超上限收敛并保留快照价', async () => {
  const items = [
    item({ sku: 's1', slug: 'p1', name: '甲', quantity: 9, stock: 5, unitPriceCents: 1000 }),
    item({ sku: 's2', slug: 'p2', name: '乙' }),
    item({ sku: 's3', slug: 'p3', name: '丙' }),
    item({ sku: 's4', slug: 'p4', name: '丁' }),
    item({ sku: 's5', slug: 'p5', name: '戊', quantity: 2, stock: 9 }),
  ]
  const result = await verifyCartItems(
    items,
    lookupFrom({
      p1: product({
        variants: [
          {
            sku: 's1',
            option1Value: 'A',
            option2Value: 'B',
            priceCents: 888,
            originalPriceCents: 999,
            stock: 1,
          },
        ],
      }),
      p2: null,
      p3: product({
        variants: [
          {
            sku: 's3',
            option1Value: 'A',
            option2Value: 'B',
            priceCents: 1000,
            originalPriceCents: 1200,
            stock: 0,
          },
        ],
      }),
      p4: product(),
      p5: product({
        variants: [
          {
            sku: 's5',
            option1Value: 'A',
            option2Value: 'B',
            priceCents: 1000,
            originalPriceCents: 1200,
            stock: 7,
          },
        ],
      }),
    }),
  )

  assert.equal(result.status, 'verified')
  if (result.status !== 'verified') {
    return
  }
  assert.deepEqual(result.changes.removed.map(change => change.name), ['乙', '丙', '丁'])
  assert.deepEqual(result.changes.removed[0], { name: '乙', slug: 'p2', sku: 's2' })
  assert.deepEqual(result.changes.adjusted, [{ name: '甲', from: 9, to: 1 }])
  assert.equal(result.items.length, 2)
  assert.deepEqual(
    result.items[0],
    { sku: 's1', slug: 'p1', name: '甲', unitPriceCents: 1000, quantity: 1, stock: 1 },
    '单价保留快照、库存刷新、数量收敛到上限',
  )
  assert.deepEqual(
    result.items[1],
    { sku: 's5', slug: 'p5', name: '戊', unitPriceCents: 1000, quantity: 2, stock: 7 },
    '未超上限时只刷新库存快照',
  )
})

test('只读：beginRecovery 后四个动作都返回 READONLY，条目不变且未调用存储写入', () => {
  const existing = item()
  const state = installFakeStorage([existing])
  const cart = useCartStore()
  cart.setStorageAvailable(true)
  cart.hydrate([existing])
  assert.equal(cart.beginRecovery(), true)
  assert.equal(cart.readonly, true)
  const snapshot = cart.items.map(entry => ({ ...entry }))

  const results = [
    cart.add({ sku: 's9', slug: 'p9', name: '新品', unitPriceCents: 500, stock: 3 }, 1),
    cart.remove('s1'),
    cart.updateQuantity('s1', 3),
    cart.clear(),
  ]
  for (const result of results) {
    assert.equal(result.ok, false)
    if (result.ok) {
      continue
    }
    assert.equal(result.reason, 'READONLY')
    assert.equal(result.message, '购物车核对中，请稍候再操作。')
  }

  assert.deepEqual(cart.items, snapshot, '核对期不得改条目')
  assert.equal(state.setCalls, 0, '核对期不得写盘')
  assert.equal(cart.recovery, 'checking')
})

test('未核对：completeRecovery 不写盘，条目与存档原样保留', () => {
  const existing = item()
  const state = installFakeStorage([existing])
  const cart = useCartStore()
  cart.setStorageAvailable(true)
  cart.hydrate([existing])
  cart.beginRecovery()
  const rawBefore = state.value

  cart.completeRecovery({ status: 'unverified' })

  assert.equal(cart.recovery, 'unverified')
  assert.deepEqual(cart.items, [existing])
  assert.equal(state.value, rawBefore, '失败时原存档必须原样保留')
  assert.equal(state.setCalls, 0, '未核对不得写盘')
  assert.equal(cart.recoveryNotice, '')
})

test('未核对：lookup 抛错返回 unverified，且没有任何写入', async () => {
  const state = installFakeStorage([item()])
  const result = await verifyCartItems([item()], async () => {
    throw new Error('ECONNREFUSED')
  })
  assert.deepEqual(result, { status: 'unverified' })
  assert.equal(state.setCalls, 0)
  assert.equal(loadCartArchive().items.length, 1)
})

test('提示：列出被移除条目与调整前后数量，不再用「件」计行数', () => {
  const state = installFakeStorage([item()])
  const cart = useCartStore()
  cart.setStorageAvailable(true)
  cart.hydrate([item({ quantity: 202 })])
  cart.beginRecovery()

  cart.completeRecovery({
    status: 'verified',
    items: [item({ quantity: 200, stock: 200 })],
    changes: {
      removed: [
        { name: '商品二', slug: 'p2', sku: 's2' },
        { name: '商品三', slug: 'p3', sku: 's3' },
      ],
      adjusted: [{ name: '商品一', from: 202, to: 200 }],
    },
  })

  assert.equal(
    cart.recoveryNotice,
    '已移除 2 个商品条目：商品二、商品三；1 个商品条目数量已按库存上限调整：商品一（202 → 200）。',
  )
  assert.equal(cart.recoveryNotice.includes('件'), false)
  assert.equal(state.setCalls, 1, '核对成功后只写盘一次')
})

test('提示：超过 3 个条目折叠为「等 N 个」', () => {
  const cart = useCartStore()
  cart.completeRecovery({
    status: 'verified',
    items: [],
    changes: {
      removed: [
        { name: '甲', slug: 'p1', sku: 's1' },
        { name: '乙', slug: 'p2', sku: 's2' },
        { name: '丙', slug: 'p3', sku: 's3' },
        { name: '丁', slug: 'p4', sku: 's4' },
      ],
      adjusted: [],
    },
  })
  assert.equal(cart.recoveryNotice, '已移除 4 个商品条目：甲、乙、丙 等 4 个。')
})
