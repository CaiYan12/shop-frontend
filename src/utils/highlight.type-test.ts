/**
 * 命中高亮解析的类型测试（编译期，无运行时断言）(#12)。
 *
 * 规格 Testing Decisions 要求把高亮解析抽成纯函数：输入契约的 `string[]`
 * （取首个片段）与回退原文，输出分段数组。此文件钉住三件编译期事实：
 * - 分段是 `text` / `em` 的判别联合，模板可据此只让 `em` 生成 `<em>`；
 * - 返回类型是 `HighlightSegment[]`，**永远不含 `undefined`**——缺失、空数组、
 *   标记不成对都在运行时回退原文，调用方不需要再判空；
 * - 参数接受 `readonly string[] | undefined`，契约里的可选字段可直接传入。
 *
 * 不覆盖：具体切分与实体解码结果——本文件只钉住类型，不验证运行时。
 */
import type { HighlightSegment } from './highlight'
import { parseHighlight } from './highlight'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

// —— 分段形状：判别联合，字段只读 ——
export type _TextSegment = Expect<Equal<Extract<HighlightSegment, { kind: 'text' }>, { readonly kind: 'text'; readonly text: string }>>
export type _EmSegment = Expect<Equal<Extract<HighlightSegment, { kind: 'em' }>, { readonly kind: 'em'; readonly text: string }>>
export type _SegmentUnion = Expect<
  Equal<
    HighlightSegment,
    | { readonly kind: 'text'; readonly text: string }
    | { readonly kind: 'em'; readonly text: string }
  >
>
export type _Kind = Expect<Equal<HighlightSegment['kind'], 'text' | 'em'>>

// —— 参数：片段可选（缺失即回退），也接受普通 `string[]` ——
export type _Parameters = Expect<
  Equal<Parameters<typeof parseHighlight>, [fragments: readonly string[] | undefined, fallback: string]>
>
export type _AcceptsPlainArray = Expect<Equal<string[] extends Parameters<typeof parseHighlight>[0] ? true : false, true>>
export type _AcceptsUndefined = Expect<Equal<undefined extends Parameters<typeof parseHighlight>[0] ? true : false, true>>

// —— 回退语义：返回值恒为分段数组，不含 `undefined` / 空联合 ——
export type _Return = Expect<Equal<ReturnType<typeof parseHighlight>, HighlightSegment[]>>
export type _NeverUndefined = Expect<Equal<ReturnType<typeof parseHighlight> extends readonly HighlightSegment[] ? true : false, true>>
export type _NoNull = Expect<Equal<null extends ReturnType<typeof parseHighlight> ? true : false, false>>
export type _NoUndefinedReturn = Expect<Equal<undefined extends ReturnType<typeof parseHighlight> ? true : false, false>>
