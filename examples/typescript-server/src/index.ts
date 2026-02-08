/**
 * MCP学習用サーバー（TypeScript）
 *
 * このサーバーは以下の機能を公開します:
 *
 * 【Tools（ツール）】
 *   - get_weather    : 指定した都市の天気を取得
 *   - add_todo       : TODOを追加
 *   - complete_todo  : TODOを完了にする
 *   - delete_todo    : TODOを削除
 *
 * 【Resources（リソース）】
 *   - todo://list          : 全TODOの一覧
 *   - todo://{id}/detail   : 個別TODOの詳細
 *
 * 【Prompts（プロンプト）】
 *   - daily-summary   : 1日のサマリーを生成するテンプレート
 *   - task-breakdown  : タスクを分解するテンプレート
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─────────────────────────────────────────────
// データモデル
// ─────────────────────────────────────────────

interface Todo {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  createdAt: string;
  completedAt?: string;
}

// インメモリのTODOストレージ
const todos: Map<string, Todo> = new Map();
let nextId = 1;

// ─────────────────────────────────────────────
// 天気データ（ダミー）
// ─────────────────────────────────────────────

interface WeatherData {
  city: string;
  condition: string;
  temperature: number;
  humidity: number;
  windSpeed: number;
}

// 学習用のダミー天気データ
const weatherDatabase: Record<string, WeatherData> = {
  tokyo: {
    city: "東京",
    condition: "晴れ",
    temperature: 25,
    humidity: 60,
    windSpeed: 3.5,
  },
  osaka: {
    city: "大阪",
    condition: "曇り",
    temperature: 27,
    humidity: 70,
    windSpeed: 2.8,
  },
  sapporo: {
    city: "札幌",
    condition: "雪",
    temperature: -2,
    humidity: 80,
    windSpeed: 5.2,
  },
  fukuoka: {
    city: "福岡",
    condition: "晴れ時々曇り",
    temperature: 28,
    humidity: 65,
    windSpeed: 4.0,
  },
  naha: {
    city: "那覇",
    condition: "晴れ",
    temperature: 30,
    humidity: 75,
    windSpeed: 6.1,
  },
};

// ─────────────────────────────────────────────
// サーバーの作成
// ─────────────────────────────────────────────

const server = new McpServer({
  name: "weather-todo-server",
  version: "1.0.0",
});

// ─────────────────────────────────────────────
// Tools（ツール）の登録
// ─────────────────────────────────────────────

/**
 * ツール1: get_weather
 * 指定した都市の天気情報を取得します。
 *
 * 【ポイント】
 * - inputSchema は Zod で定義する
 * - 戻り値は { content: [...] } の形式
 * - content の type は "text" または "image"
 */
server.tool(
  "get_weather",
  "指定した都市の現在の天気情報を取得します。対応都市: tokyo, osaka, sapporo, fukuoka, naha",
  {
    city: z
      .string()
      .describe("都市名（英語小文字）: tokyo, osaka, sapporo, fukuoka, naha"),
  },
  async ({ city }) => {
    const weather = weatherDatabase[city.toLowerCase()];

    if (!weather) {
      return {
        content: [
          {
            type: "text" as const,
            text: `エラー: "${city}" の天気データが見つかりません。対応都市: ${Object.keys(weatherDatabase).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `📍 ${weather.city}の天気`,
            `━━━━━━━━━━━━━━━━━━`,
            `天候: ${weather.condition}`,
            `気温: ${weather.temperature}°C`,
            `湿度: ${weather.humidity}%`,
            `風速: ${weather.windSpeed} m/s`,
          ].join("\n"),
        },
      ],
    };
  }
);

/**
 * ツール2: add_todo
 * 新しいTODOを追加します。
 *
 * 【ポイント】
 * - 副作用のあるツール（データを変更する）
 * - 作成したTODOのIDを返す
 */
server.tool(
  "add_todo",
  "新しいTODOを追加します",
  {
    title: z.string().describe("TODOのタイトル"),
    description: z.string().describe("TODOの詳細説明").default(""),
  },
  async ({ title, description }) => {
    const id = String(nextId++);
    const todo: Todo = {
      id,
      title,
      description,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    todos.set(id, todo);

    // リソースの変更を通知
    // （クライアントが subscribe していれば通知が届く）

    return {
      content: [
        {
          type: "text" as const,
          text: `TODO を追加しました:\n  ID: ${id}\n  タイトル: ${title}`,
        },
      ],
    };
  }
);

/**
 * ツール3: complete_todo
 * TODOを完了状態にします。
 */
server.tool(
  "complete_todo",
  "指定したTODOを完了にします",
  {
    id: z.string().describe("完了にするTODOのID"),
  },
  async ({ id }) => {
    const todo = todos.get(id);
    if (!todo) {
      return {
        content: [
          { type: "text" as const, text: `エラー: ID "${id}" のTODOが見つかりません` },
        ],
        isError: true,
      };
    }

    todo.completed = true;
    todo.completedAt = new Date().toISOString();

    return {
      content: [
        {
          type: "text" as const,
          text: `TODO "${todo.title}" (ID: ${id}) を完了にしました`,
        },
      ],
    };
  }
);

/**
 * ツール4: delete_todo
 * TODOを削除します。
 *
 * 【ポイント】
 * - 破壊的操作なのでアノテーションで明示
 */
server.tool(
  "delete_todo",
  "指定したTODOを削除します",
  {
    id: z.string().describe("削除するTODOのID"),
  },
  async ({ id }) => {
    const todo = todos.get(id);
    if (!todo) {
      return {
        content: [
          { type: "text" as const, text: `エラー: ID "${id}" のTODOが見つかりません` },
        ],
        isError: true,
      };
    }

    todos.delete(id);

    return {
      content: [
        {
          type: "text" as const,
          text: `TODO "${todo.title}" (ID: ${id}) を削除しました`,
        },
      ],
    };
  }
);

// ─────────────────────────────────────────────
// Resources（リソース）の登録
// ─────────────────────────────────────────────

/**
 * リソース1: todo://list
 * 全TODOの一覧を返す静的リソース。
 *
 * 【ポイント】
 * - URI は固定（パラメータなし）
 * - 読み取り専用のデータ提供
 * - JSON形式で返す
 */
server.resource(
  "todo-list",
  "todo://list",
  "全TODOの一覧",
  async (uri) => {
    const allTodos = Array.from(todos.values()).map((t) => ({
      id: t.id,
      title: t.title,
      completed: t.completed,
      createdAt: t.createdAt,
    }));

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(allTodos, null, 2),
        },
      ],
    };
  }
);

/**
 * リソース2: todo://{id}/detail
 * 個別のTODO詳細を返すリソーステンプレート。
 *
 * 【ポイント】
 * - URI テンプレート（RFC 6570）を使用
 * - パラメータ {id} が動的に解決される
 */
server.resource(
  "todo-detail",
  "todo://{id}/detail",
  "個別TODOの詳細情報",
  async (uri, params) => {
    const id = params.id as string;
    const todo = todos.get(id);

    if (!todo) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ error: `TODO ID "${id}" が見つかりません` }),
          },
        ],
      };
    }

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(todo, null, 2),
        },
      ],
    };
  }
);

// ─────────────────────────────────────────────
// Prompts（プロンプト）の登録
// ─────────────────────────────────────────────

/**
 * プロンプト1: daily-summary
 * 1日のサマリーを生成するテンプレート。
 *
 * 【ポイント】
 * - ユーザーが明示的に選択して使う
 * - messages 配列で会話のテンプレートを返す
 * - 引数を使ってテンプレートをカスタマイズ
 */
server.prompt(
  "daily-summary",
  "今日のTODOと天気をまとめた1日のサマリーを生成します",
  {
    city: z.string().describe("天気を確認する都市名").default("tokyo"),
  },
  async ({ city }) => {
    const allTodos = Array.from(todos.values());
    const completedCount = allTodos.filter((t) => t.completed).length;
    const pendingCount = allTodos.length - completedCount;
    const weather = weatherDatabase[city.toLowerCase()];

    const todoSection = allTodos.length > 0
      ? allTodos
          .map((t) => `  ${t.completed ? "[x]" : "[ ]"} ${t.title}`)
          .join("\n")
      : "  (TODOはありません)";

    const weatherSection = weather
      ? `${weather.city}: ${weather.condition}, ${weather.temperature}°C`
      : `${city}: データなし`;

    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "以下の情報をもとに、今日の1日サマリーを作成してください。",
              "",
              "【天気】",
              weatherSection,
              "",
              "【TODOリスト】",
              `完了: ${completedCount}件 / 未完了: ${pendingCount}件`,
              todoSection,
              "",
              "サマリーには以下を含めてください:",
              "1. 天気に基づいたアドバイス",
              "2. TODOの進捗状況の評価",
              "3. 残りのタスクの優先順位の提案",
            ].join("\n"),
          },
        },
      ],
    };
  }
);

/**
 * プロンプト2: task-breakdown
 * 大きなタスクを小さなステップに分解するテンプレート。
 */
server.prompt(
  "task-breakdown",
  "大きなタスクを小さな実行可能なステップに分解します",
  {
    task: z.string().describe("分解したいタスクの説明"),
    maxSteps: z.string().describe("最大ステップ数").default("5"),
  },
  async ({ task, maxSteps }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: [
            `以下のタスクを最大${maxSteps}個の具体的なステップに分解してください。`,
            "",
            `タスク: ${task}`,
            "",
            "各ステップは以下の形式で書いてください:",
            "1. [ステップ名]: [具体的な作業内容]",
            "   所要時間の目安: [xx分]",
            "   前提条件: [あれば記載]",
            "",
            "最後に、全体の依存関係を簡単な図で示してください。",
          ].join("\n"),
        },
      },
    ],
  })
);

// ─────────────────────────────────────────────
// サーバーの起動
// ─────────────────────────────────────────────

async function main() {
  // stdio トランスポートを使用（ローカル実行用）
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // ログは stderr に出力（stdout はプロトコル通信用）
  console.error("MCP Weather & TODO Server が起動しました");
  console.error("利用可能なツール: get_weather, add_todo, complete_todo, delete_todo");
  console.error("利用可能なリソース: todo://list, todo://{id}/detail");
  console.error("利用可能なプロンプト: daily-summary, task-breakdown");
}

main().catch((error) => {
  console.error("サーバーの起動に失敗しました:", error);
  process.exit(1);
});
