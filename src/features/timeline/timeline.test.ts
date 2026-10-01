import { describe, expect, it } from 'vitest'
import { adjustBarWidth, barFromClientX, barDurationSeconds, barsForDuration, blockStyle, canPlace, clampMinuteGuideStart, collides, MAX_BAR_WIDTH, MIN_BAR_WIDTH, minuteGuideDurationBars, moveBlock, overlaps, resizeBlock, snapDelta, timeSignatureAtBar } from './timeline'

const block = (id: string, startBar: number, durationBars: number) => ({ id, label: id, memo: '', startBar, durationBars, color: 'cyan' as const })

describe('timeline geometry', () => {
  it('uses the row rect coordinate without adding scrollLeft twice', () => {
    expect(barFromClientX(340, 100, 48, 64)).toBe(5)
    expect(blockStyle(block('a', 2, 4), 48)).toEqual({ left: 96, width: 192 })
  })

  it('snaps pointer movement to whole bars', () => {
    expect(snapDelta(221, 100, 48)).toBe(3)
    expect(snapDelta(121, 100, 48)).toBe(0)
    expect(snapDelta(75, 100, 48)).toBe(-1)
  })

  it('treats touching intervals as valid and crossing intervals as overlap', () => {
    expect(overlaps(block('a', 0, 4), block('b', 4, 2))).toBe(false)
    expect(overlaps(block('a', 0, 4), block('b', 3, 2))).toBe(true)
    expect(collides(block('a', 0, 4), [block('a', 0, 4), block('b', 4, 2)])).toBe(false)
  })

  it('clamps moving and resizing to the timeline and minimum duration', () => {
    expect(moveBlock(block('a', 2, 4), -10, 12).startBar).toBe(0)
    expect(moveBlock(block('a', 2, 4), 20, 12).startBar).toBe(8)
    expect(resizeBlock(block('a', 2, 4), 'left', 20, 12)).toMatchObject({ startBar: 5, durationBars: 1 })
    expect(resizeBlock(block('a', 2, 4), 'right', 20, 12)).toMatchObject({ startBar: 2, durationBars: 10 })
  })

  it('rejects out-of-range and overlapping placements', () => {
    const other = block('b', 4, 2)
    expect(canPlace(block('a', 3, 2), [other], 16)).toBe(false)
    expect(canPlace(block('a', 6, 2), [other], 16)).toBe(true)
    expect(canPlace(block('a', 15, 2), [], 16)).toBe(false)
  })
})

describe('adjustBarWidth', () => {
  it('changes the width by 8px', () => {
    expect(adjustBarWidth(48, 1)).toBe(56)
    expect(adjustBarWidth(48, -1)).toBe(40)
  })

  it('clamps the width to the supported range', () => {
    expect(adjustBarWidth(MAX_BAR_WIDTH, 1)).toBe(MAX_BAR_WIDTH)
    expect(adjustBarWidth(MIN_BAR_WIDTH, -1)).toBe(MIN_BAR_WIDTH)
  })
})

describe('time signature geometry', () => {
  it('uses the most recent change for a bar', () => {
    const initial = { beatsPerBar: 4, beatUnit: 4 as const }
    const changes = [{ startBar: 8, beatsPerBar: 3, beatUnit: 4 as const }]
    expect(timeSignatureAtBar(initial, changes, 7)).toEqual(initial)
    expect(timeSignatureAtBar(initial, changes, 8)).toEqual(changes[0])
    expect(barDurationSeconds(120, changes[0])).toBe(1.5)
  })

  it('counts variable-length bars for a minute guide', () => {
    expect(barsForDuration(0, 60, 64, 120, { beatsPerBar: 4, beatUnit: 4 }, [])).toBe(30)
    expect(barsForDuration(0, 60, 64, 120, { beatsPerBar: 4, beatUnit: 4 }, [{ startBar: 8, beatsPerBar: 3, beatUnit: 4 }])).toBe(38)
  })

  it('starts each minute guide using the signature at its position', () => {
    const changes = [{ startBar: 8, beatsPerBar: 3, beatUnit: 4 as const }]
    expect(minuteGuideDurationBars(0, 64, 120, { beatsPerBar: 4, beatUnit: 4 }, changes)).toBe(38)
    expect(minuteGuideDurationBars(38, 64, 120, { beatsPerBar: 4, beatUnit: 4 }, changes)).toBe(40)
    expect(clampMinuteGuideStart(50, 64, 120, { beatsPerBar: 4, beatUnit: 4 }, changes)).toBe(24)
  })
})
