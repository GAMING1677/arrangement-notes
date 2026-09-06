import { describe, expect, it } from 'vitest'
import sample from '../../examples/arrangement-notes.v1.json'
import type { ArrangementProject } from './project'
import { parseProject, serializeProject } from './project-file'

const project = (): ArrangementProject => {
  const value = structuredClone(sample) as ArrangementProject
  value.lanes[0].blocks.reverse()
  return value
}

describe('project file conversion', () => {
  it('serializes blocks in stable order and parses the result back', () => {
    const serialized = serializeProject(project())
    expect(serialized.ok).toBe(true)
    if (!serialized.ok) return
    const parsed = parseProject(serialized.value)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value).toEqual({ ...project(), lanes: project().lanes.map((lane, index) => ({
      ...lane,
      blocks: index === 0 ? [...lane.blocks].sort((a, b) => a.startBar - b.startBar || a.id.localeCompare(b.id)) : lane.blocks,
    })) })
    expect(serialized.value.endsWith('\n')).toBe(true)
  })

  it('rejects malformed JSON, unknown fields, and semantic violations', () => {
    expect(parseProject('{not json').ok).toBe(false)

    const unknown = { ...project(), extra: true }
    expect(parseProject(JSON.stringify(unknown)).ok).toBe(false)

    const overlap = project()
    overlap.lanes[0].blocks[1].startBar = 7
    expect(parseProject(JSON.stringify(overlap)).ok).toBe(false)
  })

  it('rejects a text payload over the file size limit before parsing', () => {
    expect(parseProject(' '.repeat(5 * 1024 * 1024 + 1)).ok).toBe(false)
  })

  it('does not serialize an invalid project', () => {
    const invalid = project()
    invalid.lanes[0].blocks[0].durationBars = 0
    expect(serializeProject(invalid).ok).toBe(false)
  })
})
