import { describe, expect, it } from 'vitest'
import { resolveQuantityInput, stepQuantity } from '@/utils/quantity'

// 数量纯逻辑的验收口径（spec U1）：合法范围 1..上限；输入文本不归整；
// 空值、小数、非数字、0 / 负数与超上限各有独立提示；上限是调用方算好的库存口径。
describe('resolveQuantityInput', () => {
  it('合法整数给出可提交数值，同时原样保留用户文本', () => {
    const state = resolveQuantityInput('2', 5)
    expect(state).toEqual({ raw: '2', value: 2, issue: null, error: null, valid: true })
    expect(resolveQuantityInput(' 3 ', 5)).toMatchObject({ raw: ' 3 ', value: 3, valid: true })
    expect(resolveQuantityInput('5', 5)).toMatchObject({ value: 5, valid: true })
  })

  it('空文本提示请输入数量', () => {
    expect(resolveQuantityInput('', 5)).toEqual({
      raw: '',
      value: null,
      issue: 'empty',
      error: '请输入数量。',
      valid: false,
    })
    expect(resolveQuantityInput('   ', 5).issue).toBe('empty')
  })

  it('小数与非数字给出不同提示，且不产生数值', () => {
    expect(resolveQuantityInput('1.5', 5)).toMatchObject({
      issue: 'not-integer',
      error: '数量必须是整数，不能填小数。',
      value: null,
    })
    expect(resolveQuantityInput('3件', 5)).toMatchObject({
      issue: 'not-integer',
      error: '数量必须是正整数。',
      value: null,
    })
    expect(resolveQuantityInput('abc', 5).issue).toBe('not-integer')
  })

  it('0 与负数按最小值拒绝', () => {
    for (const raw of ['0', '-3', '+0']) {
      expect(resolveQuantityInput(raw, 5)).toMatchObject({
        issue: 'below-min',
        error: '数量至少为 1 件。',
        value: null,
      })
    }
  })

  it('超上限提示当前生效的上限', () => {
    expect(resolveQuantityInput('6', 5)).toMatchObject({
      issue: 'above-limit',
      error: '该规格最多可买 5 件。',
    })
    expect(resolveQuantityInput('9007199254740992', 999).issue).toBe('above-limit')
  })

  it('上限为 0 表示缺货，合法文本也不可提交', () => {
    expect(resolveQuantityInput('1', 0)).toMatchObject({
      issue: 'above-limit',
      error: '该规格已缺货。',
      value: null,
    })
  })

  it('上限做安全整数兜底：小数向下取整、负数与 Infinity 视为 0、超过 999 收敛到 999', () => {
    expect(resolveQuantityInput('8', 8.9)).toMatchObject({ value: 8, valid: true })
    expect(resolveQuantityInput('1', -2).issue).toBe('above-limit')
    expect(resolveQuantityInput('1', Number.POSITIVE_INFINITY).issue).toBe('above-limit')
    expect(resolveQuantityInput('1000', 1200)).toMatchObject({
      issue: 'above-limit',
      error: '该规格最多可买 999 件。',
    })
  })
})

describe('stepQuantity', () => {
  it('以当前文本为基准加减，夹在 [1, 上限]', () => {
    expect(stepQuantity('2', 1, 5)).toBe('3')
    expect(stepQuantity('2', -1, 5)).toBe('1')
    expect(stepQuantity('1', -1, 5)).toBe('1')
    expect(stepQuantity('5', 1, 5)).toBe('5')
    expect(stepQuantity('12', -1, 5)).toBe('4')
  })

  it('非法或空文本从 1 起步，不在隐含的 1 上再跳一格', () => {
    for (const raw of ['', '  ', 'abc', '0', '-2', '1.5']) {
      expect(stepQuantity(raw, 1, 5)).toBe('1')
      expect(stepQuantity(raw, -1, 5)).toBe('1')
    }
  })

  it('上限为 0 时原样返回，不猜测目标值', () => {
    expect(stepQuantity('', 1, 0)).toBe('')
    expect(stepQuantity('3', -1, 0)).toBe('3')
  })
})
