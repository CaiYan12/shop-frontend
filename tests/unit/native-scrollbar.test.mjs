// 对比度门槛的边界回归：展示值可以舍入到 3.00，但原始值必须小于 3 并被拦住。
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { analyzeScrollbarPair, contrastRatio } from '../../scripts/acceptance/native-scrollbar.mjs'

const nearThreshold = contrastRatio([27, 27, 27], [102, 102, 102])

test('边界样本原始对比度低于 3:1，显示值才是 3.00', () => {
  assert.ok(Math.abs(nearThreshold - 2.9998038) < 1e-6, `边界样本值不符：${nearThreshold}`)
  assert.ok(nearThreshold < 3, `原始值应小于 3，实际 ${nearThreshold}`)
  const result = analyzeScrollbarPair({
    width: 15,
    height: 161,
    changed: [
      { y: 10, top: [27, 27, 27, 255], bottom: [102, 102, 102, 255] },
    ],
  })
  assert.equal(result.ratio, nearThreshold)
  assert.ok(result.ratio < 3)
  assert.equal(result.ratioDisplay, '3.00')
})

test('正常样本保留原始值并显示两位小数', () => {
  const result = analyzeScrollbarPair({
    width: 15,
    height: 161,
    changed: [
      { y: 10, top: [106, 106, 106, 255], bottom: [235, 235, 235, 255] },
    ],
  })
  assert.ok(result.ratio >= 3)
  assert.equal(result.ratioDisplay, '4.54')
})
