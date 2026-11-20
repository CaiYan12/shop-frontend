<template>
  <div class="flex flex-col gap-1.5" data-state="quantity">
    <label :for="inputId" class="text-sm text-muted">{{ label }}</label>

    <div class="flex items-stretch gap-2">
      <v-btn
        :aria-label="`减少${label}`"
        :disabled="controlDisabled || minusDisabled"
        class="h-10 w-10"
        data-state="quantity-decrease"
        size="small"
        variant="outlined"
        @click="step(-1)"
      >
        <v-icon icon="mdi-minus" />
      </v-btn>

      <!--
        保留原始文本的文本输入（#21）：不做过失焦归整，空值只在失焦 / 加购时提示；
        `v-model` 存的是用户输入的字符串本身。
      -->
      <input
        :id="inputId"
        ref="inputElement"
        v-model="text"
        :aria-describedby="displayedError === null ? undefined : errorId"
        :aria-invalid="displayedError === null ? undefined : 'true'"
        :disabled="controlDisabled"
        autocomplete="off"
        class="quantity-input h-10 w-16 rounded-lg border border-outline bg-surface px-2 text-center text-base"
        data-state="quantity-input"
        inputmode="numeric"
        type="text"
        @blur="validate"
      >

      <v-btn
        :aria-label="`增加${label}`"
        :disabled="controlDisabled || plusDisabled"
        class="h-10 w-10"
        data-state="quantity-increase"
        size="small"
        variant="outlined"
        @click="step(1)"
      >
        <v-icon icon="mdi-plus" />
      </v-btn>
    </div>

    <p
      v-if="displayedError !== null"
      :id="errorId"
      class="text-xs text-error"
      data-state="quantity-error"
      role="alert"
    >
      {{ displayedError }}
    </p>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, useId, watch } from 'vue'
  import { resolveQuantityInput, stepQuantity } from '@/utils/quantity'

  /**
   * 数量输入（#21）：详情页与购物车面板行共用（spec「数量与加购」）。
   *
   * - `v-model` 是**原始文本**，输入过程可以为空，不在这里做归整；
   * - `limit` 由调用方按 `min(999, 所选组合库存)` 算好传入，上限为 0 表示不可加购；
   * - 失焦或父级显式调用 `validate()` 时才显示行内提示；
   * - 加购按钮点击前由父级调用 `validate()`，不通过就不触发加购。
   */
  const props = withDefaults(
    defineProps<{
      /** 数量上限（`min(999, 所选组合库存)`）；<= 0 时整个控件禁用。 */
      limit: number
      /** 无障碍标签；默认「数量」。 */
      label?: string
      /** 规格未选齐 / 组合缺货时由父级禁用。 */
      disabled?: boolean
    }>(),
    { label: '数量', disabled: false },
  )

  const text = defineModel<string>({ required: true })

  const inputId = useId()
  const errorId = `${inputId}-error`
  const inputElement = ref<HTMLInputElement | null>(null)
  const errorVisible = ref(false)

  const resolvedLimit = computed(() =>
    Number.isFinite(props.limit) ? Math.max(0, Math.floor(props.limit)) : 0,
  )
  const state = computed(() => resolveQuantityInput(text.value, resolvedLimit.value))
  const displayedError = computed(() => (errorVisible.value ? state.value.error : null))
  const controlDisabled = computed(() => props.disabled || resolvedLimit.value < 1)
  const minusDisabled = computed(() => state.value.valid && state.value.value === 1)
  const plusDisabled = computed(() => state.value.valid && state.value.value === resolvedLimit.value)

  /** 父级在加购前调用：不合法则亮出行内提示并返回 `false`。 */
  function validate(): boolean {
    if (state.value.valid) {
      errorVisible.value = false
      return true
    }
    errorVisible.value = true
    return false
  }

  /** 加购成功或切换商品后清掉旧提示。 */
  function resetError(): void {
    errorVisible.value = false
  }

  function focus(): void {
    inputElement.value?.focus()
  }

  function step(delta: 1 | -1): void {
    if (controlDisabled.value) {
      return
    }
    text.value = stepQuantity(text.value, delta, resolvedLimit.value)
    if (errorVisible.value) {
      validate()
    }
  }

  // 控件被禁用（规格回退 / 组合缺货）时收起提示，避免留下过时的红字。
  watch(controlDisabled, (disabled) => {
    if (disabled) {
      resetError()
    }
  })

  defineExpose({ validate, resetError, focus })
</script>

<style scoped>
  .quantity-input {
    font-variant-numeric: tabular-nums;
  }

  .quantity-input:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .quantity-input:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 1px;
  }

  .quantity-input[aria-invalid='true'] {
    border-color: rgb(var(--v-theme-error));
  }
</style>
