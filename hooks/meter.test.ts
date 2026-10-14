import { expect, test } from 'claude-code/testing'

import { CHUNK, modelStep, slash, stage, tokens, usageOf } from './helpers'

test('the response stream and result pass through unchanged', async ($, on) => {
  stage(on)
  const { chunks, result } = await modelStep($)
  expect(chunks).toEqual([CHUNK])
  expect(result.answer).toBe('ok')
  expect(result.usage).toEqual(tokens(1000, 200))
})

test('a model request refreshes the status line', async ($, on) => {
  const seen = stage(on)
  await modelStep($)
  expect(seen.statuses).toEqual(['5h 62% · ctx 41%'])
})

test('a request with no usage still refreshes', async ($, on) => {
  const seen = stage(on)
  seen.setStepUsage(null)
  const { result } = await modelStep($)
  expect(result.usage).toBeNull()
  expect(seen.statuses).toEqual(['5h 62% · ctx 41%'])
})

test('a threshold toast fires once', async ($, on) => {
  const seen = stage(on)
  seen.setUsage(usageOf({ rateLimits: [{ kind: 'five_hour', percentUsed: 82, resetsAt: '2026-10-13T14:14:00Z' }] }))
  await modelStep($)
  await modelStep($)
  expect(seen.toasts).toEqual(['5-hour limit at 82%, resets in 2h 14m'])
})

test('a failed usage read keeps the last status', async ($, on) => {
  const seen = stage(on)
  await modelStep($)
  seen.setUsage('fail')
  await modelStep($)
  expect(seen.statuses).toEqual(['5h 62% · ctx 41%'])
})

test('the status line clears when nothing is known', async ($, on) => {
  const seen = stage(on)
  seen.setUsage(usageOf({ rateLimits: [], context: { window: 200_000 } }))
  await modelStep($)
  expect(seen.statuses).toEqual([undefined])
})

test('the clock refreshes every 30 seconds after session start', async ($, on) => {
  const seen = stage(on)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true } as never)
  expect(seen.statuses).toEqual([])
  await seen.clock.advance(30_000)
  expect(seen.statuses).toEqual(['5h 62% · ctx 41%'])
  await seen.clock.advance(30_000)
  // the second tick reads the same figures, so the line is not rewritten
  expect(seen.statuses).toHaveLength(1)
})

test('turn.complete and tool.call results pass through', async ($, on) => {
  stage(on)
  expect(await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'ok' } as never)).toEqual({ text: 'done' })
  expect(await $.tool.call({ tool: 'Read', file_path: 'a.ts' })).toEqual({ result: { ok: true } })
})

test('a slow usage read that finishes last does not replace a newer one', async ($, on) => {
  const seen = stage(on)
  seen.queueUsage(usageOf({ rateLimits: [{ kind: 'five_hour', percentUsed: 10 }] }), 5_000)
  const slow = modelStep($)
  await seen.clock.settle()
  await seen.clock.advance(1_000)
  seen.setUsage(usageOf({ rateLimits: [{ kind: 'five_hour', percentUsed: 20 }] }))
  await modelStep($)
  expect(seen.statuses.at(-1)).toBe('5h 20% · ctx 41%')
  await seen.clock.advance(5_000)
  await slow
  expect(seen.statuses.at(-1)).toBe('5h 20% · ctx 41%')
})

test('the status line is only rewritten when its text changes', async ($, on) => {
  const seen = stage(on)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true } as never)
  await modelStep($)
  const count = seen.statuses.length
  await seen.clock.advance(90_000)
  expect(seen.statuses).toHaveLength(count)
  seen.setUsage(usageOf({ rateLimits: [{ kind: 'five_hour', percentUsed: 70 }] }))
  await seen.clock.advance(30_000)
  expect(seen.statuses).toHaveLength(count + 1)
})

test('a fresh start trusts the engine about whether the pane is open', async ($, on) => {
  const seen = stage(on)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true } as never)
  expect((await $.command.run(slash('meter'))).text).toBe('Pane opened.')
  seen.panes.splice(0)
  await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true } as never)
  expect((await $.command.run(slash('meter'))).text).toBe('Pane opened.')
})
