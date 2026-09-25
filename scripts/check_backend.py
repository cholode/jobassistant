"""Check installed backend dependencies without API keys or external services."""
import importlib.metadata
import sqlite3
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient
from langchain_openai import ChatOpenAI  # noqa: F401
from langgraph.checkpoint.sqlite import SqliteSaver  # noqa: F401
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt  # noqa: F401
from sqlalchemy import create_engine, text

assert sys.version_info[:2] == (3, 12)
for name in ("fastapi", "uvicorn", "langchain", "langgraph", "pydantic", "sqlalchemy", "pytest", "ruff"):
    print(f"{name}: {importlib.metadata.version(name)}")
app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

assert TestClient(app).get("/health").json() == {"status": "ok"}
with create_engine("sqlite://").connect() as connection:
    assert connection.execute(text("select 1")).scalar() == 1
graph = StateGraph(dict)
graph.add_node("check", lambda state: {"ok": True})
graph.add_edge(START, "check")
graph.add_edge("check", END)
assert graph.compile().invoke({}) == {"ok": True}
print(f"Python {sys.version.split()[0]}, SQLite {sqlite3.sqlite_version}")
print("PASS: HTTP, SQLAlchemy/SQLite, LangGraph and model/checkpoint imports")
