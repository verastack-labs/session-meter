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
import type { Urgency } from './usage'

/** `Svg` is there on the surfaces that draw it (desktop, VS Code, mobile) and absent in the terminal. */
export type Els = Pick<Elements['terminal'], 'Box' | 'Text'> & { Svg?: Elements['desktop']['Svg'] }

/** What the pane draws from. `now` is the last refresh attempt. */
export type MeterInput = { snapshot: Snapshot | null; counters: Counters; now: number; columns: number }

// Column widths in cells. A Box with a fixed width lines up in any font, which
// padding with spaces does not on the desktop's proportional font.
const LABEL = 12
const USED = 5
const GAP = 2
const BAR_CELLS = 16
/** The fewest cells the last column keeps, so a bar never pushes it off the row. */
const END_MIN = 8
const BAR_MIN = 6
const STALE_MS = 120_000
const FILLED = '█'
const EMPTY = '░'
const COLOURS = { normal: undefined, warning: 'warning', error: 'error' } as const

// The SVG bar, in CSS pixels; a filled part above 0% is never thinner than the sliver.
const SVG_WIDTH = 120
const SVG_HEIGHT = 10
const SLIVER = 3
const SVG_FILLS: Record<Urgency, string> = { normal: '#4c9be8', warning: '#e0a526', error: '#e5484d' }

/** The share of the SVG bar to fill, out of 100: 0 at 0%, at least the sliver above it. */
export function svgFill(percent: number): number {
  if (percent <= 0) return 0
  return Math.min(100, Math.max(SLIVER, Math.round(percent)))
}

/** A rounded grey track with the filled part over it, coloured by urgency. */
export function barSvg(percent: number): string {
  const fill = svgFill(percent)
  const r = SVG_HEIGHT / 2
  const track = `<rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" rx="${r}" fill="#888888" fill-opacity="0.25"/>`
  const filled =
    fill === 0
      ? ''
      : `<rect data-fill="${fill}" data-urgency="${urgency(percent)}" width="${(fill / 100) * SVG_WIDTH}" height="${SVG_HEIGHT}" rx="${r}" fill="${SVG_FILLS[urgency(percent)]}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">${track}${filled}</svg>`
}

/**
 * Bar cells for a pane `columns` wide: up to 16, what is left beside the label,
 * the percent and the last column, or 0 to drop the bar.
 */
export function barCellsFor(columns: number): number {
  const room = Math.min(BAR_CELLS, columns - LABEL - USED - 3 * GAP - END_MIN)
  return room >= BAR_MIN ? room : 0
}

function rank(kind: string): number {
  const index = WINDOW_ORDER.indexOf(kind)
  return index === -1 ? WINDOW_ORDER.length : index
}

function resetText(window: LimitWindow, now: number): string {
  const countdown = formatCountdown(window.resetsAt, now)
  if (countdown === undefined) return ''
  return countdown === 'now' ? 'now' : `in ${countdown}`
}

function bar(els: Els, key: string, label: string, percent: number, cells: number) {
  const { Box, Text, Svg } = els
  if (Svg !== undefined) {
    return (
      <Box key={`${key}-bar`} width={cells} flexShrink={0} alignItems="center">
        <Svg source={barSvg(percent)} alt={`${label} ${formatPercent(percent)} used`} width={Math.round((cells * SVG_WIDTH) / BAR_CELLS)} height={SVG_HEIGHT} />
      </Box>
    )
  }
  const filled = barCells(percent, cells)
  return (
    <Box key={`${key}-bar`} width={cells} flexShrink={0}>
      <Text>
        <Text color={COLOURS[urgency(percent)]}>{FILLED.repeat(filled)}</Text>
        <Text dimColor>{EMPTY.repeat(cells - filled)}</Text>
      </Text>
    </Box>
  )
}

/** One row of the limits table: label, used percent, bar when there is room, and the last column. */
function gaugeRow(els: Els, key: string, label: string, percent: number, end: string, cells: number) {
  const { Box, Text } = els
  return (
    <Box flexDirection="row" columnGap={GAP}>
      <Box key={`${key}-label`} width={LABEL} flexShrink={0}>
        <Text wrap="truncate-end">{label}</Text>
      </Box>
      <Box key={`${key}-used`} width={USED} flexShrink={0} justifyContent="flex-end">
        <Text>{formatPercent(percent)}</Text>
      </Box>
      {cells > 0 && bar(els, key, label, percent, cells)}
      <Box key={`${key}-end`} flexGrow={1}>
        <Text wrap="truncate-end">{end}</Text>
      </Box>
    </Box>
  )
}

function headerRow(els: Els, cells: number) {
  const { Box, Text } = els
  return (
    <Box flexDirection="row" columnGap={GAP}>
      <Box width={LABEL} flexShrink={0} />
      <Box key="header-used" width={USED} flexShrink={0} justifyContent="flex-end">
        <Text dimColor>Used</Text>
      </Box>
      {cells > 0 && <Box width={cells} flexShrink={0} />}
      <Box key="header-end" flexGrow={1}>
        <Text dimColor>Resets</Text>
      </Box>
    </Box>
  )
}

/** One row of the session list: a label and its value. */
function figureRow(els: Els, key: string, label: string, value: string) {
  const { Box, Text } = els
  return (
    <Box flexDirection="row" columnGap={GAP}>
      <Box width={LABEL} flexShrink={0}>
        <Text>{label}</Text>
      </Box>
      <Box key={key} flexGrow={1}>
        <Text wrap="truncate-end">{value}</Text>
      </Box>
    </Box>
  )
}

function tokensIn(counters: Counters): string {
  const fresh = formatTokens(counters.inputTokens)
  const cache: string[] = []
  if (counters.cacheReadTokens > 0) cache.push(`+${formatTokens(counters.cacheReadTokens)} read from cache`)
  if (counters.cacheWriteTokens > 0) cache.push(cache.length > 0 ? `+${formatTokens(counters.cacheWriteTokens)} written to it` : `+${formatTokens(counters.cacheWriteTokens)} written to cache`)
  return cache.length > 0 ? `${fresh}  (${cache.join(', ')})` : fresh
}

/** The pane's drawing, per the spec's layout and its 0.2.0 amendment. */
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
  const cells = barCellsFor(columns)
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
        [
          headerRow(els, cells),
          ...windows.map(window =>
            gaugeRow(els, `window-${window.kind}`, WINDOW_LABELS[window.kind] ?? window.kind, window.percentUsed, resetText(window, now), cells),
          ),
        ]
      )}
      {context.percent === undefined ? (
        <Box flexDirection="row" columnGap={GAP}>
          <Box key="context-label" width={LABEL} flexShrink={0}>
            <Text>Context</Text>
          </Box>
          <Box key="context-waiting" flexGrow={1}>
            <Text dimColor>waiting for the first response</Text>
          </Box>
        </Box>
      ) : (
        gaugeRow(
          els,
          'context',
          'Context',
          context.percent,
          context.tokens === undefined ? '' : `${formatTokens(context.tokens)} of ${formatTokens(context.window)}`,
          cells,
        )
      )}
      <Text> </Text>
      <Text bold>This session</Text>
      {snapshot.usd !== undefined && figureRow(els, 'spend', 'Spend', formatUsd(snapshot.usd))}
      {figureRow(els, 'tokens-in', 'Tokens in', tokensIn(counters))}
      {figureRow(els, 'tokens-out', 'Tokens out', formatTokens(counters.outputTokens))}
      {figureRow(els, 'turns', 'Turns', String(counters.turns))}
      {figureRow(els, 'tool-calls', 'Tool calls', String(counters.toolCalls))}
      {figureRow(els, 'running', 'Running', formatDuration(now - snapshot.startedAt))}
    </Box>
  )
}
