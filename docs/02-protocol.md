# 02 - プロトコル仕様

## プロトコルの基盤: JSON-RPC 2.0

MCPは **JSON-RPC 2.0** をメッセージフォーマットとして採用しています。

### JSON-RPC 2.0 とは

JSON-RPCは、JSONを使ったリモートプロシージャコール（RPC）プロトコルです。

```
┌──────────┐   JSON-RPC Request    ┌──────────┐
│  Client   │ ──────────────────→  │  Server   │
│           │                      │           │
│           │   JSON-RPC Response  │           │
│           │ ←──────────────────  │           │
└──────────┘                      └──────────┘
```

### メッセージの3つの型

#### 1. Request（リクエスト）

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "Tokyo"
    }
  }
}
```

| フィールド | 型 | 説明 |
|-----------|---|------|
| `jsonrpc` | string | 常に `"2.0"` |
| `id` | number / string | リクエストの一意識別子 |
| `method` | string | 呼び出すメソッド名 |
| `params` | object | メソッドのパラメータ（任意） |

#### 2. Response（レスポンス）

**成功時:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "東京の天気は晴れ、気温25°Cです。"
      }
    ]
  }
}
```

**エラー時:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": "city は必須パラメータです"
  }
}
```

#### 3. Notification（通知）

レスポンスを期待しない一方向のメッセージです（`id` がない）。

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progressToken": "abc123",
    "progress": 50,
    "total": 100
  }
}
```

## トランスポート層

JSON-RPCメッセージを実際にやり取りする「通信路」を **トランスポート** と呼びます。

### 1. stdio（標準入出力）

**ローカル実行に最適。** MCPサーバーを子プロセスとして起動し、stdin/stdout で通信します。

```
┌───────────┐  stdin (JSON-RPC)  ┌───────────┐
│           │ ─────────────────→ │           │
│  Client   │                    │  Server   │
│ (親プロセス)│                    │ (子プロセス)│
│           │  stdout (JSON-RPC) │           │
│           │ ←───────────────── │           │
└───────────┘                    └───────────┘
              stderr → ログ出力
```

**特徴:**
- セットアップが簡単
- ネットワーク不要
- ローカル開発に最適
- サーバーのログは stderr に出力する（stdout はプロトコル通信用）

**利用例: Claude Desktop の設定**
```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/server/index.js"],
      "env": {
        "API_KEY": "your-api-key"
      }
    }
  }
}
```

### 2. Streamable HTTP

**リモートサーバーに推奨。** HTTP上でJSON-RPCメッセージをやり取りします。

```
┌───────────┐   POST /mcp        ┌───────────┐
│           │ ─────────────────→ │           │
│  Client   │                    │  Server   │
│           │   JSON Response    │           │
│           │ ←───────────────── │           │
│           │                    │           │
│           │   GET /mcp (SSE)   │           │
│           │ ─────────────────→ │           │
│           │   Event Stream     │           │
│           │ ←───────────────── │           │
└───────────┘                    └───────────┘
```

**特徴:**
- ネットワーク越しの通信が可能
- SSE（Server-Sent Events）でサーバーからのプッシュ通知対応
- セッション管理（`Mcp-Session-Id` ヘッダー）
- 本番環境での運用に適している

### 3. HTTP + SSE（レガシー）

初期バージョンで使われたトランスポート。新規開発では **Streamable HTTP** を推奨。

```
Client                          Server
  │   GET /sse                    │
  │ ─────────────────────────────→│  SSE接続を確立
  │   event: endpoint             │
  │   data: /messages?sid=xxx     │
  │ ←─────────────────────────────│
  │                               │
  │   POST /messages?sid=xxx      │
  │ ─────────────────────────────→│  メッセージ送信
  │                               │
  │   event: message              │
  │   data: { "jsonrpc": ... }    │
  │ ←─────────────────────────────│  レスポンス受信（SSE経由）
```

## 接続ライフサイクル

MCPの接続は明確なライフサイクルを持ちます。

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐     ┌──────────┐
│ 初期化       │ ──→ │ ケーパビリティ │ ──→ │ 通常動作    │ ──→ │ 切断      │
│ (Initialize) │     │ ネゴシエーション│     │ (Operation) │     │ (Shutdown)│
└─────────────┘     └──────────────┘     └────────────┘     └──────────┘
```

### Phase 1: 初期化（Initialize）

```
Client                              Server
  │                                   │
  │  initialize (capabilities, ...)   │
  │ ─────────────────────────────────→│
  │                                   │
  │  result (capabilities, ...)       │
  │ ←─────────────────────────────────│
  │                                   │
  │  notifications/initialized        │
  │ ─────────────────────────────────→│
  │                                   │
```

**initialize リクエスト:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "roots": {
        "listChanged": true
      },
      "sampling": {}
    },
    "clientInfo": {
      "name": "MyAIApp",
      "version": "1.0.0"
    }
  }
}
```

**initialize レスポンス:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "tools": {
        "listChanged": true
      },
      "resources": {
        "subscribe": true,
        "listChanged": true
      },
      "prompts": {
        "listChanged": true
      },
      "logging": {}
    },
    "serverInfo": {
      "name": "WeatherServer",
      "version": "1.0.0"
    }
  }
}
```

### Phase 2: ケーパビリティネゴシエーション

初期化時に交換される `capabilities` オブジェクトで、双方が対応する機能を宣言します。

**サーバーが宣言できるケーパビリティ:**

| ケーパビリティ | 説明 |
|--------------|------|
| `tools` | ツールの提供 |
| `resources` | リソースの提供 |
| `prompts` | プロンプトテンプレートの提供 |
| `logging` | ログメッセージの送信 |

**クライアントが宣言できるケーパビリティ:**

| ケーパビリティ | 説明 |
|--------------|------|
| `roots` | ファイルシステムのルート情報を提供 |
| `sampling` | LLMへのサンプリング（推論）を許可 |
| `elicitation` | ユーザーへの情報要求を許可 |

### Phase 3: 通常動作（Operation）

初期化完了後、リクエストと通知を自由にやり取りできます。

```
Client                              Server
  │  tools/list                       │
  │ ─────────────────────────────────→│
  │  [ツール一覧]                      │
  │ ←─────────────────────────────────│
  │                                   │
  │  tools/call                       │
  │ ─────────────────────────────────→│
  │  [実行結果]                        │
  │ ←─────────────────────────────────│
  │                                   │
  │  resources/read                   │
  │ ─────────────────────────────────→│
  │  [リソースデータ]                   │
  │ ←─────────────────────────────────│
  │                                   │
  │  notifications/tools/list_changed │
  │ ←─────────────────────────────────│  （サーバーからの通知）
  │                                   │
```

### Phase 4: 切断（Shutdown）

クライアントまたはサーバーが接続を終了します。

```
Client                              Server
  │  (トランスポートを閉じる)            │
  │ ──────────── × ──────────────────│
```

## 主要なメソッド一覧

### クライアント → サーバー

| メソッド | 説明 |
|---------|------|
| `initialize` | 接続の初期化 |
| `ping` | 生存確認 |
| `tools/list` | 利用可能なツール一覧を取得 |
| `tools/call` | ツールを実行 |
| `resources/list` | リソース一覧を取得 |
| `resources/read` | リソースの内容を取得 |
| `resources/templates/list` | リソーステンプレート一覧を取得 |
| `resources/subscribe` | リソースの変更を監視 |
| `prompts/list` | プロンプト一覧を取得 |
| `prompts/get` | プロンプトを取得 |
| `logging/setLevel` | ログレベルを設定 |
| `completion/complete` | 引数の自動補完を要求 |

### サーバー → クライアント

| メソッド | 説明 |
|---------|------|
| `sampling/createMessage` | LLMにサンプリング（推論）を要求 |
| `elicitation/create` | ユーザーに情報入力を要求 |
| `roots/list` | クライアントのルート一覧を要求 |

### 通知（双方向）

| メソッド | 方向 | 説明 |
|---------|------|------|
| `notifications/initialized` | C → S | 初期化完了 |
| `notifications/cancelled` | 双方向 | リクエストのキャンセル |
| `notifications/progress` | 双方向 | 進捗報告 |
| `notifications/tools/list_changed` | S → C | ツール一覧が変更された |
| `notifications/resources/list_changed` | S → C | リソース一覧が変更された |
| `notifications/resources/updated` | S → C | リソースが更新された |
| `notifications/prompts/list_changed` | S → C | プロンプト一覧が変更された |
| `notifications/message` | S → C | ログメッセージ |

## エラーコード

MCPは JSON-RPC 2.0 標準のエラーコードに加え、独自のエラーコードを定義しています。

| コード | 名前 | 説明 |
|--------|------|------|
| -32700 | Parse error | JSONのパースに失敗 |
| -32600 | Invalid Request | リクエストの形式が不正 |
| -32601 | Method not found | メソッドが見つからない |
| -32602 | Invalid params | パラメータが不正 |
| -32603 | Internal error | 内部エラー |

## プロトコルバージョン

| バージョン | 日付 | 主な変更 |
|-----------|------|---------|
| `2024-11-05` | 2024年11月 | 初期リリース |
| `2025-03-26` | 2025年3月 | Streamable HTTP 追加 |
| `2025-06-18` | 2025年6月 | Elicitation、Structured Output 等 |
| `2025-11-25` | 2025年11月 | 最新安定版 |

## 次のステップ

プロトコルの基盤を理解したら、次は [03-primitives.md](03-primitives.md) でMCPの3つの主要プリミティブ（Tools・Resources・Prompts）を詳しく学びましょう。
