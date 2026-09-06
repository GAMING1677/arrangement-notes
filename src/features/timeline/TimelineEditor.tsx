import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
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
import { barFromClientX, canPlace, moveBlock, resizeBlock, snapDelta } from './timeline'

const BAR_WIDTHS = [24, 32, 48, 64, 96] as const
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

type FormState = { laneId: string; blockId?: string; label: string; memo: string; startBar: string; durationBars: string }
type Interaction = { laneId: string; blockId: string; mode: 'move' | 'resize-left' | 'resize-right'; pointerId: number; initialClientX: number; initial: IdeaBlock; moved: boolean }

function newId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function initialForm(laneId: string, block?: IdeaBlock): FormState {
  return { laneId, blockId: block?.id || undefined, label: block?.label ?? 'アイデア', memo: block?.memo ?? '', startBar: String((block?.startBar ?? 0) + 1), durationBars: String(block?.durationBars ?? 4) }
}

export function TimelineEditor({ project, onMutation, disabled = false }: TimelineEditorProps) {
  const [barWidth, setBarWidth] = useState<number>(48)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [renameLaneId, setRenameLaneId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [blockToDelete, setBlockToDelete] = useState<{ laneId: string; block: IdeaBlock } | null>(null)
  const [laneToDelete, setLaneToDelete] = useState<IdeaLane | null>(null)
  const [interaction, setInteraction] = useState<Interaction | null>(null)
  const [preview, setPreview] = useState<{ block: IdeaBlock; valid: boolean } | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const totalWidth = project.timeline.totalBars * barWidth
  const selected = useMemo(() => project.lanes.flatMap((lane) => lane.blocks).find((block) => block.id === selectedBlockId), [project.lanes, selectedBlockId])

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
    setForm(initialForm(laneId, { id: '', label: 'アイデア', memo: '', startBar, durationBars: available }))
  }

  const openEdit = (laneId: string, block: IdeaBlock) => { setSelectedBlockId(block.id); setForm(initialForm(laneId, block)) }

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
    const block: IdeaBlock = { id: form.blockId ?? newId('block'), label, memo: form.memo, startBar: start, durationBars: duration }
    if (!canPlace(block, lane.blocks, project.timeline.totalBars)) { setError('同じレーンの別ブロックと重なるため配置できません'); return }
    const mutation: ProjectMutation = form.blockId ? { type: 'block/update', laneId: form.laneId, block } : { type: 'block/add', laneId: form.laneId, block }
    if (commit(mutation, form.blockId ? 'ブロックを更新しました' : 'ブロックを追加しました')) { setSelectedBlockId(block.id); setForm(null) }
  }

  const removeBlock = () => {
    if (!blockToDelete) return
    if (commit({ type: 'block/remove', laneId: blockToDelete.laneId, blockId: blockToDelete.block.id }, 'ブロックを削除しました')) { setSelectedBlockId(null); setBlockToDelete(null) }
  }

  const applyPreview = () => {
    if (!interaction || !preview) return
    if (!preview.valid) { setError('他のブロックと重なるため確定できません'); setInteraction(null); setPreview(null); return }
    if (interaction.moved) {
      commit({ type: 'block/update', laneId: interaction.laneId, block: preview.block }, 'ブロックの位置を更新しました')
    }
    setInteraction(null)
    setPreview(null)
  }

  const startPointer = (event: ReactPointerEvent<HTMLElement>, lane: IdeaLane, block: IdeaBlock, mode: Interaction['mode']) => {
    if (disabled) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedBlockId(block.id)
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    setInteraction({ laneId: lane.id, blockId: block.id, mode, pointerId: event.pointerId, initialClientX: event.clientX, initial: block, moved: false })
    setPreview({ block, valid: true })
  }

  const movePointer = (event: ReactPointerEvent<HTMLElement>, lane: IdeaLane) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return
    const delta = snapDelta(event.clientX, interaction.initialClientX, barWidth)
    const block = interaction.mode === 'move'
      ? moveBlock(interaction.initial, delta, project.timeline.totalBars)
      : resizeBlock(interaction.initial, interaction.mode === 'resize-left' ? 'left' : 'right', delta, project.timeline.totalBars)
    setInteraction({ ...interaction, moved: interaction.moved || delta !== 0 })
    setPreview({ block, valid: canPlace(block, lane.blocks, project.timeline.totalBars) })
  }

  const keyboardBlock = (event: ReactKeyboardEvent<HTMLButtonElement>, lane: IdeaLane, block: IdeaBlock) => {
    if (event.key === 'Enter') { event.preventDefault(); openEdit(lane.id, block); return }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); setBlockToDelete({ laneId: lane.id, block }); return }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowLeft' ? -1 : 1
    const candidate = event.shiftKey ? resizeBlock(block, 'right', delta, project.timeline.totalBars) : moveBlock(block, delta, project.timeline.totalBars)
    if (!canPlace(candidate, lane.blocks, project.timeline.totalBars)) { setError('その操作は境界または他のブロックと重なるため実行できません'); return }
    commit({ type: 'block/update', laneId: lane.id, block: candidate }, 'キーボード操作を適用しました')
  }

  const createFromDoubleClick = (event: React.MouseEvent<HTMLDivElement>, lane: IdeaLane) => {
    if (event.target !== event.currentTarget || disabled) return
    const row = rowRefs.current[lane.id]
    if (!row) return
    const start = barFromClientX(event.clientX, row.getBoundingClientRect().left, barWidth, project.timeline.totalBars)
    openNewBlock(lane.id, start)
  }

  return <TooltipProvider>
    <section aria-label="楽曲のタイムライン" className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2">
        <span className="mr-2 text-sm font-semibold">アイデアレーン</span>
        <Button size="sm" onClick={addLane} disabled={disabled}><Plus />レーン追加</Button>
        <span className="ml-auto text-xs text-muted-foreground">{selected ? `選択中: ${selected.label}` : 'ブロックを選択してください'}</span>
        <Button size="icon-xs" variant="outline" onClick={() => setBarWidth((value) => BAR_WIDTHS[Math.max(0, BAR_WIDTHS.indexOf(value as typeof BAR_WIDTHS[number]) - 1)])} disabled={disabled || barWidth === BAR_WIDTHS[0]} aria-label="表示倍率を下げる">−</Button>
        <span className="w-10 text-center text-xs tabular-nums">{barWidth}px</span>
        <Button size="icon-xs" variant="outline" onClick={() => setBarWidth((value) => BAR_WIDTHS[Math.min(BAR_WIDTHS.length - 1, BAR_WIDTHS.indexOf(value as typeof BAR_WIDTHS[number]) + 1)])} disabled={disabled || barWidth === BAR_WIDTHS[BAR_WIDTHS.length - 1]} aria-label="表示倍率を上げる">＋</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" onKeyDown={(event) => { if (event.key === 'Escape') { setInteraction(null); setPreview(null) } }}>
        <div style={{ minWidth: 220 + totalWidth }}>
          <div className="sticky top-0 z-30 grid h-14 grid-cols-[220px_max-content] border-b bg-card" style={{ width: 220 + totalWidth }}>
            <div className="sticky left-0 z-40 flex items-center border-r px-4 text-sm font-medium">レーン / 小節</div>
            <div className="relative h-14" style={{ width: totalWidth }}>
              {Array.from({ length: project.timeline.totalBars }, (_, index) => <div key={index} className={cn('absolute inset-y-0 border-l border-border/70 px-2 pt-5 text-xs text-muted-foreground', index % 4 === 0 && 'border-l-2 border-primary/40 font-semibold')} style={{ left: index * barWidth, width: barWidth }}>{index % Math.max(1, Math.ceil(48 / barWidth)) === 0 ? index + 1 : ''}</div>)}
            </div>
          </div>
          {project.lanes.map((lane) => <div key={lane.id} className="grid grid-cols-[220px_max-content]" style={{ width: 220 + totalWidth }}>
            <LaneHeader lane={lane} disabled={disabled} renameLaneId={renameLaneId} renameDraft={renameDraft} setRenameDraft={setRenameDraft} onStartRename={() => { setRenameLaneId(lane.id); setRenameDraft(lane.name) }} onFinishRename={() => finishRename(lane)} onCancelRename={() => setRenameLaneId(null)} onColorChange={(color) => commit({ type: 'lane/update', laneId: lane.id, name: lane.name, color })} onAddBlock={() => openNewBlock(lane.id)} onDelete={() => setLaneToDelete(lane)} />
            <div ref={(element) => { rowRefs.current[lane.id] = element }} className="relative h-[88px] border-b border-border/70" style={{ width: totalWidth, backgroundImage: 'repeating-linear-gradient(to right, transparent 0, transparent calc(var(--bar-width) - 1px), rgba(148,163,184,.16) var(--bar-width))', ['--bar-width' as string]: `${barWidth}px` }} onDoubleClick={(event) => createFromDoubleClick(event, lane)} onPointerMove={(event) => movePointer(event, lane)} onPointerUp={applyPreview} onPointerCancel={() => { setInteraction(null); setPreview(null) }}>
              {lane.blocks.map((block) => <BlockView key={block.id} block={preview?.block.id === block.id ? preview.block : block} color={lane.color} barWidth={barWidth} selected={selectedBlockId === block.id} invalid={preview?.block.id === block.id && !preview.valid} disabled={disabled} onSelect={() => setSelectedBlockId(block.id)} onDoubleClick={() => openEdit(lane.id, block)} onKeyDown={(event) => keyboardBlock(event, lane, block)} onPointerDown={(event, mode) => startPointer(event, lane, block, mode)} onPointerMove={(event) => movePointer(event, lane)} onPointerUp={applyPreview} onPointerCancel={() => { setInteraction(null); setPreview(null) }} />)}
            </div>
          </div>)}
          {project.lanes.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">「レーン追加」から曲のアイデアを置く場所を作成できます。</div>}
        </div>
      </div>
      <div className="min-h-6 border-t bg-card px-4 py-1 text-sm" aria-live="polite">{error ? <span className="text-destructive">{error}</span> : notice ? <span className="text-primary">{notice}</span> : <span className="text-muted-foreground">ブロックをドラッグして移動、左右端で伸縮。矢印キーでも操作できます。</span>}</div>
    </section>
    <Dialog open={form !== null} onOpenChange={(open) => { if (!open) setForm(null) }}><DialogContent><DialogHeader><DialogTitle>{form?.blockId ? 'ブロックを編集' : 'ブロックを追加'}</DialogTitle><DialogDescription>小節番号は1から始まります。重なるブロックは配置できません。</DialogDescription></DialogHeader>{form && <div className="mt-5 grid gap-4">
      <div className="grid gap-2"><Label htmlFor="block-label">ラベル</Label><Input id="block-label" value={form.label} maxLength={120} onChange={(event) => setForm({ ...form, label: event.target.value })} autoFocus /></div>
      <div className="grid gap-2"><Label htmlFor="block-memo">メモ</Label><Textarea id="block-memo" value={form.memo} maxLength={10000} onChange={(event) => setForm({ ...form, memo: event.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label htmlFor="block-start">開始小節</Label><Input id="block-start" inputMode="numeric" value={form.startBar} onChange={(event) => setForm({ ...form, startBar: event.target.value })} /></div><div className="grid gap-2"><Label htmlFor="block-duration">長さ（小節）</Label><Input id="block-duration" inputMode="numeric" value={form.durationBars} onChange={(event) => setForm({ ...form, durationBars: event.target.value })} /></div></div>
    </div>}<DialogFooter><Button variant="outline" onClick={() => setForm(null)}>キャンセル</Button><Button onClick={saveForm}>保存</Button></DialogFooter></DialogContent></Dialog>
    <AlertDialog open={blockToDelete !== null} onOpenChange={(open) => { if (!open) setBlockToDelete(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ブロックを削除しますか？</AlertDialogTitle><AlertDialogDescription>「{blockToDelete?.block.label}」を削除すると元に戻せません。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>キャンセル</AlertDialogCancel><AlertDialogAction onClick={removeBlock}>削除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={laneToDelete !== null} onOpenChange={(open) => { if (!open) setLaneToDelete(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>レーンを削除しますか？</AlertDialogTitle><AlertDialogDescription>「{laneToDelete?.name}」と、その中の{laneToDelete?.blocks.length ?? 0}個のブロックを削除します。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>キャンセル</AlertDialogCancel><AlertDialogAction onClick={() => { if (laneToDelete && commit({ type: 'lane/remove', laneId: laneToDelete.id }, 'レーンを削除しました')) setLaneToDelete(null) }}>削除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </TooltipProvider>
}

function LaneHeader({ lane, disabled, renameLaneId, renameDraft, setRenameDraft, onStartRename, onFinishRename, onCancelRename, onColorChange, onAddBlock, onDelete }: { lane: IdeaLane; disabled: boolean; renameLaneId: string | null; renameDraft: string; setRenameDraft: (value: string) => void; onStartRename: () => void; onFinishRename: () => void; onCancelRename: () => void; onColorChange: (color: LaneColor) => void; onAddBlock: () => void; onDelete: () => void }) {
  return <div className="sticky left-0 z-20 flex h-[88px] items-center justify-between gap-2 border-b border-r bg-card px-3">
    {renameLaneId === lane.id ? <Input value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onFinishRename(); if (event.key === 'Escape') onCancelRename() }} onBlur={onFinishRename} aria-label="レーン名" autoFocus /> : <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-semibold" onDoubleClick={onStartRename} title="ダブルクリックで改名">{lane.name}</button>}
    <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`${lane.name}のメニュー`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuLabel>レーン操作</DropdownMenuLabel><DropdownMenuItem onSelect={onStartRename}>名前を変更</DropdownMenuItem><DropdownMenuItem onSelect={onAddBlock}>ブロック追加</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuLabel>色</DropdownMenuLabel>{LANE_COLORS.map((color) => <DropdownMenuItem key={color} onSelect={() => onColorChange(color)}>{color === lane.color ? '✓ ' : ''}{COLOR_LABELS[color]}</DropdownMenuItem>)}<DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onSelect={onDelete}><Trash2 />レーン削除</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  </div>
}

function BlockView({ block, color, barWidth, selected, invalid, disabled, onSelect, onDoubleClick, onKeyDown, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: { block: IdeaBlock; color: LaneColor; barWidth: number; selected: boolean; invalid: boolean; disabled: boolean; onSelect: () => void; onDoubleClick: () => void; onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void; onPointerDown: (event: ReactPointerEvent<HTMLElement>, mode: Interaction['mode']) => void; onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void; onPointerUp: () => void; onPointerCancel: () => void }) {
  const memo = block.memo.trim()
  const memoText = memo.length > 500 ? `${memo.slice(0, 500)}\n（長文メモは編集画面で全文を表示）` : memo
  return <div className={cn('absolute inset-y-2 overflow-visible', selected && 'z-10')} style={{ left: block.startBar * barWidth, width: block.durationBars * barWidth }}>
    <button type="button" className={cn('group relative flex h-full w-full items-center overflow-hidden rounded-md border px-3 text-left text-sm font-semibold shadow-sm transition focus-visible:ring-2 focus-visible:ring-ring', COLOR_CLASSES[color], selected && 'ring-2 ring-primary', invalid && 'border-2 border-destructive bg-destructive/30', disabled && 'cursor-not-allowed opacity-60')} style={{ touchAction: 'none' }} onClick={onSelect} onDoubleClick={(event) => { event.stopPropagation(); onDoubleClick() }} onKeyDown={onKeyDown} onPointerDown={(event) => onPointerDown(event, 'move')} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onLostPointerCapture={onPointerCancel} aria-label={`${block.label}、開始小節${block.startBar + 1}、${block.durationBars}小節`}>
      <div className="min-w-0 flex-1 truncate">{block.label}</div>{memo && <Tooltip><TooltipTrigger asChild><span className="ml-2 shrink-0" aria-label="メモあり"><StickyNote className="size-4" /></span></TooltipTrigger><TooltipContent>{memoText}</TooltipContent></Tooltip>}
      <span className="absolute inset-y-0 left-0 w-2 cursor-ew-resize" role="presentation" onPointerDown={(event) => onPointerDown(event, 'resize-left')} />
      <span className="absolute inset-y-0 right-0 w-2 cursor-ew-resize" role="presentation" onPointerDown={(event) => onPointerDown(event, 'resize-right')} />
    </button>
  </div>
}
