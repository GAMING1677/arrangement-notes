/** File contract v2. Runtime validation is the first implementation task. */
export const PROJECT_FORMAT = 'arrangement-notes' as const
export const SCHEMA_VERSION = 2 as const
export const LEGACY_SCHEMA_VERSION = 1 as const

export type LaneColor = 'cyan' | 'violet' | 'amber' | 'emerald' | 'rose' | 'blue'
export type BeatUnit = 2 | 4 | 8 | 16

export interface TimeSignature {
  beatsPerBar: number
  beatUnit: BeatUnit
}

/** A change takes effect at this zero-based bar. Bar 0 uses tempo.timeSignature. */
export interface TimeSignatureChange extends TimeSignature {
  startBar: number
}

export interface IdeaBlock {
  id: string
  label: string
  memo: string
  /** Zero-based bar index; end = startBar + durationBars (exclusive). */
  startBar: number
  durationBars: number
  /** Block color. Legacy files without this field inherit their lane color on load. */
  color: LaneColor
}

export interface IdeaLane {
  id: string
  name: string
  color: LaneColor
  blocks: IdeaBlock[]
}

export interface ArrangementProject {
  format: typeof PROJECT_FORMAT
  schemaVersion: typeof SCHEMA_VERSION
  id: string
  name: string
  createdAt: string
  updatedAt: string
  tempo: { bpm: number; timeSignature: TimeSignature }
  timeline: { totalBars: number; minuteBars: number[]; timeSignatureChanges: TimeSignatureChange[] }
  lanes: IdeaLane[]
}

export const DEFAULT_PROJECT_SETTINGS = {
  bpm: 120,
  beatsPerBar: 4,
  beatUnit: 4,
  totalBars: 64,
} as const
