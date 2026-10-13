import type { SessionUsage } from 'claude-code'

import type { Snapshot } from '../types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** How each window kind is labelled; an unknown kind shows as itself. */
export const WINDOW_LABELS: Readonly<Record<string, string>> = {
  five_hour: '5-hour',
  seven_day: '7-day',
  spend_limit: 'Spend limit',
}

/** The order windows are listed in; unknown kinds come last. */
export const WINDOW_ORDER: readonly string[] = ['five_hour', 'seven_day', 'spend_limit']

export function formatPercent(percent: number): string {
  return `${Math.round(percent)}%`
}

/** The largest two units of a span: `2h 14m`, `3d 4h`, `47m`, or `under 1m`. */
export function formatDuration(ms: number): string {
  if (ms < MINUTE) return 'under 1m'
  const days = Math.floor(ms / DAY)
  const hours = Math.floor((ms % DAY) / HOUR)
  const minutes = Math.floor((ms % HOUR) / MINUTE)
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  return `${minutes}m`
}

/** Time left until an ISO reset time: a duration, `now` once passed, or nothing when unknown. */
export function formatCountdown(resetsAt: string | undefined, now: number): string | undefined {
  if (resetsAt === undefined) return undefined
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return undefined
  return at <= now ? 'now' : formatDuration(at - now)
}

function oneDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}

/** `999`, `1.2k`, `82k`, `2.1M`. */
export function formatTokens(count: number): string {
  if (count < 1000) return String(Math.round(count))
  if (Number((count / 1000).toFixed(1)) < 1000) return `${oneDecimal(count / 1000)}k`
  return `${oneDecimal(count / 1_000_000)}M`
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`
}

/** Filled cells of a bar `width` cells wide, clamped to the bar. */
export function barCells(percent: number, width: number): number {
  return Math.min(width, Math.max(0, Math.round((percent / 100) * width)))
}

export type Urgency = 'normal' | 'warning' | 'error'

/** Yellow from 80%, red from 95%, judged on the rounded number the pane shows. */
export function urgency(percent: number): Urgency {
  const shown = Math.round(percent)
  if (shown >= 95) return 'error'
  if (shown >= 80) return 'warning'
  return 'normal'
}

/** The figures the pane needs from one usage reading, with no context breakdown. */
export function toSnapshot(usage: SessionUsage, now: number): Snapshot {
  const context: Snapshot['context'] = { window: usage.context.window }
  if (usage.context.tokens !== undefined) context.tokens = usage.context.tokens
  if (usage.context.percent !== undefined) context.percent = usage.context.percent
  const snapshot: Snapshot = {
    readAt: now,
    startedAt: usage.startedAt,
    windows: usage.rateLimits.map(window =>
      window.resetsAt === undefined
        ? { kind: window.kind, percentUsed: window.percentUsed }
        : { kind: window.kind, percentUsed: window.percentUsed, resetsAt: window.resetsAt },
    ),
    context,
  }
  if (usage.cost !== undefined) snapshot.usd = usage.cost.usd
  return snapshot
}
