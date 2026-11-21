<template>
  <v-dialog
    :max-width="480"
    :model-value="modelValue"
    @update:model-value="onDialogUpdate"
  >
    <v-card
      :data-phase="phase"
      class="purchase-dialog"
      data-state="purchase-dialog"
    >
      <header class="flex items-start justify-between gap-3 border-b border-outline px-5 py-3">
        <div class="min-w-0">
          <h2 class="text-base font-semibold">模拟购买校验</h2>
          <p class="text-xs text-muted" data-state="purchase-product">{{ productName }}</p>
          <p class="text-xs text-muted" data-state="purchase-variant">{{ variantLabel }}</p>
        </div>
        <v-btn
          aria-label="关闭购买校验"
          data-state="purchase-close"
          icon="$close"
          size="small"
          variant="text"
          @click="requestClose"
        />
      </header>

      <div class="px-5 py-4">
        <!-- 校验中：请求在打开对话框时已经发出（D98）。 -->
        <div
          v-if="phase === 'checking'"
          class="flex items-center gap-3"
          data-state="purchase-checking"
        >
          <v-progress-circular indeterminate size="20" width="2" />
          <p class="text-sm">校验中…</p>
        </div>

        <!-- 可购买：只展示校验结果，不暗示下单（C12 / D102）。 -->
        <div
          v-else-if="phase === 'purchasable' && result !== null"
          class="flex flex-col gap-2"
          data-state="purchase-purchasable"
        >
          <p class="text-sm font-medium text-primary">可购买</p>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt class="text-muted">规格</dt>
            <dd>{{ variantLabel }}</dd>
            <dt class="text-muted">数量</dt>
            <dd data-state="purchase-quantity">{{ result.quantity }} 件</dd>
            <dt class="text-muted">小计</dt>
            <dd class="tabular-nums" data-state="purchase-subtotal">
              {{ formatPriceCents(result.subtotalCents) }}
            </dd>
          </dl>
          <p class="mt-1 text-xs text-muted" data-state="purchase-notice">
            模拟校验完成：本次不会生成订单，也不影响库存与购物车。
          </p>
        </div>

        <!-- 库存不足：以响应库存为准；有余量才提供调整数量（D101）。 -->
        <div
          v-else-if="phase === 'insufficient' && result !== null"
          class="flex flex-col gap-2"
          data-state="purchase-insufficient"
        >
          <p class="text-sm font-medium text-error">
            库存不足：仅剩 <span data-state="purchase-stock">{{ result.stock }}</span> 件
          </p>
          <p v-if="result.stock > 0" class="text-xs text-muted">
            把数量改到 {{ result.stock }} 件或更少后再校验。原输入会保留，不会自动改写。
          </p>
          <p v-else class="text-xs text-muted" data-state="purchase-out-of-stock">
            该规格已无库存，请重新选择规格后再试。
          </p>
        </div>

        <!-- 价格变化：并列展示用户看到的价格与当前价格，确认后按新价重校验（D100）。 -->
        <div
          v-else-if="phase === 'price-changed' && result !== null"
          class="flex flex-col gap-2"
          data-state="purchase-price-changed"
        >
          <p class="text-sm font-medium text-warning">价格已变化</p>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt class="text-muted">你看到的价格</dt>
            <dd class="tabular-nums" data-state="purchase-old-price">
              {{ formatPriceCents(confirmedUnitPriceCents) }}
            </dd>
            <dt class="text-muted">当前价格</dt>
            <dd class="tabular-nums" data-state="purchase-new-price">
              {{ formatPriceCents(result.unitPriceCents) }}
            </dd>
          </dl>
          <p class="text-xs text-muted">按当前价格重新校验，通过后仅展示模拟结果，不会生成订单。</p>
        </div>

        <!-- 请求错误：可重试错误复用本次参数；其余引导返回列表或重选规格（D104）。 -->
        <div
          v-else
          class="flex flex-col gap-2"
          data-state="purchase-error"
        >
          <p class="text-sm font-medium text-error">校验未完成</p>
          <p class="text-sm" data-state="purchase-error-text">{{ errorText }}</p>
        </div>
      </div>

      <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-outline px-5 py-3">
        <template v-if="phase === 'checking'">
          <v-btn data-state="purchase-dismiss" variant="text" @click="requestClose">关闭</v-btn>
        </template>

        <template v-else-if="phase === 'purchasable'">
          <v-btn color="primary" data-state="purchase-done" variant="flat" @click="requestClose">
            关闭
          </v-btn>
        </template>

        <template v-else-if="phase === 'insufficient'">
          <v-btn
            v-if="result !== null && result.stock > 0"
            color="primary"
            data-state="purchase-adjust-quantity"
            variant="flat"
            @click="emit('adjustQuantity')"
          >
            调整数量
          </v-btn>
          <v-btn data-state="purchase-dismiss" variant="text" @click="requestClose">关闭</v-btn>
        </template>

        <template v-else-if="phase === 'price-changed'">
          <v-btn data-state="purchase-cancel-price" variant="text" @click="requestClose">取消</v-btn>
          <v-btn
            color="primary"
            data-state="purchase-confirm-price"
            variant="flat"
            @click="confirmNewPrice"
          >
            按新价重新校验
          </v-btn>
        </template>

        <template v-else>
          <v-btn data-state="purchase-dismiss" variant="text" @click="requestClose">关闭</v-btn>
          <v-btn
            v-if="errorKind === 'retryable'"
            color="primary"
            data-state="purchase-retry"
            variant="flat"
            @click="retry"
          >
            重试
          </v-btn>
          <v-btn
            v-else-if="errorKind === 'product-missing'"
            color="primary"
            data-state="purchase-go-list"
            variant="flat"
            @click="emit('goList')"
          >
            返回列表
          </v-btn>
          <v-btn
            v-else
            color="primary"
            data-state="purchase-reload-product"
            variant="flat"
            @click="emit('reloadProduct')"
          >
            刷新商品并重选规格
          </v-btn>
        </template>
      </footer>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import { onBeforeUnmount, ref, watch } from 'vue'
  import { ApiError, checkPurchase } from '@/api/client'
  import type { components } from '@/api/schema'
  import { formatPriceCents } from '@/utils/price'

  type PurchaseResult = components['schemas']['PurchaseCheckResponse']
  /** 对话框状态：四分支加一个进行中（D99）。 */
  type Phase = 'checking' | 'purchasable' | 'insufficient' | 'price-changed' | 'error'
  /** 非三分支错误的出口：可重试 / 商品失效 / 规格失效（D104）。 */
  type ErrorKind = 'retryable' | 'product-missing' | 'variant-missing'

  const props = defineProps<{
    modelValue: boolean
    slug: string
    sku: string
    quantity: number
    /** 页面当前展示的所选组合价；打开对话框时作为 expectedUnitPriceCents（D98）。 */
    expectedUnitPriceCents: number
    variantLabel: string
    productName: string
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    adjustQuantity: []
    goList: []
    reloadProduct: []
  }>()

  const phase = ref<Phase>('checking')
  const result = ref<PurchaseResult | null>(null)
  const errorText = ref('')
  const errorKind = ref<ErrorKind>('retryable')
  /** 用户看到并确认过的单价；价格确认后更新为新价（D100）。 */
  const confirmedUnitPriceCents = ref(props.expectedUnitPriceCents)

  let controller: AbortController | null = null
  let latestRequest = 0

  function applyError(error: unknown): void {
    if (error instanceof ApiError) {
      const code = error.error?.error?.code
      if (code === 'PRODUCT_NOT_FOUND') {
        errorKind.value = 'product-missing'
        errorText.value = '商品已下架或不存在，请返回列表重新选择。'
        phase.value = 'error'
        return
      }
      if (code === 'VARIANT_NOT_FOUND' || code === 'VARIANT_NOT_IN_PRODUCT') {
        errorKind.value = 'variant-missing'
        errorText.value = '该规格已失效，请刷新商品后重新选择规格。'
        phase.value = 'error'
        return
      }
    }
    errorKind.value = 'retryable'
    errorText.value = error instanceof ApiError ? error.message : '购买校验失败，请检查网络后重试。'
    phase.value = 'error'
  }

  /** 发一次校验；关闭 / 离开时 abort 并丢弃迟到响应（D103）。 */
  async function runCheck(expectedUnitPriceCents: number): Promise<void> {
    controller?.abort()
    const sequence = ++latestRequest
    const nextController = new AbortController()
    controller = nextController
    result.value = null
    errorText.value = ''
    phase.value = 'checking'

    try {
      const data = await checkPurchase(
        {
          slug: props.slug,
          sku: props.sku,
          quantity: props.quantity,
          expectedUnitPriceCents,
        },
        nextController.signal,
      )
      if (sequence !== latestRequest || nextController.signal.aborted) {
        return
      }
      confirmedUnitPriceCents.value = expectedUnitPriceCents
      result.value = data
      if (data.result === 'purchasable') {
        phase.value = 'purchasable'
        return
      }
      phase.value = data.reason === 'INSUFFICIENT_STOCK' ? 'insufficient' : 'price-changed'
    } catch (error) {
      if (sequence !== latestRequest || nextController.signal.aborted) {
        return
      }
      applyError(error)
    } finally {
      if (sequence === latestRequest && controller === nextController) {
        controller = null
      }
    }
  }

  function requestClose(): void {
    emit('update:modelValue', false)
  }

  function onDialogUpdate(value: boolean): void {
    emit('update:modelValue', value)
  }

  /** 价格确认：用用户刚确认的新价重新校验（D100）。 */
  function confirmNewPrice(): void {
    if (result.value === null || result.value.result === 'purchasable') {
      return
    }
    void runCheck(result.value.unitPriceCents)
  }

  /** 可重试错误：复用本次请求参数（D104）。 */
  function retry(): void {
    void runCheck(confirmedUnitPriceCents.value)
  }

  watch(
    () => props.modelValue,
    (open) => {
      if (open) {
        confirmedUnitPriceCents.value = props.expectedUnitPriceCents
        void runCheck(props.expectedUnitPriceCents)
        return
      }
      latestRequest += 1
      controller?.abort()
      controller = null
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    latestRequest += 1
    controller?.abort()
    controller = null
  })
</script>
