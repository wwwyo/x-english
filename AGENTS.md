# AGENTS.md

## Project Overview

X(Twitter)の投稿を英語学習向けに変換するChrome拡張機能。投稿文の英訳・意味チャンク分割・日本語tooltip・文脈付き質問応答を提供する。

## Architecture

Bun workspace monorepo。2つのアプリで構成される。

```
x-english/
├── apps/
│   ├── extension/   # Chrome拡張（WXT framework）
│   └── worker/      # API サーバー（Cloudflare Workers + Elysia）
├── package.json     # ルート: workspaces, scripts, catalog
├── tsconfig.json    # ルート: 共通compilerOptions
└── mise.toml        # ツールバージョン管理・タスクランナー
```

### Extension (`apps/extension/`)

WXT frameworkベースのChrome拡張。

| ファイル                    | 役割                                                                 |
| --------------------------- | -------------------------------------------------------------------- |
| `entrypoints/background.ts` | Service Worker。メッセージ受信→Worker APIコール→結果キャッシュ・返却 |
| `entrypoints/content.ts`    | Content Script。DOM監視→投稿テキスト検出→チャンク描画→tooltip UI     |
| `entrypoints/options.html`  | 設定ページUI（BYOK key, model, Worker URL）                          |
| `src/options-page.ts`       | 設定ページロジック。`chrome.storage.local` の読み書き                |
| `src/shared/messages.ts`    | Runtime messageの型定義とバリデーション                              |
| `src/env.ts`                | `VITE_WORKER_BASE_URL` の検証                                        |
| `src/constants.ts`          | 共有定数                                                             |
| `src/styles/content.css`    | チャンク・tooltip・skeleton等のスタイル                              |
| `src/styles/options.css`    | 設定ページのスタイル                                                 |
| `wxt.config.ts`             | WXT設定。manifest生成（permissions, host_permissions）               |

### Worker (`apps/worker/`)

Cloudflare Workers上で動くElysiaベースのAPIサーバー。

| ファイル                               | 役割                                                                  |
| -------------------------------------- | --------------------------------------------------------------------- |
| `src/index.ts`                         | エントリポイント。`app.fetch` へ委譲、DurableObject re-export         |
| `src/app.ts`                           | Elysiaルーティング。`GET /health`, `POST /v1/process`, `POST /v1/ask` |
| `src/env.ts`                           | 環境変数バリデーション（`OPENAI_API_KEY`, `RATE_LIMIT_SALT`）         |
| `src/contracts.ts`                     | 共有型定義（`Chunk`, `ProcessResult`, `AskResult` 等）と定数          |
| `src/services/auth-service.ts`         | APIキー解決（BYOK / System）+ レート制限消費                          |
| `src/services/process-service.ts`      | 投稿の英訳・チャンク分割（AI SDK + structured output）                |
| `src/services/ask-service.ts`          | 文脈付き質問応答（AI SDK）                                            |
| `src/durable-objects/rate-limit-do.ts` | DurableObjectによるレート制限（SQLite永続化）                         |
| `src/utils/errors.ts`                  | `ApiError` クラスとエラーレスポンス変換                               |
| `src/utils/text.ts`                    | テキスト正規化ユーティリティ                                          |

### データフロー

```
[X.com DOM] → content.ts(テキスト検出)
  → chrome.runtime.sendMessage
  → background.ts(キャッシュ確認→Eden Treatyでworker呼出)
  → Worker /v1/process(認証→AI SDK→structured output)
  → background.ts(結果キャッシュ)
  → content.ts(チャンク描画・tooltip表示)
```

## Development

### 必須ツール

- [mise](https://mise.jdx.dev/) — ツールバージョン管理（Bun 1.3.4）
- Bun 1.3.4 — パッケージマネージャ・ランナー

### セットアップ

```bash
mise trust && mise run setup
# apps/worker/.dev.vars の OPENAI_API_KEY を設定
bun run dev
```

### コマンド一覧

| コマンド                  | 説明                                                    |
| ------------------------- | ------------------------------------------------------- |
| `bun run dev`             | Extension + Worker を同時に起動                         |
| `bun run dev:extension`   | Extension のみ起動                                      |
| `bun run dev:worker`      | Worker のみ起動                                         |
| `bun run typecheck`       | 両workspace の型チェック                                |
| `bun run lint`            | 両workspace の lint（oxlint `--deny-warnings`）         |
| `bun run format`          | oxfmt でフォーマット                                    |
| `bun run format:check`    | フォーマットチェック（CI用）                            |
| `bun run build:extension` | Extension ビルド → `apps/extension/.output/chrome-mv3/` |
| `bun run build:worker`    | Worker ビルド（dry-run deploy）                         |

### CI（`.github/workflows/ci.yml`）

PR・mainプッシュ時に実行: `typecheck` → `lint` → `format:check` → `build:extension` → `build:worker`

## Coding Rules

### 全般

- **変更後は必ず `bun run typecheck` と `bun run lint` を通す。**
- TypeScript strict mode。型エラー・lint warning は残さない。
- 依存追加・更新は `@latest` を付ける（例: `bun add elysia@latest`）。
- 共通依存（`typescript`, `oxlint`, `oxfmt`）はルート `package.json` の `catalog` でバージョン統一。各workspaceは `catalog:` を参照する。
- フォーマッタは oxfmt。VSCode設定済み（`.vscode/settings.json`）。

### Extension 固有

- **XのDOMセレクタ**: `article [data-testid="tweetText"]` を使用。X側の変更で壊れる可能性がある。
- **テキスト操作**: `textContent` と `createElement` で描画。`innerHTML` は使わない（XSS防止）。
- **Worker通信**: Elysia Eden Treaty の型付きRPC。Extension側から直接 OpenAI API を叩かない。
- **設定保存**: `chrome.storage.local`。キーは `openaiApiKey`, `openaiModel`, `xenglishWorkerBaseUrl`, `xenglishClientId`。
- **環境変数**: `.env.development` / `.env.production` で `VITE_WORKER_BASE_URL` を管理。
- **ビルド出力**: `apps/extension/.output/chrome-mv3/` をChromeに読み込む。

### Worker 固有

- **AI呼び出し**: Vercel AI SDK（`ai` + `@ai-sdk/openai`）経由。structured outputで型安全なレスポンス。
- **CORS**: `https://x.com` と `https://twitter.com` のみ許可。
- **認証フロー**: `x-byok-key` ヘッダーがあればBYOK、なければシステムキー + レート制限。
- **レート制限**: Durable Objects（SQLite）で管理。システムキー利用時のみ適用。
  - `50件/日/clientId`（`SYSTEM_DAILY_LIMIT`）
  - `200件/日/IP`（`SYSTEM_DAILY_IP_LIMIT`）
- **IP判定**: `cf-connecting-ip` → `x-forwarded-for` → `x-real-ip` の順。
- **識別子ハッシュ**: SHA-256 + `RATE_LIMIT_SALT` で IP・clientId をハッシュして保存。
- **エラー設計**: `ApiError` クラスで統一。`WorkerErrorCode` 型（`RATE_LIMIT_EXCEEDED` | `BAD_REQUEST` | `UPSTREAM_ERROR` | `INTERNAL_ERROR`）。
- **環境変数**: `wrangler.toml` でバインディング定義。秘匿値は `.dev.vars` に配置（gitignore済み）。
- **デプロイ**: `wrangler deploy`。`wrangler.toml` の `name = "xenglish-api"`。

### セキュリティ

- BYOKキーは `chrome.storage.local` に保存。クライアント保存のリスクをドキュメント・コメントで明記する。
- 投稿テキスト・tooltip文言は `innerHTML` を使わず `textContent` / `createElement` で描画（XSS防止）。
- AI SDK の structured output で `additionalProperties: false` を指定し、レスポンス構造を厳密に制御する。
