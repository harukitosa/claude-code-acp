# CLAUDE.md

## プロジェクト概要

Claude Code CLIをACP (Agent Client Protocol) Agentとして公開するブリッジ。
Pro/Maxサブスクリプションのまま、ACP対応クライアント（Zed, JetBrains等）からClaude Codeを利用可能にする。

## コミットルール

- **公開リポジトリである**ことを常に意識すること
- セキュリティ脆弱性の詳細、修正計画、内部TODOリストをコミットに含めない
  - セキュリティレビュー結果やfix planはローカルのみに保持する
  - コミットメッセージにも脆弱性の詳細を書かない（「fix security issue in X」程度に留める）
- `.env`、認証情報、APIキーを絶対にコミットしない
- `docs/` 以下はユーザー向けドキュメントのみ。内部の作業メモやTODOは置かない

## 開発

- テストフレームワーク: vitest
- ビルド: tsup (ESM)
- TDDで開発する（テストを先に書く）
- `npm test` で全テスト実行、`npm run build` でビルド
