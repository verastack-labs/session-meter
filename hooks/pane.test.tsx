import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { PANE_PROPS, modelStep, slash, stage, tokens, usageOf } from './helpers'

const SURFACES = ['terminal', 'desktop'] as const

async function mount($: Engine, surface: (typeof SURFACES)[number], columns = 60) {
  return $.ui.mount({ plugin: 'session-meter', surface, component: 'Pane', requestId: 'session-meter', props: PANE_PROPS(columns) })
}

async function text(ui: Awaited<ReturnType<typeof mount>>, key: string) {
  return (await ui.find({ key }))?.text
}

/** A 16-cell terminal bar with `filled` cells filled. */
function cells(filled: number) {
  return '█'.repeat(filled) + '░'.repeat(16 - filled)
}

for (const surface of SURFACES) {
  test(`${surface}: waits before any figures`, async ($, on) => {
    stage(on)
    const ui = await mount($, surface)
    expect(await text(ui, 'waiting')).toBe('Waiting for the first response')
  })

  test(`${surface}: draws the limits table`, async ($, on) => {
    stage(on)
    await modelStep($)
    const ui = await mount($, surface)
    expect(await text(ui, 'header-used')).toBe('Used')
    expect(await text(ui, 'header-end')).toBe('Resets')
    expect(await text(ui, 'window-five_hour-label')).toBe('5-hour')
    expect(await text(ui, 'window-five_hour-used')).toBe('62%')
    expect(await text(ui, 'window-five_hour-end')).toBe('in 2h 14m')
    expect(await text(ui, 'window-seven_day-label')).toBe('7-day')
    expect(await text(ui, 'window-seven_day-used')).toBe('18%')
    expect(await text(ui, 'window-seven_day-end')).toBe('in 3d 4h')
    expect(await text(ui, 'context-label')).toBe('Context')
    expect(await text(ui, 'context-used')).toBe('41%')
    expect(await text(ui, 'context-end')).toBe('82k of 200k')
    expect(await text(ui, 'stale')).toBeUndefined()
  })

  test(`${surface}: lists one session figure per row`, async ($, on) => {
    stage(on)
    await modelStep($)
    const ui = await mount($, surface)
    expect(await text(ui, 'spend')).toBe('$1.84')
    expect(await text(ui, 'tokens-in')).toBe('1k')
    expect(await text(ui, 'tokens-out')).toBe('200')
    expect(await text(ui, 'turns')).toBe('0')
    expect(await text(ui, 'tool-calls')).toBe('0')
    expect(await text(ui, 'running')).toBe('1h 6m')
  })

  test(`${surface}: drops the bars under 40 columns`, async ($, on) => {
    stage(on)
    await modelStep($)
    const ui = await mount($, surface, 30)
    expect(await text(ui, 'window-five_hour-used')).toBe('62%')
    expect(await ui.find({ key: 'window-five_hour-bar' })).toBeUndefined()
    expect(await ui.findAll({ type: 'Svg' })).toHaveLength(0)
  })

  test(`${surface}: says when no limits are reported and hides an absent spend`, async ($, on) => {
    const seen = stage(on)
    seen.setUsage(usageOf({ rateLimits: [], cost: undefined }))
    await modelStep($)
    const ui = await mount($, surface)
    expect(await text(ui, 'no-limits')).toBe('No usage limits reported for this account')
    expect(await text(ui, 'spend')).toBeUndefined()
  })
}

test('terminal: bars are full blocks with dimmed shade for the rest', async ($, on) => {
  stage(on)
  await modelStep($)
  const ui = await mount($, 'terminal')
  expect(await text(ui, 'window-five_hour-bar')).toBe(cells(10))
  expect(await text(ui, 'window-seven_day-bar')).toBe(cells(3))
  expect(await text(ui, 'context-bar')).toBe(cells(7))
})

test('terminal: colours the filled part by urgency', async ($, on) => {
  const seen = stage(on)
  seen.setUsage(usageOf({ rateLimits: [{ kind: 'five_hour', percentUsed: 82 }, { kind: 'seven_day', percentUsed: 96 }] }))
  await modelStep($)
  const ui = await mount($, 'terminal')
  const colours = (await ui.findAll({ type: 'Text' })).map(t => t.props.color).filter(c => c !== undefined)
  expect(colours).toEqual(['warning', 'error'])
})

test('desktop: draws each bar as an SVG with its percent as the alt text', async ($, on) => {
  stage(on)
  await modelStep($)
  const ui = await mount($, 'desktop')
  const bars = await ui.findAll({ type: 'Svg' })
  expect(bars.map(b => b.props.alt)).toEqual(['5-hour 62% used', '7-day 18% used', 'Context 41% used'])
  expect(await ui.find({ key: 'window-five_hour-bar' })).toBeDefined()
})

test('desktop: the bar fill follows the percent and urgency, with a sliver above 0%', async ($, on) => {
  const seen = stage(on)
  seen.setUsage(
    usageOf({
      rateLimits: [
        { kind: 'five_hour', percentUsed: 1 },
        { kind: 'seven_day', percentUsed: 0 },
        { kind: 'spend_limit', percentUsed: 96 },
      ],
      context: { tokens: 164_000, window: 200_000, percent: 82 },
    }),
  )
  await modelStep($)
  const ui = await mount($, 'desktop')
  const sources = (await ui.findAll({ type: 'Svg' })).map(b => String(b.props.source))
  expect(sources[0]).toContain('data-fill="3"')
  expect(sources[1]).not.toContain('data-fill')
  expect(sources[2]).toContain('data-fill="96"')
  expect(sources[2]).toContain('data-urgency="error"')
  expect(sources[3]).toContain('data-urgency="warning"')
})

test('counts tokens, turns and tool calls, noting cache reads', async ($, on) => {
  const seen = stage(on)
  await modelStep($)
  seen.setStepUsage(tokens(1000, 200, 5000))
  await modelStep($)
  seen.setStepUsage(null)
  await modelStep($)
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'ok' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'a.ts' })
  await $.tool.call({ tool: 'Read', file_path: 'b.ts' })
  await $.tool.call({ tool: 'Read', file_path: 'c.ts' })
  const ui = await mount($, 'terminal')
  expect(await text(ui, 'tokens-in')).toBe('2k  (+5k read from cache)')
  expect(await text(ui, 'tokens-out')).toBe('400')
  expect(await text(ui, 'turns')).toBe('1')
  expect(await text(ui, 'tool-calls')).toBe('3')
})

test('subagent turns are not counted as your turns; their tool calls are', async ($, on) => {
  stage(on)
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'ok' } as never)
  await $.turn.complete({ turnId: 't2', reason: 'answer', answer: 'ok', agentId: 'agent-1' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'a.ts' })
  await $.tool.call({ tool: 'Read', file_path: 'b.ts', agentId: 'agent-1' } as never)
  const ui = await mount($, 'terminal')
  expect(await text(ui, 'turns')).toBe('1')
  expect(await text(ui, 'tool-calls')).toBe('2')
})

test('shows how old the figures are when reads keep failing', async ($, on) => {
  const seen = stage(on)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true } as never)
  await modelStep($)
  seen.setUsage('fail')
  await seen.clock.advance(180_000)
  const ui = await mount($, 'terminal')
  expect(await text(ui, 'stale')).toBe('last updated 3m ago')
  expect(await text(ui, 'window-five_hour-used')).toBe('62%')
})

test('an unknown window kind shows under its own name with no reset', async ($, on) => {
  const seen = stage(on)
  seen.setUsage(usageOf({ rateLimits: [{ kind: 'monthly', percentUsed: 12 }] }))
  await modelStep($)
  const ui = await mount($, 'terminal')
  expect(await text(ui, 'window-monthly-label')).toBe('monthly')
  expect(await text(ui, 'window-monthly-end')).toBe('')
})

test('a start time in the future shows under 1m running', async ($, on) => {
  const seen = stage(on)
  seen.setUsage(usageOf({ startedAt: Date.parse('2026-10-13T13:00:00Z') }))
  await modelStep($)
  const ui = await mount($, 'terminal')
  expect(await text(ui, 'running')).toBe('under 1m')
})

test('context waits for the first response when limits are already known', async ($, on) => {
  const seen = stage(on)
  seen.setUsage(usageOf({ context: { window: 200_000 } }))
  await modelStep($)
  const ui = await mount($, 'terminal')
  expect(await text(ui, 'context-waiting')).toBe('waiting for the first response')
})

test('/clear resets the session counters', async ($, on) => {
  stage(on)
  await modelStep($)
  await $.session.end({ reason: 'clear' } as never)
  await modelStep($)
  const ui = await mount($, 'terminal')
  expect(await text(ui, 'tokens-in')).toBe('1k')
})

test('/meter opens and closes the pane', async ($, on) => {
  stage(on)
  expect((await $.command.run(slash('meter'))).text).toBe('Pane opened.')
  expect((await $.command.run(slash('meter'))).text).toBe('Pane closed.')
  expect((await $.command.run(slash('meter'))).text).toBe('Pane opened.')
})
