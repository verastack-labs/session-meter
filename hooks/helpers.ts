import type { On, SessionUsage, TurnUsage } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'

/** The fixed time every test runs at: 12:00 UTC on 13 October 2026. */
export const NOW = Date.parse('2026-10-13T12:00:00Z')

/** One chunk the faked model request streams, to check it passes through. */
export const CHUNK = { kind: 'text', index: 0, text: 'hel' } as never

/** Props for mounting the pane, 60 columns wide unless overridden. */
export function PANE_PROPS(bodyColumns = 60) {
  return {
    title: 'Session meter',
    isFocused: false,
    bodyColumns,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  } as never
}

/** A usage reading: 5-hour 62%, 7-day 18%, context 41%, $1.84, started 66 minutes ago. */
export function usageOf(overrides: Partial<SessionUsage> = {}): SessionUsage {
  return {
    startedAt: NOW - 66 * 60_000,
    context: { tokens: 82_000, window: 200_000, percent: 41 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 62, resetsAt: '2026-10-13T14:14:00Z' },
      { kind: 'seven_day', percentUsed: 18, resetsAt: '2026-10-16T16:00:00Z' },
    ],
    cost: { usd: 1.84 },
    ...overrides,
  }
}

/** A model request's reported usage. */
export function tokens(input: number, output: number, cacheRead = 0, cacheWrite = 0): TurnUsage {
  return {
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: cacheWrite,
    model: 'claude-opus-5-5',
  }
}

export type Stage = {
  statuses: (string | undefined)[]
  toasts: string[]
  clock: MockClock
  setUsage: (usage: SessionUsage | 'fail') => void
  setStepUsage: (usage: TurnUsage | null) => void
}

/** Stands in for everything beneath the mod. Call it before the test's first `$` call. */
export function stage(on: On): Stage {
  let usage: SessionUsage | 'fail' = usageOf()
  let stepUsage: TurnUsage | null = tokens(1000, 200)
  const statuses: (string | undefined)[] = []
  const toasts: string[] = []
  const clock = mock.clock(on, { now: NOW })
  on('session.usage', () => (usage === 'fail' ? { deny: 'usage unavailable' } : { value: usage }))
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', () => ({ sessionId: 's1' }) as never)
  on('turn.step', async function* (_$, e) {
    yield CHUNK
    return {
      turnId: e.turnId,
      index: e.index,
      answer: 'ok',
      toolUses: [],
      stopReason: 'end_turn',
      usage: stepUsage,
    } as never
  })
  on('turn.complete', () => ({ text: 'done' }))
  on('tool.call', () => ({ result: { ok: true } }) as never)
  return {
    statuses,
    toasts,
    clock,
    setUsage: next => {
      usage = next
    },
    setStepUsage: next => {
      stepUsage = next
    },
  }
}

/** Raises one model request and reads it to the end. */
export async function modelStep($: Engine): Promise<{ chunks: unknown[]; result: { answer: string; usage: unknown } }> {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
  const chunks: unknown[] = []
  let step = await stream.next()
  while (step.done !== true) {
    chunks.push(step.value)
    step = await stream.next()
  }
  return { chunks, result: step.value as never }
}

/** The arguments `$.command.run` needs for a slash command typed at the prompt. */
export function slash(command: string) {
  return {
    command,
    args: '',
    origin: { kind: 'composer' } as const,
    presentation: { isFullscreen: false, columns: 80 },
  }
}
