/**
 * src/composables/useProductRecommendations.ts
 *
 * 相关推荐请求状态机（#20）。
 *
 * 本票的三条硬约束都落在这一层：
 * - 契约上限 4 件：拿到结果后再截断一次，后端多给也不会破版式；
 * - 失败只影响本区块：错误落进 `errorMessage` / `state`，由页面渲染「标题 + 重试」，
 *   不向主内容抛错，也不改主内容状态；
 * - 只重试推荐：`retry` 沿用上一次的 slug，页面不会连带重发详情请求。
 *
 * 请求序号 `latestRequestId` 与 `AbortController` 组成两道闸：切商品 / 卸载时
 * 旧响应即使已 resolve 也不会写回。
 */
import { onBeforeUnmount, ref } from 'vue'
import type { Ref } from 'vue'
import { ApiError, listRecommendations } from '@/api/client'
import type { components } from '@/api/schema'

/** 契约上限：相关推荐最多 4 件（票 #20）。 */
export const MAX_RECOMMENDATIONS = 4

export type RecommendationItem = components['schemas']['ProductListItem']

/** `idle` 只出现在没有商品标识时；页面按 `ready` + 非空数组渲染，其它状态各自处理。 */
export type RecommendationsState = 'idle' | 'loading' | 'ready' | 'error'

export interface ProductRecommendations {
  /** 当前商品的推荐条目；失败或空结果时为空数组。 */
  items: Ref<RecommendationItem[]>
  /** 本区块自己的请求状态。 */
  state: Ref<RecommendationsState>
  /** 失败原因（中文，可直接展示）。 */
  errorMessage: Ref<string>
  /** 加载指定商品的推荐；切商品与首次加载都走这里。 */
  load: (slug: string) => Promise<void>
  /** 只重试本区块：沿用上一次请求的商品标识。 */
  retry: () => void
}

function describeRequestError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  return '相关推荐加载失败，请检查网络后重试。'
}

export function useProductRecommendations(): ProductRecommendations {
  const items = ref<RecommendationItem[]>([])
  const state = ref<RecommendationsState>('idle')
  const errorMessage = ref('')

  /** 只允许最新一次请求落盘：切商品 / 重试时旧响应不得写回。 */
  let latestRequestId = 0
  /** 在途请求的真实取消入口。 */
  let inFlight: AbortController | null = null
  /** 上一次请求的商品标识，供 `retry` 复用（不读路由，避免与本区块状态分叉）。 */
  let currentSlug = ''

  function abortInFlight(): void {
    if (inFlight !== null) {
      inFlight.abort()
      inFlight = null
    }
  }

  async function load(slug: string): Promise<void> {
    const requestId = ++latestRequestId
    currentSlug = slug

    // 发新请求前 abort 上一条；旧请求的 catch / finally 会因序号过期直接退出。
    abortInFlight()

    // 先清空：切商品时不把上一件商品的推荐留在新区块里。
    items.value = []
    errorMessage.value = ''

    if (slug === '') {
      state.value = 'idle'
      return
    }

    const controller = new AbortController()
    inFlight = controller
    state.value = 'loading'

    try {
      const data = await listRecommendations(slug, controller.signal)
      if (requestId !== latestRequestId || controller.signal.aborted) {
        return
      }
      items.value = data.items.slice(0, MAX_RECOMMENDATIONS)
      state.value = 'ready'
    } catch (error) {
      // 被 abort 或已过期的响应只是过客：不改本区块状态。
      if (requestId !== latestRequestId || controller.signal.aborted) {
        return
      }
      items.value = []
      errorMessage.value = describeRequestError(error)
      state.value = 'error'
    } finally {
      if (requestId === latestRequestId) {
        inFlight = null
      }
    }
  }

  function retry(): void {
    void load(currentSlug)
  }

  /** 离开详情页：让在途响应过期并断流，迟到的响应不得再写回已卸载页面。 */
  onBeforeUnmount(() => {
    latestRequestId += 1
    abortInFlight()
  })

  return { items, state, errorMessage, load, retry }
}
