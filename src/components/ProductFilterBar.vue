<template>
  <div>
    <!-- 桌面 / 平板横排：类型 chips + 三个下拉 + 清除筛选。 -->
    <v-card
      v-if="!isCompact"
      class="bg-surface rounded-xl border border-outline p-4"
      variant="flat"
    >
      <div class="flex flex-wrap items-center gap-4">
        <ProductFilterControls
          :state="state"
          aria-prefix=""
          class="min-w-0 flex-1"
          id-prefix="filter"
          layout="horizontal"
          @change="onChange"
        />
        <v-btn
          :disabled="!canClear"
          color="primary"
          size="small"
          variant="text"
          @click="onClear"
        >
          清除筛选
        </v-btn>
      </div>
    </v-card>

    <!-- `md`（<840px）以下：筛选收进「筛选」按钮，点开底部抽屉。 -->
    <div v-else class="flex items-center justify-between gap-3">
      <v-btn
        :aria-label="triggerLabel"
        class="rounded-xl"
        color="primary"
        prepend-icon="mdi-filter-variant"
        variant="outlined"
        @click="sheetOpen = true"
      >
        筛选<span v-if="activeFilterCount > 0">（{{ activeFilterCount }}）</span>
      </v-btn>
      <p v-if="hasFilters" class="text-xs opacity-70">已按条件缩小结果</p>
    </div>

    <v-bottom-sheet v-model="sheetOpen" inset :max-width="640">
      <v-card class="max-h-[85vh] rounded-t-xl bg-surface" variant="flat">
        <div class="flex items-center justify-between gap-3 border-b border-outline px-4 py-3">
          <h2 class="text-base font-semibold">筛选</h2>
          <v-btn
            :disabled="!canClear"
            color="primary"
            size="small"
            variant="text"
            @click="onClear"
          >
            清除筛选
          </v-btn>
        </div>

        <div class="filter-sheet__body max-h-[60vh] overflow-y-auto px-4 py-4">
          <ProductFilterControls
            :state="state"
            aria-prefix="抽屉"
            id-prefix="sheet-filter"
            layout="vertical"
            @change="onChange"
          />
        </div>

        <div class="border-t border-outline p-4">
          <v-btn block color="primary" variant="flat" @click="sheetOpen = false">
            完成
          </v-btn>
        </div>
      </v-card>
    </v-bottom-sheet>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { useDisplay } from 'vuetify'
  import { hasActiveFilters } from '@/utils/list-query'
  import type {
    ListFilterSelection,
    ListQueryState,
  } from '@/utils/list-query'
  import ProductFilterControls from '@/components/ProductFilterControls.vue'

  /**
   * `canClear` 由页面给出：解析后的筛选非默认，或原始 URL 里存在筛选 key（含非法值）。
   * 非法筛选解析后可能全是默认值，只看 `state` 会把「清除筛选」误禁用（#4）。
   */
  const props = defineProps<{ state: ListQueryState, canClear: boolean }>()

  const emit = defineEmits<{
    change: [selection: ListFilterSelection]
    clear: []
  }>()

  const display = useDisplay()

  /** 与 Tailwind 的 `md`（840px）对齐：xs / sm 用底部抽屉。 */
  const isCompact = computed(() => display.smAndDown.value)

  const sheetOpen = ref(false)

  const hasFilters = computed(() => hasActiveFilters(props.state))

  const activeFilterCount = computed(() => {
    const { category, priceMinCents, priceMaxCents, minSales } = props.state
    return Number(category !== null) +
      Number(priceMinCents !== null || priceMaxCents !== null) +
      Number(minSales !== null)
  })

  const triggerLabel = computed(() =>
    activeFilterCount.value > 0 ? `筛选，已选 ${activeFilterCount.value} 项` : '筛选',
  )

  function onChange(selection: ListFilterSelection): void {
    emit('change', selection)
  }

  function onClear(): void {
    emit('clear')
  }
</script>

<style scoped>
  /*
   * R27-C：只给筛选抽屉内容区上主题色，滚动仍由浏览器原生处理；
   * 不设置 scrollbar-width / gutter，保持默认宽度与滚动范围。
   */
  .filter-sheet__body {
    scrollbar-color:
      rgba(var(--v-theme-on-surface), 0.55)
      rgba(var(--v-theme-on-surface), 0.08);
    forced-color-adjust: auto;
  }
</style>
