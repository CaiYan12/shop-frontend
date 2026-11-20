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

test('加购：正常加入一行，只写盘一次且存档含该行', () => {
  const state = installFakeStorage(null)
  const cart = useCartStore()
  cart.setStorageAvailable(true)

  const result = cart.add(
    { sku: 's1', slug: 'p1', name: '商品一', unitPriceCents: 1000, stock: 5 },
    2,
  )

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(cart.items, [item()])
  assert.equal(state.setCalls, 1, '一次加购只写盘一次')
  assert.deepEqual(parseCartArchive(state.value), [item()])
  assert.equal(state.value?.includes('"sku":"s1"'), true, '存档字节包含该行')
})

test('加购：同 SKU 合并为一行，数量累加且存档同步', () => {
  const state = installFakeStorage(null)
  const cart = useCartStore()
  cart.setStorageAvailable(true)
  const input = { sku: 's1', slug: 'p1', name: '商品一', unitPriceCents: 1000, stock: 5 }

  assert.deepEqual(cart.add(input, 2), { ok: true })
  assert.deepEqual(cart.add(input, 1), { ok: true })

  assert.equal(cart.items.length, 1, '同 SKU 只保留一行')
  assert.equal(cart.items[0]?.quantity, 3)
  assert.equal(state.setCalls, 2, '每次成功加购各写盘一次')
  assert.deepEqual(parseCartArchive(state.value), [item({ quantity: 3 })])
})

test('加购：累计超限拒绝，条目与存档字节不变且不写盘', () => {
  const state = installFakeStorage(null)
  const cart = useCartStore()
  cart.setStorageAvailable(true)
  const input = { sku: 's1', slug: 'p1', name: '商品一', unitPriceCents: 1000, stock: 3 }

  assert.deepEqual(cart.add(input, 2), { ok: true })
  const itemsBefore = cart.items.map(entry => ({ ...entry }))
  const rawBefore = state.value
  const callsBefore = state.setCalls

  const result = cart.add(input, 2)

  assert.equal(result.ok, false, '累计数量超上限必须拒绝')
  if (result.ok) {
    return
  }
  assert.equal(result.reason, 'QUANTITY_LIMIT_EXCEEDED')
  assert.equal(result.reason === 'QUANTITY_LIMIT_EXCEEDED' ? result.limit : null, 3)
  assert.deepEqual(cart.items, itemsBefore, '拒绝时条目不变')
  assert.equal(state.value, rawBefore, '拒绝时存档字节不变')
  assert.equal(state.setCalls, callsBefore, '拒绝时不再写盘')
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
  assert.deepEqual(result.changes.adjusted, [{ name: '甲', sku: 's1', from: 9, to: 1 }])
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
  assert.equal(cart.recoveryNoticeFull, '')
})

test('只读：检查期直接调用 persist 被拦截，未核对后存档字节不变', () => {
  const existing = item()
  const state = installFakeStorage([existing])
  const rawBefore = state.value
  const cart = useCartStore()
  cart.setStorageAvailable(true)
  cart.hydrate([existing])
  assert.equal(cart.beginRecovery(), true)
  assert.equal(cart.readonly, true)

  cart.persist()

  assert.equal(state.setCalls, 0, '检查期 persist 不得写盘')
  assert.equal(state.value, rawBefore, '检查期 persist 不得改动存档字节')

  cart.completeRecovery({ status: 'unverified' })

  assert.equal(cart.recovery, 'unverified')
  assert.equal(state.setCalls, 0, '未核对不得补写盘')
  assert.equal(state.value, rawBefore, '未核对后原存档字节不变')
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

test('提示：列出被移除条目与调整前后数量，用 SKU 与名称一起标识', () => {
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
      adjusted: [{ name: '商品一', sku: 's1', from: 202, to: 200 }],
    },
  })

  assert.equal(
    cart.recoveryNotice,
    '已移除 2 个商品条目：商品二（SKU：s2）、商品三（SKU：s3）；1 个商品条目数量已按库存上限调整：商品一（SKU：s1，202 → 200）。',
  )
  assert.equal(cart.recoveryNotice.includes('件'), false)
  assert.equal(cart.recoveryNoticeFull, cart.recoveryNotice, '不超过 3 条时短提示即完整清单')
  assert.equal(state.setCalls, 1, '核对成功后只写盘一次')
})

test('提示：同名不同 SKU 的一条被移除、一条被调整时分别出现且可区分', () => {
  const cart = useCartStore()
  cart.completeRecovery({
    status: 'verified',
    items: [],
    changes: {
      removed: [{ name: 'Earpods', slug: 'p1', sku: 'EARPODS-LTN-BOX' }],
      adjusted: [{ name: 'Earpods', sku: 'EARPODS-BLK-BOX', from: 9, to: 3 }],
    },
  })

  assert.equal(
    cart.recoveryNotice,
    '已移除 1 个商品条目：Earpods（SKU：EARPODS-LTN-BOX）；1 个商品条目数量已按库存上限调整：Earpods（SKU：EARPODS-BLK-BOX，9 → 3）。',
  )
  assert.equal(cart.recoveryNotice.includes('SKU：EARPODS-LTN-BOX'), true, '被移除的 SKU 可见')
  assert.equal(cart.recoveryNotice.includes('SKU：EARPODS-BLK-BOX'), true, '被调整的 SKU 可见')
})

test('提示：超过 3 个条目时短提示折叠，完整清单保留第 4 条', () => {
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
  assert.equal(
    cart.recoveryNotice,
    '已移除 4 个商品条目：甲（SKU：s1）、乙（SKU：s2）、丙（SKU：s3） 等 4 个。',
  )
  assert.equal(cart.recoveryNotice.includes('丁'), false, '短提示折叠第 4 条')
  assert.equal(
    cart.recoveryNoticeFull,
    '已移除 4 个商品条目：甲（SKU：s1）、乙（SKU：s2）、丙（SKU：s3）、丁（SKU：s4）。',
  )
})
