/**
 * src/composables/useProductSuggestions.ts
 *
 * 商品联想请求状态机（#11）。
 *
 * 规格「商品联想」的三条硬约束都落在这一层：
 * - 防抖 250 ms：每次 `schedule` 先取消上一轮待发定时器，只有最后一次落下请求；
 * - 取消规则：关闭 / 清空 / 提交 / 跳页调用 `close`，同时清掉定时器并 `abort` 在途请求；
 * - 旧响应不得重新打开下拉：`AbortController` 负责真实断流，请求序号 `latestSeq`
 *   负责兜住「abort 前已 resolve」的竞态——两者都不依赖调用时机。
 *
 * 失败只影响下拉：`catch` 静默清空并关闭，不向页面抛错（页面错误态归 #13）。
 */
import { onBeforeUnmount, ref } from 'vue'
import type { Ref } from 'vue'
import { fetchProductSuggestions } from '@/api/client'
import type { components } from '@/api/schema'
import { KEYWORD_MAX_LENGTH, keywordLength } from '@/utils/list-query'

/** 一次最多 5 条（票 #11）。 */
export const SUGGESTION_LIMIT = 5

/** 防抖窗口（票 #11）。 */
export const SUGGESTION_DEBOUNCE_MS = 250

export type ProductSuggestionItem = components['schemas']['ProductSuggestionItem']

export interface ProductSuggestions {
  /** 当前查询的联想条目；关闭时为空数组。 */
  items: Ref<ProductSuggestionItem[]>
  /** 下拉是否展开（只有拿到至少 1 条才展开）。 */
  isOpen: Ref<boolean>
  /** 排一次 250 ms 后发出的联想请求；上一次的待发与在途会先被取消。 */
  schedule: (query: string) => void
  /** 关闭下拉并取消待发 / 在途请求（旧的 query 不再产生任何落盘）。 */
  close: () => void
}

export function useProductSuggestions(): ProductSuggestions {
  const items = ref<ProductSuggestionItem[]>([])
  const isOpen = ref(false)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let inFlight: AbortController | null = null
  let latestSeq = 0

  /**
   * 取消「待发」与「在途」，并把序号 +1：即使某个响应赶在 abort 之前已经
   * resolve，它也会因为序号过期而被丢弃，不会重新打开下拉。
   */
  function cancel(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (inFlight !== null) {
      inFlight.abort()
      inFlight = null
    }
    latestSeq += 1
  }

  function close(): void {
    cancel()
    isOpen.value = false
    items.value = []
  }

  async function request(query: string): Promise<void> {
    const seq = ++latestSeq
    const controller = new AbortController()
    inFlight = controller

    try {
      const data = await fetchProductSuggestions(
        { q: query, limit: SUGGESTION_LIMIT },
        controller.signal,
      )
      if (seq !== latestSeq) {
        return
      }
      items.value = data.items.slice(0, SUGGESTION_LIMIT)
      isOpen.value = items.value.length > 0
    } catch {
      // 联想失败只让下拉不出现：不抛错、不清列表、不写页面错误态。
      if (seq !== latestSeq) {
        return
      }
      items.value = []
      isOpen.value = false
    } finally {
      if (seq === latestSeq) {
        inFlight = null
      }
    }
  }

  function schedule(query: string): void {
    const trimmed = query.trim()
    // 关闭旧下拉，同时取消上一轮待发 / 在途（防抖期间不展示过期条目）。
    close()
    const length = keywordLength(trimmed)
    if (length < 1 || length > KEYWORD_MAX_LENGTH) {
      return
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void request(trimmed)
    }, SUGGESTION_DEBOUNCE_MS)
  }

  // 离开页面（例如选中条目跳详情）时一并取消在途请求。
  onBeforeUnmount(close)

  return { items, isOpen, schedule, close }
}
