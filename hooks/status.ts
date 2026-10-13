import type { Snapshot } from '../types'
import { formatPercent } from './usage'

/**
 * The status-line text: the 5-hour window and context, `5h 62% · ctx 41%`.
 * Undefined, which clears the line, when neither is known. The engine shows
 * the line under the mod's name, so the text leaves the name out.
 */
export function statusText(snapshot: Snapshot | null): string | undefined {
  if (snapshot === null) return undefined
  const parts: string[] = []
  const five = snapshot.windows.find(window => window.kind === 'five_hour')
  if (five !== undefined) parts.push(`5h ${formatPercent(five.percentUsed)}`)
  if (snapshot.context.percent !== undefined) parts.push(`ctx ${formatPercent(snapshot.context.percent)}`)
  return parts.length > 0 ? parts.join(' · ') : undefined
}
