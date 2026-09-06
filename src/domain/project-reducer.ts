import type { ProjectMutation, Result } from './editor-contracts'
import type { ArrangementProject, IdeaBlock, IdeaLane } from './project'
import { DEFAULT_PROJECT_SETTINGS, PROJECT_FORMAT, SCHEMA_VERSION } from './project'
import { validateBlock, validateLane, validateProject } from './project-schema'

const fail = <T>(error: string): Result<T> => ({ ok: false, error })

const cloneBlock = (block: IdeaBlock): IdeaBlock => ({ ...block })

const cloneLane = (lane: IdeaLane): IdeaLane => ({
  ...lane,
  blocks: lane.blocks.map(cloneBlock),
})

const cloneProject = (project: ArrangementProject): ArrangementProject => ({
  ...project,
  tempo: {
    bpm: project.tempo.bpm,
    timeSignature: { ...project.tempo.timeSignature },
  },
  timeline: { ...project.timeline },
  lanes: project.lanes.map(cloneLane),
})

const isValidMutationTime = (project: ArrangementProject, now: string): boolean => {
  const parsed = Date.parse(now)
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(now) &&
    !Number.isNaN(parsed) &&
    parsed >= Date.parse(project.updatedAt)
}

const setUpdatedAt = (project: ArrangementProject, now: string): ArrangementProject => ({
  ...project,
  updatedAt: now,
})

export const createProject = (id: string, now: string): ArrangementProject => {
  const project: ArrangementProject = {
    format: PROJECT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    id,
    name: '無題のプロジェクト',
    createdAt: now,
    updatedAt: now,
    tempo: {
      bpm: DEFAULT_PROJECT_SETTINGS.bpm,
      timeSignature: {
        beatsPerBar: DEFAULT_PROJECT_SETTINGS.beatsPerBar,
        beatUnit: DEFAULT_PROJECT_SETTINGS.beatUnit,
      },
    },
    timeline: { totalBars: DEFAULT_PROJECT_SETTINGS.totalBars },
    lanes: [],
  }
  const validated = validateProject(project)
  if (!validated.ok) {
    throw new Error(validated.error)
  }
  return validated.value
}

export const applyProjectMutation = (
  project: ArrangementProject,
  mutation: ProjectMutation,
  now: string,
): Result<ArrangementProject> => {
  const current = validateProject(project)
  if (!current.ok) return fail(`現在のプロジェクトが不正です: ${current.error}`)
  if (!isValidMutationTime(current.value, now)) {
    return fail('更新日時はUTCのISO 8601形式で、現在のupdatedAt以降にしてください')
  }

  const next = cloneProject(current.value)
  switch (mutation.type) {
    case 'project/settings':
      next.name = mutation.name
      next.tempo = {
        bpm: mutation.tempo.bpm,
        timeSignature: { ...mutation.tempo.timeSignature },
      }
      next.timeline = { totalBars: mutation.totalBars }
      break
    case 'lane/add':
      next.lanes.push(cloneLane(mutation.lane))
      break
    case 'lane/update': {
      const lane = next.lanes.find((candidate) => candidate.id === mutation.laneId)
      if (!lane) return fail(`レーンが見つかりません: ${mutation.laneId}`)
      lane.name = mutation.name
      lane.color = mutation.color
      break
    }
    case 'lane/remove': {
      const laneIndex = next.lanes.findIndex((candidate) => candidate.id === mutation.laneId)
      if (laneIndex < 0) return fail(`レーンが見つかりません: ${mutation.laneId}`)
      next.lanes.splice(laneIndex, 1)
      break
    }
    case 'block/add': {
      const lane = next.lanes.find((candidate) => candidate.id === mutation.laneId)
      if (!lane) return fail(`レーンが見つかりません: ${mutation.laneId}`)
      lane.blocks.push(cloneBlock(mutation.block))
      break
    }
    case 'block/update': {
      const lane = next.lanes.find((candidate) => candidate.id === mutation.laneId)
      if (!lane) return fail(`レーンが見つかりません: ${mutation.laneId}`)
      const blockIndex = lane.blocks.findIndex((candidate) => candidate.id === mutation.block.id)
      if (blockIndex < 0) return fail(`ブロックが見つかりません: ${mutation.block.id}`)
      lane.blocks[blockIndex] = cloneBlock(mutation.block)
      break
    }
    case 'block/remove': {
      const lane = next.lanes.find((candidate) => candidate.id === mutation.laneId)
      if (!lane) return fail(`レーンが見つかりません: ${mutation.laneId}`)
      const blockIndex = lane.blocks.findIndex((candidate) => candidate.id === mutation.blockId)
      if (blockIndex < 0) return fail(`ブロックが見つかりません: ${mutation.blockId}`)
      lane.blocks.splice(blockIndex, 1)
      break
    }
  }

  const candidate = setUpdatedAt(next, now)
  if (mutation.type === 'lane/add') {
    const laneResult = validateLane(mutation.lane)
    if (!laneResult.ok) return fail(`追加するレーンが不正です: ${laneResult.error}`)
  }
  if (mutation.type === 'block/add' || mutation.type === 'block/update') {
    const blockResult = validateBlock(mutation.block)
    if (!blockResult.ok) return fail(`追加・更新するブロックが不正です: ${blockResult.error}`)
  }
  const validated = validateProject(candidate)
  return validated.ok ? validated : fail(validated.error)
}
