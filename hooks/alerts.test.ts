import { describe, expect, test } from 'claude-code/testing'

import type { AlertState, LimitWindow, Snapshot } from '../types'
import { INITIAL_ALERTS, dueAlerts } from './alerts'
import { statusText } from './status'

const NOW = Date.parse('2026-10-13T12:00:00Z')
const RESET = '2026-10-13T14:14:00Z'

function snap(windows: LimitWindow[], percent?: number): Snapshot {
  return {
    readAt: NOW,
    startedAt: NOW,
    windows,
    context: percent === undefined ? { window: 200_000 } : { window: 200_000, percent },
  }
}

const five = (percentUsed: number, resetsAt: string | undefined = RESET): LimitWindow =>
  resetsAt === undefined ? { kind: 'five_hour', percentUsed } : { kind: 'five_hour', percentUsed, resetsAt }

/** Runs snapshots in order, returning the toast texts each produced. */
function run(snapshots: Snapshot[], start: AlertState = INITIAL_ALERTS): string[][] {
  let state = start
  return snapshots.map(s => {
    const { alerts, next } = dueAlerts(s, state)
    state = next
    return alerts.map(a => a.text)
  })
}

describe('statusText', () => {
  test('shows the 5-hour window and context', () => {
    expect(statusText(snap([five(62)], 41))).toBe('5h 62% · ctx 41%')
  })
  test('shows context alone without a 5-hour window', () => {
    expect(statusText(snap([], 41))).toBe('ctx 41%')
  })
  test('shows nothing before any figures', () => {
    expect(statusText(null)).toBeUndefined()
    expect(statusText(snap([]))).toBeUndefined()
  })
})

describe('window alerts', () => {
  test('80% fires once with the countdown', () => {
    expect(run([snap([five(82)]), snap([five(83)])])).toEqual([['5-hour limit at 82%, resets in 2h 14m'], []])
  })
  test('95% fires once after 80%', () => {
    expect(run([snap([five(82)]), snap([five(96)]), snap([five(97)])])).toEqual([
      ['5-hour limit at 82%, resets in 2h 14m'],
      ['5-hour limit at 96%, resets in 2h 14m'],
      [],
    ])
  })
  test('thresholds use the rounded number the toast shows', () => {
    expect(run([snap([five(82)]), snap([five(94.6)]), snap([five(95)])])).toEqual([
      ['5-hour limit at 82%, resets in 2h 14m'],
      ['5-hour limit at 95%, resets in 2h 14m'],
      [],
    ])
    expect(run([snap([five(79.5)])])).toEqual([['5-hour limit at 80%, resets in 2h 14m']])
    expect(run([snap([], 79.5)])).toEqual([['Context 80% full; consider /compact or /clear']])
  })
  test('jumping from 70% to 96% fires only the 95% alert', () => {
    expect(run([snap([five(70)]), snap([five(96)]), snap([five(96)])])).toEqual([
      [],
      ['5-hour limit at 96%, resets in 2h 14m'],
      [],
    ])
  })
  test('a new window fires again', () => {
    expect(run([snap([five(85)]), snap([five(85, '2026-10-13T19:00:00Z')])])).toEqual([
      ['5-hour limit at 85%, resets in 2h 14m'],
      ['5-hour limit at 85%, resets in 7h'],
    ])
  })
  test('the 7-day window is labelled, a spend limit does not alert', () => {
    const windows: LimitWindow[] = [
      { kind: 'seven_day', percentUsed: 81, resetsAt: '2026-10-16T16:00:00Z' },
      { kind: 'spend_limit', percentUsed: 99 },
    ]
    expect(run([snap(windows)])).toEqual([['7-day limit at 81%, resets in 3d 4h']])
  })
  test('a window without a reset time has no countdown', () => {
    expect(run([snap([{ kind: 'five_hour', percentUsed: 82 }])])).toEqual([['5-hour limit at 82%']])
  })
  test('a reset time already passed reads as resets now', () => {
    expect(run([snap([five(82, '2026-10-13T11:00:00Z')])])).toEqual([['5-hour limit at 82%, resets now']])
  })
  test('keeps only the last 50 fired keys', () => {
    const fired = Array.from({ length: 60 }, (_, i) => `old:${i}`)
    const { next } = dueAlerts(snap([five(82)]), { fired, isContextArmed: true })
    expect(next.fired).toHaveLength(50)
    expect(next.fired[next.fired.length - 1]).toBe(`five_hour:${RESET}:80`)
  })
})

describe('context alerts', () => {
  test('fires at 80%, then only again after dropping below 70%', () => {
    expect(run([snap([], 81), snap([], 85), snap([], 75), snap([], 65), snap([], 82)])).toEqual([
      ['Context 81% full; consider /compact or /clear'],
      [],
      [],
      [],
      ['Context 82% full; consider /compact or /clear'],
    ])
  })
  test('unknown context fires nothing', () => {
    expect(run([snap([])])).toEqual([[]])
  })
})

// built directly: five(p, undefined) would take the default reset time
const noReset = (percentUsed: number): LimitWindow => ({ kind: 'five_hour', percentUsed })

test('a window with no reset time warns again after dropping well below a threshold', () => {
  expect(run([snap([noReset(82)]), snap([noReset(65)]), snap([noReset(83)])])).toEqual([
    ['5-hour limit at 82%'],
    [],
    ['5-hour limit at 83%'],
  ])
})

test('a small dip below a threshold does not warn again', () => {
  expect(run([snap([noReset(82)]), snap([noReset(78)]), snap([noReset(83)])])).toEqual([['5-hour limit at 82%'], [], []])
})
