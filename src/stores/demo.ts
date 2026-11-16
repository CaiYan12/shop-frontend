import { defineStore } from 'pinia'

/**
 * 骨架期的可操作示例 store，用于验证 Pinia 4 已接入。
 * 真实业务 store（cart / products）在 Phase 5、Phase 6 建立。
 */
export const useDemoStore = defineStore('demo', {
  state: () => ({
    clicks: 0,
  }),
  actions: {
    increment () {
      this.clicks += 1
    },
  },
})
