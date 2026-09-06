# 楽曲展開メモ 設計書

作成日: 2026-09-06 / 状態: 初版実装済み、公開前

## 1. 目的と今回の範囲

曲の展開、楽器の出入り、盛り上げ方などを、小節に沿って自由なラベルとメモで記録する。添付DAW画像は上部の小節ルーラー、左側のレーン名、横長ブロックの配置を参考にする。画像内のトラック名・音源・ミキサーは要件ではない。

**今回用意するもの**: React + TypeScript + Vite、shadcn/ui、タイムライン編集画面、実行時検証、JSON入出力、未保存管理、検査環境、Cloudflare設定、本設計書、実装引き継ぎ書。

**実装済み**: レーン追加・改名・色変更・削除、BPM等の編集、ブロック配置・移動・両端伸縮・削除・編集、メモ表示、JSON保存・読み込み、未保存状態の扱い。

音声再生・波形・MIDI・ミキサー・共同編集・アカウント・サーバー保存・テンポチェンジ・Undo/Redoは初版の対象外。音声を扱わないため再生ボタンは置かない。今回は公開操作を行わない。

## 2. 採用構成

| 項目 | 方針 |
| --- | --- |
| クライアント | React / TypeScript strict / Vite、単一画面SPA |
| UI | shadcn/ui（Radix系）+ Tailwind CSS v4 + lucide-react |
| 状態 | React useReducer + 必要箇所へのContext。初版で外部状態ライブラリは追加しない |
| ファイル検証 | Zod。JSON.parseの結果をunknownとして検証する |
| タイムライン | HTML/CSS + Pointer Events。shadcnにタイムライン部品はないため独自実装 |
| 保存 | ユーザーのJSONファイルが正本。ブラウザ内で読み書きする |
| ホスティング | Cloudflare Workers Static Assetsでdistを公開 |
| テスト | Vitest（境界計算・reducer・保存形式）、ESLint、TypeScript、手動操作確認 |

DB・API・ログインを作らない。JSONはCloudflareへ送信しない。アプリの配信のみCloudflareを利用する。静的配信なのでCloudflare用ViteプラグインやWorkerのサーバーコードは不要。利用者のログインは不要だが、公開を行う開発者にはCloudflareアカウントが必要。

## 3. 画面設計

```text
┌ プロジェクト名 [未保存] ─ BPM [120] 拍子 [4/4] 小節数 [64] ─ [新規][開く][保存] ┐
├ アイデアレーン [+] ─────┬ 1   2   3   4   5   6   7   8 ... 小節ルーラー ┤
│ 構成          [⋯]       │ [ Intro          ][ Aメロ               ]      │
│ ドラム        [⋯]       │                  [ Kick + Hat       ▤  ]      │
│ 演出          [⋯]       │                                [ Fill ▤ ]     │
├────────────────────────┴────────────────────────────────────────────────┤
│ 選択ブロックの位置・長さ / 操作ヒント                      表示倍率 [-][+] │
└─────────────────────────────────────────────────────────────────────────┘
```

これは完成時の構造。現在のApp.tsxは基盤確認用で、追加ボタンは無効・数値は固定表示。

- 濃いグレーの作業面、明るい小節線、レーン別の色。アクセントはシアン。
- 左列220px、レーン高さ88px、ルーラー高さ48〜56px。ラベルは18px・太字、通常UI文字14〜16px。
- 小節幅の初期値48px、倍率は24 / 32 / 48 / 64 / 96pxから選ぶ。小節番号の表示密度は倍率に応じて間引くが、小節境界は保つ。
- 1つのoverflowコンテナに左列・ルーラー・レーンを収める。左列をsticky left:0、ルーラーをsticky top:0、左上を両方向固定。別々のスクロール位置同期を実装しない。
- 背景のグリッドはCSS repeating-linear-gradient。小節セルを全レーン分DOM生成しない。ブロックはレーン内でabsolute配置。
- 4小節ごとの線を強める。UIは1小節目から、データは0始まりで扱う。
- デスクトップのマウス・キーボードを優先。狭い画面は横スクロールし、ヘッダーを折り返す。タッチ端末では編集ダイアログの数値入力で配置・長さを操作できるようにする。

## 4. プロジェクト設定

| 項目 | 初期値 | 検証と動作 |
| --- | --- | --- |
| 名前 | 無題のプロジェクト | trim後1〜120文字 |
| BPM | 120 | 有限数、20〜400、小数第1位まで。四分音符基準 |
| 拍子の分子 | 4 | 整数1〜16 |
| 拍子の分母 | 4 | 2 / 4 / 8 / 16 |
| 総小節数 | 64 | 整数1〜1024 |

BPMと拍子を変更してもブロックの小節位置・長さは変えない。初版は全曲共通のテンポ・拍子。参考所要時間を表示する場合は `totalBars × beatsPerBar × (4 / beatUnit) × 60 / bpm` 秒。

総小節数を末尾ブロックの終了位置より短くする変更は拒否し、必要な最小小節数を表示する。自動削除・自動短縮はしない。フォーム編集中の空文字などはローカルの文字列stateで保持し、確定時に数値へ変換・検証する。

## 5. レーンとブロックの操作

製品上の呼び名は「ブロック」。ユーザー要件の「コンポーネント」に相当する。Reactのコンポーネントと区別する。

### レーン

- 左上の＋ボタンで末尾に1レーン追加。名前は「アイデアレーン N」、色はプリセットを順番に割り当てる。追加後は名前入力にフォーカスする。
- 改名はレーン名のダブルクリックまたはメニューの「名前を変更」。Enter確定、Escape取消、空名は拒否。重複した表示名は許可し、識別にはIDを使う。
- レーンのメニューに色変更・ブロック追加・レーン削除。中身のあるレーン削除は件数を示して確認する。
- 初版ではレーンの並び替え・折り畳み・レーン間ドラッグを実装しない。

### ブロックの作成・選択・編集

- 空き場所のクリックでその小節からデフォルトの4小節長のブロックを即時追加する。末尾・次ブロックまでの空きが4未満なら収まる長さにする。空きがなければ作成せず説明する。追加後はブロックを選択状態にし、ダブルクリックまたはEnterで内容を編集できる。
- キーボード・タッチ向けにレーンメニューの「ブロック追加」から開始小節と長さを指定可能にする。
- レーンメニューからの追加ダイアログにはラベル、メモ、開始小節、長さ（小節）を用意する。新規の初期ラベルは「アイデア」で、保存時に作成し、キャンセルでは増やさない。
- クリックで選択、ダブルクリックまたはEnterで編集。長いラベルはellipsis、全文は編集画面で確認できる。
- 同一レーンの重なりは**許可しない**。別レーンの同時刻配置は許可。境界が接するブロックは許可。
- 選択ブロックはDelete / Backspaceで削除確認。フォーム入力中はグローバルショートカットを無効にする。

### 移動・伸縮

- ブロック本体のドラッグで同じレーン内を移動。左右端の8px以上のハンドルで長さを変更する。「収縮」は時間方向の短縮と解釈し、拡張も対応する。
- 最小長は1小節。1小節単位のスナップ。開始位置は0以上、終了はtotalBars以下。
- 左端伸縮では終了位置を固定、右端伸縮では開始位置を固定する。
- 4px程度の移動しきい値でクリックとドラッグを区別する。pointerdownで元状態を記録し、setPointerCaptureを使用する。移動中は一時プレビューだけを更新し、pointerupで1回確定する。
- 他ブロックに重なる候補は赤枠で表示し、確定時は元位置に戻して説明する。自動で他ブロックを動かさない。
- Escape、pointercancel、lostpointercaptureでは元状態に戻す。ドラッグ中はTooltipを抑止。リサイズハンドルはstopPropagationで本体移動との競合を防ぐ。
- ドラッグ中の自動スクロールは初版では行わない。通常スクロールしてから再操作するか、ダイアログの位置入力を使う。ズーム変更は操作中無効にする。
- フォーカスしたブロックに左右矢印で1小節移動、Shift+左右矢印で右端を1小節伸縮。イベントをconsumeするのは対象ブロックにフォーカスがある場合のみ。結果と拒否理由をaria-liveで通知する。

### メモ

- `memo.trim().length > 0` の場合だけ、右上にメモアイコンと「メモあり」のアクセシブルな説明を表示。色だけに依存しない。狭いブロックでもアイコンの領域を確保する。
- shadcn Tooltipをホバー・キーボードフォーカスで表示（約300ms遅延）。改行を保ち、最大幅360px、長文は先頭500文字と「編集で全文を表示」にする。
- メモは最大10,000文字、ラベルはtrim後1〜120文字。Tooltipは読み取り専用で、長文閲覧・編集はダイアログに集約。タッチではタップ選択後の編集ボタンから開く。
- 文字列を通常のReactテキストとして描画。HTML・Markdown解釈やdangerouslySetInnerHTMLは使わない。

## 6. 時間軸計算と不変条件

開始を `s = startBar`、長さを `d = durationBars` とし、区間は `[s, s+d)`。UIの開始小節は `s+1`、UIの最終小節は `s+d`。

```text
ブロック左位置 = startBar × barWidth
ブロック幅 = durationBars × barWidth
空き位置の小節 = floor((clientX - row.getBoundingClientRect().left) / barWidth)
ドラッグ差分 = round((現在のcontentX - 開始時のcontentX) / barWidth)
重なり = a.start < b.end && b.start < a.end
```

rowはスクロールするタイムライン本体を指す。このgetBoundingClientRectはスクロールを反映済みなのでscrollLeftを二重加算しない。ドラッグ中も同じ座標系を使う。

startBar・durationBarsは整数、`0 <= s`、`1 <= d`、`s+d <= totalBars`。長さを縮める計算は左右の固定端を守る。移動の境界clampは`[0, totalBars-d]`。衝突判定は操作対象自身のIDを除いて行う。

## 7. JSONデータ契約

型: `src/domain/project.ts` / 実例: `examples/arrangement-notes.v1.json`

- ルートの`format: "arrangement-notes"`と`schemaVersion: 1`でファイル種類と版を識別する。
- UUID文字列のproject ID、lane ID、block IDを使用。lane/block IDはそれぞれプロジェクト内で一意。
- `lanes`配列順が表示順。blocksは保存時にstartBar、同値ならIDで安定ソートする。
- `color`は6種の列挙値。任意のCSSを保存・適用しない。ブロックはレーン色を継承する。
- createdAt / updatedAtはUTCのISO 8601文字列。updatedAtはプロジェクト内容の確定編集で更新。読込・保存・選択・ズームで更新しない。
- 保存対象は名前、テンポ、拍子、総小節数、レーン（名称・色）、ブロック（位置・長さ・ラベル・メモ）とID・日時。
- 選択状態・ホバー・開いているダイアログ・ズーム・スクロール・未保存フラグはファイルに入れない。再開時は内容を復元し、表示状態は初期値に戻す。
- v1はstrictスキーマ。未知のキーは互換性エラーとして拒否する。新フィールド追加時はschemaVersionと明示的migrationを検討する。未知の将来版を推測で読み込まない。
- 初版の上限: 5MiB（File.sizeで読込前検査）、100レーン、合計5,000ブロック、総小節数1,024。これらは本アプリの操作性・保護のための制限で、Cloudflareの上限ではない。
- 型定義はコンパイル時の契約のみ。次の実装でZodによる全フィールド検査、日時順序、ID重複、範囲外、重なり、総件数検査を追加する。必要なら型をz.inferへ一本化し二重管理をなくす。

## 8. 保存・読み込みと未保存状態

### 保存

1. 未確定の編集フォームがある場合はフォーム内の保存・キャンセルを先に行う。
2. 現在のプロジェクトを検証し、UTF-8・2スペースのJSONへ直列化。
3. Blob（application/json;charset=utf-8）→object URL→downloadリンクで保存する。ファイル名は安全化したプロジェクト名 + `.arrangement.json`。
4. クリック後にobject URLを解放する。保存したスナップショットを基準に未保存判定をリセットする。

ブラウザのダウンロード方式では実際のディスク書込やキャンセルを確認できない。「保存しました」と断言せず「ダウンロードを開始しました」と通知する。初版では既存ファイルへの直接上書きやFile System Access APIを必須にしない。保存のたびにファイルをダウンロードする。

### 読み込み

1. `<input type="file" accept=".json,application/json">`から1ファイル選択。拡張子やMIMEだけを信用しない。
2. サイズ→テキスト読込→JSON.parse→format/版→Zod→全体不変条件の順に検証。
3. エラー時は現在のプロジェクトを一切変更せず、日本語の理由（例:「レーン2のブロックが重なっています」）を表示。
4. 有効な候補ができた後、現在未保存なら置き換え確認。必要なら「JSONをダウンロードして続行」「破棄して続行」「キャンセル」。ダウンロード完了は検知できない旨を短く表示。
5. 確定時に1回だけプロジェクトを置き換える。選択・ドラッグ・フォームを解除し、未保存を解除。
6. 非同期読込中は編集と重複読込を無効にする。キャンセル・失敗・完了後にfile inputのvalueを空にし、同じファイルも再選択できるようにする。

新規作成にも同じ未保存確認を使う。未保存中のみbeforeunloadを登録。ブラウザの標準確認は環境によって表示されない場合があるため、ヘッダーにも未保存を常時表示する。localStorage自動保存・IndexedDB・PWAは初版に追加しない。ブラウザを閉じた後の再開にはJSONが必要。

## 9. 実装の分割

以下のうち`project.ts`以外はこれから作成する予定のファイル。

```text
src/domain/project.ts                  ファイルの型・定数（作成済み）
src/domain/project-schema.ts           Zodと意味検証
src/domain/project-reducer.ts          確定編集、新規/読込での置換
src/domain/timeline.ts                 座標、スナップ、境界、衝突の純関数
src/features/project/ProjectToolbar.tsx
src/features/project/use-project-file.ts
src/features/timeline/TimelineEditor.tsx
src/features/timeline/TimelineRuler.tsx
src/features/timeline/IdeaLaneHeader.tsx
src/features/timeline/IdeaLaneRow.tsx
src/features/timeline/IdeaBlock.tsx
src/features/timeline/BlockEditorDialog.tsx
src/features/timeline/use-block-interaction.ts
src/components/ui/*                   shadcnの生成ソース
```

reducerは純粋に保ち、IDと日時はactionを作る側で渡す。action例はproject/updateSettings、lane/add・rename・recolor・remove、block/add・update・move・resize・remove、project/replace。全mutationで同一の不変条件を適用する。失敗時は元stateとエラーを返し、部分更新しない。UI上だけのpreviewはreducerへ連続dispatchしない。

shadcnはButtonを基盤に導入済みとし、Input・Textarea・Label・Select・Dialog・AlertDialog・DropdownMenu・Tooltipは使用する段階でCLIから追加する。Resizableはパネル分割用なので、ブロックの時間方向の伸縮には流用しない。

## 10. 受け入れ条件

| ID | 確認内容 |
| --- | --- |
| A01 | ＋を1回押すとレーンが1つ増え、改名が確定・取消できる |
| A02 | BPM・拍子変更後も既存ブロックの小節位置が変わらない |
| A03 | 空き小節へ作成でき、末尾を超えず、キャンセルで残らない |
| A04 | 移動・左右伸縮が1小節単位。最小1小節、0未満・曲末超過・重なりを拒否 |
| A05 | 横スクロール・全倍率で位置計算がずれず、取消で元位置へ戻る |
| A06 | ラベルが大きく、メモ有無をアイコンで区別。ホバーとfocusでメモ表示 |
| A07 | JSON保存→新規→読込で全設定・レーン・ラベル・メモ・位置・長さを復元 |
| A08 | 不正JSON、未知版、重複ID、範囲外、過大ファイルの読込で現状を保持 |
| A09 | 新規・読込・離脱時に未保存を扱う。ダイアログ中のDeleteでブロックを消さない |
| A10 | 小節数短縮で既存ブロックを切り捨てない |
| A11 | キーボードで追加・編集・移動・伸縮が可能。タッチでメモ全文を開ける |
| A12 | 公開URLをログインせず利用でき、JSONの内容を外部送信しない |

### 受け入れ条件の実測結果（2026-09-06）

| 範囲 | 結果 | 方法・補足 |
| --- | --- | --- |
| A01〜A06 | 確認済み | 実画面でレーン、設定、ブロック、メモ、倍率、横スクロールを操作。ブロック追加時の空ID不具合は統合時に修正済み |
| A07〜A10 | 確認済み | JSON往復・拒否条件・未保存置換は純関数テストと実画面の保存通知/確認ダイアログで確認 |
| A11 | 確認済み | 実画面でEnter編集、左右移動、Shift+左右伸縮、メモアイコンとダイアログを確認 |
| A12 | 未実施 | 公開操作は依頼範囲外。Cloudflareのdry-runのみ成功し、JSONを外部送信しない構成を維持 |

自動検証は`npm run check`（6ファイル・22テスト）と`npm run cf:check`（Wrangler dry-run）が成功。ブラウザコンソールのエラーはなかった。

純関数テストは境界、隣接/重複、倍率とスクロール、読込拒否と状態保持、serialize/parse往復を重点にする。UIのスタイルをなぞるだけのテストは増やさない。操作検証は実装後に行う。

## 11. 参照した公式資料

2026-09-06確認。バージョンの再現性はpackage-lock.jsonを基準とする。

- [Vite Getting Started](https://vite.dev/guide/)
- [shadcn/ui: Vite](https://ui.shadcn.com/docs/installation/vite)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/get-started/)
- [Cloudflare SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
