import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, TurnUsage } from 'claude-code'

import type { Counters, Snapshot } from '../types'
import { INITIAL_ALERTS, dueAlerts } from './alerts'
import type { Alert } from './alerts'
import { statusText } from './status'
import { toSnapshot } from './usage'

const REFRESH_MS = 30_000

const ZERO_COUNTERS: Counters = {
  turns: 0,
  toolCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
}

const snapshot = atom({ plugin: 'session-meter', key: 'snapshot' } as const, null as Snapshot | null)
const counters = atom({ plugin: 'session-meter', key: 'counters' } as const, ZERO_COUNTERS)
const alerts = atom({ plugin: 'session-meter', key: 'alerts' } as const, INITIAL_ALERTS)
const checkedAt = atom({ plugin: 'session-meter', key: 'checkedAt' } as const, 0)

type Dollar = Pick<EngineInterface, 'state' | 'session' | 'ui' | 'clock'>

/**
 * Reads the usage figures, stores them, updates the status line and shows due
 * toasts. A failed read keeps the last figures; `checkedAt` still moves, so the
 * pane can say how old they are.
 */
async function refresh($: Dollar): Promise<void> {
  const now = await $.clock.now()
  await update($, checkedAt, () => now)
  let next: Snapshot
  try {
    next = toSnapshot(await $.session.usage(), now)
  } catch {
    return
  }
  await update($, snapshot, () => next)
  $.ui.status(statusText(next))
  let due: Alert[] = []
  await update($, alerts, current => {
    const result = dueAlerts(next, current)
    due = result.alerts
    return result.next
  })
  for (const alert of due) $.ui.toast(alert.text)
}

async function addUsage($: Dollar, usage: TurnUsage): Promise<void> {
  await update($, counters, current => ({
    ...current,
    inputTokens: current.inputTokens + usage.input_tokens,
    outputTokens: current.outputTokens + usage.output_tokens,
    cacheReadTokens: current.cacheReadTokens + usage.cache_read_input_tokens,
    cacheWriteTokens: current.cacheWriteTokens + usage.cache_creation_input_tokens,
  }))
}

async function addTurn($: Dollar): Promise<void> {
  await update($, counters, current => ({ ...current, turns: current.turns + 1 }))
}

async function addToolCall($: Dollar): Promise<void> {
  await update($, counters, current => ({ ...current, toolCalls: current.toolCalls + 1 }))
}

async function resetCounters($: Dollar): Promise<void> {
  await update($, counters, () => ZERO_COUNTERS)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.clock.every(REFRESH_MS, () => {
      void refresh($)
    })
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      try {
        await resetCounters($)
      } catch {
        // counting never disturbs the session
      }
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    try {
      if (result.usage !== null) await addUsage($, result.usage)
      await refresh($)
    } catch {
      // counting never disturbs the response
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      await addTurn($)
      await refresh($)
    } catch {
      // counting never disturbs the turn
    }
    return result
  })

  on('tool.call', async ($, e, next) => {
    try {
      await addToolCall($)
    } catch {
      // counting never blocks a tool call
    }
    return next(e)
  })
}
