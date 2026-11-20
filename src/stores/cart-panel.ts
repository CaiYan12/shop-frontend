/**
 * src/stores/cart-panel.ts
 *
 * 购物车面板的开关态（#21 的状态接缝）。
 *
 * 本票不实现面板本身（#22 负责），只把「详情页成功提示里的『查看购物车』要能
 * 打开面板」这件事先钉成一份最小 UI 状态：应用外壳与详情页共用同一个 Pinia
 * 实例，谁都可以读 `panelOpen`、调 `openPanel` / `closePanel`。
 * 在 #22 落地前，打开后不可见属预期中间态。
 */
import { defineStore } from 'pinia'

/** 面板开关态；不持久化，刷新即回到关闭。 */
export interface CartPanelState {
  /** 面板是否展开；#22 的面板组件读取它决定显示。 */
  panelOpen: boolean
}

export const useCartPanelStore = defineStore('cart-panel', {
  state: (): CartPanelState => ({
    panelOpen: false,
  }),
  actions: {
    /** 打开面板（摘要入口与「查看购物车」共用）。 */
    openPanel (): void {
      this.panelOpen = true
    },
    /** 关闭面板（关闭按钮、Esc、遮罩与路由变化共用，#22 接入）。 */
    closePanel (): void {
      this.panelOpen = false
    },
  },
})
