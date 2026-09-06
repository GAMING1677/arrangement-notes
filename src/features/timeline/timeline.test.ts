import { describe, expect, it } from 'vitest'
import { barFromClientX, blockStyle, canPlace, collides, moveBlock, overlaps, resizeBlock, snapDelta } from './timeline'

const block = (id: string, startBar: number, durationBars: number) => ({ id, label: id, memo: '', startBar, durationBars })

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
