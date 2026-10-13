import type { Elements, RenderElement } from 'claude-code'

import type { Counters, LimitWindow, Snapshot } from '../types'
import {
  WINDOW_LABELS,
  WINDOW_ORDER,
  barCells,
  formatCountdown,
  formatDuration,
  formatPercent,
  formatTokens,
  formatUsd,
  urgency,
} from './usage'

type Els = Pick<Elements['terminal'], 'Box' | 'Text'>

/** What the pane draws from. `now` is the last refresh attempt. */
export type MeterInput = { snapshot: Snapshot | null; counters: Counters; now: number; columns: number }

const GAUGE_LABEL = 9
const ROW_LABEL = 13
const NARROW = 40
const MAX_BAR = 20
const STALE_MS = 120_000
const BAR = '━'
const COLOURS = { normal: undefined, warning: 'warning', error: 'error' } as const

/** Bar cells for a body width: 20 at 54 columns or more, none under 40. */
export function barWidth(columns: number): number {
  return columns < NARROW ? 0 : Math.min(MAX_BAR, columns - 34)
}

function rank(kind: string): number {
  const index = WINDOW_ORDER.indexOf(kind)
  return index === -1 ? WINDOW_ORDER.length : index
}

function resetSuffix(window: LimitWindow, now: number): string {
  const countdown = formatCountdown(window.resetsAt, now)
  if (countdown === undefined) return ''
  return countdown === 'now' ? '   resets now' : `   resets in ${countdown}`
}

function gauge(els: Els, key: string, label: string, percent: number, width: number, suffix: string) {
  const { Box, Text } = els
  const filled = barCells(percent, width)
  return (
    <Box key={key}>
      <Text>
        {label.padEnd(GAUGE_LABEL)}
        {width > 0 && <Text color={COLOURS[urgency(percent)]}>{BAR.repeat(filled)}</Text>}
        {width > 0 && <Text dimColor>{BAR.repeat(width - filled)}</Text>}
        {`${width > 0 ? '  ' : ''}${formatPercent(percent).padStart(4)}${suffix}`}
      </Text>
    </Box>
  )
}

function row(els: Els, key: string, label: string, value: string) {
  const { Box, Text } = els
  return (
    <Box key={key}>
      <Text>
        {label.padEnd(ROW_LABEL)}
        {value}
      </Text>
    </Box>
  )
}

/** The pane's drawing, per the spec's layout. */
export function meterView(els: Els, input: MeterInput): RenderElement {
  const { Box, Text } = els
  const { snapshot, counters, now, columns } = input
  if (snapshot === null || (snapshot.context.percent === undefined && snapshot.windows.length === 0)) {
    return (
      <Box flexDirection="column">
        <Box key="waiting">
          <Text dimColor>Waiting for the first response</Text>
        </Box>
      </Box>
    )
  }
  const width = barWidth(columns)
  const windows = [...snapshot.windows].sort((a, b) => rank(a.kind) - rank(b.kind))
  const age = now - snapshot.readAt
  const { context } = snapshot
  return (
    <Box flexDirection="column">
      <Text bold>Usage limits</Text>
      {age > STALE_MS && (
        <Box key="stale">
          <Text dimColor>last updated {formatDuration(age)} ago</Text>
        </Box>
      )}
      {windows.length === 0 ? (
        <Box key="no-limits">
          <Text dimColor>No usage limits reported for this account</Text>
        </Box>
      ) : (
        windows.map(window =>
          gauge(els, `window-${window.kind}`, WINDOW_LABELS[window.kind] ?? window.kind, window.percentUsed, width, resetSuffix(window, now)),
        )
      )}
      <Text> </Text>
      {context.percent === undefined ? (
        <Box key="context">
          <Text>
            {'Context'.padEnd(GAUGE_LABEL)}
            <Text dimColor>waiting for the first response</Text>
          </Text>
        </Box>
      ) : (
        gauge(
          els,
          'context',
          'Context',
          context.percent,
          width,
          context.tokens === undefined ? '' : `   ${formatTokens(context.tokens)} of ${formatTokens(context.window)} tokens`,
        )
      )}
      <Text> </Text>
      <Text bold>This session</Text>
      {snapshot.usd !== undefined && row(els, 'spend', 'Spend', formatUsd(snapshot.usd))}
      {row(
        els,
        'tokens',
        'Tokens',
        `${formatTokens(counters.inputTokens)} in · ${formatTokens(counters.outputTokens)} out · ${formatTokens(counters.cacheReadTokens)} cache read`,
      )}
      {row(els, 'turns', 'Turns', `${String(counters.turns).padEnd(8)}Tool calls  ${counters.toolCalls}`)}
      {row(els, 'running', 'Running', formatDuration(now - snapshot.startedAt))}
    </Box>
  )
}
