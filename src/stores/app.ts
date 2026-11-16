import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    visits: 0,
  }),
  actions: {
    increment () {
      this.visits += 1
    },
  },
})
