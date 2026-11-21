/**
 * 相关推荐 composable 的类型测试（编译期，无运行时断言）(#20)。
 *
 * 页面只依赖三样东西：推荐条目（最多 4 件）、区块状态、以及「只重试本区块」的入口。
 * 这里钉住它们的外部形状，`pnpm type-check` 通过即代表组件与 composable 契约一致。
 *
 * 不覆盖：请求是否真的按序号与中止控制落盘、空数组是否真的隐藏区块——需要浏览器验收。
 */
import type { Ref } from 'vue'
import type { components } from '@/api/schema'
import {
  MAX_RECOMMENDATIONS,
  useProductRecommendations,
} from '@/composables/useProductRecommendations'
import type { RecommendationsState } from '@/composables/useProductRecommendations'

type RecommendationItem = components['schemas']['ProductListItem']

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

export type _Recommendations = ReturnType<typeof useProductRecommendations>

/** 条目类型来自契约的 `ProductListItem`（推荐接口不含命中高亮）。 */
export type _Items = Expect<Equal<_Recommendations['items'], Ref<RecommendationItem[]>>>

/** 区块状态：加载中 / 就绪 / 失败，页面据此决定隐藏、渲染还是给重试。 */
export type _State = Expect<Equal<_Recommendations['state'], Ref<RecommendationsState>>>

/** 加载：按商品标识取推荐，无返回值。 */
export type _Load = Expect<Equal<_Recommendations['load'], (slug: string) => Promise<void>>>

/** 只重试本区块：不接收参数，不改主内容。 */
export type _Retry = Expect<Equal<_Recommendations['retry'], () => void>>

/** 契约上限为 4 件。 */
export type _Limit = Expect<Equal<typeof MAX_RECOMMENDATIONS, 4>>

export type _Summary = _Items | _State | _Load | _Retry | _Limit
