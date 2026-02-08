/**
 * MCP学習用クライアント（TypeScript）
 *
 * MCPサーバーに接続し、以下の操作をデモンストレーションします:
 *   1. 初期化とケーパビリティネゴシエーション
 *   2. ツール一覧の取得と実行
 *   3. リソース一覧の取得と読み取り
 *   4. プロンプト一覧の取得と展開
 *
 * 使い方:
 *   npm run build
 *   node build/index.js <サーバーコマンド> [引数...]
 *
 * 例:
 *   node build/index.js node ../typescript-server/build/index.js
 *   node build/index.js python ../python-server/server.py
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// ─────────────────────────────────────────────
// ヘルパー関数
// ─────────────────────────────────────────────

function printSection(title: string) {
  console.log("\n" + "=".repeat(50));
  console.log(`  ${title}`);
  console.log("=".repeat(50));
}

function printSubSection(title: string) {
  console.log(`\n--- ${title} ---`);
}

// ─────────────────────────────────────────────
// メインロジック
// ─────────────────────────────────────────────

async function main() {
  // コマンドライン引数からサーバーコマンドを取得
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("使い方: node build/index.js <サーバーコマンド> [引数...]");
    console.error("例:     node build/index.js node ../typescript-server/build/index.js");
    process.exit(1);
  }

  const [command, ...commandArgs] = args;

  // ─────────────────────────────────────────
  // Step 1: クライアントの作成
  // ─────────────────────────────────────────
  printSection("Step 1: MCPクライアントの作成");

  /**
   * Client はMCPプロトコルのクライアント側を実装するクラスです。
   * サーバーとの通信、ケーパビリティのネゴシエーション、
   * メッセージのルーティングを担当します。
   */
  const client = new Client({
    name: "mcp-learning-client",
    version: "1.0.0",
  });

  console.log("クライアントを作成しました: mcp-learning-client v1.0.0");

  // ─────────────────────────────────────────
  // Step 2: トランスポートの作成と接続
  // ─────────────────────────────────────────
  printSection("Step 2: サーバーへの接続");

  /**
   * StdioClientTransport は、サーバーを子プロセスとして起動し、
   * stdin/stdout で JSON-RPC メッセージをやり取りします。
   *
   * ローカル開発では最も一般的なトランスポートです。
   */
  const transport = new StdioClientTransport({
    command,
    args: commandArgs,
  });

  console.log(`サーバーを起動中: ${command} ${commandArgs.join(" ")}`);

  /**
   * connect() を呼ぶと、以下が自動的に行われます:
   * 1. サーバープロセスの起動
   * 2. initialize リクエストの送信
   * 3. ケーパビリティの交換
   * 4. initialized 通知の送信
   */
  await client.connect(transport);

  console.log("接続成功!");
  console.log(`サーバー情報: ${JSON.stringify(client.getServerVersion())}`);

  // ─────────────────────────────────────────
  // Step 3: ツール（Tools）の操作
  // ─────────────────────────────────────────
  printSection("Step 3: ツールの操作");

  // 3-1: ツール一覧の取得
  printSubSection("3-1: ツール一覧の取得 (tools/list)");

  /**
   * listTools() は tools/list リクエストを送信し、
   * サーバーが公開している全ツールの一覧を取得します。
   */
  const toolsResult = await client.listTools();

  console.log(`利用可能なツール数: ${toolsResult.tools.length}`);
  for (const tool of toolsResult.tools) {
    console.log(`  - ${tool.name}: ${tool.description}`);
    if (tool.inputSchema) {
      const props = (tool.inputSchema as any).properties || {};
      const required = (tool.inputSchema as any).required || [];
      const paramList = Object.keys(props)
        .map((p) => `${p}${required.includes(p) ? "*" : ""}`)
        .join(", ");
      console.log(`    パラメータ: ${paramList}`);
    }
  }

  // 3-2: ツールの実行
  printSubSection("3-2: ツールの実行 (tools/call)");

  // 天気ツールがあれば実行
  if (toolsResult.tools.some((t) => t.name === "get_weather")) {
    console.log('\n[get_weather ツールを実行: city="tokyo"]');

    /**
     * callTool() は tools/call リクエストを送信し、
     * サーバーでツールを実行して結果を取得します。
     */
    const weatherResult = await client.callTool({
      name: "get_weather",
      arguments: { city: "tokyo" },
    });

    console.log("結果:");
    for (const content of weatherResult.content as any[]) {
      if (content.type === "text") {
        console.log(content.text);
      }
    }
  }

  // TODOツールがあれば実行
  if (toolsResult.tools.some((t) => t.name === "add_todo")) {
    console.log('\n[add_todo ツールを実行: title="MCPを学習する"]');

    const addResult = await client.callTool({
      name: "add_todo",
      arguments: {
        title: "MCPを学習する",
        description: "Model Context Protocol の仕様とSDKを理解する",
      },
    });

    console.log("結果:");
    for (const content of addResult.content as any[]) {
      if (content.type === "text") {
        console.log(content.text);
      }
    }
  }

  // ─────────────────────────────────────────
  // Step 4: リソース（Resources）の操作
  // ─────────────────────────────────────────
  printSection("Step 4: リソースの操作");

  // 4-1: リソース一覧の取得
  printSubSection("4-1: リソース一覧の取得 (resources/list)");

  /**
   * listResources() は resources/list リクエストを送信し、
   * サーバーが公開している静的リソースの一覧を取得します。
   */
  const resourcesResult = await client.listResources();

  console.log(`利用可能なリソース数: ${resourcesResult.resources.length}`);
  for (const resource of resourcesResult.resources) {
    console.log(`  - [${resource.uri}] ${resource.name}: ${resource.description || ""}`);
  }

  // 4-2: リソーステンプレートの一覧
  printSubSection("4-2: リソーステンプレート一覧 (resources/templates/list)");

  const templatesResult = await client.listResourceTemplates();

  console.log(`利用可能なテンプレート数: ${templatesResult.resourceTemplates.length}`);
  for (const template of templatesResult.resourceTemplates) {
    console.log(`  - [${template.uriTemplate}] ${template.name}: ${template.description || ""}`);
  }

  // 4-3: リソースの読み取り
  printSubSection("4-3: リソースの読み取り (resources/read)");

  if (resourcesResult.resources.length > 0) {
    const firstResource = resourcesResult.resources[0];
    console.log(`\n[リソースを読み取り: ${firstResource.uri}]`);

    /**
     * readResource() は resources/read リクエストを送信し、
     * 指定されたURIのリソースの内容を取得します。
     */
    const readResult = await client.readResource({
      uri: firstResource.uri,
    });

    console.log("内容:");
    for (const content of readResult.contents) {
      if ("text" in content) {
        console.log(content.text);
      }
    }
  }

  // ─────────────────────────────────────────
  // Step 5: プロンプト（Prompts）の操作
  // ─────────────────────────────────────────
  printSection("Step 5: プロンプトの操作");

  // 5-1: プロンプト一覧の取得
  printSubSection("5-1: プロンプト一覧の取得 (prompts/list)");

  /**
   * listPrompts() は prompts/list リクエストを送信し、
   * サーバーが公開しているプロンプトテンプレートの一覧を取得します。
   */
  const promptsResult = await client.listPrompts();

  console.log(`利用可能なプロンプト数: ${promptsResult.prompts.length}`);
  for (const prompt of promptsResult.prompts) {
    const argNames = prompt.arguments?.map((a) => a.name).join(", ") || "なし";
    console.log(`  - ${prompt.name}: ${prompt.description}`);
    console.log(`    引数: ${argNames}`);
  }

  // 5-2: プロンプトの取得（展開）
  printSubSection("5-2: プロンプトの展開 (prompts/get)");

  if (promptsResult.prompts.length > 0) {
    const firstPrompt = promptsResult.prompts[0];
    console.log(`\n[プロンプトを展開: ${firstPrompt.name}]`);

    // 引数を構築
    const promptArgs: Record<string, string> = {};
    if (firstPrompt.arguments) {
      for (const arg of firstPrompt.arguments) {
        // デモ用のデフォルト値
        if (arg.name === "city") promptArgs.city = "tokyo";
        if (arg.name === "task") promptArgs.task = "MCPサーバーを構築する";
        if (arg.name === "path") promptArgs.path = "/tmp/test.txt";
        if (arg.name === "query") promptArgs.query = "MCPとは何ですか？";
      }
    }

    /**
     * getPrompt() は prompts/get リクエストを送信し、
     * 引数を適用してプロンプトを展開します。
     * 返されるのは LLM に送信できるメッセージの配列です。
     */
    const promptResult = await client.getPrompt({
      name: firstPrompt.name,
      arguments: promptArgs,
    });

    console.log("展開されたメッセージ:");
    for (const message of promptResult.messages) {
      console.log(`  [${message.role}]:`);
      if (typeof message.content === "string") {
        console.log(`  ${message.content.substring(0, 200)}...`);
      } else if ("text" in message.content) {
        console.log(`  ${message.content.text.substring(0, 200)}...`);
      }
    }
  }

  // ─────────────────────────────────────────
  // 完了
  // ─────────────────────────────────────────
  printSection("デモ完了");
  console.log("MCPクライアントのデモを終了します。");
  console.log("\n学んだこと:");
  console.log("  1. Client + Transport でサーバーに接続");
  console.log("  2. listTools() / callTool() でツールを操作");
  console.log("  3. listResources() / readResource() でリソースを読み取り");
  console.log("  4. listPrompts() / getPrompt() でプロンプトを展開");

  // クリーンアップ
  await client.close();
  console.log("\n接続を切断しました。");
}

// 実行
main().catch((error) => {
  console.error("エラー:", error);
  process.exit(1);
});
