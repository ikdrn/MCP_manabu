# 05 - 高度なトピックとベストプラクティス

## 1. Streamable HTTP トランスポート

リモートサーバーとして MCP を公開する場合は **Streamable HTTP** を使います。

### TypeScript での実装

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

const app = express();
app.use(express.json());

const server = new McpServer({
  name: "remote-server",
  version: "1.0.0",
});

// ツールなどを登録...

// セッション管理用のMap
const transports = new Map<string, StreamableHTTPServerTransport>();

// MCPエンドポイント
app.all("/mcp", async (req, res) => {
  // セッションIDの取得または生成
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (req.method === "GET") {
    // SSE接続（サーバーからのプッシュ通知用）
    const transport = transports.get(sessionId || "");
    if (!transport) {
      res.status(400).json({ error: "Invalid session" });
      return;
    }
    await transport.handleSSERequest(req, res);
    return;
  }

  if (req.method === "POST") {
    if (!sessionId) {
      // 新しいセッションの開始
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
      });

      await server.connect(transport);
      const newSessionId = transport.sessionId!;
      transports.set(newSessionId, transport);

      await transport.handlePostRequest(req, res);
      return;
    }

    // 既存セッションへのメッセージ
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(400).json({ error: "Invalid session" });
      return;
    }
    await transport.handlePostRequest(req, res);
    return;
  }

  if (req.method === "DELETE") {
    // セッションの終了
    const transport = transports.get(sessionId || "");
    if (transport) {
      await transport.close();
      transports.delete(sessionId!);
    }
    res.status(200).end();
    return;
  }

  res.status(405).end();
});

app.listen(3000, () => {
  console.log("MCP Server listening on http://localhost:3000/mcp");
});
```

### Streamable HTTP の通信フロー

```
Client                              Server (:3000/mcp)
  │                                        │
  │  POST /mcp                             │
  │  { "method": "initialize", ... }       │
  │ ──────────────────────────────────────→│
  │                                        │
  │  200 OK                                │
  │  Mcp-Session-Id: abc-123               │
  │  { "result": { "capabilities": ... } } │
  │ ←──────────────────────────────────────│
  │                                        │
  │  GET /mcp                              │
  │  Mcp-Session-Id: abc-123               │
  │ ──────────────────────────────────────→│  SSE接続確立
  │                                        │
  │  POST /mcp                             │
  │  Mcp-Session-Id: abc-123               │
  │  { "method": "tools/call", ... }       │
  │ ──────────────────────────────────────→│
  │                                        │
  │  200 OK                                │
  │  { "result": { ... } }                 │
  │ ←──────────────────────────────────────│
  │                                        │
  │  DELETE /mcp                           │
  │  Mcp-Session-Id: abc-123               │
  │ ──────────────────────────────────────→│  セッション終了
```

### クライアント側の接続

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "my-client", version: "1.0.0" });

const transport = new StreamableHTTPClientTransport(
  new URL("http://localhost:3000/mcp")
);

await client.connect(transport);
```

---

## 2. セキュリティ

### 2.1 入力バリデーション

```typescript
import { z } from "zod";

server.tool(
  "query_database",
  "データベースを検索します",
  {
    // Zod でスキーマを厳密に定義
    table: z.enum(["users", "products", "orders"])
      .describe("検索するテーブル"),
    limit: z.number().int().min(1).max(100)
      .describe("取得件数の上限")
      .default(10),
    // SQLインジェクション対策: フリーテキストのクエリは避ける
    // 代わりに構造化されたフィルタを使う
    filters: z.object({
      field: z.string().regex(/^[a-zA-Z_]+$/),  // 英数字とアンダースコアのみ
      operator: z.enum(["eq", "gt", "lt", "contains"]),
      value: z.string().max(100),
    }).array().max(5).optional(),
  },
  async ({ table, limit, filters }) => {
    // パラメータ化クエリを使用
    // ...
  }
);
```

### 2.2 パストラバーサルの防止

```typescript
import path from "path";

const ALLOWED_BASE_DIR = "/home/user/documents";

server.tool(
  "read_document",
  "ドキュメントを読みます",
  { filePath: z.string() },
  async ({ filePath }) => {
    // パスを正規化して基準ディレクトリ内かチェック
    const resolved = path.resolve(ALLOWED_BASE_DIR, filePath);

    if (!resolved.startsWith(ALLOWED_BASE_DIR)) {
      return {
        content: [{ type: "text", text: "エラー: 許可されたディレクトリ外のアクセスです" }],
        isError: true,
      };
    }

    // 安全にファイルを読み取り
    // ...
  }
);
```

### 2.3 認証と認可

Streamable HTTP サーバーでは OAuth 2.0 による認証が推奨されています。

```typescript
// ミドルウェアで認証チェック
app.use("/mcp", (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({ error: "Forbidden" });
  }
});
```

### 2.4 セキュリティチェックリスト

| チェック項目 | 説明 |
|-------------|------|
| 入力バリデーション | 全入力をZodスキーマで検証 |
| パストラバーサル | ファイルパスを基準ディレクトリ内に制限 |
| SQLインジェクション | パラメータ化クエリを使用 |
| 秘密情報の漏洩 | APIキーなどを結果に含めない |
| レート制限 | HTTP サーバーにレート制限を設定 |
| CORS | 必要なオリジンのみ許可 |
| ツールの承認 | 破壊的操作にはユーザー確認を要求 |
| ログ | 全ツール実行をログに記録 |

---

## 3. Sampling（サンプリング）

**Sampling** は、MCPサーバーが **クライアント側のLLMに推論を依頼する** 機能です。

```
Server → Client: "この文章を要約してください" (sampling/createMessage)
Client → LLM: (推論を実行)
Client → Server: "要約結果は..." (result)
```

### 実装例

```typescript
// サーバー側: Sampling を使って LLM に処理を依頼
server.tool(
  "smart_categorize",
  "テキストをAIで分類します",
  { text: z.string() },
  async ({ text }, { sendRequest }) => {
    // クライアントの LLM にサンプリングを依頼
    const result = await sendRequest(
      {
        method: "sampling/createMessage",
        params: {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `以下のテキストを "技術", "ビジネス", "エンタメ", "その他" のいずれかに分類してください。カテゴリ名のみ回答してください。\n\nテキスト: ${text}`,
              },
            },
          ],
          maxTokens: 10,
        },
      }
    );

    return {
      content: [
        { type: "text", text: `分類結果: ${result.content.text}` },
      ],
    };
  }
);
```

**注意:** Sampling はクライアントが `sampling` ケーパビリティを宣言している場合のみ使用可能です。

---

## 4. Elicitation（情報要求）

**Elicitation** は、MCPサーバーが **ユーザーに追加情報の入力を求める** 機能です。

```
Server → Client: "APIキーを入力してください" (elicitation/create)
Client → User: (入力フォームを表示)
User → Client: (APIキーを入力)
Client → Server: "ユーザーの入力: sk-..." (result)
```

### 実装例

```typescript
server.tool(
  "configure_api",
  "外部APIの設定を行います",
  { service: z.string() },
  async ({ service }, { sendRequest }) => {
    // ユーザーに情報の入力を要求
    const result = await sendRequest(
      {
        method: "elicitation/create",
        params: {
          message: `${service} の API キーを入力してください`,
          requestedSchema: {
            type: "object",
            properties: {
              apiKey: {
                type: "string",
                title: "API キー",
                description: "サービスのAPIキー",
              },
              region: {
                type: "string",
                title: "リージョン",
                enum: ["us-east-1", "ap-northeast-1", "eu-west-1"],
              },
            },
            required: ["apiKey"],
          },
        },
      }
    );

    if (result.action === "accept") {
      // ユーザーが入力を完了
      const { apiKey, region } = result.content;
      // 設定を保存...
      return {
        content: [{ type: "text", text: `${service} の設定が完了しました` }],
      };
    } else {
      // ユーザーがキャンセル
      return {
        content: [{ type: "text", text: "設定がキャンセルされました" }],
      };
    }
  }
);
```

---

## 5. 進捗報告

長時間かかる処理では、進捗を報告できます。

```typescript
server.tool(
  "process_large_file",
  "大きなファイルを処理します",
  { path: z.string() },
  async ({ path }, { sendNotification, _meta }) => {
    const lines = await readLines(path);
    const total = lines.length;

    for (let i = 0; i < total; i++) {
      // 各行を処理...
      await processLine(lines[i]);

      // 進捗を報告（10行ごと）
      if (i % 10 === 0) {
        await sendNotification({
          method: "notifications/progress",
          params: {
            progressToken: _meta?.progressToken,
            progress: i,
            total: total,
          },
        });
      }
    }

    return {
      content: [
        { type: "text", text: `${total}行の処理が完了しました` },
      ],
    };
  }
);
```

---

## 6. ベストプラクティス

### 6.1 ツール設計

```
良い例:
  - ツール名: get_user_by_email
  - 説明: "メールアドレスでユーザーを検索します"
  - 明確なスキーマ、1つの責務

悪い例:
  - ツール名: do_stuff
  - 説明: "いろいろやります"
  - 曖昧、複数の責務を持つ
```

| 原則 | 説明 |
|------|------|
| **単一責任** | 1つのツールに1つの機能 |
| **明確な命名** | `verb_noun` 形式（`get_weather`, `create_user`） |
| **詳細な説明** | LLMが判断に使うため、説明は具体的に |
| **厳密なスキーマ** | Zodで入力を厳密に定義 |
| **エラーハンドリング** | `isError: true` で明示的にエラーを返す |
| **冪等性** | 可能な限り冪等（同じ入力で同じ結果）に設計 |

### 6.2 リソース設計

| 原則 | 説明 |
|------|------|
| **直感的なURI** | `protocol://path/to/resource` |
| **適切なMIMEタイプ** | `application/json`, `text/plain` など |
| **テンプレート活用** | 動的なリソースには URI テンプレートを使用 |
| **軽量なレスポンス** | 必要なデータだけ返す |

### 6.3 エラーハンドリング

```typescript
server.tool("risky_operation", "...", { /* ... */ }, async (args) => {
  try {
    const result = await doSomething(args);

    return {
      content: [{ type: "text", text: `成功: ${result}` }],
    };
  } catch (error) {
    // ユーザーフレンドリーなエラーメッセージを返す
    // 内部的なスタックトレースは返さない
    return {
      content: [
        {
          type: "text",
          text: `操作に失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`,
        },
      ],
      isError: true,
    };
  }
});
```

### 6.4 パフォーマンス

| 対策 | 説明 |
|------|------|
| **タイムアウト設定** | 長時間のAPI呼び出しにはタイムアウトを設定 |
| **ページネーション** | 大量のデータはページ分割して返す |
| **キャッシュ** | 頻繁にアクセスされるリソースはキャッシュ |
| **非同期処理** | I/O操作は必ず非同期で実行 |
| **進捗報告** | 長時間処理は notifications/progress で報告 |

---

## 7. デプロイパターン

### パターン 1: ローカル（stdio）

```
User ↔ Claude Desktop ↔ [stdio] ↔ MCP Server (ローカルプロセス)
```

- 最もシンプル
- ネットワーク不要
- 個人利用に最適

### パターン 2: リモートサーバー（Streamable HTTP）

```
User ↔ AI App ↔ [HTTPS] ↔ MCP Server (クラウド)
                              ↓
                           Database / API
```

- チームで共有可能
- スケーラブル
- 認証・認可が必須

### パターン 3: サイドカー

```
┌─────────────────────────┐
│  Container              │
│  ┌──────┐  ┌─────────┐ │
│  │ App  │↔│MCP Server│ │
│  └──────┘  └─────────┘ │
└─────────────────────────┘
```

- アプリケーションと同じ環境で実行
- マイクロサービスアーキテクチャに適合

---

## 8. 既存の MCP サーバー一覧

自分で作る前に、既に公開されているサーバーを確認しましょう。

### 公式リファレンスサーバー

| サーバー名 | 機能 |
|-----------|------|
| **Filesystem** | ファイルの読み書き、ディレクトリ操作 |
| **Git** | Gitリポジトリの操作 |
| **GitHub** | GitHub API との統合 |
| **PostgreSQL** | PostgreSQL データベースの操作 |
| **Fetch** | Web コンテンツの取得 |
| **Memory** | ナレッジグラフベースの永続メモリ |
| **Sequential Thinking** | 動的な思考・推論の管理 |
| **Everything** | テスト用の全機能デモサーバー |

### コミュニティサーバー

数千のMCPサーバーが公開されています:
- [MCP Servers ディレクトリ](https://modelcontextprotocol.io/examples)
- [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers)

---

## まとめ

この教材シリーズで学んだこと:

1. **[01-overview](01-overview.md)**: MCPの全体像とアーキテクチャ
2. **[02-protocol](02-protocol.md)**: JSON-RPC 2.0ベースのプロトコル仕様
3. **[03-primitives](03-primitives.md)**: Tools・Resources・Prompts の3つのプリミティブ
4. **[04-hands-on](04-hands-on-tutorial.md)**: ゼロからサーバーを構築するチュートリアル
5. **[05-advanced](05-advanced.md)**: セキュリティ、Streamable HTTP、ベストプラクティス

### 次のステップ

- 自分のユースケースに合ったMCPサーバーを作ってみる
- 既存のMCPサーバーのソースコードを読む
- [MCP公式仕様](https://modelcontextprotocol.io/specification/2025-11-25) を読み込む
- コミュニティに参加してフィードバックを共有する
