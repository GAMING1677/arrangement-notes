import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DEFAULT_PROJECT_SETTINGS } from '@/domain/project'

/** Layout scaffold only. Editing belongs to the next implementation phase. */
export default function App() {
  return (
    <main className="flex h-svh flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
        <div><h1 className="text-xl font-semibold">Arrangement Notes</h1><p className="mt-1 text-sm text-muted-foreground">楽曲の展開メモ</p></div>
        <div className="flex gap-5 text-sm tabular-nums"><span>{DEFAULT_PROJECT_SETTINGS.bpm} BPM</span><span>4 / 4</span><span>{DEFAULT_PROJECT_SETTINGS.totalBars} 小節</span></div>
      </header>
      <p className="border-b bg-secondary px-6 py-2 text-sm text-muted-foreground">設計・基盤準備版：タイムラインの編集とファイルの保存・読み込みは次の実装で追加します。</p>
      <section aria-label="楽曲のタイムライン（準備中）" className="min-h-0 flex-1 overflow-auto">
        <div className="grid min-h-full" style={{ gridTemplateColumns: '220px 1fr', minWidth: 1244 }}>
          <aside className="sticky left-0 z-20 border-r bg-card">
            <div className="flex h-14 items-center justify-between border-b px-4"><span className="text-sm font-medium">アイデアレーン</span><Button size="icon" variant="outline" disabled aria-label="アイデアレーンを追加（準備中）"><Plus /></Button></div>
            <p className="px-4 py-6 text-sm text-muted-foreground">レーンはまだありません</p>
          </aside>
          <div className="bg-background">
            <div className="grid h-14 grid-cols-16 border-b bg-card text-sm tabular-nums" style={{ gridTemplateColumns: 'repeat(16, minmax(64px, 1fr))' }}>{Array.from({ length: 16 }, (_, i) => <div key={i} className="border-l px-2 py-4 text-muted-foreground">{i * 4 + 1}</div>)}</div>
            <div className="p-8 text-sm text-muted-foreground">小節に沿って、曲の構成や音のアイデアを並べる作業スペース</div>
          </div>
        </div>
      </section>
    </main>
  )
}
