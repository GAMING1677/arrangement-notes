# Luna High 並行実装計画

2026-09-06。各担当は独立したCodexタスクとworktreeで進める。

統合結果（2026-09-06）: A `6e06840ee78d9d74e8720d9530f8b3acbd2a13b1`、B `b66ec73ba3afccb78dbe7eb4eb6bdf0e92ef3c36`、C `933a11f4a0fb207dea1f2ddede8a25d4afb6fcec`をDの`codex/integration`へ取り込み済み。DでApp.tsx接続、Bのshadcn部品への統一、実画面確認、Cloudflare dry-runまで完了。masterへのマージ・公開は未実施。

## 依存順

```text
共有型・Git・CI/CD（今回の準備）
  ├─ A: データ検証・確定編集・JSON変換 ─────┐
  ├─ B: タイムライン画面・ブロック操作 ────┼─ D: 統合・操作検証・PR
  └─ C: プロジェクト設定・ファイル操作UI ──┘
```

A/B/Cは同時開始可能。Dは3件の完了コミットを取り込んでから統合する。すべてGPT-5.6 Luna / Highを使用。masterへのマージ・本番公開は各担当で実行しない。

## ファイル担当

| 担当 | 所有ファイル | 成果物 |
| --- | --- | --- |
| A | src/domain/project-schema.ts、project-reducer.ts、project-file.tsと各test | 検証、生成、純粋mutation、JSON parse/serialize |
| B | src/features/timeline/**、src/components/ui/**、package.jsonとlockfile | レーン、ルーラー、ブロック編集、Tooltip、移動・伸縮、必要なshadcn部品 |
| C | src/features/project/** | 設定フォーム、新規/開く/保存、未保存確認、beforeunload |
| D | src/App.tsx、必要なsrc/index.css調整、統合修正、docsの最終状況 | 接続済みアプリと動作確認、master宛PR |

共有契約は`src/domain/editor-contracts.ts`。A/B/Cは変更しない。依存パッケージとshadcn生成はBだけが担当し、CはBの未生成部品に依存せず既存Buttonとアクセシブルな標準フォームで作り、Dで必要に応じてshadcnへ差し替える。Cはfile inputなどネイティブが適切な要素は保持する。

## 固定するexport

### A

- `project-schema.ts`: `validateProject(value: unknown): Result<ArrangementProject>`
- `project-reducer.ts`: `createProject(id: string, now: string): ArrangementProject`、`applyProjectMutation(project, mutation, now: string): Result<ArrangementProject>`
- `project-file.ts`: `parseProject(text: string): Result<ArrangementProject>`、`serializeProject(project): Result<string>`
- これらは副作用なし。nowとidは呼び出し側から注入。project.tsの公開型は維持。

### B

- `src/features/timeline/TimelineEditor.tsx`: named export `TimelineEditor`、propsはTimelineEditorProps。
- onMutationの戻り値で拒否理由を表示。projectは親が所有。App.tsxは編集しない。
- 必要な位置計算はfeatures/timeline内へ置いてAと競合させない。

### C

- `src/features/project/ProjectControls.tsx`: named export `ProjectControls`、propsはProjectControlsProps。
- 検証・変換・新規生成はservicesから注入。Aの未実装ファイルへ直接importしない。
- 非同期読込とフォーム表示中はonBusyChangeでタイムラインを無効化する。
- onSavedにはダウンロードした時点のsnapshotを渡す。実際の保存完了を検知したと表示しない。

### D

- useState/useReducerでprojectを所有し、A/B/Cを接続。services.createはcrypto.randomUUIDとnew Date().toISOStringを注入。
- snapshot比較でdirtyを管理。拒否されたmutationでprojectやupdatedAtを変えない。
- Cの汎用フォームUIをBのshadcn部品へ統一し、フォーカスと取消を検証。
- A/B/Cのブランチを統合用worktreeへマージし、競合と不整合を修正。元worktreeの未コミット変更に触れない。
- lint/test/build/Cloudflare dry-runと実画面操作を確認。masterへはマージしない。

## 各タスク共通

README.md、docs/design.md、本書、共有型を最初に読む。再scaffold・モデル変更・サブエージェント追加はしない。必要な依存はnpm ciで各worktreeへ導入する。Windowsのnpm/ghランチャーはREADMEの既知事項と`C:/Program Files/GitHub CLI/gh.exe`を参考にする。

担当ファイルだけをcommitし、最後にブランチ名・commit SHA・検証結果・注意点を報告する。originがあれば自分の作業ブランチをpushしてよい。masterへpush/mergeしない。統合担当が1つのPRを作るため、A/B/Cは個別PRを作らない。

コストを抑えるため、Dはwait_threadsを使い、完了済みタスクを繰り返し読まない。A/B/Cは待ちタスクを作らず、共有契約に沿って単独で検証できる実装を進める。
