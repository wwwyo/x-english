# AGENTS.md

## Instructions

- このプロジェクトは `WXT + TypeScript + pnpm` を前提とする。
- 依存追加・更新は `pnpm add ...@latest` / `pnpm add -D ...@latest` を使う。
- 変更後は最低限 `pnpm run typecheck` と `pnpm run lint` を実行する。
- Chrome拡張の読み込み先は `.output/chrome-mv3/`。
- APIキーは `chrome.storage.local` に保存する実装を維持し、キーをログ出力しない。
- Xの投稿内容はHTMLとして挿入しない（`textContent` を使い、XSSリスクを増やさない）。
