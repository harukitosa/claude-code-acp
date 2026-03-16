# Claude Code ACP Bridge - 実装計画

## 概要

Claude Code CLIをACP (Agent Client Protocol) Agent として公開するブリッジ実装。
Pro/Maxサブスクリプションのままclaude CLIをバックエンドとして利用し、
ACP対応クライアント（Zed, JetBrains等）から透過的にClaude Codeを使えるようにする。

## アーキテクチャ

```
ACP Client (Zed, JetBrains, etc.)
  ↕ stdio (JSON-RPC 2.0, newline-delimited)
claude-code-acp (TypeScript ACP Agent)
  ↕ subprocess (stream-json NDJSON)
claude CLI (Pro/Max subscription login済み)
```

### 重要な設計判断

- **ANTHROPIC_API_KEY は設定しない** → サブスク利用の必須条件
- **トランスポートは stdio** → ACP仕様の推奨、クライアントがAgentをsubprocess起動
- **認証はClaude Code側に委譲** → 事前に `claude auth login` 済みが前提
- **ACP SDK (`@agentclientprotocol/sdk`) を使用** → `AgentSideConnection` クラスで実装

## 技術スタック

| 項目 | 選定 | 理由 |
|---|---|---|
| 言語 | TypeScript | ACP公式SDKがTypeScript最優先、型安全 |
| ACP SDK | `@agentclientprotocol/sdk` | 公式SDK、AgentSideConnection提供 |
| ランタイム | Node.js >= 20 | ESM対応、subprocess管理が容易 |
| ビルド | tsup | シンプルなCLIビルド |
| パッケージ管理 | npm | 標準的 |

## ディレクトリ構成

```
claude-code-acp/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts            # エントリポイント、stdio接続セットアップ、エクスポート
│   ├── agent.ts            # ACP メソッドハンドラ実装
│   ├── claude-runner.ts    # Claude Code CLI subprocess管理
│   ├── session-store.ts    # ACP sessionId ↔ Claude Code session UUID マッピング
│   ├── config.ts           # 環境変数ベースの設定
│   └── logger.ts           # 構造化ロガー (stderr出力)
├── bin/
│   └── claude-code-acp.js  # 実行可能エントリポイント (shebang付き)
└── tests/
    ├── session-store.test.ts
    ├── claude-runner.test.ts
    ├── claude-runner-config.test.ts
    ├── agent.test.ts
    ├── agent-tool-call.test.ts
    ├── agent-errors.test.ts
    ├── streaming.test.ts
    ├── mcp-passthrough.test.ts
    ├── config.test.ts
    ├── logger.test.ts
    └── e2e.test.ts
```

---

## 段階別TODO

### 第1段階: MVP (最小動作可能プロダクト) ✅

目標: ACP クライアントから接続 → Claude Codeにプロンプト送信 → テキスト応答返却

#### 1.1 プロジェクト初期化 ✅
- [x] `npm init` でpackage.json作成 (type: "module")
- [x] TypeScript設定 (`tsconfig.json`)
- [x] 依存パッケージインストール
- [x] ビルド・開発スクリプト設定 (build, dev, test)
- [x] `.gitignore` 作成

#### 1.2 セッションストア実装 (`src/session-store.ts`) ✅
- [x] `SessionStore` クラス作成 (create, get, set, delete, has)
- [x] セッションメタデータ保持 (cwd, 作成日時, MCPサーバー)
- [x] ユニットテスト作成 (13テスト)

#### 1.3 Claude Runner実装 (`src/claude-runner.ts`) ✅
- [x] `ClaudeRunner` クラス作成
- [x] 初回実行 `startSession` / ストリーミング `startSessionStreaming`
- [x] 継続実行 `continueSession` / `continueSessionStreaming`
- [x] キャンセル `cancel` (SIGTERM)
- [x] エラーハンドリング (非ゼロ終了コード、JSON解析失敗)
- [x] ユニットテスト作成 (6テスト)

#### 1.4 ACPエージェント実装 (`src/agent.ts`) ✅
- [x] `initialize` ハンドラ (PROTOCOL_VERSION, agentCapabilities)
- [x] `session/new` ハンドラ (sessionId生成、SessionStore登録)
- [x] `session/prompt` ハンドラ (テキスト抽出、Claude実行、session/update送出)
- [x] `session/cancel` ハンドラ (プロセスkill)
- [x] `authenticate` ハンドラ (no-op)
- [x] ユニットテスト作成 (10テスト)

#### 1.5 エントリポイント ✅
- [x] stdio トランスポート接続セットアップ (ndJsonStream)
- [x] AgentSideConnection 初期化
- [x] グレースフルシャットダウン (SIGINT, SIGTERM)
- [x] bin エントリポイント作成

#### 1.6 動作確認 ✅
- [x] ビルド成功確認
- [x] E2Eテスト作成 (initialize → newSession → prompt フロー、マルチターン)

---

### 第2段階: ストリーミング対応 ✅

#### 2.1 ClaudeRunner ストリーミング対応 ✅
- [x] `--output-format stream-json` NDJSON パーサー
- [x] `content_block_delta` → `text_delta` 検出
- [x] `assistant.message.content` → `tool_use` 検出
- [x] コールバックパターンでイベント通知
- [x] 部分行バッファリング処理

#### 2.2 session/update 通知実装 ✅
- [x] `agent_message_chunk` 送出 (テキストストリーミング)
- [x] `tool_call` 送出 (ツール実行通知)

#### 2.3 テスト ✅
- [x] ストリーミングパーサーテスト (6テスト)
- [x] ツールコール通知テスト (1テスト)
- [x] E2Eストリーミングテスト

---

### 第3段階: 権限管理と堅牢化 ✅

#### 3.1 権限管理 ✅
- [x] `--allowedTools` による明示的許可リスト (環境変数設定)
- [x] `--dangerously-skip-permissions` オプション (環境変数設定)

#### 3.2 エラーハンドリング強化 ✅
- [x] Claude Code プロセスの異常終了処理
- [x] RequestError.resourceNotFound / invalidParams 使用
- [x] エラーをagent_message_chunkで送出（クライアントが確認可能）
- [x] エラーハンドリングテスト (3テスト)

#### 3.3 ロギング ✅
- [x] stderr への構造化ログ出力 (タイムスタンプ、レベル)
- [x] ログレベル設定 (環境変数 `LOG_LEVEL`)
- [x] ロガーテスト (4テスト)

#### 3.4 設定 ✅
- [x] `CLAUDE_ACP_ALLOWED_TOOLS`: 許可ツールリスト
- [x] `CLAUDE_ACP_MODEL`: モデル指定
- [x] `CLAUDE_ACP_MAX_TURNS`: 最大ターン数
- [x] `CLAUDE_ACP_TIMEOUT`: タイムアウト
- [x] `CLAUDE_ACP_SKIP_PERMISSIONS`: 権限スキップ
- [x] 設定テスト (6テスト)
- [x] 設定統合テスト (5テスト)

---

### 第4段階: MCP・拡張機能 ✅

#### 4.1 MCP サーバーパススルー ✅
- [x] `session/new` の `mcpServers` パラメータ処理
- [x] MCP設定をClaude Code の `--mcp-config` に変換 (一時ファイル)
- [x] SessionStoreにMCPサーバー設定保持
- [x] MCPパススルーテスト

---

### 第5段階: 配布準備 ✅

#### 5.1 パッケージング ✅
- [x] package.json の files, engines 設定
- [x] bin エントリポイント実行権限
- [x] ビルド成功確認 (dist/index.js + dist/index.d.ts)
- [x] `npx claude-code-acp` で実行可能な構成

#### 5.2 ACP Agent Registry 登録
- [ ] レジストリ仕様に準拠したメタデータ作成
- [ ] https://cdn.agentclientprotocol.com/registry への登録申請

#### 5.3 IDE統合テスト
- [ ] Zed での動作確認
- [ ] JetBrains IDE での動作確認

---

## テスト結果サマリ

- テストファイル: 11
- テストケース: 57
- 全てGREEN ✅

---

## 環境変数リファレンス

| 変数名 | 説明 | デフォルト |
|---|---|---|
| `LOG_LEVEL` | ログレベル (debug/info/warn/error) | `info` |
| `CLAUDE_ACP_ALLOWED_TOOLS` | 許可ツール (カンマ区切り) | (空) |
| `CLAUDE_ACP_MODEL` | モデル指定 (sonnet/opus) | (未指定) |
| `CLAUDE_ACP_MAX_TURNS` | 最大ターン数 | (無制限) |
| `CLAUDE_ACP_TIMEOUT` | タイムアウト(ms) | `300000` |
| `CLAUDE_ACP_SKIP_PERMISSIONS` | 権限スキップ | `false` |

## 参考資料

- [ACP Protocol Overview](https://agentclientprotocol.com/protocol/overview)
- [ACP Schema](https://agentclientprotocol.com/protocol/schema)
- [ACP TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk)
- [Claude Code Headless Mode](https://code.claude.com/docs/en/headless)
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference)
- [Using Claude Code with Pro/Max](https://support.anthropic.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)
