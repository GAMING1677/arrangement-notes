# Arrangement Notes

楽曲の展開を、小節ベースのアイデアレーンに記録するWebアプリ。

**現在は設計と開発基盤のみです。編集機能・JSON保存/読み込みは未実装で、Cloudflareへの公開もしていません。**

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

`npm run check`はlint・テスト・ビルドを順に実行。現在のテストはサンプルJSONと型の契約確認のみで、未実装機能の動作を保証しない。実装時に設計書の境界・失敗ケースを追加する。

## 現在用意しているもの

- React + TypeScript strict + Vite、Tailwind CSS v4、shadcnの設定とButton
- 日本語・ダークテーマの静的な画面骨格
- プロジェクト形式v1の型定義とサンプル
- ESLint、Vitest、Cloudflare静的配信の設定

ソースはsrc/、設計はdocs/、例はexamples/。ログインやバックエンドは設計に含まれない。

## 基盤の確認結果（2026-09-06）

- ESLint: エラー・警告なし
- Vitest: サンプルJSONの契約検査2件成功
- TypeScript / Vite: 本番ビルド成功
- Wrangler: 静的アセットのdry-run成功（公開なし）
- package.jsonとpackage-lock.jsonの依存定義一致を確認

確認環境はWindows / Node.js 22.14.0。解決済みの主な版はReact 19.2.8、Vite 7.3.6、TypeScript 5.9.3、Wrangler 4.129.0。Codexの制限環境ではビルドツールの親ディレクトリ読み取りが拒否されたため、検査は承認された通常環境で実行した。ブラウザ操作・実機UI・公開URLの検証は今回の対象外。
