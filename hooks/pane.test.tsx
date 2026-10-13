import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { PANE_PROPS, modelStep, slash, stage, tokens, usageOf } from './helpers'

const BAR = '━'.repeat(20)
const SURFACES = ['terminal', 'desktop'] as const

async function mount($: Engine, surface: (typeof SURFACES)[number], columns = 60) {
  return $.ui.mount({ plugin: 'session-meter', surface, component: 'Pane', requestId: 'session-meter', props: PANE_PROPS(columns) })
}

async function text(ui: Awaited<ReturnType<typeof mount>>, key: string) {
  return (await ui.find({ key }))?.text
}

for (const surface of SURFACES) {
  test(`${surface}: waits before any figures`, async ($, on) => {
    stage(on)
    const ui = await mount($, surface)
    expect(await text(ui, 'waiting')).toBe('Waiting for the first response')
  })

  test(`${surface}: draws the full layout`, async ($, on) => {
    stage(on)
    await modelStep($)
    const ui = await mount($, surface)
    expect(await text(ui, 'window-five_hour')).toBe(`5-hour   ${BAR}   62%   resets in 2h 14m`)
    expect(await text(ui, 'window-seven_day')).toBe(`7-day    ${BAR}   18%   resets in 3d 4h`)
    expect(await text(ui, 'context')).toBe(`Context  ${BAR}   41%   82k of 200k tokens`)
    expect(await text(ui, 'spend')).toBe('Spend        $1.84')
    expect(await text(ui, 'tokens')).toBe('Tokens       1k in · 200 out · 0 cache read')
    expect(await text(ui, 'turns')).toBe('Turns        0       Tool calls  0')
    expect(await text(ui, 'running')).toBe('Running      1h 6m')
    expect(await text(ui, 'stale')).toBeUndefined()
  })

  test(`${surface}: drops the bars under 40 columns`, async ($, on) => {
    stage(on)
    await modelStep($)
    const ui = await mount($, surface, 30)
    expect(await text(ui, 'window-five_hour')).toBe('5-hour    62%   resets in 2h 14m')
  })

  test(`${surface}: colours the filled part by urgency`, async ($, on) => {
    const seen = stage(on)
    seen.setUsage(usageOf({ rateLimits: [{ kind: 'five_hour', percentUsed: 82 }, { kind: 'seven_day', percentUsed: 96 }] }))
    await modelStep($)
    const ui = await mount($, surface)
    const colours = (await ui.findAll({ type: 'Text' })).map(t => t.props.color).filter(c => c !== undefined)
    expect(colours).toEqual(['warning', 'error'])
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

test('counts tokens, turns and tool calls', async ($, on) => {
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
  expect(await text(ui, 'tokens')).toBe('Tokens       2k in · 400 out · 5k cache read')
  expect(await text(ui, 'turns')).toBe('Turns        1       Tool calls  3')
})

test('subagent turns are not counted as your turns; their tool calls are', async ($, on) => {
  stage(on)
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'ok' } as never)
  await $.turn.complete({ turnId: 't2', reason: 'answer', answer: 'ok', agentId: 'agent-1' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'a.ts' })
  await $.tool.call({ tool: 'Read', file_path: 'b.ts', agentId: 'agent-1' } as never)
  const ui = await mount($, 'terminal')
  expect(await text(ui, 'turns')).toBe('Turns        1       Tool calls  2')
})

test('shows how old the figures are when reads keep failing', async ($, on) => {
  const seen = stage(on)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true } as never)
  await modelStep($)
  seen.setUsage('fail')
  await seen.clock.advance(180_000)
  const ui = await mount($, 'terminal')
  expect(await text(ui, 'stale')).toBe('last updated 3m ago')
  expect(await text(ui, 'window-five_hour')).toContain('62%')
})

test('an unknown window kind shows under its own name', async ($, on) => {
  const seen = stage(on)
  seen.setUsage(usageOf({ rateLimits: [{ kind: 'monthly', percentUsed: 12 }] }))
  await modelStep($)
  const ui = await mount($, 'terminal')
  expect(await text(ui, 'window-monthly')).toBe(`monthly  ${'━'.repeat(20)}   12%`)
})

test('a start time in the future shows under 1m running', async ($, on) => {
  const seen = stage(on)
  seen.setUsage(usageOf({ startedAt: Date.parse('2026-10-13T13:00:00Z') }))
  await modelStep($)
  const ui = await mount($, 'terminal')
  expect(await text(ui, 'running')).toBe('Running      under 1m')
})

test('context waits for the first response when limits are already known', async ($, on) => {
  const seen = stage(on)
  seen.setUsage(usageOf({ context: { window: 200_000 } }))
  await modelStep($)
  const ui = await mount($, 'terminal')
  expect(await text(ui, 'context')).toBe('Context  waiting for the first response')
})

test('/clear resets the session counters', async ($, on) => {
  stage(on)
  await modelStep($)
  await $.session.end({ reason: 'clear' } as never)
  await modelStep($)
  const ui = await mount($, 'terminal')
  expect(await text(ui, 'tokens')).toBe('Tokens       1k in · 200 out · 0 cache read')
})

test('/meter opens and closes the pane', async ($, on) => {
  stage(on)
  expect((await $.command.run(slash('meter'))).text).toBe('Pane opened.')
  expect((await $.command.run(slash('meter'))).text).toBe('Pane closed.')
  expect((await $.command.run(slash('meter'))).text).toBe('Pane opened.')
})
