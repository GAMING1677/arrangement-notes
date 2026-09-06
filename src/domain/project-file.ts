import type { Result } from './editor-contracts'
import type { ArrangementProject } from './project'
import { validateProject } from './project-schema'

export const MAX_PROJECT_FILE_BYTES = 5 * 1024 * 1024

const fail = (error: string): Result<never> => ({ ok: false, error })

const sortedProject = (project: ArrangementProject): ArrangementProject => ({
  ...project,
  tempo: {
    bpm: project.tempo.bpm,
    timeSignature: { ...project.tempo.timeSignature },
  },
  timeline: { ...project.timeline },
  lanes: project.lanes.map((lane) => ({
    ...lane,
    blocks: [...lane.blocks]
      .sort((left, right) => left.startBar - right.startBar || left.id.localeCompare(right.id))
      .map((block) => ({ ...block })),
  })),
})

export const parseProject = (text: string): Result<ArrangementProject> => {
  if (typeof text !== 'string') return fail('JSONテキストを指定してください')
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_FILE_BYTES) {
    return fail(`ファイルは${MAX_PROJECT_FILE_BYTES}バイト以内で指定してください`)
  }

  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    return fail('JSONを解析できません')
  }
  return validateProject(value)
}

export const serializeProject = (project: ArrangementProject): Result<string> => {
  const validated = validateProject(project)
  if (!validated.ok) return validated
  try {
    return { ok: true, value: `${JSON.stringify(sortedProject(validated.value), null, 2)}\n` }
  } catch {
    return fail('プロジェクトをJSONに変換できません')
  }
}
