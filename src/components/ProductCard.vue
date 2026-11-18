<template>
  <v-card
    :to="{ name: 'product', params: { slug: item.slug } }"
    class="flex h-full flex-col overflow-hidden rounded-xl border border-outline bg-surface transition-colors hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    variant="flat"
  >
    <div class="relative shrink-0">
      <v-img
        :alt="item.coverImage.alt"
        :class="item.soldOut ? 'opacity-60 grayscale' : ''"
        :src="item.coverImage.path"
        aspect-ratio="1"
        class="block"
        cover
      />
      <span
        v-if="item.soldOut"
        class="absolute right-3 top-3 rounded-full bg-slate-900/85 px-2.5 py-1 text-xs font-semibold text-white"
      >售罄</span>
    </div>

    <div class="flex grow flex-col gap-2 p-4">
      <!-- 不使用 line-clamp / text-overflow：长名称在 390 / 768 / 1365 下换行显示完整。 -->
      <!-- 名称 / 品牌 / 型号按命中片段渲染，只有成对 `<em>` 变成强调（#12）。 -->
      <h2 class="break-words text-base leading-snug font-medium">
        <HighlightedText :fallback="item.name" :fragments="item.highlight?.name" />
      </h2>
      <p class="text-sm opacity-70">
        <HighlightedText :fallback="item.brand" :fragments="item.highlight?.brand" />
        <span aria-hidden="true"> · </span>
        <HighlightedText :fallback="item.model" :fragments="item.highlight?.model" />
      </p>

      <div class="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-1 pt-1">
        <span class="text-lg font-semibold text-primary">{{ formatPriceCents(item.displayPriceCents) }}</span>
        <span
          v-if="showOriginalPrice"
          class="text-sm line-through opacity-60"
        >{{ formatPriceCents(item.displayOriginalPriceCents) }}</span>
      </div>

      <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-70">
        <span>销量 {{ item.sales }}</span>
        <span>评分 {{ item.rating.toFixed(1) }}</span>
        <span>{{ item.category.name }}</span>
      </p>
    </div>
  </v-card>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import HighlightedText from '@/components/HighlightedText.vue'
  import type { components } from '@/api/schema'
  import { formatPriceCents, shouldShowOriginalPrice } from '@/utils/price'

  type ProductSearchListItem = components['schemas']['ProductSearchListItem']

  /**
   * 整卡是语义化链接：`v-card` 的 `to` 渲染成 `<a href="/product/{slug}">`，
   * 点击任意位置、键盘 Tab 聚焦后回车都能进入详情；售罄只做视觉标记，不拦截（#8）。
   */
  const props = defineProps<{ item: ProductSearchListItem }>()

  /** 划线原价由纯函数判定（`#8`），卡片只决定是否渲染。 */
  const showOriginalPrice = computed(() =>
    shouldShowOriginalPrice(props.item.displayPriceCents, props.item.displayOriginalPriceCents),
  )
</script>
