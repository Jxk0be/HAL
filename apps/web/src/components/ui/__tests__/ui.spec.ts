import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import UiTable from '../UiTable.vue'
import ScoreChip from '../ScoreChip.vue'
import TeamLogo from '../TeamLogo.vue'

describe('UiTable', () => {
  const columns = [
    { key: 'team', label: 'Team', sortable: true },
    { key: 'wins', label: 'W', sortable: true, numeric: true },
  ]
  const rows = [
    { team: 'Bravo', wins: 2 },
    { team: 'Alpha', wins: 5 },
    { team: 'Charlie', wins: 3 },
  ]

  const order = (w: ReturnType<typeof mount>) =>
    w.findAll('tbody tr').map((tr) => tr.find('td').text())

  it('sorts numeric columns descending first, then toggles', async () => {
    const w = mount(UiTable, {
      props: { columns, rows, rowKey: 'team', caption: 'Standings', sortRows: true, sort: null },
    })
    await w.findAll('th button')[1]!.trigger('click')
    await w.setProps({ sort: w.emitted('update:sort')!.at(-1)![0] as never })
    expect(order(w)).toEqual(['Alpha', 'Charlie', 'Bravo'])
    expect(w.findAll('th')[1]!.attributes('aria-sort')).toBe('descending')

    await w.findAll('th button')[1]!.trigger('click')
    await w.setProps({ sort: w.emitted('update:sort')!.at(-1)![0] as never })
    expect(order(w)).toEqual(['Bravo', 'Charlie', 'Alpha'])
  })

  it('shows an empty row when there is no data', () => {
    const w = mount(UiTable, { props: { columns, rows: [], rowKey: 'team', caption: 'Empty' } })
    expect(w.text()).toContain('Nothing here yet.')
  })
})

describe('ScoreChip', () => {
  it('derives W/L and an accessible label', () => {
    const win = mount(ScoreChip, { props: { score: 3, opponent: 1 } })
    expect(win.attributes('aria-label')).toBe('Win, 3 to 1')
    const loss = mount(ScoreChip, { props: { score: 0, opponent: 3 } })
    expect(loss.text()).toContain('L')
    expect(loss.attributes('aria-label')).toBe('Loss, 0 to 3')
  })
})

describe('TeamLogo', () => {
  it('falls back to the tag when there is no logo', () => {
    const w = mount(TeamLogo, { props: { tag: 'srph', name: 'Seraphim' } })
    expect(w.text()).toBe('SRPH')
    expect(w.attributes('aria-label')).toBe('Seraphim logo')
  })
})
