# Cloudflare公開手順

## 方針

Cloudflare Workers Static AssetsでViteの`dist/`を配信する。`wrangler.jsonc`に静的配信とSPAフォールバックを設定済み。アプリ用サーバーコード、DB、APIキーは不要。Cloudflare Pagesへ変更する必要はない。

Cloudflareプロジェクト作成・ログイン・デプロイはまだしていない。2026-09-06にmaster更新時のGitHub Actionsを追加した。

## masterへのマージ時の自動デプロイ

`.github/workflows/deploy.yml`はmasterへのpush（PRマージを含む）で実行する。`npm ci`→lint/test/build→認証情報確認→Wranglerによる公開の順。いずれかが失敗すれば公開しない。PRと作業ブランチからは公開しない。手動実行もmaster限定。公開の同時実行を避けるconcurrencyを設定済み。

`.github/workflows/ci.yml`はmaster宛PRとmaster更新時に検査・ビルド・dry-runを行う。リポジトリ設定でmasterへの直接pushを制限し、このCIを必須にすれば「レビューしてマージ→公開」の運用にできる。ブランチ保護設定はまだ追加していない。

GitHubリポジトリのSettings → Secrets and variables → Actionsに次のRepository secretsを設定する（production Environment secretsでも可）。

| 名前 | 値 |
| --- | --- |
| CLOUDFLARE_API_TOKEN | 対象アカウントに限定したEdit Cloudflare Workersトークン |
| CLOUDFLARE_ACCOUNT_ID | 公開先のCloudflareアカウントID |

トークン値はチャットやソースへ書かず、GitHubの設定画面で登録する。未設定の場合はデプロイジョブが明示的に失敗する。Secrets登録後、ActionsのDeploy to CloudflareからmasterでRun workflowを実行すれば接続確認できる。以降のmasterマージで自動公開する。初回pushもトリガー対象である。

本番環境名はproduction。Environmentに承認ルールを設定した場合は、その承認後に公開する。完全自動化したい場合は必須承認を設定しない。Cloudflare側のGit連携ビルドを同時に有効化すると二重公開になるため、本構成ではGitHub Actionsを公開経路にする。

公式資料: [Cloudflare GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)。依存のWrangler版はlockfileを使用する。

## ローカル確認

```sh
npm ci
npm run check
npm run cf:check
```

`cf:check`はビルドと`wrangler deploy --dry-run`。公開せずに設定と出力を検証する。ビルド前に手書きのdistを作らない。

## 公開する段階

1. `wrangler.jsonc`の`name`を利用するCloudflareアカウント内で適切な名前にする。
2. `npx wrangler login`で公開担当者のアカウントにログイン。
3. 複数アカウントの場合は対象を確認し、必要に応じて`CLOUDFLARE_ACCOUNT_ID`を環境変数に設定する。トークンをソースに書かない。
4. `npm run deploy`で検査・ビルド後に静的アセットを公開。
5. 表示されたworkers.dev URLをプライベートウィンドウで開き、アプリのログインが不要なことを確認。
6. レーン・ブロック・メモを作成してJSON保存し、再読み込み後にJSONを開いて復元を確認。開発者ツールでJSON内容の外部送信がないことを確認。

保存ファイルやユーザーのメモを`public/`や`dist/`へ置かない。examples/とdocs/はViteの静的公開対象外。

## 更新・切り戻し

更新は同じnameに`npm run deploy`。問題があればCloudflareのデプロイ履歴から確認済みの版へ切り戻すか、前のソースをビルドして再公開する。アプリの版を戻しても利用者の手元のJSONは変更されない。schemaVersion互換性は別途守る。

## 公式資料

- [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/get-started/)
- [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
