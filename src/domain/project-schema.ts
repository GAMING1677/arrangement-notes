import { z } from 'zod'
import type { ArrangementProject, IdeaBlock, IdeaLane, LaneColor } from './project'
import { PROJECT_FORMAT, SCHEMA_VERSION } from './project'
import type { Result } from './editor-contracts'

export const MAX_LANES = 100
export const MAX_BLOCKS = 5_000
export const MAX_TOTAL_BARS = 1_024
export const MAX_PROJECT_NAME_LENGTH = 120
export const MAX_LANE_NAME_LENGTH = 120
export const MAX_BLOCK_LABEL_LENGTH = 120
export const MAX_BLOCK_MEMO_LENGTH = 10_000

const isUtcIsoDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(value)
  if (!match) return false
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return false
  const date = new Date(parsed)
  const milliseconds = Number((match[7] ?? '').padEnd(3, '0') || 0)
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]) &&
    date.getUTCHours() === Number(match[4]) &&
    date.getUTCMinutes() === Number(match[5]) &&
    date.getUTCSeconds() === Number(match[6]) &&
    date.getUTCMilliseconds() === milliseconds
  )
}

const utcIsoDate = z.string().refine(isUtcIsoDate, 'UTCのISO 8601日時を指定してください')

const uuid = z.string().uuid('UUIDを指定してください')

const projectName = z.string().refine(
  (value) => value.trim().length >= 1 && value.trim().length <= MAX_PROJECT_NAME_LENGTH,
  `プロジェクト名はtrim後${MAX_PROJECT_NAME_LENGTH}文字以内で、空にできません`,
)

const laneName = z.string().refine(
  (value) => value.trim().length >= 1 && value.trim().length <= MAX_LANE_NAME_LENGTH,
  `レーン名はtrim後${MAX_LANE_NAME_LENGTH}文字以内で、空にできません`,
)

const blockLabel = z.string().refine(
  (value) => value.trim().length >= 1 && value.trim().length <= MAX_BLOCK_LABEL_LENGTH,
  `ブロックラベルはtrim後${MAX_BLOCK_LABEL_LENGTH}文字以内で、空にできません`,
)

const laneColor = z.enum(['cyan', 'violet', 'amber', 'emerald', 'rose', 'blue'])
const beatUnit = z.union([z.literal(2), z.literal(4), z.literal(8), z.literal(16)])

const blockSchema = z
  .object({
    id: uuid,
    label: blockLabel,
    memo: z.string().max(MAX_BLOCK_MEMO_LENGTH, `メモは${MAX_BLOCK_MEMO_LENGTH}文字以内で指定してください`),
    startBar: z.number().int('開始小節は整数で指定してください').nonnegative('開始小節は0以上で指定してください'),
    durationBars: z.number().int('長さは整数で指定してください').min(1, '長さは1小節以上で指定してください'),
    // Optional for backwards compatibility with v1 files. validateProject fills it from the lane color.
    color: laneColor.optional(),
  })
  .strict()

const laneSchema = z
  .object({
    id: uuid,
    name: laneName,
    color: laneColor,
    blocks: z.array(blockSchema),
  })
  .strict()

const projectShapeSchema = z
  .object({
    format: z.literal(PROJECT_FORMAT),
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: uuid,
    name: projectName,
    createdAt: utcIsoDate,
    updatedAt: utcIsoDate,
    tempo: z
      .object({
        bpm: z
          .number()
          .finite('BPMは有限数で指定してください')
          .min(20, 'BPMは20以上で指定してください')
          .max(400, 'BPMは400以下で指定してください')
          .refine((value) => Number.isInteger(value * 10), 'BPMは小数第1位までで指定してください'),
        timeSignature: z
          .object({
            beatsPerBar: z.number().int('拍子の分子は整数で指定してください').min(1).max(16),
            beatUnit,
          })
          .strict(),
      })
      .strict(),
    timeline: z
      .object({
        totalBars: z
          .number()
          .int('総小節数は整数で指定してください')
          .min(1, '総小節数は1以上で指定してください')
          .max(MAX_TOTAL_BARS, `総小節数は${MAX_TOTAL_BARS}以下で指定してください`),
        minuteBars: z.array(z.number().int().nonnegative()).max(MAX_TOTAL_BARS, '1分バーが多すぎます').default([0]),
      })
      .strict(),
    lanes: z.array(laneSchema).max(MAX_LANES, `レーンは${MAX_LANES}件以内で指定してください`),
  })
  .strict()

const issueMessage = (path: PropertyKey[], message: string) => {
  const location = path.length > 0 ? ` (${path.map(String).join('.')})` : ''
  return `${message}${location}`
}

const fail = <T>(error: string): Result<T> => ({ ok: false, error })

const semanticError = (project: ArrangementProject): string | undefined => {
  const createdAt = Date.parse(project.createdAt)
  const updatedAt = Date.parse(project.updatedAt)
  if (updatedAt < createdAt) {
    return 'updatedAtはcreatedAt以降の日時にしてください'
  }

  const minuteBarStarts = project.timeline.minuteBars
  if (minuteBarStarts.some((startBar) => startBar >= project.timeline.totalBars)) {
    return '1分バーの開始位置が曲末を超えています'
  }
  if (new Set(minuteBarStarts).size !== minuteBarStarts.length) {
    return '1分バーの位置が重複しています'
  }

  const laneIds = new Set<string>()
  const entityIds = new Set<string>([project.id])
  let blockCount = 0

  for (const [laneIndex, lane] of project.lanes.entries()) {
    if (laneIds.has(lane.id)) {
      return `レーンIDが重複しています: ${lane.id}`
    }
    laneIds.add(lane.id)
    if (entityIds.has(lane.id)) {
      return `IDが重複しています: ${lane.id}`
    }
    entityIds.add(lane.id)

    const sortedBlocks = [...lane.blocks].sort(
      (left, right) => left.startBar - right.startBar || left.id.localeCompare(right.id),
    )
    for (let index = 0; index < sortedBlocks.length; index += 1) {
      const block = sortedBlocks[index]
      blockCount += 1
      if (blockCount > MAX_BLOCKS) {
        return `ブロックは${MAX_BLOCKS}件以内で指定してください`
      }
      if (entityIds.has(block.id)) {
        return `IDが重複しています: ${block.id}`
      }
      entityIds.add(block.id)
      if (block.startBar + block.durationBars > project.timeline.totalBars) {
        return `レーン${laneIndex + 1}のブロックが曲末を超えています`
      }
      const previous = sortedBlocks[index - 1]
      if (previous && previous.startBar + previous.durationBars > block.startBar) {
        return `レーン${laneIndex + 1}のブロックが重なっています`
      }
    }
  }

  return undefined
}

export const validateProject = (value: unknown): Result<ArrangementProject> => {
  const parsed = projectShapeSchema.safeParse(value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return fail(issueMessage(issue.path, issue.message))
  }

  const project = {
    ...parsed.data,
    lanes: parsed.data.lanes.map((lane) => ({
      ...lane,
      blocks: lane.blocks.map((block): IdeaBlock => ({
        id: block.id,
        label: block.label,
        memo: block.memo,
        startBar: block.startBar,
        durationBars: block.durationBars,
        color: block.color ?? lane.color,
      })),
    })),
  } as ArrangementProject
  const error = semanticError(project)
  return error ? fail(error) : { ok: true, value: project }
}

export const isLaneColor = (value: string): value is LaneColor => laneColor.safeParse(value).success

export const validateBlock = (value: unknown): Result<IdeaBlock> => {
  const parsed = blockSchema.safeParse(value)
  return parsed.success
    ? { ok: true, value: { ...parsed.data, color: parsed.data.color ?? 'cyan' } as IdeaBlock }
    : fail(parsed.error.issues[0].message)
}

export const validateLane = (value: unknown): Result<IdeaLane> => {
  const parsed = laneSchema.safeParse(value)
  return parsed.success
    ? {
        ok: true,
        value: {
          ...parsed.data,
          blocks: parsed.data.blocks.map((block): IdeaBlock => ({
            id: block.id,
            label: block.label,
            memo: block.memo,
            startBar: block.startBar,
            durationBars: block.durationBars,
            color: block.color ?? parsed.data.color,
          })),
        },
      }
    : fail(parsed.error.issues[0].message)
}
