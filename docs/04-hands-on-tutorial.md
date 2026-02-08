# 04 - ハンズオンチュートリアル

ゼロからMCPサーバーを構築し、クライアントから接続するまでの手順を解説します。

## 前提条件

- Node.js 18以上（TypeScript版）
- Python 3.10以上（Python版）
- お好みのエディタ

## Part 1: TypeScript で MCPサーバーを作る

### Step 1: プロジェクトの初期化

```bash
# プロジェクトディレクトリの作成
mkdir my-mcp-server
cd my-mcp-server

# package.json の作成
npm init -y

# ES Modules を有効化
# package.json に "type": "module" を追加

# 依存パッケージのインストール
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node

# TypeScript の設定
npx tsc --init
```

### Step 2: tsconfig.json の設定

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

**ポイント:**
- `module` と `moduleResolution` は `Node16` を指定（ESM対応）
- SDK は ESM で提供されているため `"type": "module"` が必須

### Step 3: 最小構成のサーバーを作る

`src/index.ts` を作成します。

```typescript
// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// 1. サーバーインスタンスの作成
const server = new McpServer({
  name: "my-first-server",   // サーバー名
  version: "1.0.0",          // バージョン
});

// 2. ツールの登録
server.tool(
  "hello",                        // ツール名
  "挨拶を返します",                  // 説明（LLMがこれを読んで判断する）
  {
    name: z.string().describe("挨拶する相手の名前"),
  },
  async ({ name }) => ({          // ハンドラ関数
    content: [
      {
        type: "text",
        text: `こんにちは、${name}さん！MCPサーバーからの挨拶です。`,
      },
    ],
  })
);

// 3. サーバーの起動
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("サーバーが起動しました");
```

### Step 4: ビルドと動作確認

```bash
# ビルド
npx tsc

# MCP Inspector で動作確認（推奨）
npx @modelcontextprotocol/inspector node build/index.js
```

MCP Inspector が起動したらブラウザで開き:
1. **Tools** タブで `hello` ツールが表示されることを確認
2. `name` に値を入れて **Call Tool** を実行
3. 結果が返ってくることを確認

### Step 5: ツールを追加する

計算ツールを追加してみましょう。

```typescript
server.tool(
  "calculate",
  "四則演算を実行します",
  {
    operation: z.enum(["add", "subtract", "multiply", "divide"])
      .describe("演算の種類"),
    a: z.number().describe("1つ目の数値"),
    b: z.number().describe("2つ目の数値"),
  },
  async ({ operation, a, b }) => {
    let result: number;

    switch (operation) {
      case "add":       result = a + b; break;
      case "subtract":  result = a - b; break;
      case "multiply":  result = a * b; break;
      case "divide":
        if (b === 0) {
          return {
            content: [{ type: "text", text: "エラー: ゼロで割ることはできません" }],
            isError: true,  // エラーフラグ
          };
        }
        result = a / b;
        break;
    }

    return {
      content: [
        {
          type: "text",
          text: `${a} ${operation} ${b} = ${result}`,
        },
      ],
    };
  }
);
```

### Step 6: リソースを追加する

```typescript
// 静的リソース: サーバー情報
server.resource(
  "server-info",
  "info://server",
  "このMCPサーバーの情報",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({
          name: "my-first-server",
          version: "1.0.0",
          tools: ["hello", "calculate"],
          uptime: process.uptime(),
        }, null, 2),
      },
    ],
  })
);

// リソーステンプレート: 計算履歴（例）
const history: { expression: string; result: number }[] = [];

server.resource(
  "calculation-history",
  "history://calculations",
  "計算の履歴",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(history, null, 2),
      },
    ],
  })
);
```

### Step 7: プロンプトを追加する

```typescript
server.prompt(
  "math-tutor",
  "数学の問題を解くためのガイドを提供します",
  {
    problem: z.string().describe("解きたい数学の問題"),
    level: z.enum(["elementary", "middle", "high", "university"])
      .describe("学習レベル")
      .default("middle"),
  },
  async ({ problem, level }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            `あなたは${level}レベルの数学の家庭教師です。`,
            `以下の問題を、ステップバイステップで解説してください。`,
            ``,
            `問題: ${problem}`,
            ``,
            `解説のルール:`,
            `1. まず問題を分析してください`,
            `2. 解法の方針を示してください`,
            `3. 各ステップを丁寧に説明してください`,
            `4. 最終的な答えを明示してください`,
            `5. 類似問題を1つ提示してください`,
          ].join("\n"),
        },
      },
    ],
  })
);
```

### Step 8: Claude Desktop に接続する

Claude Desktop の設定ファイルを編集します。

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "my-first-server": {
      "command": "node",
      "args": ["/absolute/path/to/my-mcp-server/build/index.js"]
    }
  }
}
```

Claude Desktop を再起動すると、チャット欄にツールアイコンが表示されます。

---

## Part 2: Python で MCPサーバーを作る

### Step 1: プロジェクトの初期化

```bash
# uv を使う場合（推奨）
uv init my-mcp-server-py
cd my-mcp-server-py
uv add "mcp[cli]"

# pip を使う場合
mkdir my-mcp-server-py
cd my-mcp-server-py
pip install "mcp[cli]"
```

### Step 2: 最小構成のサーバーを作る

`server.py` を作成します。

```python
# server.py
from mcp.server.fastmcp import FastMCP

# 1. サーバーインスタンスの作成
mcp = FastMCP("my-first-server")

# 2. ツールの登録（デコレータを使用）
@mcp.tool()
async def hello(name: str) -> str:
    """挨拶を返します。

    Args:
        name: 挨拶する相手の名前
    """
    return f"こんにちは、{name}さん！MCPサーバーからの挨拶です。"

# 3. サーバーの起動
if __name__ == "__main__":
    mcp.run()
```

**ポイント:**
- FastMCP は Python の型ヒントとdocstringから自動的にスキーマを生成する
- TypeScript版よりもボイラープレートが少ない
- デコレータパターンで直感的にツールを定義できる

### Step 3: 動作確認

```bash
# MCP Inspector で確認
mcp dev server.py

# または直接実行（stdio）
python server.py
```

### Step 4: ツールを追加する

```python
from enum import Enum
from typing import Optional


class Operation(str, Enum):
    ADD = "add"
    SUBTRACT = "subtract"
    MULTIPLY = "multiply"
    DIVIDE = "divide"


@mcp.tool()
async def calculate(operation: Operation, a: float, b: float) -> str:
    """四則演算を実行します。

    Args:
        operation: 演算の種類（add, subtract, multiply, divide）
        a: 1つ目の数値
        b: 2つ目の数値
    """
    if operation == Operation.ADD:
        result = a + b
    elif operation == Operation.SUBTRACT:
        result = a - b
    elif operation == Operation.MULTIPLY:
        result = a * b
    elif operation == Operation.DIVIDE:
        if b == 0:
            return "エラー: ゼロで割ることはできません"
        result = a / b
    else:
        return f"エラー: 不明な演算 '{operation}'"

    return f"{a} {operation.value} {b} = {result}"
```

### Step 5: リソースを追加する

```python
import json
from datetime import datetime

# インメモリデータ
notes: dict[str, dict] = {}


@mcp.resource("notes://list")
async def list_notes() -> str:
    """全ノートの一覧を返します。"""
    return json.dumps(list(notes.values()), ensure_ascii=False, indent=2)


@mcp.resource("notes://{note_id}")
async def get_note(note_id: str) -> str:
    """個別のノートを返します。"""
    if note_id in notes:
        return json.dumps(notes[note_id], ensure_ascii=False, indent=2)
    return json.dumps({"error": f"ノート '{note_id}' が見つかりません"})
```

### Step 6: プロンプトを追加する

```python
@mcp.prompt()
async def explain_concept(concept: str, audience: str = "beginner") -> str:
    """概念を分かりやすく説明するプロンプトを生成します。

    Args:
        concept: 説明したい概念
        audience: 対象者のレベル（beginner, intermediate, expert）
    """
    return f"""以下の概念を{audience}向けに分かりやすく説明してください。

概念: {concept}

説明には以下を含めてください:
1. 一言での定義
2. 身近な例えを使った説明
3. 具体的な使用例
4. よくある誤解や注意点
5. さらに学ぶためのキーワード"""
```

### Step 7: Claude Desktop に接続する

```json
{
  "mcpServers": {
    "my-python-server": {
      "command": "python",
      "args": ["/absolute/path/to/my-mcp-server-py/server.py"]
    }
  }
}
```

---

## Part 3: MCPクライアントを作る

### プログラムからMCPサーバーに接続する

通常、Claude Desktop やCursorなどのホストアプリがクライアントの役割を果たしますが、
独自のクライアントを作ることもできます。

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// 1. クライアントの作成
const client = new Client({
  name: "my-client",
  version: "1.0.0",
});

// 2. トランスポートの作成
const transport = new StdioClientTransport({
  command: "node",
  args: ["path/to/server/build/index.js"],
});

// 3. 接続（initialize + initialized が自動で行われる）
await client.connect(transport);

// 4. ツール一覧を取得
const { tools } = await client.listTools();
console.log("利用可能なツール:", tools.map(t => t.name));

// 5. ツールを実行
const result = await client.callTool({
  name: "hello",
  arguments: { name: "World" },
});
console.log("結果:", result.content);

// 6. リソースを読み取り
const { contents } = await client.readResource({
  uri: "info://server",
});
console.log("リソース:", contents);

// 7. 切断
await client.close();
```

**完全な実装例:** [examples/client/src/index.ts](../examples/client/src/index.ts)

---

## Part 4: テストとデバッグ

### MCP Inspector

MCPサーバーの開発・テストに最適なツールです。

```bash
# TypeScript サーバーをInspectorで起動
npx @modelcontextprotocol/inspector node build/index.js

# Python サーバーをInspectorで起動
npx @modelcontextprotocol/inspector python server.py

# または Python SDK の dev コマンド
mcp dev server.py
```

Inspector では以下のことができます:
- **Tools** タブ: ツール一覧の確認、引数を入れてテスト実行
- **Resources** タブ: リソース一覧の確認、内容の読み取り
- **Prompts** タブ: プロンプト一覧の確認、引数を入れて展開

### ログ出力

```typescript
// TypeScript: stderr にログを出力（stdoutはプロトコル通信用）
console.error("[DEBUG] ツールが呼ばれました:", toolName);

// サーバーのロギング機能を使用
server.server.sendLoggingMessage({
  level: "info",
  data: "ツールの実行が完了しました",
});
```

```python
# Python: logging モジュールを使用
import logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger("my-server")

@mcp.tool()
async def my_tool(arg: str) -> str:
    logger.debug(f"my_tool が呼ばれました: {arg}")
    return "結果"
```

### よくあるトラブルと対処法

| 問題 | 原因 | 対処法 |
|------|------|--------|
| サーバーが起動しない | パスが間違っている | 絶対パスを使用する |
| ツールが表示されない | 初期化に失敗 | Inspector でデバッグ |
| stdout に出力している | プロトコル通信の妨害 | ログは stderr を使う |
| JSON パースエラー | 不正な出力がある | console.log を削除 |
| タイムアウト | サーバーが応答しない | ハンドラの非同期処理を確認 |

---

## 演習問題

### 演習 1: 辞書ツール
インメモリの辞書（キー・バリューストア）を操作するMCPサーバーを作ってください。
- `set_value(key, value)` — 値を設定
- `get_value(key)` — 値を取得
- `list_keys()` — 全キーの一覧
- リソースとして `dict://all` で全データを公開

### 演習 2: ファイルマネージャー
指定したディレクトリのファイルを操作するMCPサーバーを作ってください。
- `list_files(directory)` — ファイル一覧
- `read_file(path)` — ファイル読み取り
- `file_info(path)` — ファイルのメタデータ
- プロンプトとして `summarize-directory` を実装

### 演習 3: クライアント統合
演習1のサーバーに接続するクライアントを作り、以下を自動で実行してください。
1. サーバーに接続
2. いくつかの値を設定
3. リソースから全データを読み取り
4. 結果を表示

## 次のステップ

基本的なMCPサーバーの構築ができたら、[05-advanced.md](05-advanced.md) でセキュリティ、Streamable HTTP、デプロイなどの高度なトピックを学びましょう。
