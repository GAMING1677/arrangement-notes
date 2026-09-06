import { describe, expect, it } from 'vitest'
import type { ArrangementProject, IdeaBlock, IdeaLane } from './project'
import { applyProjectMutation, createProject } from './project-reducer'

const NOW = '2026-09-06T00:00:00.000Z'
const LATER = '2026-09-06T00:01:00.000Z'
const projectId = 'd9508367-412a-45f8-a94f-9a4b55f34933'
const laneId = '15b892d9-eec3-4c4a-bff6-263c9056e6ec'
const blockId = '9b4e8dce-5769-4b60-b061-6296f5333c2f'

const lane = (id = laneId): IdeaLane => ({
  id,
  name: '構成',
  color: 'cyan',
  blocks: [],
})

const block = (id = blockId, startBar = 0, durationBars = 4): IdeaBlock => ({
  id,
  label: 'Intro',
  memo: '',
  startBar,
  durationBars,
})

const projectWithLane = (): ArrangementProject => {
  const created = createProject(projectId, NOW)
  const added = applyProjectMutation(created, { type: 'lane/add', lane: lane() }, LATER)
  if (!added.ok) throw new Error(added.error)
  return added.value
}

describe('project reducer', () => {
  it('creates a valid empty project with injected ID and timestamps', () => {
    const project = createProject(projectId, NOW)
    expect(project.id).toBe(projectId)
    expect(project.createdAt).toBe(NOW)
    expect(project.updatedAt).toBe(NOW)
    expect(project.name).toBe('無題のプロジェクト')
    expect(project.lanes).toEqual([])
  })

  it('applies settings, lane, and block mutations without mutating the input', () => {
    const original = projectWithLane()
    const changed = applyProjectMutation(
      original,
      {
        type: 'project/settings',
        name: '新しい曲',
        tempo: { bpm: 132.5, timeSignature: { beatsPerBar: 3, beatUnit: 4 } },
        totalBars: 32,
      },
      '2026-09-06T00:02:00.000Z',
    )
    expect(changed.ok).toBe(true)
    if (!changed.ok) return
    expect(changed.value).not.toBe(original)
    expect(changed.value.lanes).not.toBe(original.lanes)
    expect(changed.value.name).toBe('新しい曲')
    expect(changed.value.tempo.bpm).toBe(132.5)
    expect(changed.value.timeline.totalBars).toBe(32)
    expect(original.name).toBe('無題のプロジェクト')

    const withBlock = applyProjectMutation(
      changed.value,
      { type: 'block/add', laneId, block: block() },
      '2026-09-06T00:03:00.000Z',
    )
    expect(withBlock.ok).toBe(true)
    if (!withBlock.ok) return
    expect(withBlock.value.lanes[0].blocks).toEqual([block()])
    expect(changed.value.lanes[0].blocks).toEqual([])
  })

  it('rejects invalid mutations while returning the original value unchanged', () => {
    const original = projectWithLane()
    const invalid = applyProjectMutation(
      original,
      { type: 'block/add', laneId, block: block(blockId, 2, 4) },
      '2026-09-06T00:02:00.000Z',
    )
    expect(invalid.ok).toBe(true)
    if (!invalid.ok) return

    const overlap = applyProjectMutation(
      invalid.value,
      { type: 'block/add', laneId, block: block('1bba9de1-8723-422e-aaef-b121c7854a51', 3, 4) },
      '2026-09-06T00:03:00.000Z',
    )
    expect(overlap.ok).toBe(false)
    expect(invalid.value.lanes[0].blocks).toHaveLength(1)
    expect(invalid.value.updatedAt).toBe('2026-09-06T00:02:00.000Z')

    const stale = applyProjectMutation(
      invalid.value,
      { type: 'lane/update', laneId, name: '変更', color: 'violet' },
      '2026-09-06T00:01:00.000Z',
    )
    expect(stale.ok).toBe(false)
    expect(invalid.value.lanes[0].name).toBe('構成')
  })

  it('updates and removes existing entities, and rejects missing entities', () => {
    const original = projectWithLane()
    const withBlock = applyProjectMutation(original, { type: 'block/add', laneId, block: block() }, LATER)
    if (!withBlock.ok) throw new Error(withBlock.error)

    const updated = applyProjectMutation(
      withBlock.value,
      { type: 'block/update', laneId, block: block(blockId, 8, 2) },
      '2026-09-06T00:02:00.000Z',
    )
    expect(updated.ok).toBe(true)
    if (!updated.ok) return
    expect(updated.value.lanes[0].blocks[0].startBar).toBe(8)

    const removedBlock = applyProjectMutation(
      updated.value,
      { type: 'block/remove', laneId, blockId },
      '2026-09-06T00:03:00.000Z',
    )
    expect(removedBlock.ok).toBe(true)
    if (!removedBlock.ok) return
    expect(removedBlock.value.lanes[0].blocks).toEqual([])

    const removedLane = applyProjectMutation(
      removedBlock.value,
      { type: 'lane/remove', laneId },
      '2026-09-06T00:04:00.000Z',
    )
    expect(removedLane.ok).toBe(true)
    if (!removedLane.ok) return
    expect(removedLane.value.lanes).toEqual([])
    expect(
      applyProjectMutation(removedLane.value, { type: 'lane/remove', laneId }, '2026-09-06T00:05:00.000Z').ok,
    ).toBe(false)
  })
})
