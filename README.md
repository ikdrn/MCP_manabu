# MCP (Model Context Protocol) 学習教材

MCP（Model Context Protocol）を体系的に学ぶための教材リポジトリです。

## 教材構成

### ドキュメント (`docs/`)

| # | ファイル | 内容 |
|---|---------|------|
| 01 | [MCP概要とアーキテクチャ](docs/01-overview.md) | MCPとは何か、なぜ必要か、全体アーキテクチャ |
| 02 | [プロトコル仕様](docs/02-protocol.md) | JSON-RPC 2.0、トランスポート、ライフサイクル |
| 03 | [3つのプリミティブ](docs/03-primitives.md) | Tools・Resources・Prompts の詳細解説 |
| 04 | [ハンズオンチュートリアル](docs/04-hands-on-tutorial.md) | ゼロからMCPサーバーを構築する手順 |
| 05 | [高度なトピック](docs/05-advanced.md) | セキュリティ、デプロイ、ベストプラクティス |

### コード例 (`examples/`)

| ディレクトリ | 内容 |
|-------------|------|
| [typescript-server/](examples/typescript-server/) | TypeScript で実装した MCP サーバー（天気情報 + TODO管理） |
| [python-server/](examples/python-server/) | Python で実装した MCP サーバー（ファイル検索 + メモ管理） |
| [client/](examples/client/) | TypeScript で実装した MCP クライアント |

## 学習の進め方

1. まず `docs/01-overview.md` でMCPの全体像を把握する
2. `docs/02-protocol.md` でプロトコルの仕組みを理解する
3. `docs/03-primitives.md` で3つの主要機能を学ぶ
4. `docs/04-hands-on-tutorial.md` に沿って実際にコードを書く
5. `examples/` のコードを読み、動かしてみる
6. `docs/05-advanced.md` で本番運用の知識を身につける

## 前提知識

- JavaScript / TypeScript または Python の基礎
- JSON の基本
- REST API の概念（あると理解しやすい）
- コマンドライン操作

## 参考リンク

- [MCP 公式仕様](https://modelcontextprotocol.io/specification/2025-11-25)
- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Python SDK](https://github.com/modelcontextprotocol/python-sdk)
- [MCP サーバー一覧](https://modelcontextprotocol.io/examples)
