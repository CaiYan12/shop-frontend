import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { createVuetify } from 'vuetify'
import { VBtn, VIcon } from 'vuetify/components'
import QuantityInput from '@/components/QuantityInput.vue'

// 组件测试只注册 QuantityInput 实际用到的 Vuetify 元件（v-btn / v-icon），
// 不经过 src/main.ts 的全局插件，也不依赖 vite-plugin-vuetify 的自动导入。
function createTestVuetify () {
  return createVuetify({ components: { VBtn, VIcon } })
}

// 真实父级的 v-model：子组件 emit 后由父级更新绑定的 ref，再把新值传回去。
const QuantityHost = defineComponent({
  props: {
    initial: { type: String, required: true },
    limit: { type: Number, required: true },
    disabled: { type: Boolean, default: false },
  },
  setup (props) {
    const text = ref(props.initial)
    return () => h(QuantityInput, {
      modelValue: text.value,
      'onUpdate:modelValue': (value: string) => {
        text.value = value
      },
      limit: props.limit,
      disabled: props.disabled,
    })
  },
})

function mountQuantity (options: { modelValue: string; limit: number; disabled?: boolean }) {
  const wrapper = mount(QuantityHost, {
    props: {
      initial: options.modelValue,
      limit: options.limit,
      disabled: options.disabled ?? false,
    },
    global: { plugins: [createTestVuetify()] },
  })
  return {
    wrapper,
    child: wrapper.findComponent(QuantityInput),
    input: wrapper.get<HTMLInputElement>('input[data-state="quantity-input"]'),
  }
}

const lastModel = (child: ReturnType<typeof mountQuantity>['child']) => {
  const events = child.emitted('update:modelValue') ?? []
  return events.at(-1)?.[0]
}

// spec U2：原始文本、失焦提示、加减边界、禁用行为。
describe('QuantityInput', () => {
  it('输入只更新原始文本，不归整空格、前导零或非数字内容', async () => {
    const { wrapper, child, input } = mountQuantity({ modelValue: '1', limit: 5 })

    await input.setValue('007')
    expect(input.element.value).toBe('007')
    expect(lastModel(child)).toBe('007')

    await input.setValue('3件')
    expect(lastModel(child)).toBe('3件')
    expect(wrapper.find('[data-state="quantity-error"]').exists()).toBe(false)
  })

  it('失焦才亮校验提示，改正后提示自动收起并同步 aria-invalid', async () => {
    const { wrapper, input } = mountQuantity({ modelValue: '', limit: 5 })

    expect(wrapper.find('[data-state="quantity-error"]').exists()).toBe(false)
    await input.trigger('blur')
    expect(wrapper.get('[data-state="quantity-error"]').text()).toBe('请输入数量。')
    expect(input.attributes('aria-invalid')).toBe('true')

    await input.setValue('0')
    expect(wrapper.get('[data-state="quantity-error"]').text()).toBe('数量至少为 1 件。')

    await input.setValue('2')
    expect(wrapper.find('[data-state="quantity-error"]').exists()).toBe(false)
    expect(input.attributes('aria-invalid')).toBeUndefined()
  })

  it('加减按钮以当前文本为基准，并在 1 与上限处禁用', async () => {
    const atMin = mountQuantity({ modelValue: '1', limit: 5 })
    expect(atMin.wrapper.get('[data-state="quantity-decrease"]').attributes('disabled')).toBeDefined()
    expect(atMin.wrapper.get('[data-state="quantity-increase"]').attributes('disabled')).toBeUndefined()
    await atMin.wrapper.get('[data-state="quantity-increase"]').trigger('click')
    expect(lastModel(atMin.child)).toBe('2')

    const atMax = mountQuantity({ modelValue: '5', limit: 5 })
    expect(atMax.wrapper.get('[data-state="quantity-increase"]').attributes('disabled')).toBeDefined()
    await atMax.wrapper.get('[data-state="quantity-decrease"]').trigger('click')
    expect(lastModel(atMax.child)).toBe('4')

    const empty = mountQuantity({ modelValue: '', limit: 5 })
    await empty.wrapper.get('[data-state="quantity-increase"]').trigger('click')
    expect(lastModel(empty.child)).toBe('1')

    const above = mountQuantity({ modelValue: '12', limit: 5 })
    await above.wrapper.get('[data-state="quantity-decrease"]').trigger('click')
    expect(lastModel(above.child)).toBe('4')
  })

  it('disabled 时输入与两个按钮都不能操作，并收起已有提示', async () => {
    const { wrapper, child, input } = mountQuantity({ modelValue: '0', limit: 5 })
    await input.trigger('blur')
    expect(wrapper.find('[data-state="quantity-error"]').exists()).toBe(true)
    const emittedBefore = child.emitted('update:modelValue')?.length ?? 0

    await wrapper.setProps({ disabled: true })

    expect(wrapper.find('[data-state="quantity-error"]').exists()).toBe(false)
    expect(input.attributes('disabled')).toBeDefined()
    for (const state of ['quantity-decrease', 'quantity-increase']) {
      expect(wrapper.get(`[data-state="${state}"]`).attributes('disabled')).toBeDefined()
    }

    await wrapper.get('[data-state="quantity-increase"]').trigger('click')
    await wrapper.get('[data-state="quantity-decrease"]').trigger('click')
    expect(child.emitted('update:modelValue')?.length ?? 0).toBe(emittedBefore)
  })

  it('上限为 0 时整个控件禁用，缺货提示只在父级校验时出现', async () => {
    const { wrapper, child, input } = mountQuantity({ modelValue: '1', limit: 0 })

    expect(input.attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-state="quantity-increase"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-state="quantity-decrease"]').attributes('disabled')).toBeDefined()

    const validate = (child.vm as unknown as { validate: () => boolean }).validate
    expect(validate()).toBe(false)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-state="quantity-error"]').text()).toBe('该规格已缺货。')
  })

  it('父级调用 validate 时非法文本返回 false 并亮提示，合法文本返回 true 并收起提示', async () => {
    const { wrapper, child, input } = mountQuantity({ modelValue: '', limit: 5 })
    const component = child.vm as unknown as { validate: () => boolean }

    expect(component.validate()).toBe(false)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-state="quantity-error"]').text()).toBe('请输入数量。')

    await input.setValue('3')
    expect(component.validate()).toBe(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-state="quantity-error"]').exists()).toBe(false)
  })
})
