/** One rate-limit window as the engine reports it. */
export type LimitWindow = { kind: string; percentUsed: number; resetsAt?: string }

/** One reading of `$.session.usage()`, with when it was read. */
export type Snapshot = {
  readAt: number
  startedAt: number
  windows: LimitWindow[]
  context: { tokens?: number; window: number; percent?: number }
  usd?: number
}

/** Session totals the mod counts itself. */
export type Counters = {
  turns: number
  toolCalls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** Which warnings were shown, and whether the context warning may fire again. */
export type AlertState = { fired: string[]; isContextArmed: boolean }

declare module 'claude-code' {
  interface PluginState {
    'session-meter': {
      snapshot: Snapshot | null
      counters: Counters
      alerts: AlertState
      isPaneOpen: boolean
      checkedAt: number
    }
  }
}
