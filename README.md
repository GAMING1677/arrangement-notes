# Arrangement Notes

楽曲の展開を、小節ベースのアイデアレーンに記録するWebアプリ。

**編集機能・JSON保存/読み込みを実装済みです。Cloudflareへの公開はしていません。**

## ドキュメント

- [設計書](docs/design.md): 画面、操作、データ形式、制約、受け入れ条件
- [実装引き継ぎ](docs/implementation-handoff.md): GPT-5.6 Luna / High向けの実装順と依頼文
- [並行実装計画](docs/parallel-work.md): worktreeごとの担当、共有契約、統合順
- [公開手順](docs/deployment.md): Cloudflareの検証と公開
- [サンプルJSON](examples/arrangement-notes.v1.json)

## 開発

Node.js 22系の最新LTSパッチとnpmを使用。依存バージョンはpackage-lock.jsonで固定する。

```sh
npm ci
npm run dev
```

このWindows環境では既存のnpmランチャーが存在しないグローバルnpmを参照する場合がある。OS側の設定は変更していない。該当する場合は同梱CLIを直接呼び出せる。

```powershell
& 'C:/Program Files/nodejs/node.exe' 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' ci
& 'C:/Program Files/nodejs/node.exe' 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run dev
```

## 検証

```sh
npm run lint
npm run test
npm run build
npm run cf:check
```

`npm run check`はlint・テスト・型検査・ビルドを順に実行する。`npm run cf:check`は同じビルド後にCloudflareのdry-runを行う。

## 現在用意しているもの

- React + TypeScript strict + Vite、Tailwind CSS v4、shadcn部品
- 日本語・ダークテーマのタイムライン編集画面
- プロジェクト形式v1のZod検証、純粋な確定編集、JSON入出力
- レーン/ブロック編集、メモTooltip、キーボード移動・伸縮、未保存確認
- ESLint、Vitest、Cloudflare静的配信の設定

ソースはsrc/、設計はdocs/、例はexamples/。ログインやバックエンドは設計に含まれない。

## 統合後の確認結果（2026-09-06）

- `npm run check`: 成功（6ファイル・22テスト、lint・型検査・本番ビルド）
- `npm run cf:check`: 成功（Wrangler静的アセットdry-run、公開なし）
- 実画面: レーン追加/改名、BPM・拍子・総小節数、ブロック追加/編集、メモ表示、キーボード移動/伸縮、倍率、横スクロール、保存通知、未保存確認を確認
- ブラウザコンソール: エラーなし
- package.jsonとpackage-lock.jsonの依存定義一致を確認

確認環境はWindows / Node.js 22.14.0。解決済みの主な版はReact 19.2.8、Vite 7.3.6、TypeScript 5.9.3、Wrangler 4.129.0。隔離worktreeの依存解決では親ディレクトリ権限により通常実行が止まったため、最終検査は承認された通常環境で実行した。公開URLとA12の実運用確認は未実施（公開していないため）。
