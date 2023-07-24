import { describe, it, expect } from 'vitest'

import { mount } from '@vue/test-utils'
import Demo from '../Demo.vue'

describe('Demo', () => {
  it('renders properly', () => {
    const wrapper = mount(Demo, { props: { msg: 'Hello Vitest' } })
    expect(wrapper.text()).toContain('Hello Vitest')
  })
})
