/**
 * src/utils/quantity.ts
 *
 * 数量输入的纯逻辑（#21）。
 *
 * 详情页与购物车面板行共用同一套规则（spec「数量与加购」）：
 * - 输入保留**原始文本**，允许输入过程为空，不在每次按键时改写用户内容；
 * - 合法范围是 `1` 到「数量上限」；上限由调用方用
 *   `min(999, 所选组合库存)` 算出后传入，这里不读库存、不碰 store；
 * - 空值、0、负数、小数、非数字与超上限都给出行内提示，且不产生可提交的数值；
 * - 增减按钮以当前文本为基准夹到 `[1, 上限]`，非法文本退回 `1` 起步。
 *
 * 术语沿用 `GLOSSARY.md`：数量上限。函数只回答「这段文本能不能加购」，
 * 不负责赋值、清空或与购物车交互。
 */

/** 行内提示的分类：调用方据此决定是否在失焦/加购时展示。 */
export type QuantityIssue = 'empty' | 'not-integer' | 'below-min' | 'above-limit'

/** 一次数量文本的解析结果；`valid` 为真时 `value` 一定在范围内。 */
export interface QuantityInputState {
  /** 用户输入的原始文本，不做 trim / 改写。 */
  readonly raw: string
  /** 可提交的数量；文本不合法时为 `null`。 */
  readonly value: number | null
  /** 提示分类；合法时为 `null`。 */
  readonly issue: QuantityIssue | null
  /** 行内提示文案；合法时为 `null`。 */
  readonly error: string | null
  /** 是否可以直接用于加购。 */
  readonly valid: boolean
}

/** 与后端 D68 一致：单规格组合最多 999 件。 */
const MAX_QUANTITY = 999

/** 上限统一兜到 `0..999` 的安全整数，脏数据按 0（不可加购）处理。 */
function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return 0
  }
  return Math.min(MAX_QUANTITY, Math.floor(limit))
}

function invalid(issue: QuantityIssue, error: string): QuantityInputState {
  return { raw: '', value: null, issue, error, valid: false }
}

/**
 * 解析数量文本。
 *
 * `limit` 是调用方算好的数量上限（`min(999, 所选组合库存)`）；上限为 0 表示
 * 该规格组合缺货，任何数量都不可提交，提示统一为「该规格已缺货」。
 */
export function resolveQuantityInput(raw: string, limit: number): QuantityInputState {
  const trimmed = raw.trim()
  const bounded = normalizeLimit(limit)

  if (trimmed === '') {
    return { ...invalid('empty', '请输入数量。'), raw }
  }

  const base = { raw, value: null, valid: false } as const

  if (!/^[+-]?\d+$/.test(trimmed)) {
    const isDecimal = /^[+-]?\d*\.\d+$/.test(trimmed)
    return {
      ...base,
      issue: 'not-integer',
      error: isDecimal ? '数量必须是整数，不能填小数。' : '数量必须是正整数。',
    }
  }

  const value = Number(trimmed)
  if (!Number.isSafeInteger(value)) {
    return {
      ...base,
      issue: 'above-limit',
      error: bounded === 0 ? '该规格已缺货。' : `该规格最多可买 ${bounded} 件。`,
    }
  }

  if (value < 1) {
    return { ...base, issue: 'below-min', error: '数量至少为 1 件。' }
  }

  if (bounded === 0) {
    return { ...base, issue: 'above-limit', error: '该规格已缺货。' }
  }

  if (value > bounded) {
    return { ...base, issue: 'above-limit', error: `该规格最多可买 ${bounded} 件。` }
  }

  return { raw, value, issue: null, error: null, valid: true }
}

/**
 * 增减按钮的目标文本：以当前文本（按 `Number` 解析）夹到 `[1, 上限]` 再加减。
 *
 * 空值、0、负数或非数字文本按 `1` 起步（加减都是「恢复为 1」，不会从隐含的 1
 * 再跳一格）；超上限文本先夹到上限，这样「减」不会从一位数跳回 1。
 * 上限为 0 时原样返回，按钮此时本应禁用，这里只是防御。
 */
export function stepQuantity(raw: string, delta: 1 | -1, limit: number): string {
  const bounded = normalizeLimit(limit)
  if (bounded === 0) {
    return raw
  }

  const parsed = Number(raw.trim())
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return '1'
  }

  const start = Math.min(parsed, bounded)
  return String(Math.min(bounded, Math.max(1, start + delta)))
}
