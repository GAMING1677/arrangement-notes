import { describe, expect, it } from 'vitest'
import sample from '../../examples/arrangement-notes.v1.json'
import { PROJECT_FORMAT, SCHEMA_VERSION } from './project'

// Contract fixture checks; runtime validation and editing tests come next.
describe('v1 handoff fixture', () => {
  it('identifies the documented format and contains unique entity IDs', () => {
    expect(sample.format).toBe(PROJECT_FORMAT)
    expect(sample.schemaVersion).toBe(SCHEMA_VERSION)
    const laneIds = sample.lanes.map((lane) => lane.id)
    const blockIds = sample.lanes.flatMap((lane) => lane.blocks.map((block) => block.id))
    expect(new Set(laneIds).size).toBe(laneIds.length)
    expect(new Set(blockIds).size).toBe(blockIds.length)
  })

  it('demonstrates adjacent, non-overlapping intervals inside the song', () => {
    for (const lane of sample.lanes) {
      const blocks = [...lane.blocks].sort((a, b) => a.startBar - b.startBar)
      for (const [index, block] of blocks.entries()) {
        expect(Number.isInteger(block.startBar)).toBe(true)
        expect(Number.isInteger(block.durationBars)).toBe(true)
        expect(block.startBar).toBeGreaterThanOrEqual(0)
        expect(block.durationBars).toBeGreaterThanOrEqual(1)
        expect(block.startBar + block.durationBars).toBeLessThanOrEqual(sample.timeline.totalBars)
        if (index > 0) {
          const previous = blocks[index - 1]
          expect(previous.startBar + previous.durationBars).toBeLessThanOrEqual(block.startBar)
        }
      }
    }
  })
})
