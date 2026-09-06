import { describe, expect, it } from 'vitest'
import sample from '../../examples/arrangement-notes.v1.json'
import type { ArrangementProject } from './project'
import {
  MAX_BLOCK_MEMO_LENGTH,
  MAX_TOTAL_BARS,
  validateProject,
} from './project-schema'

const validProject = (): ArrangementProject => structuredClone(sample) as ArrangementProject

describe('validateProject', () => {
  it('accepts the documented v1 project', () => {
    const result = validateProject(validProject())
    expect(result.ok).toBe(true)
  })

  it('rejects unknown keys and malformed UTC timestamps', () => {
    const unknownKey = { ...validProject(), extra: true }
    const unknownResult = validateProject(unknownKey)
    const timestampProject = validProject()
    timestampProject.updatedAt = '2026-09-06T00:00:00+09:00'
    const impossibleDateProject = validProject()
    impossibleDateProject.updatedAt = '2026-02-30T00:00:00.000Z'

    expect(unknownResult.ok).toBe(false)
    expect(validateProject(timestampProject).ok).toBe(false)
    expect(validateProject(impossibleDateProject).ok).toBe(false)
  })

  it('rejects invalid settings and content limits', () => {
    const project = validProject()
    project.tempo.bpm = 120.25
    expect(validateProject(project).ok).toBe(false)

    project.tempo.bpm = 120
    project.timeline.totalBars = MAX_TOTAL_BARS + 1
    expect(validateProject(project).ok).toBe(false)

    project.timeline.totalBars = 64
    project.lanes[0].blocks[0].memo = 'x'.repeat(MAX_BLOCK_MEMO_LENGTH + 1)
    expect(validateProject(project).ok).toBe(false)
  })

  it('rejects timestamp order, duplicate IDs, out-of-range blocks, and overlaps', () => {
    const timestampProject = validProject()
    timestampProject.updatedAt = '2026-09-05T23:59:59.000Z'
    expect(validateProject(timestampProject).ok).toBe(false)

    const duplicateProject = validProject()
    duplicateProject.lanes[1].blocks[0].id = duplicateProject.lanes[0].blocks[0].id
    expect(validateProject(duplicateProject).ok).toBe(false)

    const outOfRangeProject = validProject()
    outOfRangeProject.lanes[0].blocks[0].startBar = 60
    expect(validateProject(outOfRangeProject).ok).toBe(false)

    const overlapProject = validProject()
    overlapProject.lanes[0].blocks[1].startBar = 7
    expect(validateProject(overlapProject).ok).toBe(false)
  })
})
