<template>
  <!--
    联想下拉在卡片外展开：Vuetify 的 `.v-card` 自带 `overflow: hidden`，
    会把 `top-full` 的 listbox 裁到卡片底部；`overflow-visible` 解除裁切。
    卡片同时抬到筛选条之上（两者都是 `z-index: 0` 的 v-card，DOM 靠后的
    筛选条会盖住下拉），保证下拉整体可见且可点击。
  -->
  <v-card
    class="relative z-20 overflow-visible rounded-xl border border-outline bg-surface p-4"
    role="search"
    variant="flat"
  >
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start">
      <!--
        受控输入：本地 `draft` 只负责「正在输入」，提交后的关键词以 URL 为准。
        联想下拉（#11）绝对定位在输入框下方，不撑开布局；组合事件与焦点事件挂在
        外层容器上，不依赖 Vuetify 组件内部的事件转发。
      -->
      <div
        ref="searchRoot"
        class="relative min-w-0 flex-1"
        @compositionend="onCompositionEnd"
        @compositionstart="onCompositionStart"
        @focusin="onFocusIn"
        @focusout="onFocusOut"
      >
        <v-text-field
          id="product-search"
          :aria-activedescendant="activeOptionId"
          :aria-controls="SUGGESTION_LISTBOX_ID"
          :aria-expanded="isOpen ? 'true' : 'false'"
          :error-messages="tooLong ? `关键词最多 ${KEYWORD_MAX_LENGTH} 个字符` : []"
          :model-value="draft"
          aria-autocomplete="list"
          class="min-w-0 flex-1"
          density="comfortable"
          hide-details="auto"
          label="搜索商品"
          name="keyword"
          placeholder="商品名、品牌或型号"
          prepend-inner-icon="mdi-magnify"
          role="combobox"
          variant="outlined"
          @keydown="onKeydown"
          @update:model-value="onDraftChange"
        >
          <template #append-inner>
            <v-btn
              v-if="showClear"
              aria-label="清空关键词"
              icon="mdi-close"
              size="small"
              title="清空关键词"
              variant="text"
              @click="onClear"
            />
          </template>
        </v-text-field>

        <!--
          条目只展示名称与品牌；命中片段由 `HighlightedText` 解析（#12），
          `role="option"` 与 `aria-selected` 让 ↑↓ 高亮对辅助技术可见。
        -->
        <!--
          窄屏（<640px）搜索按钮在输入框下方，弹层要越过按钮再展开，否则会盖住提交入口；
          `top-[calc(100%+3.5rem)]` = 12px 行间距 + 44px 大按钮高度，`sm:` 起恢复贴输入框。
        -->
        <v-list
          v-if="isOpen"
          :id="SUGGESTION_LISTBOX_ID"
          aria-label="商品联想"
          class="absolute left-0 right-0 top-[calc(100%+3.5rem)] z-50 mt-1 overflow-hidden rounded-xl border border-outline bg-surface py-1 shadow-lg sm:top-full"
          density="compact"
          role="listbox"
          tabindex="-1"
        >
          <v-list-item
            v-for="(item, index) in items"
            :id="optionId(index)"
            :key="item.slug"
            :aria-selected="index === activeIndex ? 'true' : 'false'"
            :class="index === activeIndex ? 'bg-primary/10 text-primary' : ''"
            class="cursor-pointer text-sm"
            density="compact"
            role="option"
            tabindex="-1"
            @click="onSelectSuggestion(item)"
            @mousedown.prevent
          >
            <span class="font-medium">
              <HighlightedText :fallback="item.name" :fragments="item.highlight?.name" />
            </span>
            <span class="ml-2 opacity-70">
              <HighlightedText :fallback="item.brand" :fragments="item.highlight?.brand" />
            </span>
          </v-list-item>
        </v-list>
      </div>

      <v-btn
        :disabled="tooLong"
        color="primary"
        size="large"
        variant="flat"
        @click="submitDraft"
      >
        搜索
      </v-btn>
    </div>
  </v-card>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import HighlightedText from '@/components/HighlightedText.vue'
  import { useProductSuggestions } from '@/composables/useProductSuggestions'
  import type { ProductSuggestionItem } from '@/composables/useProductSuggestions'
  import { KEYWORD_MAX_LENGTH, keywordLength } from '@/utils/list-query'

  const props = defineProps<{
    /** URL 中已提交的关键词；`null` 表示普通浏览。 */
    keyword: string | null
  }>()

  /** 提交一个已 `trim` 的关键词；`null` 表示空提交或点「×」清除。 */
  const emit = defineEmits<{
    submit: [keyword: string | null]
    /** 选中联想项后直达详情：`/product/{slug}`，由页面负责 `router.push`（#11）。 */
    select: [slug: string]
  }>()

  /** 输入框本地状态：从 URL 初始化，并在浏览器前进 / 后退时跟随 URL。 */
  const draft = ref(props.keyword ?? '')

  const route = useRoute()

  /**
   * URL 关键词变化（提交、前进 / 后退）：先取消联想并清空旧条目与高亮，再同步输入框。
   * 只同步 `draft` 会让上一轮的 `items / activeIndex` 残留，返回后按 Enter 会命中旧条目。
   */
  watch(() => props.keyword, (keyword) => {
    dismissSuggestions()
    draft.value = keyword ?? ''
  })

  /**
   * 整条路由变化（push / replace / popstate）同样要收掉联想：同关键词下只改筛选或
   * 页码时 `props.keyword` 不变，上面那个 watcher 不会触发，旧条目与高亮会带到下一次
   * Enter。这里以 `fullPath` 为信号，取消待发 / 在途请求、清空条目并把高亮置 -1，
   * 同时把输入框对齐 URL。用户打字不改变路由，因此不会被误触发。
   * `flush: 'post'` 保证读到父级按新路由算出的 `props.keyword`。
   */
  watch(() => route.fullPath, () => {
    dismissSuggestions()
    draft.value = props.keyword ?? ''
  }, { flush: 'post' })

  /** 中文输入法组合期间按 Enter / 方向键不驱动提交或联想；失焦（blur）也不提交。 */
  const composing = ref(false)

  /** 搜索框（含清空按钮）是否处于焦点内，联想只在有焦点时触发。 */
  const focused = ref(false)

  const searchRoot = ref<HTMLElement | null>(null)

  const {
    items,
    isOpen,
    close: closeSuggestions,
    schedule: scheduleSuggestions,
  } = useProductSuggestions()

  /** ↑↓ 当前高亮项下标；`-1` 表示没有选中项。 */
  const activeIndex = ref(-1)

  /** 每次拿到新条目都清掉旧高亮，避免高亮指向上一轮的条目。 */
  watch(items, () => {
    activeIndex.value = -1
  })

  const tooLong = computed(() => keywordLength(draft.value.trim()) > KEYWORD_MAX_LENGTH)

  const showClear = computed(() => draft.value.length > 0 || props.keyword !== null)

  const SUGGESTION_LISTBOX_ID = 'product-suggestion-listbox'

  function optionId(index: number): string {
    return `product-suggestion-option-${index}`
  }

  const activeOptionId = computed(() =>
    isOpen.value && activeIndex.value >= 0 ? optionId(activeIndex.value) : undefined,
  )

  /** 关闭下拉并取消待发 / 在途请求：Esc、清空、提交、跳页、点击外部共用。 */
  function dismissSuggestions(): void {
    closeSuggestions()
    activeIndex.value = -1
  }

  /**
   * 触发条件：搜索框有焦点 + 输入法组合已结束 + `trim` 后长度 1–100。
   * 不满足时不发请求，并把已排队的请求一起取消。
   */
  function refreshSuggestions(): void {
    const query = draft.value.trim()
    const length = keywordLength(query)
    if (
      !focused.value ||
      composing.value ||
      length === 0 ||
      length > KEYWORD_MAX_LENGTH
    ) {
      dismissSuggestions()
      return
    }
    scheduleSuggestions(query)
  }

  /** 用户输入：先同步本地值，再（防抖后）请求联想。 */
  function onDraftChange(value: string | null): void {
    draft.value = value ?? ''
    refreshSuggestions()
  }

  function onFocusIn(): void {
    focused.value = true
    refreshSuggestions()
  }

  function onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget
    if (next instanceof Node && searchRoot.value?.contains(next)) {
      return
    }
    focused.value = false
    dismissSuggestions()
  }

  function onCompositionStart(): void {
    composing.value = true
    // 组合期间发出的联想请求不可信，直接取消（不发、也不等旧响应）。
    dismissSuggestions()
  }

  function onCompositionEnd(): void {
    composing.value = false
    refreshSuggestions()
  }

  function onKeydown(event: KeyboardEvent): void {
    // 只处理输入框自身的按键；清空按钮等其它控件上的 Enter 不触发提交。
    if (!(event.target instanceof HTMLInputElement)) {
      return
    }
    // `isComposing`（Chrome / Firefox）与 keyCode 229（Safari 组合结束键）双保险。
    if (composing.value || event.isComposing || event.keyCode === 229) {
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveActive(1)
        return
      case 'ArrowUp':
        event.preventDefault()
        moveActive(-1)
        return
      case 'Escape':
        // 无条件取消：请求在途时 `isOpen` 仍为 false，不能只在下拉展开时处理。
        event.preventDefault()
        dismissSuggestions()
        return
      case 'Enter':
        onKeydownEnter(event)
        return
    }
  }

  /** ↑↓ 在条目间循环移动高亮；未展开或没有条目时不动。 */
  function moveActive(step: number): void {
    const count = items.value.length
    if (!isOpen.value || count === 0) {
      return
    }
    if (activeIndex.value < 0) {
      activeIndex.value = step > 0 ? 0 : count - 1
      return
    }
    activeIndex.value = (activeIndex.value + step + count) % count
  }

  /** 有选中项时直达详情；没有选中项时保持 T5 的「提交整段关键词」。 */
  function onKeydownEnter(event: KeyboardEvent): void {
    event.preventDefault()

    const selected = activeIndex.value >= 0 ? items.value[activeIndex.value] : undefined
    if (isOpen.value && selected) {
      onSelectSuggestion(selected)
      return
    }
    submitDraft()
  }

  /** 点选 / 回车选中：先取消联想（含在途请求），再交给页面跳详情。 */
  function onSelectSuggestion(item: ProductSuggestionItem): void {
    dismissSuggestions()
    emit('select', item.slug)
  }

  /**
   * 提交语义：`trim` 后长度 1–100 才接受；空串按「清除关键词」处理（回到普通浏览），
   * 超长只提示、不提交，URL 与请求都不动。提交即关闭联想并取消待发 / 在途请求。
   */
  function submitDraft(): void {
    dismissSuggestions()
    const accepted = draft.value.trim()
    if (keywordLength(accepted) > KEYWORD_MAX_LENGTH) {
      return
    }
    draft.value = accepted
    emit('submit', accepted.length === 0 ? null : accepted)
  }

  /** 「×」：清空输入并移除 URL 里的关键词（是否真的变化由页面判断）。 */
  function onClear(): void {
    dismissSuggestions()
    draft.value = ''
    emit('submit', null)
  }

  /** 点击外部关闭：用捕获阶段的 pointerdown / click，点在页面空白处也生效。 */
  function onDocumentOutsideInteraction(event: Event): void {
    const target = event.target
    if (target instanceof Node && searchRoot.value?.contains(target)) {
      return
    }
    dismissSuggestions()
  }

  /** 下拉展开时才挂文档监听，关闭即摘掉，避免整页点击被无谓拦截。 */
  watch(isOpen, (open) => {
    if (open) {
      document.addEventListener('pointerdown', onDocumentOutsideInteraction, true)
      document.addEventListener('click', onDocumentOutsideInteraction, true)
      return
    }
    document.removeEventListener('pointerdown', onDocumentOutsideInteraction, true)
    document.removeEventListener('click', onDocumentOutsideInteraction, true)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocumentOutsideInteraction, true)
    document.removeEventListener('click', onDocumentOutsideInteraction, true)
  })
</script>
