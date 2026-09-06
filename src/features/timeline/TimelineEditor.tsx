import { useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { MoreHorizontal, Plus, StickyNote, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { IdeaBlock, IdeaLane, LaneColor } from '@/domain/project'
import type { ProjectMutation, TimelineEditorProps } from '@/domain/editor-contracts'
import { cn } from '@/lib/utils'
import { adjustBarWidth, barFromClientX, barsPerMinute, canPlace, moveBlock, resizeBlock, snapDelta, MAX_BAR_WIDTH, MIN_BAR_WIDTH } from './timeline'

const LANE_COLORS: LaneColor[] = ['cyan', 'violet', 'amber', 'emerald', 'rose', 'blue']
const COLOR_CLASSES: Record<LaneColor, string> = {
  cyan: 'border-cyan-300/60 bg-cyan-400/20 text-cyan-100',
  violet: 'border-violet-300/60 bg-violet-400/20 text-violet-100',
  amber: 'border-amber-300/60 bg-amber-400/20 text-amber-100',
  emerald: 'border-emerald-300/60 bg-emerald-400/20 text-emerald-100',
  rose: 'border-rose-300/60 bg-rose-400/20 text-rose-100',
  blue: 'border-blue-300/60 bg-blue-400/20 text-blue-100',
}
const COLOR_LABELS: Record<LaneColor, string> = { cyan: 'シアン', violet: 'バイオレット', amber: 'アンバー', emerald: 'エメラルド', rose: 'ローズ', blue: 'ブルー' }
const SKIP_BLOCK_DELETE_CONFIRMATION_KEY = 'arrangement-notes:skip-block-delete-confirmation'

type FormState = { laneId: string; blockId?: string; label: string; memo: string; startBar: string; durationBars: string; color: LaneColor }
type BlockRef = { laneId: string; block: IdeaBlock }
type Interaction = { laneId: string; blockId: string; mode: 'move' | 'resize-left' | 'resize-right'; pointerId: number; initialClientX: number; initialBlocks: BlockRef[]; moved: boolean }
type MinuteInteraction = { index: number; pointerId: number; initialClientX: number; initialStartBar: number; moved: boolean }
type CreateInteraction = { laneId: string; pointerId: number; initialClientX: number; startBar: number; moved: boolean }
type SelectionInteraction = { laneId: string; pointerId: number; initialClientX: number; startBar: number; endBar: number }

function newId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function initialForm(laneId: string, block?: IdeaBlock, fallbackColor: LaneColor = 'cyan'): FormState {
  return { laneId, blockId: block?.id || undefined, label: block?.label ?? 'アイデア', memo: block?.memo ?? '', startBar: String((block?.startBar ?? 0) + 1), durationBars: String(block?.durationBars ?? 4), color: block?.color ?? fallbackColor }
}

function readSkipBlockDeleteConfirmation() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SKIP_BLOCK_DELETE_CONFIRMATION_KEY) === 'true'
  } catch {
    return false
  }
}

function writeSkipBlockDeleteConfirmation(skip: boolean) {
  if (typeof window === 'undefined') return
  try {
    if (skip) window.localStorage.setItem(SKIP_BLOCK_DELETE_CONFIRMATION_KEY, 'true')
    else window.localStorage.removeItem(SKIP_BLOCK_DELETE_CONFIRMATION_KEY)
  } catch {
    // localStorageが利用できない環境でも削除操作は継続する
  }
}

export function TimelineEditor({ project, onMutation, disabled = false }: TimelineEditorProps) {
  const [barWidth, setBarWidth] = useState<number>(48)
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([])
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [renameLaneId, setRenameLaneId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [blocksToDelete, setBlocksToDelete] = useState<BlockRef[]>([])
  const [skipBlockDeleteConfirmation, setSkipBlockDeleteConfirmation] = useState(readSkipBlockDeleteConfirmation)
  const [laneToDelete, setLaneToDelete] = useState<IdeaLane | null>(null)
  const [interaction, setInteraction] = useState<Interaction | null>(null)
  const [preview, setPreview] = useState<{ blocks: BlockRef[]; valid: boolean } | null>(null)
  const [createInteraction, setCreateInteraction] = useState<CreateInteraction | null>(null)
  const [createPreview, setCreatePreview] = useState<{ laneId: string; block: IdeaBlock; valid: boolean } | null>(null)
  const [selectionInteraction, setSelectionInteraction] = useState<SelectionInteraction | null>(null)
  const [minuteInteraction, setMinuteInteraction] = useState<MinuteInteraction | null>(null)
  const [minutePreview, setMinutePreview] = useState<{ index: number; startBar: number } | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const totalWidth = project.timeline.totalBars * barWidth
  const minuteSpan = Math.max(1, barsPerMinute(project.tempo.bpm, project.tempo.timeSignature.beatsPerBar, project.tempo.timeSignature.beatUnit))
  const minuteWidth = minuteSpan * barWidth
  const allBlocks = useMemo(() => project.lanes.flatMap((lane) => lane.blocks.map((block) => ({ laneId: lane.id, block }))), [project.lanes])
  const selectedBlocks = useMemo(() => allBlocks.filter(({ block }) => selectedBlockIds.includes(block.id)), [allBlocks, selectedBlockIds])
  const selected = selectedBlocks[0]?.block

  const commit = useCallback((mutation: ProjectMutation, success = '') => {
    const result = onMutation(mutation)
    if (!result.ok) { setError(result.error); setNotice(''); return false }
    setError('')
    if (success) setNotice(success)
    return true
  }, [onMutation])

  const addLane = () => {
    const lane: IdeaLane = { id: newId('lane'), name: `アイデアレーン ${project.lanes.length + 1}`, color: LANE_COLORS[project.lanes.length % LANE_COLORS.length], blocks: [] }
    if (commit({ type: 'lane/add', lane }, 'レーンを追加しました')) { setRenameLaneId(lane.id); setRenameDraft(lane.name) }
  }

  const finishRename = (lane: IdeaLane) => {
    const name = renameDraft.trim()
    if (!name) { setError('レーン名を入力してください'); return }
    if (commit({ type: 'lane/update', laneId: lane.id, name, color: lane.color }, 'レーン名を更新しました')) setRenameLaneId(null)
  }

  const openNewBlock = (laneId: string, startBar = 0, duration = 4) => {
    const lane = project.lanes.find((candidate) => candidate.id === laneId)
    if (!lane) return
    const next = lane.blocks.filter((block) => block.startBar >= startBar).sort((a, b) => a.startBar - b.startBar)[0]
    const available = Math.min(duration, project.timeline.totalBars - startBar, next ? next.startBar - startBar : duration)
    if (available < 1) { setError('その位置には空きがありません'); return }
    setForm(initialForm(laneId, { id: '', label: 'アイデア', memo: '', startBar, durationBars: available, color: lane.color }, lane.color))
  }

  const addBlockAt = (laneId: string, startBar: number, duration = 4) => {
    const lane = project.lanes.find((candidate) => candidate.id === laneId)
    if (!lane) return
    const next = lane.blocks.filter((block) => block.startBar >= startBar).sort((a, b) => a.startBar - b.startBar)[0]
    const available = Math.min(duration, project.timeline.totalBars - startBar, next ? next.startBar - startBar : duration)
    if (available < 1) { setError('その位置には空きがありません'); return }

    const block: IdeaBlock = { id: newId('block'), label: 'アイデア', memo: '', startBar, durationBars: available, color: lane.color }
    if (commit({ type: 'block/add', laneId, block }, 'ブロックを追加しました')) {
      setSelectedBlockIds([block.id])
      setSelectionAnchorId(block.id)
    }
  }

  const openEdit = (laneId: string, block: IdeaBlock) => { setSelectedBlockIds([block.id]); setSelectionAnchorId(block.id); setForm(initialForm(laneId, block, project.lanes.find((lane) => lane.id === laneId)?.color ?? 'cyan')) }

  const selectBlock = (event: ReactMouseEvent<HTMLButtonElement>, lane: IdeaLane, block: IdeaBlock) => {
    const additive = event.metaKey || event.ctrlKey
    if (event.shiftKey && selectionAnchorId) {
      const anchorIndex = lane.blocks.findIndex((candidate) => candidate.id === selectionAnchorId)
      const blockIndex = lane.blocks.findIndex((candidate) => candidate.id === block.id)
      if (anchorIndex >= 0 && blockIndex >= 0) {
        const start = Math.min(anchorIndex, blockIndex)
        const end = Math.max(anchorIndex, blockIndex)
        setSelectedBlockIds(lane.blocks.slice(start, end + 1).map((candidate) => candidate.id))
        return
      }
    }
    if (additive) {
      setSelectedBlockIds((current) => current.includes(block.id) ? current.filter((id) => id !== block.id) : [...current, block.id])
    } else {
      setSelectedBlockIds([block.id])
    }
    setSelectionAnchorId(block.id)
  }

  const saveForm = () => {
    if (!form) return
    const label = form.label.trim()
    const start = Number(form.startBar) - 1
    const duration = Number(form.durationBars)
    if (!label || label.length > 120) { setError('ラベルは1〜120文字で入力してください'); return }
    if (form.memo.length > 10000) { setError('メモは10,000文字以内で入力してください'); return }
    if (!Number.isInteger(start) || !Number.isInteger(duration) || start < 0 || duration < 1 || start + duration > project.timeline.totalBars) { setError(`開始小節と長さは1〜${project.timeline.totalBars}の範囲で指定してください`); return }
    const lane = project.lanes.find((candidate) => candidate.id === form.laneId)
    if (!lane) return
    const block: IdeaBlock = { id: form.blockId ?? newId('block'), label, memo: form.memo, startBar: start, durationBars: duration, color: form.color }
    if (!canPlace(block, lane.blocks, project.timeline.totalBars)) { setError('同じレーンの別ブロックと重なるため配置できません'); return }
    const mutation: ProjectMutation = form.blockId ? { type: 'block/update', laneId: form.laneId, block } : { type: 'block/add', laneId: form.laneId, block }
    if (commit(mutation, form.blockId ? 'ブロックを更新しました' : 'ブロックを追加しました')) { setSelectedBlockIds([block.id]); setSelectionAnchorId(block.id); setForm(null) }
  }

  const removeBlocks = (blocksToRemove = blocksToDelete) => {
    if (blocksToRemove.length === 0) return
    const blocks = blocksToRemove.map(({ laneId, block }) => ({ laneId, blockId: block.id }))
    if (commit({ type: 'block/remove-many', blocks }, 'ブロックを削除しました')) {
      setSelectedBlockIds((current) => current.filter((id) => !blocks.some((item) => item.blockId === id)))
      setSelectionAnchorId(null)
      setBlocksToDelete([])
    }
  }

  const requestDelete = (blocks: BlockRef[]) => {
    if (disabled || blocks.length === 0) return
    if (skipBlockDeleteConfirmation) {
      removeBlocks(blocks)
      return
    }
    setBlocksToDelete(blocks)
  }

  const changeSkipBlockDeleteConfirmation = (skip: boolean) => {
    setSkipBlockDeleteConfirmation(skip)
    writeSkipBlockDeleteConfirmation(skip)
  }

  const applyPreview = () => {
    if (!interaction || !preview) return
    if (!preview.valid) { setError('他のブロックと重なるため確定できません'); setInteraction(null); setPreview(null); return }
    if (interaction.moved) {
      commit({ type: 'block/update-many', blocks: preview.blocks }, 'ブロックの位置を更新しました')
    }
    setInteraction(null)
    setPreview(null)
  }

  const addMinuteBar = () => {
    if (disabled) return
    const lastStart = Math.max(...project.timeline.minuteBars, 0)
    const startBar = project.timeline.minuteBars.length === 0 ? 0 : Math.round(lastStart + minuteSpan)
    const totalBars = Math.max(project.timeline.totalBars, Math.ceil(startBar + minuteSpan))
    if (totalBars > 1024) { setError('1分バーを追加できるのは総小節数1024までです'); return }
    const minuteBars = [...project.timeline.minuteBars, startBar].sort((left, right) => left - right)
    commit({ type: 'timeline/minute-bars', minuteBars, totalBars }, '1分バーを追加しました')
  }

  const startMinutePointer = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setMinuteInteraction({ index, pointerId: event.pointerId, initialClientX: event.clientX, initialStartBar: project.timeline.minuteBars[index], moved: false })
    setMinutePreview({ index, startBar: project.timeline.minuteBars[index] })
  }

  const moveMinutePointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (!minuteInteraction || minuteInteraction.pointerId !== event.pointerId) return
    const delta = snapDelta(event.clientX, minuteInteraction.initialClientX, barWidth)
    const maximum = Math.max(0, Math.floor(project.timeline.totalBars - minuteSpan))
    const startBar = Math.min(maximum, Math.max(0, minuteInteraction.initialStartBar + delta))
    setMinuteInteraction({ ...minuteInteraction, moved: minuteInteraction.moved || delta !== 0 })
    setMinutePreview({ index: minuteInteraction.index, startBar })
  }

  const applyMinutePreview = () => {
    if (!minuteInteraction || !minutePreview) return
    if (minuteInteraction.moved) {
      const minuteBars = [...project.timeline.minuteBars]
      minuteBars[minutePreview.index] = minutePreview.startBar
      minuteBars.sort((left, right) => left - right)
      commit({ type: 'timeline/minute-bars', minuteBars, totalBars: project.timeline.totalBars }, '1分バーの位置を更新しました')
    }
    setMinuteInteraction(null)
    setMinutePreview(null)
  }

  const startPointer = (event: ReactPointerEvent<HTMLElement>, lane: IdeaLane, block: IdeaBlock, mode: Interaction['mode']) => {
    if (disabled) return
    event.preventDefault()
    event.stopPropagation()
    const currentSelection = selectedBlockIds.includes(block.id) ? selectedBlockIds : [block.id]
    if (!selectedBlockIds.includes(block.id)) {
      setSelectedBlockIds([block.id])
      setSelectionAnchorId(block.id)
    }
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const initialBlocks = mode === 'move'
      ? allBlocks.filter(({ block: candidate }) => currentSelection.includes(candidate.id))
      : [{ laneId: lane.id, block }]
    setInteraction({ laneId: lane.id, blockId: block.id, mode, pointerId: event.pointerId, initialClientX: event.clientX, initialBlocks, moved: false })
    setPreview({ blocks: initialBlocks, valid: true })
  }

  const movePointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return
    const delta = snapDelta(event.clientX, interaction.initialClientX, barWidth)
    const blocks = interaction.initialBlocks.map(({ laneId, block: initial }) => ({
      laneId,
      block: interaction.mode === 'move'
        ? moveBlock(initial, delta, project.timeline.totalBars)
        : resizeBlock(initial, interaction.mode === 'resize-left' ? 'left' : 'right', delta, project.timeline.totalBars),
    }))
    const selectedIds = new Set(interaction.initialBlocks.map(({ block }) => block.id))
    const valid = blocks.every(({ laneId, block }) => {
      const siblingLane = project.lanes.find((candidate) => candidate.id === laneId)
      return siblingLane ? canPlace(block, siblingLane.blocks.filter((candidate) => !selectedIds.has(candidate.id)), project.timeline.totalBars) : false
    })
    setInteraction({ ...interaction, moved: interaction.moved || delta !== 0 })
    setPreview({ blocks, valid })
  }

  const keyboardBlock = (event: ReactKeyboardEvent<HTMLButtonElement>, lane: IdeaLane, block: IdeaBlock) => {
    if (event.key === 'Enter') { event.preventDefault(); openEdit(lane.id, block); return }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); requestDelete(selectedBlocks.some(({ block: selectedBlock }) => selectedBlock.id === block.id) ? selectedBlocks : [{ laneId: lane.id, block }]); return }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowLeft' ? -1 : 1
    const candidate = event.shiftKey ? resizeBlock(block, 'right', delta, project.timeline.totalBars) : moveBlock(block, delta, project.timeline.totalBars)
    if (!canPlace(candidate, lane.blocks, project.timeline.totalBars)) { setError('その操作は境界または他のブロックと重なるため実行できません'); return }
    commit({ type: 'block/update', laneId: lane.id, block: candidate }, 'キーボード操作を適用しました')
  }

  const startCreateOrSelect = (event: ReactPointerEvent<HTMLDivElement>, lane: IdeaLane) => {
    if (disabled || event.target !== event.currentTarget) return
    const row = rowRefs.current[lane.id]
    if (!row) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const startBar = barFromClientX(event.clientX, row.getBoundingClientRect().left, barWidth, project.timeline.totalBars)
    if (event.shiftKey) {
      setSelectionInteraction({ laneId: lane.id, pointerId: event.pointerId, initialClientX: event.clientX, startBar, endBar: startBar })
      return
    }
    setSelectedBlockIds([])
    setSelectionAnchorId(null)
    setCreateInteraction({ laneId: lane.id, pointerId: event.pointerId, initialClientX: event.clientX, startBar, moved: false })
    setCreatePreview(null)
  }

  const moveCreateOrSelect = (event: ReactPointerEvent<HTMLDivElement>, lane: IdeaLane) => {
    const row = rowRefs.current[lane.id]
    if (!row) return
    if (selectionInteraction?.pointerId === event.pointerId) {
      const endBar = barFromClientX(event.clientX, row.getBoundingClientRect().left, barWidth, project.timeline.totalBars)
      setSelectionInteraction({ ...selectionInteraction, endBar })
      return
    }
    if (!createInteraction || createInteraction.pointerId !== event.pointerId) return
    const currentBar = barFromClientX(event.clientX, row.getBoundingClientRect().left, barWidth, project.timeline.totalBars)
    const startBar = Math.min(createInteraction.startBar, currentBar)
    const endBar = Math.max(createInteraction.startBar, currentBar) + 1
    const block: IdeaBlock = { id: newId('block'), label: 'アイデア', memo: '', startBar, durationBars: Math.min(project.timeline.totalBars - startBar, endBar - startBar), color: lane.color }
    const valid = canPlace(block, lane.blocks, project.timeline.totalBars)
    setCreateInteraction({ ...createInteraction, moved: createInteraction.moved || currentBar !== createInteraction.startBar })
    setCreatePreview({ laneId: lane.id, block, valid })
  }

  const applyCreateOrSelect = (lane: IdeaLane) => {
    if (selectionInteraction) {
      const start = Math.min(selectionInteraction.startBar, selectionInteraction.endBar)
      const end = Math.max(selectionInteraction.startBar, selectionInteraction.endBar) + 1
      setSelectedBlockIds(lane.blocks.filter((block) => block.startBar < end && block.startBar + block.durationBars > start).map((block) => block.id))
      setSelectionAnchorId(null)
      setSelectionInteraction(null)
      return
    }
    if (!createInteraction || !createPreview || createInteraction.laneId !== lane.id) return
    if (!createPreview.valid) setError('他のブロックと重なるため作成できません')
    else if (createInteraction.moved) addBlockAt(lane.id, createPreview.block.startBar, createPreview.block.durationBars)
    setCreateInteraction(null)
    setCreatePreview(null)
  }

  const createOneBar = (event: ReactMouseEvent<HTMLDivElement>, lane: IdeaLane) => {
    if (disabled || event.target !== event.currentTarget) return
    const row = rowRefs.current[lane.id]
    if (!row) return
    const start = barFromClientX(event.clientX, row.getBoundingClientRect().left, barWidth, project.timeline.totalBars)
    addBlockAt(lane.id, start, 1)
  }

  const adjustWidthFromWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (disabled || event.shiftKey || event.deltaY === 0) return
    event.preventDefault()
    const direction = event.deltaY < 0 ? 1 : -1
    setBarWidth((value) => adjustBarWidth(value, direction))
  }

  const handleTimelineKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || (event.key !== 'Delete' && event.key !== 'Backspace') || selectedBlocks.length === 0) return
    const target = event.target as HTMLElement
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) return
    event.preventDefault()
    requestDelete(selectedBlocks)
  }

  return <TooltipProvider>
    <section aria-label="楽曲のタイムライン" className="flex min-h-0 flex-1 flex-col bg-background" onKeyDown={handleTimelineKeyDown}>
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2">
        <span className="mr-2 text-sm font-semibold">アイデアレーン</span>
        <Button size="sm" onClick={addLane} disabled={disabled}><Plus />レーン追加</Button>
        <span className="ml-auto text-xs text-muted-foreground">{selectedBlocks.length > 1 ? `${selectedBlocks.length}個のブロックを選択中` : selected ? `選択中: ${selected.label}` : 'ブロックを選択してください'}</span>
        <Button size="icon-xs" variant="outline" onClick={() => setBarWidth((value) => adjustBarWidth(value, -1))} disabled={disabled || barWidth === MIN_BAR_WIDTH} aria-label="表示倍率を下げる">−</Button>
        <span className="w-10 text-center text-xs tabular-nums">{barWidth}px</span>
        <Button size="icon-xs" variant="outline" onClick={() => setBarWidth((value) => adjustBarWidth(value, 1))} disabled={disabled || barWidth === MAX_BAR_WIDTH} aria-label="表示倍率を上げる">＋</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" tabIndex={0} onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setInteraction(null); setPreview(null); setCreateInteraction(null); setCreatePreview(null); setSelectionInteraction(null)
        }
      }}>
        <div style={{ minWidth: 220 + totalWidth }}>
          <div className="sticky top-0 z-30 grid grid-cols-[220px_max-content] grid-rows-[56px_38px] border-b bg-card" style={{ width: 220 + totalWidth }}>
            <div className="sticky left-0 z-40 row-span-2 flex h-[94px] items-center border-r bg-card px-4 text-sm font-medium">レーン / 小節</div>
            <div className="relative h-14" style={{ width: totalWidth }} onWheel={adjustWidthFromWheel} aria-label="小節ルーラー">
              {Array.from({ length: project.timeline.totalBars }, (_, index) => <div key={index} className={cn('absolute inset-y-0 border-l border-border/70 px-2 pt-5 text-xs text-muted-foreground', index % 4 === 0 && 'border-l-2 border-primary/40 font-semibold')} style={{ left: index * barWidth, width: barWidth }}>{index % Math.max(1, Math.ceil(48 / barWidth)) === 0 ? index + 1 : ''}</div>)}
            </div>
            <MinuteBarTrack minuteBars={project.timeline.minuteBars} totalWidth={totalWidth} barWidth={barWidth} minuteWidth={minuteWidth} minutePreview={minutePreview} disabled={disabled} onStart={startMinutePointer} onMove={moveMinutePointer} onEnd={applyMinutePreview} onCancel={() => { setMinuteInteraction(null); setMinutePreview(null) }} onAdd={addMinuteBar} />
          </div>
          {project.lanes.map((lane) => <div key={lane.id} className="grid grid-cols-[220px_max-content]" style={{ width: 220 + totalWidth }}>
            <LaneHeader lane={lane} disabled={disabled} renameLaneId={renameLaneId} renameDraft={renameDraft} setRenameDraft={setRenameDraft} onStartRename={() => { setRenameLaneId(lane.id); setRenameDraft(lane.name) }} onFinishRename={() => finishRename(lane)} onCancelRename={() => setRenameLaneId(null)} onColorChange={(color) => commit({ type: 'lane/update', laneId: lane.id, name: lane.name, color })} onAddBlock={() => openNewBlock(lane.id)} onDelete={() => setLaneToDelete(lane)} />
            <div ref={(element) => { rowRefs.current[lane.id] = element }} className="relative h-[88px] cursor-crosshair border-b border-border/70" style={{ width: totalWidth, backgroundImage: 'repeating-linear-gradient(to right, transparent 0, transparent calc(var(--bar-width) - 1px), rgba(148,163,184,.16) var(--bar-width))', ['--bar-width' as string]: `${barWidth}px` }} onDoubleClick={(event) => createOneBar(event, lane)} onPointerDown={(event) => startCreateOrSelect(event, lane)} onPointerMove={(event) => { movePointer(event); moveCreateOrSelect(event, lane) }} onPointerUp={() => { applyPreview(); applyCreateOrSelect(lane) }} onPointerCancel={() => { setInteraction(null); setPreview(null); setCreateInteraction(null); setCreatePreview(null); setSelectionInteraction(null) }}>
              {selectionInteraction?.laneId === lane.id && <div className="pointer-events-none absolute inset-y-2 z-20 rounded border border-primary bg-primary/15" style={{ left: Math.min(selectionInteraction.startBar, selectionInteraction.endBar) * barWidth, width: (Math.abs(selectionInteraction.endBar - selectionInteraction.startBar) + 1) * barWidth }} />}
              {createPreview?.laneId === lane.id && <CreationPreview block={createPreview.block} barWidth={barWidth} invalid={!createPreview.valid} />}
              {lane.blocks.map((block) => {
                const previewBlock = preview?.blocks.find((candidate) => candidate.block.id === block.id)?.block
                return <BlockView key={block.id} block={previewBlock ?? block} color={block.color ?? lane.color} barWidth={barWidth} selected={selectedBlockIds.includes(block.id)} invalid={preview?.blocks.some((candidate) => candidate.block.id === block.id) === true && !preview.valid} disabled={disabled} onSelect={(event) => selectBlock(event, lane, block)} onDoubleClick={() => openEdit(lane.id, block)} onKeyDown={(event) => keyboardBlock(event, lane, block)} onPointerDown={(event, mode) => startPointer(event, lane, block, mode)} onPointerMove={movePointer} onPointerUp={applyPreview} onPointerCancel={() => { setInteraction(null); setPreview(null) }} />
              })}
            </div>
          </div>)}
          {project.lanes.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">「レーン追加」から曲のアイデアを置く場所を作成できます。</div>}
        </div>
      </div>
      <div className="min-h-6 border-t bg-card px-4 py-1 text-sm" aria-live="polite">{error ? <span className="text-destructive">{error}</span> : notice ? <span className="text-primary">{notice}</span> : <span className="text-muted-foreground">小節ルーラー上のホイールで横幅を8px刻みで変更できます。空き場所をダブルクリックで1小節、クリックしてドラッグで任意の長さを追加。Shift＋ドラッグで範囲選択、Ctrl/Cmd＋クリックで複数選択。選択中はDelete / Backspaceで削除できます。</span>}</div>
    </section>
    <Dialog open={form !== null} onOpenChange={(open) => { if (!open) setForm(null) }}><DialogContent><DialogHeader><DialogTitle>{form?.blockId ? 'ブロックを編集' : 'ブロックを追加'}</DialogTitle><DialogDescription>小節番号は1から始まります。重なるブロックは配置できません。</DialogDescription></DialogHeader>{form && <div className="mt-5 grid gap-4">
      <div className="grid gap-2"><Label htmlFor="block-label">ラベル</Label><Input id="block-label" value={form.label} maxLength={120} onChange={(event) => setForm({ ...form, label: event.target.value })} autoFocus /></div>
      <div className="grid gap-2"><Label htmlFor="block-memo">メモ</Label><Textarea id="block-memo" value={form.memo} maxLength={10000} onChange={(event) => setForm({ ...form, memo: event.target.value })} /></div>
      <fieldset className="grid gap-2"><legend className="text-sm font-medium">色</legend><div className="flex flex-wrap gap-2" role="radiogroup" aria-label="ブロックの色">{LANE_COLORS.map((color) => <button key={color} type="button" className={cn('flex h-9 min-w-20 items-center justify-center rounded-md border px-2 text-xs font-semibold transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring', COLOR_CLASSES[color], form.color === color && 'ring-2 ring-primary ring-offset-2 ring-offset-background')} aria-label={`ブロックの色を${COLOR_LABELS[color]}にする`} aria-pressed={form.color === color} onClick={() => setForm({ ...form, color })}>{form.color === color ? '✓ ' : ''}{COLOR_LABELS[color]}</button>)}</div></fieldset>
      <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label htmlFor="block-start">開始小節</Label><Input id="block-start" inputMode="numeric" value={form.startBar} onChange={(event) => setForm({ ...form, startBar: event.target.value })} /></div><div className="grid gap-2"><Label htmlFor="block-duration">長さ（小節）</Label><Input id="block-duration" inputMode="numeric" value={form.durationBars} onChange={(event) => setForm({ ...form, durationBars: event.target.value })} /></div></div>
    </div>}<DialogFooter><Button variant="outline" onClick={() => setForm(null)}>キャンセル</Button><Button onClick={saveForm}>保存</Button></DialogFooter></DialogContent></Dialog>
    <AlertDialog open={blocksToDelete.length > 0} onOpenChange={(open) => { if (!open) setBlocksToDelete([]) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ブロックを削除しますか？</AlertDialogTitle><AlertDialogDescription>{blocksToDelete.length === 1 ? `「${blocksToDelete[0].block.label}」を削除すると元に戻せません。` : `${blocksToDelete.length}個のブロックを削除すると元に戻せません。`}</AlertDialogDescription></AlertDialogHeader><label className="mt-4 flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={skipBlockDeleteConfirmation} onChange={(event) => changeSkipBlockDeleteConfirmation(event.target.checked)} />今後この確認を表示しない</label><AlertDialogFooter><AlertDialogCancel>キャンセル</AlertDialogCancel><AlertDialogAction onClick={removeBlocks}>削除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={laneToDelete !== null} onOpenChange={(open) => { if (!open) setLaneToDelete(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>レーンを削除しますか？</AlertDialogTitle><AlertDialogDescription>「{laneToDelete?.name}」と、その中の{laneToDelete?.blocks.length ?? 0}個のブロックを削除します。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>キャンセル</AlertDialogCancel><AlertDialogAction onClick={() => { if (laneToDelete && commit({ type: 'lane/remove', laneId: laneToDelete.id }, 'レーンを削除しました')) setLaneToDelete(null) }}>削除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </TooltipProvider>
}

function MinuteBarTrack({ minuteBars, totalWidth, barWidth, minuteWidth, minutePreview, disabled, onStart, onMove, onEnd, onCancel, onAdd }: { minuteBars: number[]; totalWidth: number; barWidth: number; minuteWidth: number; minutePreview: { index: number; startBar: number } | null; disabled: boolean; onStart: (event: ReactPointerEvent<HTMLButtonElement>, index: number) => void; onMove: (event: ReactPointerEvent<HTMLElement>) => void; onEnd: () => void; onCancel: () => void; onAdd: () => void }) {
  const lastStart = Math.max(...minuteBars, 0)
  return <div className="relative h-[38px] border-t border-border/60 bg-muted/20" style={{ width: totalWidth }} onPointerMove={onMove}>
    {minuteBars.map((startBar, index) => {
      const displayStart = minutePreview?.index === index ? minutePreview.startBar : startBar
      const visibleWidth = Math.max(28, Math.min(minuteWidth, totalWidth - displayStart * barWidth))
      return <button key={`${startBar}-${index}`} type="button" className={cn('absolute inset-y-1 flex items-center justify-center rounded border border-primary/60 bg-primary/15 px-2 text-xs font-semibold text-primary shadow-sm transition hover:bg-primary/25 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring', disabled && 'cursor-not-allowed opacity-60')} style={{ left: displayStart * barWidth, width: visibleWidth, touchAction: 'none' }} onPointerDown={(event) => onStart(event, index)} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onCancel} onLostPointerCapture={onCancel} aria-label={`1分バー ${index + 1}、開始小節${displayStart + 1}、ドラッグで移動`}><span className="truncate">1分</span></button>
    })}
    {minuteBars.length > 0 && <button type="button" className="absolute inset-y-0 z-10 w-6 -translate-x-1/2 cursor-pointer text-primary transition hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring" style={{ left: Math.min(totalWidth - 1, lastStart * barWidth + minuteWidth) }} onClick={onAdd} disabled={disabled} aria-label="右端に1分バーを追加">＋</button>}
    {minuteBars.length === 0 && <button type="button" className="absolute inset-0 text-left text-xs text-muted-foreground hover:text-primary" onClick={onAdd} disabled={disabled}>＋ 1分バーを追加</button>}
  </div>
}

function LaneHeader({ lane, disabled, renameLaneId, renameDraft, setRenameDraft, onStartRename, onFinishRename, onCancelRename, onColorChange, onAddBlock, onDelete }: { lane: IdeaLane; disabled: boolean; renameLaneId: string | null; renameDraft: string; setRenameDraft: (value: string) => void; onStartRename: () => void; onFinishRename: () => void; onCancelRename: () => void; onColorChange: (color: LaneColor) => void; onAddBlock: () => void; onDelete: () => void }) {
  return <div className="sticky left-0 z-40 flex h-[88px] items-center justify-between gap-2 border-b border-r bg-card px-3">
    {renameLaneId === lane.id ? <Input value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onFinishRename(); if (event.key === 'Escape') onCancelRename() }} onBlur={onFinishRename} aria-label="レーン名" autoFocus /> : <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-semibold" onDoubleClick={onStartRename} title="ダブルクリックで改名">{lane.name}</button>}
    <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`${lane.name}のメニュー`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuLabel>レーン操作</DropdownMenuLabel><DropdownMenuItem onSelect={() => onStartRename()}>名前を変更</DropdownMenuItem><DropdownMenuItem onSelect={() => onAddBlock()}>ブロック追加</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuLabel>色</DropdownMenuLabel>{LANE_COLORS.map((color) => <DropdownMenuItem key={color} onSelect={() => onColorChange(color)}>{color === lane.color ? '✓ ' : ''}{COLOR_LABELS[color]}</DropdownMenuItem>)}<DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onSelect={() => onDelete()}><Trash2 />レーン削除</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  </div>
}

function CreationPreview({ block, barWidth, invalid }: { block: IdeaBlock; barWidth: number; invalid: boolean }) {
  return <div className={cn('pointer-events-none absolute inset-y-2 z-30 rounded-md border-2 border-dashed bg-primary/20', invalid && 'border-destructive bg-destructive/20')} style={{ left: block.startBar * barWidth, width: block.durationBars * barWidth }} aria-hidden="true" />
}

function BlockView({ block, color, barWidth, selected, invalid, disabled, onSelect, onDoubleClick, onKeyDown, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: { block: IdeaBlock; color: LaneColor; barWidth: number; selected: boolean; invalid: boolean; disabled: boolean; onSelect: (event: ReactMouseEvent<HTMLButtonElement>) => void; onDoubleClick: () => void; onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void; onPointerDown: (event: ReactPointerEvent<HTMLElement>, mode: Interaction['mode']) => void; onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void; onPointerUp: () => void; onPointerCancel: () => void }) {
  const memo = block.memo.trim()
  return <Tooltip className={cn('absolute inset-y-2 overflow-visible', selected && 'z-10')} style={{ left: block.startBar * barWidth, width: block.durationBars * barWidth }}>
    <TooltipTrigger asChild>
      <button type="button" className={cn('group relative flex h-full w-full items-center overflow-hidden rounded-md border px-3 text-left text-sm font-semibold shadow-sm transition focus-visible:ring-2 focus-visible:ring-ring', COLOR_CLASSES[color], selected && 'ring-2 ring-primary', invalid && 'border-2 border-destructive bg-destructive/30', disabled && 'cursor-not-allowed opacity-60')} style={{ touchAction: 'none' }} onClick={onSelect} onDoubleClick={(event) => { event.stopPropagation(); onDoubleClick() }} onKeyDown={onKeyDown} onPointerDown={(event) => onPointerDown(event, 'move')} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onLostPointerCapture={onPointerCancel} aria-label={`${block.label}、開始小節${block.startBar + 1}、${block.durationBars}小節${memo ? '、メモあり' : ''}`}>
        <div className="min-w-0 flex-1 truncate">{block.label}</div>{memo && <span className="ml-2 shrink-0" aria-label="メモあり"><StickyNote className="size-4" /></span>}
      <span className="absolute inset-y-0 left-0 w-2 cursor-ew-resize" role="presentation" onPointerDown={(event) => onPointerDown(event, 'resize-left')} />
      <span className="absolute inset-y-0 right-0 w-2 cursor-ew-resize" role="presentation" onPointerDown={(event) => onPointerDown(event, 'resize-right')} />
      </button>
    </TooltipTrigger>
    {memo && <TooltipContent>{memo}</TooltipContent>}
  </Tooltip>
}
