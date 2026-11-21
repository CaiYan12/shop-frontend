<template>
  <Teleport to="body">
    <Transition name="cart-panel">
      <div
        v-if="cartPanel.panelOpen"
        :class="[isCompact ? 'items-end cart-panel--compact' : 'justify-end', 'fixed inset-0 z-[2000] flex']"
        data-state="cart-panel-layer"
      >
        <!-- 遮罩：点击关闭；`aria-hidden` 是纯装饰层，关闭的无障碍入口在面板内。 -->
        <div
          aria-hidden="true"
          class="absolute inset-0 bg-black/40"
          data-state="cart-panel-scrim"
          @click="requestClose"
        />

        <section
          :id="PANEL_ID"
          ref="panelElement"
          :aria-labelledby="titleId"
          aria-modal="true"
          :class="[
            'cart-panel__panel relative flex flex-col overflow-hidden bg-surface',
            isCompact
              ? 'max-h-[80vh] w-full rounded-t-xl border-t border-outline'
              : 'h-dvh w-[380px] border-l border-outline',
          ]"
          data-state="cart-panel"
          role="dialog"
          tabindex="-1"
        >
          <header class="flex items-start justify-between gap-3 border-b border-outline px-4 py-3">
            <div class="min-w-0">
              <h2 :id="titleId" class="text-base font-semibold">购物车</h2>
              <p class="text-xs text-muted" data-state="cart-panel-count">
                共 {{ cart.totalQuantity }} 件
              </p>
            </div>
            <button
              :aria-label="'关闭购物车面板'"
              class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-outline focus-ring hover:border-primary"
              data-state="cart-panel-close"
              type="button"
              @click="requestClose"
            >
              <v-icon icon="mdi-close" size="18" />
            </button>
          </header>

          <!-- 空车：空态说明 + 就地关闭入口，避免只有小叉可以退出。 -->
          <div
            v-if="cart.items.length === 0"
            class="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center"
            data-state="cart-panel-empty"
          >
            <p class="text-sm font-medium">购物车还是空的</p>
            <p class="text-xs text-muted">把想要的规格加入购物车后，会在这里逐行列出。</p>
            <button
              class="mt-2 inline-flex h-10 items-center justify-center rounded-lg border border-outline px-4 text-sm focus-ring hover:border-primary"
              data-state="cart-panel-empty-close"
              type="button"
              @click="requestClose"
            >
              关闭
            </button>
          </div>

          <!--
            面板行：名称、单价、数量（复用详情页的 `QuantityInput` 与同一套规则）、
            小计、删除。数量只在文本**合法**时即时写回 store，非法文本留给行内提示，
            不截断、不猜值。删除直接生效，不二次确认。
          -->
          <ul
            v-else
            class="cart-panel__items min-h-0 flex-1 divide-y divide-outline overflow-y-auto overscroll-contain"
            data-state="cart-panel-items"
          >
            <li
              v-for="(item, index) in cart.items"
              :key="item.sku"
              :data-sku="item.sku"
              class="flex flex-col gap-3 px-4 py-4"
              data-state="cart-panel-row"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p :id="rowNameId(index)" class="break-words text-sm font-medium">{{ item.name }}</p>
                  <p class="mt-0.5 text-xs text-muted tabular-nums">
                    单价 {{ formatPriceCents(item.unitPriceCents) }}
                  </p>
                </div>
                <button
                  :aria-label="`删除 ${item.name}`"
                  :disabled="cart.readonly"
                  class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border focus-ring border-outline text-muted hover:text-error disabled:cursor-not-allowed disabled:opacity-40"
                  data-state="cart-panel-remove"
                  type="button"
                  @click="removeItem(item)"
                >
                  <v-icon icon="mdi-delete-outline" size="18" />
                </button>
              </div>

              <div :aria-labelledby="rowNameId(index)" class="flex items-end justify-between gap-3" role="group">
                <QuantityInput
                  :disabled="cart.readonly"
                  :limit="limitOf(item)"
                  :model-value="drafts[item.sku] ?? String(item.quantity)"
                  @update:model-value="value => onDraftInput(item, value)"
                />
                <p class="pb-1 text-sm tabular-nums" data-state="cart-panel-subtotal">
                  小计 {{ formatPriceCents(item.unitPriceCents * item.quantity) }}
                </p>
              </div>

              <p
                v-if="rowErrors[item.sku]"
                class="text-xs text-error"
                data-state="cart-panel-row-error"
                role="alert"
              >
                {{ rowErrors[item.sku] }}
              </p>
            </li>
          </ul>

          <!-- 底部只显示合计：本阶段不提供清空购物车与结算入口。 -->
          <footer class="shrink-0 border-t border-outline px-4 py-3">
            <div class="flex items-baseline justify-between gap-3">
              <p class="text-sm text-muted">合计</p>
              <p class="text-lg font-semibold tabular-nums" data-state="cart-panel-total">
                {{ formatPriceCents(cart.totalAmountCents) }}
              </p>
            </div>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import QuantityInput from '@/components/QuantityInput.vue'
  import { resolveQuantityLimit, useCartStore } from '@/stores/cart'
  import type { CartItem } from '@/stores/cart'
  import { useCartPanelStore } from '@/stores/cart-panel'
  import { formatPriceCents } from '@/utils/price'
  import { resolveQuantityInput } from '@/utils/quantity'

  /**
   * 购物车面板（#22）：挂在应用外壳层的模态抽屉。
   *
   * - 桌面（≥1145px）为右侧抽屉（约 380px），小屏为底部抽屉（≤80vh，内容区独立滚动，
   *   打开时锁背景滚动）；
   * - 关闭方式：关闭按钮、Esc、点击遮罩；关闭后焦点回到打开它的元素；
   * - 路由**路径**变化时关闭；查询参数变化（筛选 / 排序 / 翻页）不关闭。
   *
   * 断点与 Tailwind / Vuetify 的 `lg` 同源（1145px），不另立一套数字。
   */
  const MOBILE_BREAKPOINT = 1145
  const PANEL_ID = 'cart-panel'
  const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

  const cart = useCartStore()
  const cartPanel = useCartPanelStore()
  const route = useRoute()
  const display = useDisplay()

  const titleId = `${useId()}-title`
  const panelElement = ref<HTMLElement | null>(null)
  /** 每行的数量文本；允许输入过程为空，只有合法文本才写回 store。 */
  const drafts = ref<Record<string, string>>({})
  /** 写回 store 被拒绝时的行内提示；文本层面的错误由 `QuantityInput` 自己展示。 */
  const rowErrors = ref<Record<string, string>>({})

  const isCompact = computed(() => display.width.value < MOBILE_BREAKPOINT)

  /** 与详情页共用同一口径：`resolveQuantityLimit` = `min(999, 该行库存)`。 */
  function limitOf(item: CartItem): number {
    return resolveQuantityLimit(item.stock)
  }

  function rowNameId(index: number): string {
    return `${titleId}-row-${index}`
  }

  /** 打开面板时把每行文本对齐到 store 当前数量；关闭期间的外部变化不会被旧草稿覆盖。 */
  function syncDrafts(): void {
    const next: Record<string, string> = {}
    for (const item of cart.items) {
      next[item.sku] = String(item.quantity)
    }
    drafts.value = next
    rowErrors.value = {}
  }

  /**
   * 恢复复核结束（`cart.readonly` 由 true 落回 false）：`completeRecovery` 会用复核后的
   * 快照整体替换条目，数量可能已被改写，而面板打开期间不重建草稿（#16 B2）。
   * 只重写仍存在的行，不新增、不删除草稿键；只读期间控件已禁用，不打断进行中的输入。
   */
  function syncDraftsAfterRecovery(): void {
    const next = { ...drafts.value }
    for (const item of cart.items) {
      if (item.sku in next) {
        next[item.sku] = String(item.quantity)
      }
    }
    drafts.value = next
  }

  /** 文本变化：合法就即时写回，非法保持原样，由行内提示解释原因。 */
  function onDraftInput(item: CartItem, value: string): void {
    // 核对期间购物车只读（#23）：控件已禁用，这里再兜一层防御。
    if (cart.readonly) {
      return
    }
    drafts.value[item.sku] = value
    const parsed = resolveQuantityInput(value, limitOf(item))
    if (!parsed.valid || parsed.value === null) {
      return
    }
    rowErrors.value[item.sku] = ''
    if (parsed.value === item.quantity) {
      return
    }
    const result = cart.updateQuantity(item.sku, parsed.value)
    if (!result.ok) {
      rowErrors.value[item.sku] = result.message
    }
  }

  /** 删除整行；被删按钮若持有焦点，焦点先落到面板容器，避免掉到 body。 */
  function removeItem(item: CartItem): void {
    // 核对期间购物车只读（#23）。
    if (cart.readonly) {
      return
    }
    cart.remove(item.sku)
    const nextDrafts = { ...drafts.value }
    const nextErrors = { ...rowErrors.value }
    delete nextDrafts[item.sku]
    delete nextErrors[item.sku]
    drafts.value = nextDrafts
    rowErrors.value = nextErrors
    void nextTick(() => {
      const active = document.activeElement
      if (active === null || active === document.body) {
        focusPanel()
      }
    })
  }

  function requestClose(): void {
    cartPanel.closePanel()
  }

  function focusPanel(): void {
    panelElement.value?.focus({ preventScroll: true })
  }

  /** Esc 关闭；Tab 在面板内循环，模态期间不让焦点跑到被遮罩的页面上。 */
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      requestClose()
      return
    }
    if (event.key !== 'Tab') {
      return
    }
    const panel = panelElement.value
    if (panel === null) {
      return
    }
    const nodes = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (first === undefined || last === undefined) {
      event.preventDefault()
      focusPanel()
      return
    }
    const active = document.activeElement
    const outside = active === null || !panel.contains(active)
    if (event.shiftKey) {
      if (outside || active === first) {
        event.preventDefault()
        last.focus()
      }
      return
    }
    if (outside || active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  let bodyOverflow = ''
  let bodyPaddingRight = ''
  let scrollLocked = false

  /** 小屏底部抽屉打开时锁背景滚动，并补上滚动条宽度避免页面横跳。 */
  function lockBodyScroll(): void {
    if (scrollLocked) {
      return
    }
    bodyOverflow = document.body.style.overflow
    bodyPaddingRight = document.body.style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }
    scrollLocked = true
  }

  function restoreBodyScroll(): void {
    if (!scrollLocked) {
      return
    }
    document.body.style.overflow = bodyOverflow
    document.body.style.paddingRight = bodyPaddingRight
    scrollLocked = false
  }

  /**
   * 关闭后归还焦点：只有焦点仍在面板内（或已掉到 body）时才移动，避免抢走
   * 新页面 / 新对话框已经设置好的焦点。触发元素被卸载时退回摘要入口。
   */
  function restoreFocus(): void {
    const panel = panelElement.value
    const active = document.activeElement
    const focusInside = panel !== null && active !== null && panel.contains(active)
    const focusIdle = active === null || active === document.body
    if (!focusInside && !focusIdle) {
      return
    }
    const trigger = cartPanel.triggerElement
    if (trigger !== null && trigger.isConnected) {
      trigger.focus({ preventScroll: true })
      return
    }
    document.getElementById('cart-summary-trigger')?.focus({ preventScroll: true })
  }

  watch(
    () => cartPanel.panelOpen,
    (open) => {
      if (open) {
        syncDrafts()
        lockBodyScroll()
        window.addEventListener('keydown', onKeydown)
        void nextTick(focusPanel)
        return
      }
      window.removeEventListener('keydown', onKeydown)
      restoreBodyScroll()
      restoreFocus()
    },
  )

  // 恢复复核结束（#23）：只读落回 false 时数量可能已被复核改写，补一次草稿对齐（#16 B2）。
  watch(
    () => cart.readonly,
    (readonly, wasReadonly) => {
      if (!wasReadonly || readonly) {
        return
      }
      syncDraftsAfterRecovery()
    },
  )

  // 只盯路径：筛选 / 排序 / 翻页改的是查询参数，面板保持原状（spec 用户故事 26 / 27）。
  watch(
    () => route.path,
    (path, previous) => {
      if (path === previous) {
        return
      }
      if (cartPanel.panelOpen) {
        requestClose()
      }
    },
  )

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    restoreBodyScroll()
  })
</script>

<style scoped>
  /* 键盘焦点环与详情页同源：Vuetify 主题色 + 2px 实线，不依赖 Tailwind 的 outline 工具类。 */
  .focus-ring:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
  }

  /* 进场：遮罩淡入 + 抽屉滑入；只动 transform / opacity，尊重减少动态效果。 */
  .cart-panel-enter-active,
  .cart-panel-leave-active {
    transition: opacity 180ms ease;
  }

  .cart-panel-enter-active .cart-panel__panel,
  .cart-panel-leave-active .cart-panel__panel {
    transition: transform 180ms ease;
  }

  .cart-panel-enter-from,
  .cart-panel-leave-to {
    opacity: 0;
  }

  .cart-panel-enter-from .cart-panel__panel,
  .cart-panel-leave-to .cart-panel__panel {
    transform: translateX(100%);
  }

  .cart-panel--compact.cart-panel-enter-from .cart-panel__panel,
  .cart-panel--compact.cart-panel-leave-to .cart-panel__panel {
    transform: translateY(100%);
  }

  @media (prefers-reduced-motion: reduce) {
    .cart-panel-enter-active,
    .cart-panel-leave-active,
    .cart-panel-enter-active .cart-panel__panel,
    .cart-panel-leave-active .cart-panel__panel {
      transition: none;
    }

    .cart-panel-enter-from .cart-panel__panel,
    .cart-panel-leave-to .cart-panel__panel {
      transform: none;
    }
  }

  /*
   * R27-C：只给内部列表上主题色，沿用浏览器原生滚动条与滚动行为；
   * 不设置 scrollbar-width / gutter，宽度与滚动范围保持浏览器默认。
   * forced-color-adjust: auto 让 Windows 强制色模式仍可接管。
   */
  .cart-panel__items {
    scrollbar-color:
      rgba(var(--v-theme-on-surface), 0.55)
      rgba(var(--v-theme-on-surface), 0.08);
    forced-color-adjust: auto;
  }
</style>
