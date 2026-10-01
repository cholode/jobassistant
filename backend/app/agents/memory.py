"""记忆接口与本地 SQLite 实现；未来 RAG 通过 Retriever 接入，无需嵌入模型。"""

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Protocol


class MemoryStore(Protocol):
    """持久化执行经验；不替代用户资料数据库和审批检查点。"""

    def recall(self, scope: str, limit: int = 3) -> list[dict]: ...
    def remember(self, scope: str, run_id: str, record: dict) -> None: ...
    def forget(self, scope: str) -> None: ...


class Retriever(Protocol):
    """未来向量检索实现此接口；返回带来源的资料，不在这里注册网页动作。"""

    async def retrieve(self, query: str, scope: str, limit: int) -> list[dict]: ...


class SQLiteMemory:
    def __init__(self, path: Path, capacity: int = 500):
        if capacity < 1:
            raise ValueError("记忆容量必须大于零")
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path, self.capacity = path, capacity
        with self._connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS memories (seq INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, run_id TEXT UNIQUE NOT NULL, record TEXT NOT NULL)"
            )
            db.execute(
                "CREATE INDEX IF NOT EXISTS memories_scope ON memories(scope, seq)"
            )

    @contextmanager
    def _connect(self):
        # sqlite 的事务上下文本身不关闭连接，退出时必须显式释放文件句柄。
        db = sqlite3.connect(self.path)
        try:
            with db:
                yield db
        finally:
            db.close()

    def recall(self, scope: str, limit: int = 3) -> list[dict]:
        with self._connect() as db:
            rows = db.execute(
                "SELECT record FROM memories WHERE scope = ? ORDER BY seq DESC LIMIT ?",
                (scope, max(0, min(limit, 20))),
            ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def remember(self, scope: str, run_id: str, record: dict) -> None:
        # 同一 run_id 只写一次；全局有容量上限，避免长期运行无限增长。
        with self._connect() as db:
            db.execute(
                "INSERT OR IGNORE INTO memories(scope, run_id, record) VALUES (?, ?, ?)",
                (scope, run_id, json.dumps(record, ensure_ascii=False)),
            )
            db.execute(
                "DELETE FROM memories WHERE seq NOT IN (SELECT seq FROM memories ORDER BY seq DESC LIMIT ?)",
                (self.capacity,),
            )

    def forget(self, scope: str) -> None:
        with self._connect() as db:
            db.execute("DELETE FROM memories WHERE scope = ?", (scope,))
