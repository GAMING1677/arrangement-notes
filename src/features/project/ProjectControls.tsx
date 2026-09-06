import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ArrangementProject } from '@/domain/project'
import type { ProjectControlsProps, Result } from '@/domain/editor-contracts'
import {
  makeProjectSettingsDraft,
  makeProjectSettingsMutation,
  MAX_PROJECT_FILE_SIZE_BYTES,
  projectFileName,
  type ProjectSettingsDraft,
} from './project-controls-helpers'

type Notice = { kind: 'info' | 'error'; message: string }
type ReplacementRequest = { project: ArrangementProject; reason: 'new' | 'open' }

function isResultError<T>(result: Result<T>): result is { ok: false; error: string } {
  return !result.ok
}

function downloadProject(project: ArrangementProject, serialized: string): Result<true> {
  try {
    const blob = new Blob([serialized], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = projectFileName(project.name)
    link.rel = 'noopener'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    return { ok: true, value: true }
  } catch {
    return { ok: false, error: 'JSONのダウンロードを開始できませんでした。' }
  }
}

function replacementLabel(reason: ReplacementRequest['reason']): string {
  return reason === 'new' ? '新規プロジェクト' : '読み込んだJSON'
}

export function ProjectControls({
  project,
  dirty,
  services,
  onMutation,
  onReplace,
  onSaved,
  onBusyChange,
}: ProjectControlsProps) {
  const [draft, setDraft] = useState<ProjectSettingsDraft>(() => makeProjectSettingsDraft(project))
  const [formBusy, setFormBusy] = useState(false)
  const [fileBusy, setFileBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [replacement, setReplacement] = useState<ReplacementRequest | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dialogCancelRef = useRef<HTMLButtonElement>(null)
  const busy = formBusy || fileBusy || replacement !== null

  useEffect(() => {
    if (!formBusy) setDraft(makeProjectSettingsDraft(project))
  }, [formBusy, project])

  useEffect(() => {
    onBusyChange(busy)
  }, [busy, onBusyChange])

  useEffect(() => {
    if (!dirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  useEffect(() => {
    if (!replacement) return
    dialogCancelRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReplacement(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [replacement])

  function changeDraft(field: keyof ProjectSettingsDraft, value: string) {
    setFormBusy(true)
    setDraft((current) => ({ ...current, [field]: value }))
    setNotice(null)
  }

  function startForm() {
    setFormBusy(true)
    setNotice(null)
  }

  function cancelForm() {
    setDraft(makeProjectSettingsDraft(project))
    setFormBusy(false)
    setNotice(null)
  }

  function submitForm() {
    const mutation = makeProjectSettingsMutation(draft)
    if (isResultError(mutation)) {
      setNotice({ kind: 'error', message: mutation.error })
      return
    }
    const result = onMutation(mutation.value)
    if (isResultError(result)) {
      setNotice({ kind: 'error', message: result.error })
      return
    }
    setDraft(makeProjectSettingsDraft(result.value))
    setFormBusy(false)
    setNotice({ kind: 'info', message: 'プロジェクト設定を更新しました。' })
  }

  function saveProject() {
    if (formBusy) {
      setNotice({ kind: 'error', message: '設定の編集中です。フォームの適用または取消を先に行ってください。' })
      return
    }
    const serialized = services.serialize(project)
    if (isResultError(serialized)) {
      setNotice({ kind: 'error', message: serialized.error })
      return
    }
    const download = downloadProject(project, serialized.value)
    if (isResultError(download)) {
      setNotice({ kind: 'error', message: download.error })
      return
    }
    onSaved(project)
    setNotice({ kind: 'info', message: 'JSONのダウンロードを開始しました。実際の保存完了やキャンセルは確認できません。' })
  }

  function finishReplacement(candidate: ArrangementProject, message: string) {
    onReplace(candidate)
    setReplacement(null)
    setFormBusy(false)
    setDraft(makeProjectSettingsDraft(candidate))
    setNotice({ kind: 'info', message })
  }

  function replaceOrConfirm(candidate: ArrangementProject, reason: ReplacementRequest['reason']) {
    if (dirty) {
      setReplacement({ project: candidate, reason })
      return
    }
    finishReplacement(candidate, `${replacementLabel(reason)}に切り替えました。`)
  }

  function createNewProject() {
    if (busy) return
    try {
      replaceOrConfirm(services.create(), 'new')
    } catch {
      setNotice({ kind: 'error', message: '新規プロジェクトを作成できませんでした。現在の内容は保持されています。' })
    }
  }

  function openFilePicker() {
    if (busy) return
    fileInputRef.current?.click()
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy) return

    setFileBusy(true)
    setNotice(null)
    try {
      if (file.size > MAX_PROJECT_FILE_SIZE_BYTES) {
        setNotice({ kind: 'error', message: 'ファイルが大きすぎます。読み込める上限は5MiBです。現在の内容は保持されています。' })
        return
      }
      const parsedText = await file.text()
      const parsed = services.parse(parsedText)
      if (isResultError(parsed)) {
        setNotice({ kind: 'error', message: `${parsed.error} 現在の内容は保持されています。` })
        return
      }
      replaceOrConfirm(parsed.value, 'open')
    } catch {
      setNotice({ kind: 'error', message: 'JSONファイルを読み込めませんでした。現在の内容は保持されています。' })
    } finally {
      setFileBusy(false)
    }
  }

  function confirmReplacement(mode: 'download' | 'discard') {
    if (!replacement) return
    if (mode === 'discard') {
      finishReplacement(replacement.project, `${replacementLabel(replacement.reason)}に切り替えました。未保存の内容は破棄しました。`)
      return
    }
    const serialized = services.serialize(project)
    if (isResultError(serialized)) {
      setNotice({ kind: 'error', message: serialized.error })
      return
    }
    const download = downloadProject(project, serialized.value)
    if (isResultError(download)) {
      setNotice({ kind: 'error', message: download.error })
      return
    }
    onSaved(project)
    finishReplacement(replacement.project, `${replacementLabel(replacement.reason)}に切り替えました。先に現在のJSONのダウンロードを開始しました（完了は確認できません）。`)
  }

  return (
    <section aria-label="プロジェクト設定" className="border-b bg-card px-4 py-3">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-52 flex-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="project-name">プロジェクト名</label>
          <input
            id="project-name"
            className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={draft.name}
            onFocus={startForm}
            onChange={(event) => changeDraft('name', event.target.value)}
            aria-describedby="project-name-help"
            disabled={fileBusy || replacement !== null}
          />
          <span id="project-name-help" className="sr-only">1〜120文字</span>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor="project-bpm">
          BPM
          <input id="project-bpm" type="text" inputMode="decimal" className="h-9 w-24 rounded-md border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" value={draft.bpm} onFocus={startForm} onChange={(event) => changeDraft('bpm', event.target.value)} disabled={fileBusy || replacement !== null} />
        </label>
        <fieldset className="flex gap-2">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">拍子</legend>
          <label className="sr-only" htmlFor="project-beats-per-bar">拍子の分子</label>
          <input id="project-beats-per-bar" type="text" inputMode="numeric" className="h-9 w-16 rounded-md border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" value={draft.beatsPerBar} onFocus={startForm} onChange={(event) => changeDraft('beatsPerBar', event.target.value)} disabled={fileBusy || replacement !== null} />
          <span className="self-center text-muted-foreground">/</span>
          <label className="sr-only" htmlFor="project-beat-unit">拍子の分母</label>
          <select id="project-beat-unit" className="h-9 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" value={draft.beatUnit} onFocus={startForm} onChange={(event) => changeDraft('beatUnit', event.target.value)} disabled={fileBusy || replacement !== null}>
            {[2, 4, 8, 16].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </fieldset>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor="project-total-bars">
          総小節数
          <input id="project-total-bars" type="text" inputMode="numeric" className="h-9 w-24 rounded-md border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" value={draft.totalBars} onFocus={startForm} onChange={(event) => changeDraft('totalBars', event.target.value)} disabled={fileBusy || replacement !== null} />
        </label>
        <div className="flex flex-wrap items-end gap-2 pt-5">
          <Button type="button" variant="outline" size="sm" onClick={submitForm} disabled={!formBusy || fileBusy || replacement !== null}>適用</Button>
          <Button type="button" variant="ghost" size="sm" onClick={cancelForm} disabled={!formBusy || fileBusy || replacement !== null}>取消</Button>
          <Button type="button" variant="outline" size="sm" onClick={createNewProject} disabled={busy}>新規</Button>
          <Button type="button" variant="outline" size="sm" onClick={openFilePicker} disabled={busy}>開く</Button>
          <Button type="button" size="sm" onClick={saveProject} disabled={busy}>保存</Button>
          <input ref={fileInputRef} className="sr-only" type="file" accept=".json,application/json" onChange={handleFileChange} aria-label="JSONファイルを選択" />
        </div>
      </div>
      <div className="mt-2 flex min-h-5 items-center gap-3 text-sm" aria-live="polite">
        {dirty && <span className="font-medium text-amber-300">未保存</span>}
        {notice && <span className={notice.kind === 'error' ? 'text-rose-300' : 'text-muted-foreground'} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.message}</span>}
      </div>
      {replacement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
          <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="replace-dialog-title" aria-describedby="replace-dialog-description">
            <h2 id="replace-dialog-title" className="text-lg font-semibold">未保存の内容があります</h2>
            <p id="replace-dialog-description" className="mt-2 text-sm text-muted-foreground">{replacementLabel(replacement.reason)}へ切り替えると、現在の未保存内容が置き換わります。</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button ref={dialogCancelRef} type="button" variant="ghost" onClick={() => setReplacement(null)}>キャンセル</Button>
              <Button type="button" variant="outline" onClick={() => confirmReplacement('discard')}>破棄して続行</Button>
              <Button type="button" onClick={() => confirmReplacement('download')}>JSONをダウンロードして続行</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
