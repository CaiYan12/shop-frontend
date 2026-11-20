/**
 * src/stores/cart-panel.ts
 *
 * 购物车面板的开关态（#21 的状态接缝，#22 落地面板与焦点归还）。
 *
 * 应用外壳与详情页共用同一个 Pinia 实例，谁都可以读 `panelOpen`、调
 * `openPanel` / `closePanel`。面板本身挂在应用外壳层（`App.vue`），关闭后
 * 把焦点还给**打开它的那个元素**，所以 `openPanel` 顺手记下触发元素。
 */
import { defineStore } from 'pinia'
import { markRaw } from 'vue'

/** 面板开关态；不持久化，刷新即回到关闭。 */
export interface CartPanelState {
  /** 面板是否展开；`CartPanel.vue` 读取它决定显示。 */
  panelOpen: boolean
  /**
   * 打开面板的触发元素（摘要入口、「查看购物车」等）；关闭时焦点回到这里。
   *
   * 用 `markRaw` 存原始 DOM 节点：HTMLElement 不需要响应式代理，Proxy 包一层
   * 反而会让 `focus()` / `isConnected` 这类原生访问多绕一步。元素被路由卸载后
   * 由面板侧用 `isConnected` 判断，不会把焦点送回已移除的节点。
   */
  triggerElement: HTMLElement | null
}

export const useCartPanelStore = defineStore('cart-panel', {
  state: (): CartPanelState => ({
    panelOpen: false,
    triggerElement: null,
  }),
  actions: {
    /**
     * 打开面板（摘要入口与「查看购物车」共用）。
     *
     * 传触发元素时以它为准；不传时退回 `document.activeElement`——键盘用户在
     * 摘要按钮上按 Enter / Space 时焦点就在那里，等价于显式传入。
     */
    openPanel (trigger?: HTMLElement | null): void {
      const active = typeof document === 'undefined' ? null : document.activeElement
      const element = trigger ?? (active instanceof HTMLElement ? active : null)
      this.triggerElement = element === null ? null : markRaw(element)
      this.panelOpen = true
    },
    /** 关闭面板（关闭按钮、Esc、遮罩与路由变化共用）。 */
    closePanel (): void {
      this.panelOpen = false
    },
  },
})
