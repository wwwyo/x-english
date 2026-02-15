# XEnglish

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

1. [mise](https://mise.jdx.dev/) をインストール
2. セットアップを実行（依存インストール + `.dev.vars` 生成）
3. 生成された `apps/worker/.dev.vars` の `OPENAI_API_KEY` を設定
4. 開発サーバーを起動

```bash
mise trust && mise run setup
# OPENAI_API_KEY を設定後
bun run dev
```

5. Chrome の `chrome://extensions` を開く
6. 「デベロッパーモード」を ON
7. `apps/extension/.output/chrome-mv3/` を読み込む
8. 拡張の `Details` -> `Extension options` を開く

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
