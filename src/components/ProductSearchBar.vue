<template>
  <v-card
    class="rounded-xl border border-outline bg-surface p-4"
    role="search"
    variant="flat"
  >
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start">
      <!--
        受控输入：本地 `draft` 只负责「正在输入」，提交后的关键词以 URL 为准。
        `id` / `name` 是原题对表单元素的硬性要求（AGENTS.md「已知约束」）。
      -->
      <v-text-field
        id="product-search"
        v-model="draft"
        :error-messages="tooLong ? `关键词最多 ${KEYWORD_MAX_LENGTH} 个字符` : []"
        class="min-w-0 flex-1"
        density="comfortable"
        hide-details="auto"
        label="搜索商品"
        name="keyword"
        placeholder="商品名、品牌或型号"
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        @compositionend="composing = false"
        @compositionstart="composing = true"
        @keydown.enter="onKeydownEnter"
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
  import { computed, ref, watch } from 'vue'
  import { KEYWORD_MAX_LENGTH } from '@/utils/list-query'

  const props = defineProps<{
    /** URL 中已提交的关键词；`null` 表示普通浏览。 */
    keyword: string | null
  }>()

  /** 提交一个已 `trim` 的关键词；`null` 表示空提交或点「×」清除。 */
  const emit = defineEmits<{ submit: [keyword: string | null] }>()

  /** 输入框本地状态：从 URL 初始化，并在浏览器前进 / 后退时跟随 URL。 */
  const draft = ref(props.keyword ?? '')

  watch(() => props.keyword, (keyword) => {
    draft.value = keyword ?? ''
  })

  /** 中文输入法组合期间按 Enter 不提交；失焦（blur）也不提交。 */
  const composing = ref(false)

  const tooLong = computed(() => draft.value.trim().length > KEYWORD_MAX_LENGTH)

  const showClear = computed(() => draft.value.length > 0 || props.keyword !== null)

  function onKeydownEnter (event: KeyboardEvent): void {
    // `isComposing`（Chrome / Firefox）与 keyCode 229（Safari 组合结束键）双保险。
    if (composing.value || event.isComposing || event.keyCode === 229) {
      return
    }
    event.preventDefault()
    submitDraft()
  }

  /**
   * 提交语义：`trim` 后长度 1–100 才接受；空串按「清除关键词」处理（回到普通浏览），
   * 超长只提示、不提交，URL 与请求都不动。
   */
  function submitDraft (): void {
    const accepted = draft.value.trim()
    if (accepted.length > KEYWORD_MAX_LENGTH) {
      return
    }
    draft.value = accepted
    emit('submit', accepted.length === 0 ? null : accepted)
  }

  /** 「×」：清空输入并移除 URL 里的关键词（是否真的变化由页面判断）。 */
  function onClear (): void {
    draft.value = ''
    emit('submit', null)
  }
</script>
