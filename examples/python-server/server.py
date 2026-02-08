"""
MCP学習用サーバー（Python / FastMCP）

このサーバーは以下の機能を公開します:

【Tools（ツール）】
  - search_files    : ディレクトリ内のファイルを検索
  - read_file       : ファイルの内容を読み取り
  - add_memo        : メモを追加
  - list_memos      : メモの一覧を表示
  - delete_memo     : メモを削除

【Resources（リソース）】
  - memo://list           : 全メモの一覧
  - memo://{id}/content   : 個別メモの内容

【Prompts（プロンプト）】
  - summarize-file   : ファイルの内容を要約するテンプレート
  - search-and-explain : 検索結果を説明するテンプレート

起動方法:
  python server.py                  (stdio トランスポート)
  mcp dev server.py                 (開発モード / MCP Inspector)
"""

import os
import glob
from datetime import datetime
from mcp.server.fastmcp import FastMCP

# ─────────────────────────────────────────────
# サーバーの作成
# ─────────────────────────────────────────────

mcp = FastMCP(
    "file-memo-server",
    version="1.0.0",
)

# ─────────────────────────────────────────────
# データストア
# ─────────────────────────────────────────────

# インメモリのメモストレージ
memos: dict[str, dict] = {}
next_memo_id = 1


# ─────────────────────────────────────────────
# Tools（ツール）
# ─────────────────────────────────────────────


@mcp.tool()
async def search_files(
    directory: str,
    pattern: str = "*",
    recursive: bool = True,
) -> str:
    """ディレクトリ内のファイルを検索します。

    Args:
        directory: 検索するディレクトリのパス
        pattern: 検索パターン（glob形式、例: "*.py", "*.md"）
        recursive: サブディレクトリも検索するか

    Returns:
        見つかったファイルの一覧
    """
    # セキュリティ: パストラバーサルの防止
    directory = os.path.realpath(directory)

    if not os.path.isdir(directory):
        return f"エラー: '{directory}' はディレクトリではありません"

    if recursive:
        search_pattern = os.path.join(directory, "**", pattern)
        files = glob.glob(search_pattern, recursive=True)
    else:
        search_pattern = os.path.join(directory, pattern)
        files = glob.glob(search_pattern)

    if not files:
        return f"'{directory}' で パターン '{pattern}' に一致するファイルは見つかりませんでした"

    # ファイル情報を収集
    results = []
    for filepath in sorted(files)[:50]:  # 最大50件
        if os.path.isfile(filepath):
            size = os.path.getsize(filepath)
            modified = datetime.fromtimestamp(os.path.getmtime(filepath))
            results.append(
                f"  {filepath}\n"
                f"    サイズ: {_format_size(size)} | "
                f"更新日: {modified.strftime('%Y-%m-%d %H:%M')}"
            )

    header = f"検索結果: {len(results)}件 (パターン: {pattern})\n"
    return header + "\n".join(results)


@mcp.tool()
async def read_file(path: str, max_lines: int = 100) -> str:
    """ファイルの内容を読み取ります。

    Args:
        path: 読み取るファイルのパス
        max_lines: 最大読み取り行数（デフォルト: 100）

    Returns:
        ファイルの内容
    """
    path = os.path.realpath(path)

    if not os.path.isfile(path):
        return f"エラー: '{path}' が見つかりません"

    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        total_lines = len(lines)
        content = "".join(lines[:max_lines])

        header = f"ファイル: {path}\n行数: {total_lines}\n"
        if total_lines > max_lines:
            header += f"(最初の{max_lines}行を表示)\n"
        header += "─" * 40 + "\n"

        return header + content

    except UnicodeDecodeError:
        return f"エラー: '{path}' はテキストファイルではありません（バイナリファイルの可能性）"


@mcp.tool()
async def add_memo(title: str, content: str, tags: str = "") -> str:
    """メモを追加します。

    Args:
        title: メモのタイトル
        content: メモの内容
        tags: タグ（カンマ区切り、例: "work,important"）

    Returns:
        作成されたメモの情報
    """
    global next_memo_id
    memo_id = str(next_memo_id)
    next_memo_id += 1

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    memos[memo_id] = {
        "id": memo_id,
        "title": title,
        "content": content,
        "tags": tag_list,
        "created_at": datetime.now().isoformat(),
    }

    return f"メモを追加しました:\n  ID: {memo_id}\n  タイトル: {title}\n  タグ: {', '.join(tag_list) if tag_list else 'なし'}"


@mcp.tool()
async def list_memos(tag: str = "") -> str:
    """メモの一覧を表示します。

    Args:
        tag: フィルタするタグ（空の場合は全件表示）

    Returns:
        メモの一覧
    """
    filtered = memos.values()
    if tag:
        filtered = [m for m in filtered if tag in m["tags"]]

    if not filtered:
        if tag:
            return f"タグ '{tag}' のメモはありません"
        return "メモはまだありません"

    lines = [f"メモ一覧 ({len(list(filtered))}件):"]
    for memo in filtered:
        status = f"[{', '.join(memo['tags'])}]" if memo["tags"] else ""
        lines.append(f"  #{memo['id']} {memo['title']} {status}")

    return "\n".join(lines)


@mcp.tool()
async def delete_memo(id: str) -> str:
    """メモを削除します。

    Args:
        id: 削除するメモのID

    Returns:
        削除結果
    """
    if id not in memos:
        return f"エラー: ID '{id}' のメモが見つかりません"

    deleted = memos.pop(id)
    return f"メモ '{deleted['title']}' (ID: {id}) を削除しました"


# ─────────────────────────────────────────────
# Resources（リソース）
# ─────────────────────────────────────────────


@mcp.resource("memo://list")
async def get_memo_list() -> str:
    """全メモの一覧をJSON形式で返します。"""
    import json

    memo_list = [
        {
            "id": m["id"],
            "title": m["title"],
            "tags": m["tags"],
            "created_at": m["created_at"],
        }
        for m in memos.values()
    ]
    return json.dumps(memo_list, ensure_ascii=False, indent=2)


@mcp.resource("memo://{id}/content")
async def get_memo_content(id: str) -> str:
    """個別メモの内容をJSON形式で返します。"""
    import json

    if id not in memos:
        return json.dumps({"error": f"ID '{id}' のメモが見つかりません"}, ensure_ascii=False)

    return json.dumps(memos[id], ensure_ascii=False, indent=2)


# ─────────────────────────────────────────────
# Prompts（プロンプト）
# ─────────────────────────────────────────────


@mcp.prompt()
async def summarize_file(path: str, focus: str = "general") -> str:
    """ファイルの内容を要約するプロンプトを生成します。

    Args:
        path: 要約するファイルのパス
        focus: 要約の観点（general, technical, business）
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read(5000)  # 最大5000文字
    except Exception as e:
        content = f"(ファイル読み取りエラー: {e})"

    focus_descriptions = {
        "general": "全体的な概要",
        "technical": "技術的な詳細に重点を置いた",
        "business": "ビジネス上の意味に重点を置いた",
    }
    focus_desc = focus_descriptions.get(focus, "全体的な概要")

    return f"""以下のファイルの内容について、{focus_desc}要約を作成してください。

ファイル: {path}

内容:
```
{content}
```

要約には以下を含めてください:
1. ファイルの目的
2. 主要な内容のポイント（3-5項目）
3. 注目すべき点や改善の余地"""


@mcp.prompt()
async def search_and_explain(query: str, context: str = "") -> str:
    """検索クエリに基づいて説明を生成するプロンプトです。

    Args:
        query: 検索・質問したい内容
        context: 追加のコンテキスト情報
    """
    context_section = ""
    if context:
        context_section = f"\n追加コンテキスト:\n{context}\n"

    return f"""以下の質問について、分かりやすく説明してください。

質問: {query}
{context_section}
回答は以下の形式で構成してください:
1. 簡潔な回答（1-2文）
2. 詳細な説明
3. 具体的な例
4. 関連する参考情報"""


# ─────────────────────────────────────────────
# ユーティリティ
# ─────────────────────────────────────────────


def _format_size(size_bytes: int) -> str:
    """バイト数を人間が読みやすい形式に変換"""
    for unit in ["B", "KB", "MB", "GB"]:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


# ─────────────────────────────────────────────
# エントリポイント
# ─────────────────────────────────────────────

if __name__ == "__main__":
    # stdio トランスポートで起動
    mcp.run()
