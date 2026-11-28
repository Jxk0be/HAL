import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { stepStates } from '../stepper'
import { tabFromHash } from '../tabsHash'
import UiStepper from '../UiStepper.vue'
import UiTabs from '../UiTabs.vue'

describe('stepStates', () => {
  const keys = ['signups', 'w1', 'w2', 'playoffs']
  it('marks earlier steps done and later ones upcoming', () => {
    expect(stepStates(keys, 'w2')).toEqual(['done', 'done', 'current', 'upcoming'])
  })
  it('first and last step', () => {
    expect(stepStates(keys, 'signups')).toEqual(['current', 'upcoming', 'upcoming', 'upcoming'])
    expect(stepStates(keys, 'playoffs')).toEqual(['done', 'done', 'done', 'current'])
  })
  it('unknown or missing key leaves everything upcoming', () => {
    expect(stepStates(keys, 'offseason')).toEqual(['upcoming', 'upcoming', 'upcoming', 'upcoming'])
    expect(stepStates(keys, null)).toEqual(['upcoming', 'upcoming', 'upcoming', 'upcoming'])
  })
  it('renders aria-current on the current step', () => {
    const w = mount(UiStepper, {
      props: { steps: keys.map((k) => ({ key: k, label: k })), currentKey: 'w1' },
    })
    const items = w.findAll('li')
    expect(items[1]!.attributes('aria-current')).toBe('step')
    expect(items[0]!.attributes('aria-current')).toBeUndefined()
  })
})

describe('tabFromHash', () => {
  const values = ['overview', 'standings', 'rules'] as const
  it('accepts known values only', () => {
    expect(tabFromHash('#standings', values)).toBe('standings')
    expect(tabFromHash('standings', values)).toBe('standings')
    expect(tabFromHash('#nope', values)).toBeNull()
    expect(tabFromHash('', values)).toBeNull()
    expect(tabFromHash('#%E0%A4%A', values)).toBeNull()
  })
})

describe('UiTabs hashSync', () => {
  async function setup(initialPath: string) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/season', component: { render: () => null } }],
    })
    await router.push(initialPath)
    await router.isReady()
    const active = ref<'overview' | 'standings'>('overview')
    const Host = defineComponent(() => () =>
      h(UiTabs<'overview' | 'standings'>, {
        tabs: [
          { value: 'overview', label: 'Overview' },
          { value: 'standings', label: 'Standings' },
        ],
        label: 'Season',
        hashSync: true,
        modelValue: active.value,
        'onUpdate:modelValue': (v: 'overview' | 'standings') => (active.value = v),
      }),
    )
    const w = mount(Host, { global: { plugins: [router] } })
    await flushPromises()
    return { w, router, active }
  }

  it('picks the tab from the hash on load', async () => {
    const { active } = await setup('/season#standings')
    expect(active.value).toBe('standings')
  })

  it('writes the selected tab to the hash', async () => {
    const { w, router, active } = await setup('/season')
    await w.findAll('[role="tab"]')[1]!.trigger('click')
    await nextTick()
    await flushPromises()
    expect(active.value).toBe('standings')
    expect(router.currentRoute.value.hash).toBe('#standings')
  })
})
