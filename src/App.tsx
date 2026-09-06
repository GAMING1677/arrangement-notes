import { useCallback, useMemo, useState } from 'react'
import { ProjectControls } from '@/features/project/ProjectControls'
import { TimelineEditor } from '@/features/timeline/TimelineEditor'
import { applyProjectMutation, createProject } from '@/domain/project-reducer'
import { parseProject, serializeProject } from '@/domain/project-file'
import type { ProjectMutation, ProjectServices, Result } from '@/domain/editor-contracts'
import type { ArrangementProject } from '@/domain/project'

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `project-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createInitialProject() {
  return createProject(createId(), new Date().toISOString())
}

function sameProject(left: ArrangementProject, right: ArrangementProject) {
  const leftSerialized = serializeProject(left)
  const rightSerialized = serializeProject(right)
  return leftSerialized.ok && rightSerialized.ok && leftSerialized.value === rightSerialized.value
}

export default function App() {
  const [project, setProject] = useState<ArrangementProject>(createInitialProject)
  const [snapshot, setSnapshot] = useState<ArrangementProject>(project)
  const [busy, setBusy] = useState(false)

  const services = useMemo<ProjectServices>(() => ({
    create: createInitialProject,
    parse: parseProject,
    serialize: serializeProject,
  }), [])

  const dirty = useMemo(() => !sameProject(project, snapshot), [project, snapshot])

  const onMutation = useCallback((mutation: ProjectMutation): Result<ArrangementProject> => {
    const result = applyProjectMutation(project, mutation, new Date().toISOString())
    if (!result.ok) return result
    setProject(result.value)
    return result
  }, [project])

  const onReplace = useCallback((nextProject: ArrangementProject) => {
    setProject(nextProject)
    setSnapshot(nextProject)
  }, [])

  const onSaved = useCallback((savedProject: ArrangementProject) => {
    setSnapshot(savedProject)
  }, [])

  return (
    <main className="flex h-svh min-w-0 flex-col bg-background text-foreground">
      <ProjectControls
        project={project}
        dirty={dirty}
        services={services}
        onMutation={onMutation}
        onReplace={onReplace}
        onSaved={onSaved}
        onBusyChange={setBusy}
      />
      <TimelineEditor project={project} onMutation={onMutation} disabled={busy} />
    </main>
  )
}
