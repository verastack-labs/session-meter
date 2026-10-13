import { expect, test } from 'claude-code/testing'

import { CHUNK, modelStep, stage, tokens, usageOf } from './helpers'

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
  expect(seen.statuses).toHaveLength(2)
})

test('turn.complete and tool.call results pass through', async ($, on) => {
  stage(on)
  expect(await $.turn.complete({ turnId: 't1', reason: 'answer' } as never)).toEqual({ text: 'done' })
  expect(await $.tool.call({ tool: 'Read', file_path: 'a.ts' })).toEqual({ result: { ok: true } })
})
