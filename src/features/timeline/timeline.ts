import type { IdeaBlock, TimeSignature, TimeSignatureChange } from '@/domain/project'

export const MIN_BAR_WIDTH = 24
export const MAX_BAR_WIDTH = 96
export const BAR_WIDTH_STEP = 8

export function barsPerMinute(bpm: number, beatsPerBar: number, beatUnit: number): number {
  return bpm / (beatsPerBar * (4 / beatUnit))
}

export function timeSignatureAtBar(initial: TimeSignature, changes: readonly TimeSignatureChange[], bar: number): TimeSignature {
  let current = initial
  for (const change of changes) {
    if (change.startBar > bar) break
    current = change
  }
  return current
}

export function barDurationSeconds(bpm: number, signature: TimeSignature): number {
  return (60 / bpm) * signature.beatsPerBar * (4 / signature.beatUnit)
}

export function barsForDuration(
  startBar: number,
  seconds: number,
  totalBars: number,
  bpm: number,
  initial: TimeSignature,
  changes: readonly TimeSignatureChange[],
): number {
  if (seconds <= 0 || startBar >= totalBars) return 0
  let elapsed = 0
  let bars = 0
  while (startBar + bars < totalBars && elapsed < seconds) {
    elapsed += barDurationSeconds(bpm, timeSignatureAtBar(initial, changes, startBar + bars))
    bars += 1
  }
  return bars
}

export function minuteGuideDurationBars(
  startBar: number,
  totalBars: number,
  bpm: number,
  initial: TimeSignature,
  changes: readonly TimeSignatureChange[],
): number {
  const shortestBarSeconds = barDurationSeconds(bpm, { beatsPerBar: 1, beatUnit: 16 })
  const horizonBars = Math.max(totalBars, startBar + Math.ceil(60 / shortestBarSeconds) + 1)
  return Math.max(1, barsForDuration(startBar, 60, horizonBars, bpm, initial, changes))
}

export function clampMinuteGuideStart(
  startBar: number,
  totalBars: number,
  bpm: number,
  initial: TimeSignature,
  changes: readonly TimeSignatureChange[],
): number {
  let candidate = clampBar(startBar, 0, Math.max(0, totalBars - 1))
  while (candidate > 0 && candidate + minuteGuideDurationBars(candidate, totalBars, bpm, initial, changes) > totalBars) {
    candidate -= 1
  }
  return candidate
}

export function adjustBarWidth(barWidth: number, direction: -1 | 1): number {
  return Math.min(MAX_BAR_WIDTH, Math.max(MIN_BAR_WIDTH, barWidth + direction * BAR_WIDTH_STEP))
}

export type TimelineInteraction = 'move' | 'resize-left' | 'resize-right'

export function clampBar(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)))
}

export function snapDelta(clientX: number, initialClientX: number, barWidth: number): number {
  if (barWidth <= 0) return 0
  return Math.round((clientX - initialClientX) / barWidth)
}

export function blockStyle(block: Pick<IdeaBlock, 'startBar' | 'durationBars'>, barWidth: number) {
  return { left: block.startBar * barWidth, width: block.durationBars * barWidth }
}

export function barFromClientX(clientX: number, rowLeft: number, barWidth: number, totalBars: number): number {
  if (barWidth <= 0) return 0
  return clampBar((clientX - rowLeft) / barWidth, 0, Math.max(0, totalBars - 1))
}

export function overlaps(a: Pick<IdeaBlock, 'startBar' | 'durationBars'>, b: Pick<IdeaBlock, 'startBar' | 'durationBars'>): boolean {
  return a.startBar < b.startBar + b.durationBars && b.startBar < a.startBar + a.durationBars
}

export function collides(block: Pick<IdeaBlock, 'id' | 'startBar' | 'durationBars'>, siblings: readonly IdeaBlock[]): boolean {
  return siblings.some((candidate) => candidate.id !== block.id && overlaps(block, candidate))
}

export function moveBlock(block: IdeaBlock, deltaBars: number, totalBars: number): IdeaBlock {
  return { ...block, startBar: clampBar(block.startBar + deltaBars, 0, Math.max(0, totalBars - block.durationBars)) }
}

export function resizeBlock(block: IdeaBlock, edge: 'left' | 'right', deltaBars: number, totalBars: number): IdeaBlock {
  if (edge === 'left') {
    const end = block.startBar + block.durationBars
    const start = clampBar(block.startBar + deltaBars, 0, end - 1)
    return { ...block, startBar: start, durationBars: end - start }
  }
  const duration = clampBar(block.durationBars + deltaBars, 1, totalBars - block.startBar)
  return { ...block, durationBars: duration }
}

export function canPlace(block: Pick<IdeaBlock, 'id' | 'startBar' | 'durationBars'>, siblings: readonly IdeaBlock[], totalBars: number): boolean {
  return block.startBar >= 0 && block.durationBars >= 1 && block.startBar + block.durationBars <= totalBars && !collides(block, siblings)
}
