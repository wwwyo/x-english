# AGENTS.md

## Instructions

- 構成は `bun workspace` の monorepo（`apps/extension`, `apps/worker`）。
- 共通依存（例: `typescript`, `oxlint`, `oxfmt`）はルート `package.json` の `catalog` でバージョンを統一し、各workspaceは `catalog:` を参照する。
- 依存追加・更新は必ず `@latest` を使う（例: `bun add x@latest`, `bun add -d x@latest`）。
- 変更後は `bun run typecheck` と `bun run lint` を通す。
- 拡張の読み込み先は `apps/extension/.output/chrome-mv3/`。
- AI呼び出しは Worker 側の `AI SDK` 経由で実装し、拡張側から直接 OpenAI API を叩かない。
- Extension と Worker の通信は Elysia Eden Treaty の型付きRPCを使う。
- システムキー利用には `50件/1日/(IP + clientId)` の制限を Durable Objects で維持する。
- BYOKキーは `chrome.storage.local` 保存のため、コメント・ドキュメントで非推奨であることを明記する。
- Xの投稿テキストは `textContent` で扱い、HTML挿入をしない。
