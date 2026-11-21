<template>
  <nav
    ref="navElement"
    aria-label="主导航"
    class="floating-nav"
    :data-expanded="expanded ? 'true' : 'false'"
    data-state="floating-nav"
  >
    <div class="floating-nav__bar">
      <span class="floating-nav__brand">{{ SITE_NAME }}</span>
      <span class="floating-nav__page" data-state="nav-page">{{ pageLabel }}</span>
      <v-btn
        ref="toggleElement"
        :aria-controls="panelId"
        :aria-expanded="expanded"
        :aria-label="expanded ? '收起导航' : '展开导航'"
        class="floating-nav__toggle"
        data-state="nav-toggle"
        density="comfortable"
        icon
        size="small"
        variant="text"
        @click="toggleExpanded"
      >
        <v-icon :icon="expanded ? 'mdi-close' : 'mdi-menu'" />
      </v-btn>
    </div>

    <div
      v-show="expanded"
      :id="panelId"
      ref="panelElement"
      class="floating-nav__panel"
      data-state="nav-panel"
    >
      <v-btn
        class="floating-nav__item"
        data-state="nav-item-home"
        size="small"
        to="/"
        variant="text"
        @click="closePanel"
      >
        商品列表
      </v-btn>
      <v-btn
        class="floating-nav__item"
        data-state="nav-item-cart"
        size="small"
        variant="text"
        @click="openCart"
      >
        购物车
      </v-btn>
      <v-btn
        class="floating-nav__item"
        data-state="nav-item-theme"
        size="small"
        variant="text"
        @click="toggleTheme"
      >
        {{ themeLabel }}
      </v-btn>
    </div>
  </nav>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { SITE_NAME } from '@/theme'
  import { useCartPanelStore } from '@/stores/cart-panel'
  import { useThemePreference } from '@/composables/useThemePreference'

  /**
   * 灵动岛导航（D106–D108）：顶替原 AppHeader，收起态只显示站名、当前页与展开按钮；
   * 展开项为商品列表、购物车、切换主题。当前页文案固定为「商品列表」/「商品详情」，
   * 不从详情页同步商品名。
   */
  const route = useRoute()
  const cartPanel = useCartPanelStore()
  const { current, toggle: toggleThemePreference } = useThemePreference()

  const expanded = ref(false)
  const navElement = ref<HTMLElement | null>(null)
  const panelElement = ref<HTMLElement | null>(null)
  const toggleElement = ref<{ $el?: HTMLElement } | null>(null)
  const panelId = `${useId()}-panel`

  const pageLabel = computed(() => (route.name === 'product' ? '商品详情' : '商品列表'))
  const themeLabel = computed(() => (current.value === 'dark' ? '切换主题（当前暗色）' : '切换主题（当前浅色）'))

  function toggleExpanded(): void {
    expanded.value = !expanded.value
  }

  function closePanel(): void {
    expanded.value = false
  }

  function focusToggle(): void {
    void nextTick(() => toggleElement.value?.$el?.focus())
  }

  /** 购物车项只打开既有面板；面板自带焦点陷阱与层级（D108）。 */
  function openCart(): void {
    expanded.value = false
    cartPanel.openPanel()
  }

  function toggleTheme(): void {
    toggleThemePreference()
  }

  /** 点击外部收起；用捕获阶段，避免被页面上的 stopPropagation 吞掉。 */
  function onDocumentPointerDown(event: PointerEvent): void {
    const nav = navElement.value
    if (nav !== null && event.target instanceof Node && nav.contains(event.target)) {
      return
    }
    closePanel()
  }

  /** Esc 收起并回焦展开按钮（D108）。 */
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return
    }
    event.preventDefault()
    closePanel()
    focusToggle()
  }

  watch(expanded, (open) => {
    if (open) {
      document.addEventListener('pointerdown', onDocumentPointerDown, true)
      window.addEventListener('keydown', onKeydown)
      return
    }
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    window.removeEventListener('keydown', onKeydown)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    window.removeEventListener('keydown', onKeydown)
  })
</script>

<style scoped>
  /*
   * 玻璃质感（D108）：半透明 surface + 静态 backdrop-filter，边线用 on-surface 的浅色，
   * 暗色跟随主题变量自动切换。模糊只在静态使用，动画不碰 blur（D109）。
   */
  .floating-nav {
    position: fixed;
    top: 12px;
    left: 50%;
    z-index: 30;
    display: flex;
    max-width: calc(100vw - 32px);
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.14);
    border-radius: 999px;
    background: rgba(var(--v-theme-surface), 0.8);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16);
    transform: translateX(-50%);
    backdrop-filter: blur(16px) saturate(140%);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
  }

  .floating-nav[data-expanded='true'] {
    border-radius: 20px;
  }

  /* 窄屏左右各留 16px，展开内容允许换行（D107）。 */
  @media (max-width: 599px) {
    .floating-nav {
      right: 16px;
      left: 16px;
      max-width: none;
      transform: none;
    }
  }

  /* 不支持 backdrop-filter 时提高不透明度，保证无模糊也可读（D108）。 */
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .floating-nav {
      background: rgba(var(--v-theme-surface), 0.96);
    }
  }

  .floating-nav__bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 12px;
  }

  .floating-nav__brand {
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
  }

  .floating-nav__page {
    color: rgb(var(--v-theme-muted));
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .floating-nav__toggle {
    margin-left: 2px;
  }

  .floating-nav__panel {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding-top: 4px;
    border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  }

  .floating-nav__item {
    letter-spacing: 0;
    text-transform: none;
  }
</style>
