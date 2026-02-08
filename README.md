# xEnglish

X(Twitter)の投稿を英語学習向けに変換する拡張機能です。

## 機能

1. 投稿文を英語化（英語投稿は維持）
2. 英文を意味チャンクに分割し、薄い青の下線を付与
3. チャンクホバーで日本語の意味を tooltip 表示
4. tooltip クリックで文脈付き質問 UI を開き、質問回答を表示
5. 読み込み中は元テキストを skeleton 表示
6. デフォルトはシステムプロバイダキー利用（1日50件）
7. 上限超過後は BYOK（ユーザーAPIキー）で継続利用
8. Extension -> Worker は Elysia Eden Treaty の型付きRPCで通信

## セットアップ（ローカル）

1. Bun を用意
2. 依存関係をインストール
3. Worker と Extension を同時起動

```bash
bun install
bun run dev
```

4. Chrome の `chrome://extensions` を開く
5. 「デベロッパーモード」を ON
6. `apps/extension/.output/chrome-mv3/` を読み込む
7. 拡張の `Details` -> `Extension options` を開く
8. `Worker Base URL`（例: `https://xenglish-api.<subdomain>.workers.dev`）を設定

## Cloudflare Worker 設定

1. `apps/worker/wrangler.toml` の `RATE_LIMIT_SALT` を本番値に変更
2. システムプロバイダキーを secret 設定
3. `wrangler.toml` の Durable Object migration (`RateLimitDurableObject`) を維持したまま deploy

```bash
bun run --cwd apps/worker deploy
# 初回は以下も実行
wrangler secret put OPENAI_API_KEY --cwd apps/worker
```

## 開発コマンド（ルート）

- `bun run dev`
- `bun run dev:extension`
- `bun run dev:worker`
- `bun run build:extension`
- `bun run build:worker`
- `bun run zip:extension`
- `bun run typecheck`
- `bun run lint`
- `bun run format`
- `bun run format:check`

## ファイル構成

```text
x-english/
├── apps/
│   ├── extension/
│   │   ├── entrypoints/
│   │   ├── src/
│   │   ├── package.json
│   │   └── wxt.config.ts
│   └── worker/
│       ├── src/index.ts
│       ├── package.json
│       └── wrangler.toml
├── AGENTS.md
├── README.md
├── package.json
└── bun.lock
```

## 注意点

- X のDOM変更によりセレクタ調整が必要になる場合があります。
- システムキー利用の上限は `50件 / 1日 / (IP + clientId)` です（Durable Objectsで管理）。
- BYOKを設定した場合は上限を回避できます。
- BYOKキーは `chrome.storage.local` に保存されます。クライアント保存はセキュリティ上非推奨です。
- Webページから直接キーは参照できませんが、拡張機能側に脆弱性があれば漏洩リスクは残ります。
- 投稿文字列とtooltip文言は `innerHTML` を使わず `textContent` と `createElement` で描画しており、文字列起因のXSSを避けています。
