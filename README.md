# xEnglish

X(Twitter)の投稿を英語学習向けに変換する Chrome Extension です。  

## 実装済み機能

1. 投稿文を英語化（英語投稿は維持）
2. 英文を意味チャンクに分割し、薄い青の下線を付与
3. チャンクホバーで日本語の意味を tooltip 表示
4. tooltip クリックで文脈付き質問 UI を開き、質問回答を表示

## セットアップ

1. Node.js 20+ を用意
2. 依存関係をインストール
3. 開発ビルドを起動

```bash
pnpm install
pnpm run dev
```

4. Chrome の `chrome://extensions` を開く
5. 「デベロッパーモード」を ON
6. `.output/chrome-mv3/` を「パッケージ化されていない拡張機能」で読み込む
7. 拡張の `Details` -> `Extension options` を開く
8. OpenAI API Key と Model を保存する（デフォルト: `gpt-4.1-mini`）

## 開発コマンド

- `pnpm run dev`: 開発モード
- `pnpm run build`: 本番ビルド
- `pnpm run zip`: 配布zip作成
- `pnpm run typecheck`: TypeScript型チェック
- `pnpm run lint`: oxlint実行
- `pnpm run format`: oxfmtで整形
- `pnpm run format:check`: oxfmtの整形チェック

## ファイル構成

```text
x-english/
├── entrypoints/
│   ├── background.ts
│   ├── content.ts
│   └── options.html
├── src/
│   ├── options-page.ts
│   ├── shared/
│   │   └── messages.ts
│   ├── styles/
│   │   ├── content.css
│   │   └── options.css
│   └── wxt-globals.d.ts
├── AGENTS.md
├── README.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── wxt.config.ts
```

## 注意点

- X のDOM変更によりセレクタ調整が必要になる場合があります。
- APIコール回数は投稿数に比例します（キャッシュは service worker 稼働中のみ有効）。
- APIキーは `chrome.storage.local` に保存されます（WebページやXのスクリプトから直接参照はできません）。
- ただし「XSSがあっても完全に安全」という意味ではありません。拡張機能側のUI/スクリプトに脆弱性があればキー流出リスクはあります。
- 現状はDOMから受け取った値をHTMLとして挿入せず（`textContent`中心）、`eval`や動的スクリプト実行を使わない実装にしています。
