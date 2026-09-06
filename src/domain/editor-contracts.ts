import type { ArrangementProject, IdeaBlock, IdeaLane, LaneColor } from './project'

/** Shared boundary for independently implemented domain and controlled UI. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export type ProjectMutation =
  | { type: 'project/settings'; name: string; tempo: ArrangementProject['tempo']; totalBars: number }
  | { type: 'timeline/minute-bars'; minuteBars: number[]; totalBars: number }
  | { type: 'lane/add'; lane: IdeaLane }
  | { type: 'lane/update'; laneId: string; name: string; color: LaneColor }
  | { type: 'lane/remove'; laneId: string }
  | { type: 'block/add'; laneId: string; block: IdeaBlock }
  | { type: 'block/update'; laneId: string; block: IdeaBlock }
  | { type: 'block/remove'; laneId: string; blockId: string }

export interface ProjectServices {
  create: () => ArrangementProject
  parse: (text: string) => Result<ArrangementProject>
  serialize: (project: ArrangementProject) => Result<string>
}

export interface TimelineEditorProps {
  project: ArrangementProject
  onMutation: (mutation: ProjectMutation) => Result<ArrangementProject>
  disabled?: boolean
}

export interface ProjectControlsProps {
  project: ArrangementProject
  dirty: boolean
  services: ProjectServices
  onMutation: (mutation: ProjectMutation) => Result<ArrangementProject>
  onReplace: (project: ArrangementProject) => void
  onSaved: (snapshot: ArrangementProject) => void
  onBusyChange: (busy: boolean) => void
}
