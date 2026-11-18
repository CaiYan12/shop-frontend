<template>
  <span>
    <template v-for="(segment, index) in segments" :key="index">
      <!-- 只有 `em` 段生成 `<em>`；文本一律走插值，任何 HTML 都不会被解释。 -->
      <em
        v-if="segment.kind === 'em'"
        class="font-semibold not-italic text-primary"
      >{{ segment.text }}</em>
      <template v-else>{{ segment.text }}</template>
    </template>
  </span>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { parseHighlight } from '@/utils/highlight'

  /**
   * 命中高亮的唯一渲染点（#12）。
   *
   * 卡片与联想共用：解析交给 `parseHighlight`，模板只按分段 `kind` 决定是否
   * 生成 `<em>`，模板之外没有任何 HTML 注入，也不会把数据里的标签当 HTML 解释。
   */
  const props = defineProps<{
    /** 契约给的命中片段；缺失或为空时按 `fallback` 原文渲染。 */
    fragments: string[] | undefined
    /** 字段原文（未命中时的回退内容）。 */
    fallback: string
  }>()

  const segments = computed(() => parseHighlight(props.fragments, props.fallback))
</script>
