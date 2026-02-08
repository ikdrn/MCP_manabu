# 03 - 3つのプリミティブ: Tools・Resources・Prompts

MCPサーバーが公開できる機能は、3つの **プリミティブ（基本要素）** に分類されます。

```
┌─────────────────────────────────────────────────┐
│                  MCP Server                      │
│                                                  │
│  ┌─────────┐  ┌───────────┐  ┌─────────┐       │
│  │  Tools  │  │ Resources │  │ Prompts │       │
│  │ (動詞)  │  │  (名詞)   │  │(テンプレ)│       │
│  │         │  │           │  │         │       │
│  │ モデルが │  │ アプリが   │  │ ユーザーが│       │
│  │ 選択    │  │ 選択      │  │ 選択     │       │
│  └─────────┘  └───────────┘  └─────────┘       │
└─────────────────────────────────────────────────┘
```

---

## 1. Tools（ツール）

### 概要

**Tools** は、LLMが呼び出せる「アクション」です。Web APIにおける **POST エンドポイント** に相当します。

> ツールは「動詞」です。計算する、検索する、作成する、送信する、など。

### 制御フロー

```
User → Host → LLM → "get_weather を呼びたい" → Client → Server
                                                          │
                                                    ツール実行
                                                          │
User ← Host ← LLM ← 結果を解釈 ←───────── Client ← Server
```

**重要:** ツールの選択はLLM（モデル）が行いますが、実行にはユーザーの承認が必要です（ホストが制御）。

### ツールの定義（スキーマ）

```json
{
  "name": "get_weather",
  "description": "指定した都市の現在の天気情報を取得します",
  "inputSchema": {
    "type": "object",
    "properties": {
      "city": {
        "type": "string",
        "description": "天気を取得する都市名（例: Tokyo, Osaka）"
      },
      "units": {
        "type": "string",
        "enum": ["celsius", "fahrenheit"],
        "description": "温度の単位",
        "default": "celsius"
      }
    },
    "required": ["city"]
  }
}
```

### ツールの実装例（TypeScript）

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({
  name: "weather-server",
  version: "1.0.0",
});

// ツールの登録
server.tool(
  "get_weather",                              // ツール名
  "指定した都市の現在の天気情報を取得します",       // 説明
  {                                            // 入力スキーマ（Zod）
    city: z.string().describe("都市名"),
    units: z.enum(["celsius", "fahrenheit"]).default("celsius"),
  },
  async ({ city, units }) => {                 // ハンドラ
    // 実際のAPI呼び出しをここに書く
    const weather = await fetchWeather(city, units);

    return {
      content: [
        {
          type: "text",
          text: `${city}の天気: ${weather.condition}, 気温: ${weather.temp}°`,
        },
      ],
    };
  }
);
```

### ツールの実装例（Python）

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("weather-server")

@mcp.tool()
async def get_weather(city: str, units: str = "celsius") -> str:
    """指定した都市の現在の天気情報を取得します。

    Args:
        city: 天気を取得する都市名
        units: 温度の単位（celsius または fahrenheit）
    """
    weather = await fetch_weather(city, units)
    return f"{city}の天気: {weather['condition']}, 気温: {weather['temp']}°"
```

### ツールのアノテーション

ツールの振る舞いについてのヒントを提供できます。

```typescript
server.tool(
  "send_email",
  "メールを送信します",
  { to: z.string(), subject: z.string(), body: z.string() },
  async (args) => { /* ... */ },
  {
    // アノテーション
    title: "メール送信",
    readOnlyHint: false,         // 副作用がある
    destructiveHint: false,      // 破壊的ではない
    idempotentHint: false,       // 冪等ではない（何度も送れる）
    openWorldHint: true,         // 外部サービスと通信する
  }
);
```

| アノテーション | 説明 | デフォルト |
|--------------|------|-----------|
| `readOnlyHint` | 読み取り専用かどうか | `false` |
| `destructiveHint` | 破壊的操作かどうか | `true` |
| `idempotentHint` | 冪等かどうか | `false` |
| `openWorldHint` | 外部と通信するかどうか | `true` |

### tools/list レスポンス例

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "get_weather",
        "description": "指定した都市の現在の天気情報を取得します",
        "inputSchema": {
          "type": "object",
          "properties": {
            "city": { "type": "string" },
            "units": { "type": "string", "enum": ["celsius", "fahrenheit"] }
          },
          "required": ["city"]
        }
      }
    ]
  }
}
```

### tools/call リクエスト・レスポンス例

**リクエスト:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "Tokyo"
    }
  }
}
```

**レスポンス:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "東京の天気: 晴れ, 気温: 25°C"
      }
    ],
    "isError": false
  }
}
```

---

## 2. Resources（リソース）

### 概要

**Resources** は、クライアントが読み取れる「データ」です。Web APIにおける **GET エンドポイント** に相当します。

> リソースは「名詞」です。ファイル、データベースのレコード、設定値、ログ、など。

### 制御フロー

```
User/App → "この情報をコンテキストに追加" → Client → Server
                                                      │
                                                 データ読み取り
                                                      │
User/App ← コンテキストに追加 ←──────────── Client ← Server
```

**重要:** リソースは **アプリケーション（またはユーザー）が選択** します。LLMが自動的にリソースを取得するわけではありません。

### リソースのURI

各リソースは **URI（Uniform Resource Identifier）** で一意に識別されます。

```
protocol://host/path

例:
  file:///home/user/config.json     ← ローカルファイル
  db://mydb/users/123               ← データベースレコード
  github://repo/owner/name/main     ← GitHubリポジトリ
  screen://localhost/display         ← スクリーンキャプチャ
```

### 静的リソース vs リソーステンプレート

**静的リソース** — URI が固定されている

```typescript
server.resource(
  "app-config",                              // リソース名
  "config://app/settings",                   // URI
  "アプリケーションの設定情報",                  // 説明
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({
          theme: "dark",
          language: "ja",
          version: "2.0.0",
        }),
      },
    ],
  })
);
```

**リソーステンプレート** — URI にパラメータを含む

```typescript
server.resource(
  "user-profile",
  "users://{userId}/profile",               // URI テンプレート (RFC 6570)
  "ユーザーのプロフィール情報",
  async (uri, { userId }) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(await getUser(userId)),
      },
    ],
  })
);
```

### リソースの型

リソースのコンテンツは2種類あります。

**テキスト（text）:**
```json
{
  "uri": "file:///config.json",
  "mimeType": "application/json",
  "text": "{ \"key\": \"value\" }"
}
```

**バイナリ（blob）:**
```json
{
  "uri": "image://photos/sunset.png",
  "mimeType": "image/png",
  "blob": "iVBORw0KGgo..."
}
```

### resources/list レスポンス例

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "resources": [
      {
        "uri": "config://app/settings",
        "name": "app-config",
        "description": "アプリケーションの設定情報",
        "mimeType": "application/json"
      }
    ]
  }
}
```

### リソースの購読（Subscribe）

リソースの変更をリアルタイムで監視できます。

```
Client                              Server
  │  resources/subscribe              │
  │  { uri: "config://app/settings" } │
  │ ─────────────────────────────────→│
  │                                   │
  │  （設定が変更された時）               │
  │                                   │
  │  notifications/resources/updated  │
  │  { uri: "config://app/settings" } │
  │ ←─────────────────────────────────│
  │                                   │
  │  resources/read                   │
  │  { uri: "config://app/settings" } │
  │ ─────────────────────────────────→│
  │  （最新データ）                     │
  │ ←─────────────────────────────────│
```

---

## 3. Prompts（プロンプト）

### 概要

**Prompts** は、LLMとの対話で使える **再利用可能なテンプレート** です。

> プロンプトは「定型文」です。コードレビューの依頼、要約の指示、翻訳の形式、など。

### 制御フロー

```
User → "コードレビューのプロンプトを使いたい" → Client → Server
                                                         │
                                                   テンプレート取得
                                                   引数を埋める
                                                         │
User → LLM ← プロンプトが適用される ←────────── Client ← Server
```

**重要:** プロンプトは **ユーザーが明示的に選択** します。自動的に適用されるものではありません。

### プロンプトの定義

```typescript
server.prompt(
  "code-review",                             // プロンプト名
  "コードレビューを実行します",                  // 説明
  {                                           // 引数
    code: z.string().describe("レビュー対象のコード"),
    language: z.string().describe("プログラミング言語").optional(),
    focus: z.enum(["security", "performance", "readability", "all"])
      .describe("レビューの観点")
      .default("all"),
  },
  async ({ code, language, focus }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            `以下の${language || ""}コードをレビューしてください。`,
            ``,
            `観点: ${focus}`,
            ``,
            "```" + (language || ""),
            code,
            "```",
            ``,
            `以下の項目について分析してください:`,
            `1. バグや潜在的な問題`,
            `2. ${focus === "security" ? "セキュリティの脆弱性" : "改善の余地"}`,
            `3. ベストプラクティスへの準拠`,
            `4. 具体的な改善提案`,
          ].join("\n"),
        },
      },
    ],
  })
);
```

### Pythonでの実装

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("prompt-server")

@mcp.prompt()
async def code_review(code: str, language: str = "", focus: str = "all") -> str:
    """コードレビューを実行します。

    Args:
        code: レビュー対象のコード
        language: プログラミング言語
        focus: レビューの観点（security, performance, readability, all）
    """
    return f"""以下の{language}コードをレビューしてください。

観点: {focus}

```{language}
{code}
```

以下の項目について分析してください:
1. バグや潜在的な問題
2. 改善の余地
3. ベストプラクティスへの準拠
4. 具体的な改善提案"""
```

### プロンプトに画像を含める

```typescript
server.prompt(
  "analyze-screenshot",
  "スクリーンショットを分析します",
  { imageData: z.string().describe("Base64エンコードされた画像") },
  async ({ imageData }) => ({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            data: imageData,
            mimeType: "image/png",
          },
          {
            type: "text",
            text: "この画面のUIを分析し、改善点を提案してください。",
          },
        ],
      },
    ],
  })
);
```

### prompts/list レスポンス例

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "prompts": [
      {
        "name": "code-review",
        "description": "コードレビューを実行します",
        "arguments": [
          {
            "name": "code",
            "description": "レビュー対象のコード",
            "required": true
          },
          {
            "name": "language",
            "description": "プログラミング言語",
            "required": false
          },
          {
            "name": "focus",
            "description": "レビューの観点",
            "required": false
          }
        ]
      }
    ]
  }
}
```

---

## 3つのプリミティブの比較

| 観点 | Tools | Resources | Prompts |
|------|-------|-----------|---------|
| **メタファ** | 動詞（アクション） | 名詞（データ） | テンプレート |
| **制御主体** | モデル（LLM） | アプリケーション | ユーザー |
| **副作用** | あり得る | なし（読み取り専用） | なし |
| **HTTP類似** | POST | GET | ― |
| **例** | メール送信、DB更新 | 設定ファイル、ユーザー情報 | コードレビュー依頼 |
| **ユーザー承認** | 必要（実行前） | 不要（読み取りのみ） | 選択時 |

### いつ何を使うか

```
「LLMが判断して実行すべき操作」
  → Tools を使う
  例: 天気を調べる、メールを送る、計算する

「LLMに与えるコンテキスト情報」
  → Resources を使う
  例: 設定ファイル、ドキュメント、データベースの内容

「ユーザーが定型的に使いたい指示」
  → Prompts を使う
  例: コードレビュー、要約、翻訳テンプレート
```

## 次のステップ

3つのプリミティブを理解したら、[04-hands-on-tutorial.md](04-hands-on-tutorial.md) で実際にMCPサーバーを構築してみましょう。
