<template>
  <nav
    ref="navElement"
    aria-label="主导航"
    class="floating-nav"
    :data-expanded="expanded ? 'true' : 'false'"
    data-state="floating-nav"
  >
    <!-- 收起态：站名 + 当前页 + 展开按钮（D106） -->
    <div v-if="!expanded" class="floating-nav__bar" data-state="nav-bar">
      <span class="floating-nav__brand">{{ SITE_NAME }}</span>
      <span class="floating-nav__page" data-state="nav-page">{{ pageLabel }}</span>
      <v-btn
        ref="collapsedToggle"
        aria-expanded="false"
        aria-label="展开导航"
        class="floating-nav__toggle"
        data-state="nav-toggle"
        density="comfortable"
        icon
        size="small"
        variant="text"
        @click="toggleExpanded"
      >
        <v-icon icon="mdi-menu" />
      </v-btn>
    </div>

    <!--
      展开态：同一行内换成三项 + 收起按钮（D107）。
      岛高度保持不变，展开不会向下遮住搜索控件或购物车摘要；390 下允许换行兜底。
    -->
    <Transition :css="false" @enter="onPanelEnter" @leave="onPanelLeave">
      <div
        v-if="expanded"
        :id="panelId"
        class="floating-nav__panel"
        data-state="nav-panel"
      >
        <v-btn
          ref="homeItemRef"
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
          :aria-label="themeAriaLabel"
          data-state="nav-item-theme"
          size="small"
          variant="text"
          @click="toggleTheme"
        >
          <v-icon :icon="themeIcon" size="16" start />
          切换主题
        </v-btn>
        <v-btn
          ref="expandedToggle"
          :aria-controls="panelId"
          aria-expanded="true"
          aria-label="收起导航"
          class="floating-nav__toggle"
          data-state="nav-toggle"
          density="comfortable"
          icon
          size="small"
          variant="text"
          @click="toggleExpanded"
        >
          <v-icon icon="mdi-close" />
        </v-btn>
      </div>
    </Transition>
  </nav>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { SITE_NAME } from '@/theme'
  import { useCartPanelStore } from '@/stores/cart-panel'
  import { useThemePreference } from '@/composables/useThemePreference'
  import { allowsMotion, gsap } from '@/plugins/motion'

  /**
   * 灵动岛导航（D106–D108）：顶替原 AppHeader。收起态显示站名、当前页与展开按钮；
   * 展开态在同一行内换成商品列表、购物车、切换主题与收起按钮，岛高度不变。
   * 当前页文案固定为「商品列表」/「商品详情」，不从详情页同步商品名。
   *
   * 能力缺口（AGENTS「组件库样式与验收」）：Vuetify 4.3.3 没有浮动岛 / 玻璃导航组件，
   * 容器用原生 `<nav>`（语义与焦点顺序）承载，控件本体仍是 Vuetify `VBtn` / `VIcon`；
   * 玻璃只用项目主题色派生样式，浅暗对比、无模糊可读与真实命中由 P7-NAV 覆盖。
   */
  const route = useRoute()
  const cartPanel = useCartPanelStore()
  const { current, toggle: toggleThemePreference } = useThemePreference()

  const expanded = ref(false)
  const navElement = ref<HTMLElement | null>(null)
  /** 收起 / 展开是两个互斥按钮，分开持有 ref，避免离场元素卸载时清空同一个 ref。 */
  const collapsedToggle = ref<{ $el?: HTMLElement } | null>(null)
  const expandedToggle = ref<{ $el?: HTMLElement } | null>(null)
  const homeItemRef = ref<{ $el?: HTMLElement } | null>(null)
  const panelId = `${useId()}-panel`

  const pageLabel = computed(() => (route.name === 'product' ? '商品详情' : '商品列表'))
  const themeIcon = computed(() => (current.value === 'dark' ? 'mdi-weather-sunny' : 'mdi-weather-night'))
  const themeAriaLabel = computed(() =>
    current.value === 'dark' ? '切换到浅色主题' : '切换到暗色主题',
  )

  function focusToggle(): void {
    const toggle = expanded.value ? expandedToggle : collapsedToggle
    void nextTick(() => toggle.value?.$el?.focus({ preventScroll: true }))
  }

  /**
   * 展开后焦点落在第一个导航项（DOM 顺序在收起按钮之前），Tab 才会按自然顺序走完三项；
   * 收起后回到收起态展开按钮（D108）。
   *
   * 被点击的收起态按钮会在同一轮 patch 里卸载，浏览器可能把焦点丢回 body；
   * 下一帧再确认一次，普通与减弱动态走同一条路径。
   */
  function focusFirstItem(): void {
    void nextTick(() => {
      const element = homeItemRef.value?.$el ??
        navElement.value?.querySelector<HTMLElement>('[data-state="nav-item-home"]') ?? null
      if (element === null) {
        return
      }
      element.focus({ preventScroll: true })
      requestAnimationFrame(() => {
        if (document.activeElement !== element) {
          element.focus({ preventScroll: true })
        }
      })
    })
  }

  function toggleExpanded(): void {
    const next = !expanded.value
    expanded.value = next
    if (next) {
      focusFirstItem()
      return
    }
    focusToggle()
  }

  function closePanel(): void {
    if (!expanded.value) {
      return
    }
    expanded.value = false
    focusToggle()
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

  /**
   * Esc 收起并回焦（D108）。搜索框 / 文本域内的 Esc 只归该控件处理，事件冒泡到 window
   * 时不能再把岛一起收起（独立复审 Spec 2）。
   */
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return
    }
    const target = event.target
    if (target instanceof HTMLElement) {
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
        return
      }
    }
    event.preventDefault()
    closePanel()
  }

  /** 展开 / 收起（D109）：开 220ms、关 160ms，只动 opacity 与 transform。 */
  function onPanelEnter(el: Element, done: () => void): void {
    if (!allowsMotion()) {
      done()
      return
    }
    gsap.fromTo(el, { autoAlpha: 0, x: 8 }, { autoAlpha: 1, x: 0, duration: 0.22, ease: 'power2.out', onComplete: done })
  }

  function onPanelLeave(el: Element, done: () => void): void {
    if (!allowsMotion()) {
      done()
      return
    }
    // 收起期间面板已不可交互，避免退场元素接住点击。
    ;(el as HTMLElement).style.pointerEvents = 'none'
    gsap.to(el, { autoAlpha: 0, x: 8, duration: 0.16, ease: 'power2.in', onComplete: done })
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
    align-items: center;
    padding: 6px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.14);
    border-radius: 999px;
    background: rgba(var(--v-theme-surface), 0.8);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16);
    transform: translateX(-50%);
    /* 无前缀写在最后：构建压缩会保留最后一条，仅留 -webkit- 时 Chrome 计算值为 none。 */
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    backdrop-filter: blur(16px) saturate(140%);
  }

  /* 窄屏左右各留 16px；展开内容允许换行兜底（D107）。 */
  @media (max-width: 599px) {
    .floating-nav {
      right: 16px;
      left: 16px;
      max-width: none;
      flex-wrap: wrap;
      transform: none;
    }
  }

  /* 不支持 backdrop-filter 时提高不透明度，保证无模糊也可读（D108）。 */
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .floating-nav {
      background: rgba(var(--v-theme-surface), 0.96);
    }
  }

  .floating-nav__bar,
  .floating-nav__panel {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .floating-nav__bar {
    padding-left: 12px;
  }

  .floating-nav__panel {
    gap: 2px;
    padding-left: 4px;
  }

  .floating-nav__brand {
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
  }

  .floating-nav__page {
    color: rgb(var(--v-theme-on-surface-muted));
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .floating-nav__toggle {
    margin-left: 2px;
  }

  .floating-nav__item {
    letter-spacing: 0;
    text-transform: none;
  }
</style>
