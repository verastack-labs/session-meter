import type { AlertState, Snapshot } from '../types'
import { WINDOW_LABELS, formatCountdown, formatPercent } from './usage'

/** A toast to show, and the key that stops it showing twice. */
export type Alert = { key: string; text: string }

export const INITIAL_ALERTS: AlertState = { fired: [], isContextArmed: true }

const WARNED_KINDS: readonly string[] = ['five_hour', 'seven_day']
const THRESHOLDS: readonly number[] = [80, 95]
const CONTEXT_WARN = 80
const CONTEXT_REARM = 70
const MAX_FIRED = 50

function resetPhrase(resetsAt: string | undefined, now: number): string {
  const countdown = formatCountdown(resetsAt, now)
  if (countdown === undefined) return ''
  return countdown === 'now' ? ', resets now' : `, resets in ${countdown}`
}

/**
 * The toasts a new snapshot calls for. Each window alerts once at 80% and
 * once at 95% per window (keyed by its reset time); a jump past 95% fires only
 * the 95% alert. Context alerts at 80% and re-arms below 70%.
 */
export function dueAlerts(snapshot: Snapshot, state: AlertState): { alerts: Alert[]; next: AlertState } {
  const alerts: Alert[] = []
  const fired = [...state.fired]
  for (const window of snapshot.windows) {
    if (!WARNED_KINDS.includes(window.kind)) continue
    const keys = THRESHOLDS.filter(threshold => window.percentUsed >= threshold).map(
      threshold => `${window.kind}:${window.resetsAt ?? ''}:${threshold}`,
    )
    const topKey = keys[keys.length - 1]
    if (topKey === undefined || fired.includes(topKey)) continue
    const label = WINDOW_LABELS[window.kind] ?? window.kind
    alerts.push({
      key: topKey,
      text: `${label} limit at ${formatPercent(window.percentUsed)}${resetPhrase(window.resetsAt, snapshot.readAt)}`,
    })
    for (const key of keys) if (!fired.includes(key)) fired.push(key)
  }
  let isContextArmed = state.isContextArmed
  const percent = snapshot.context.percent
  if (percent !== undefined) {
    if (isContextArmed && percent >= CONTEXT_WARN) {
      alerts.push({ key: 'context', text: `Context ${formatPercent(percent)} full; consider /compact or /clear` })
      isContextArmed = false
    } else if (!isContextArmed && percent < CONTEXT_REARM) {
      isContextArmed = true
    }
  }
  return { alerts, next: { fired: fired.slice(-MAX_FIRED), isContextArmed } }
}
