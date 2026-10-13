import { describe, expect, test } from 'claude-code/testing'

import {
  barCells,
  formatCountdown,
  formatDuration,
  formatPercent,
  formatTokens,
  formatUsd,
  toSnapshot,
  urgency,
} from './usage'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const NOW = Date.parse('2026-10-13T12:00:00Z')

describe('formatPercent', () => {
  test('rounds to a whole number and keeps values over 100', () => {
    expect(formatPercent(61.6)).toBe('62%')
    expect(formatPercent(104)).toBe('104%')
    expect(formatPercent(0)).toBe('0%')
  })
})

describe('formatDuration', () => {
  test('shows the largest two units and drops a zero second unit', () => {
    expect(formatDuration(30_000)).toBe('under 1m')
    expect(formatDuration(47 * MIN)).toBe('47m')
    expect(formatDuration(HOUR + 6 * MIN)).toBe('1h 6m')
    expect(formatDuration(2 * HOUR + 14 * MIN)).toBe('2h 14m')
    expect(formatDuration(2 * HOUR)).toBe('2h')
    expect(formatDuration(3 * DAY + 4 * HOUR + 30 * MIN)).toBe('3d 4h')
    expect(formatDuration(3 * DAY)).toBe('3d')
  })
  test('treats zero and negative spans as under a minute', () => {
    expect(formatDuration(0)).toBe('under 1m')
    expect(formatDuration(-5 * MIN)).toBe('under 1m')
  })
})

describe('formatCountdown', () => {
  test('counts down to an ISO reset time', () => {
    expect(formatCountdown('2026-10-13T14:14:00Z', NOW)).toBe('2h 14m')
    expect(formatCountdown('2026-10-16T16:00:00Z', NOW)).toBe('3d 4h')
  })
  test('says now for a reset already passed', () => {
    expect(formatCountdown('2026-10-13T11:00:00Z', NOW)).toBe('now')
  })
  test('gives nothing for a missing or unreadable time', () => {
    expect(formatCountdown(undefined, NOW)).toBeUndefined()
    expect(formatCountdown('soon', NOW)).toBeUndefined()
  })
})

describe('formatTokens', () => {
  test('uses k and M with one decimal, dropping .0', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(1000)).toBe('1k')
    expect(formatTokens(1234)).toBe('1.2k')
    expect(formatTokens(82_000)).toBe('82k')
    expect(formatTokens(999_999)).toBe('1M')
    expect(formatTokens(2_100_000)).toBe('2.1M')
  })
})

describe('formatUsd', () => {
  test('shows two decimals', () => {
    expect(formatUsd(1.844)).toBe('$1.84')
    expect(formatUsd(0)).toBe('$0.00')
  })
})

describe('barCells', () => {
  test('rounds the filled share and clamps to the width', () => {
    expect(barCells(0, 20)).toBe(0)
    expect(barCells(62, 20)).toBe(12)
    expect(barCells(100, 20)).toBe(20)
    expect(barCells(104, 20)).toBe(20)
    expect(barCells(62, 10)).toBe(6)
    expect(barCells(-3, 10)).toBe(0)
  })
})

describe('urgency', () => {
  test('turns yellow at 80 and red at 95', () => {
    expect(urgency(79.9)).toBe('normal')
    expect(urgency(80)).toBe('warning')
    expect(urgency(94.9)).toBe('warning')
    expect(urgency(95)).toBe('error')
  })
})

describe('toSnapshot', () => {
  test('copies the figures the pane needs and the read time', () => {
    const snapshot = toSnapshot(
      {
        startedAt: NOW - HOUR,
        context: { tokens: 82_000, window: 200_000, percent: 41 },
        rateLimits: [{ kind: 'five_hour', percentUsed: 62, resetsAt: '2026-10-13T14:14:00Z' }, { kind: 'seven_day', percentUsed: 18 }],
        cost: { usd: 1.84 },
      },
      NOW,
    )
    expect(snapshot).toEqual({
      readAt: NOW,
      startedAt: NOW - HOUR,
      windows: [
        { kind: 'five_hour', percentUsed: 62, resetsAt: '2026-10-13T14:14:00Z' },
        { kind: 'seven_day', percentUsed: 18 },
      ],
      context: { tokens: 82_000, window: 200_000, percent: 41 },
      usd: 1.84,
    })
  })
  test('leaves out what the engine left out', () => {
    const snapshot = toSnapshot({ startedAt: NOW, context: { window: 200_000 }, rateLimits: [] }, NOW)
    expect(snapshot).toEqual({ readAt: NOW, startedAt: NOW, windows: [], context: { window: 200_000 } })
  })
})
