"""Phase 1 local coordinator. No model calls or automated website actions."""

import asyncio
import logging
import os
import secrets
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger("job_agent")
logging.basicConfig(level=logging.INFO)


class PageState(BaseModel):
    url: str = Field(default="", max_length=4096)
    title: str = Field(default="", max_length=512)


class ClientMessage(BaseModel):
    type: Literal["pause", "resume", "start", "page", "ping"]
    request_id: str = Field(max_length=100)
    page: PageState | None = None


def create_app(token: str | None = None) -> FastAPI:
    secret = token or os.environ.get("JOB_AGENT_TOKEN")
    if not secret:
        raise RuntimeError("JOB_AGENT_TOKEN is required; launch scripts/dev.ps1")
    app = FastAPI(title="Job Agent Desktop", version="0.1.0")
    state = {
        "status": "paused",
        "mode": "manual",
        "page": PageState().model_dump(),
        "revision": 0,
    }
    clients: set[WebSocket] = set()
    lock = asyncio.Lock()

    def event(kind: str, request_id: str | None = None) -> dict:
        return {
            "type": kind,
            "request_id": request_id,
            "state": dict(state),
            "time": datetime.now(UTC).isoformat(),
        }

    def authorize(value: str | None) -> None:
        if not value or not secrets.compare_digest(value, secret):
            raise HTTPException(401, "Unauthorized")

    @app.get("/health")
    async def health():
        return {"status": "ok", "service": "job-agent", "phase": 1}

    @app.get("/agent/state")
    async def get_state(x_job_agent_token: str | None = Header(default=None)):
        authorize(x_job_agent_token)
        return state

    @app.websocket("/ws")
    async def websocket(ws: WebSocket):
        # Authentication is sent as the first frame, never in URLs or logs.
        # Browser-origin WebSocket requests are rejected; Electron main has no Origin.
        if ws.headers.get("origin"):
            await ws.close(code=1008)
            return
        await ws.accept()
        try:
            auth = await asyncio.wait_for(ws.receive_json(), timeout=5)
            if not isinstance(auth, dict) or not isinstance(auth.get("token"), str):
                await ws.close(code=1008)
                return
            if not secrets.compare_digest(auth["token"], secret):
                await ws.close(code=1008)
                return
            async with lock:
                if clients:
                    await ws.close(code=1008, reason="One desktop client at a time")
                    return
                clients.add(ws)
                await ws.send_json(event("connected"))
            logger.info("Desktop connected")
            while True:
                raw = await ws.receive_json()
                try:
                    message = ClientMessage.model_validate(raw)
                except ValidationError:
                    await ws.send_json({"type": "error", "message": "Invalid message"})
                    continue
                async with lock:
                    if message.type in {"resume", "start"} and message.page is None:
                        await ws.send_json(
                            {
                                "type": "error",
                                "request_id": message.request_id,
                                "message": "Resume requires a fresh page snapshot",
                            }
                        )
                        continue
                    if message.page is not None:
                        state["page"] = message.page.model_dump()
                    if message.type in {"resume", "start", "pause"}:
                        state["status"] = (
                            "paused" if message.type == "pause" else "running"
                        )
                        logger.info("Agent status: %s", state["status"])
                    if message.type != "ping":
                        state["revision"] += 1
                    await ws.send_json(
                        event(
                            "pong" if message.type == "ping" else "agent_state",
                            message.request_id,
                        )
                    )
        except (WebSocketDisconnect, TimeoutError, ValueError):
            pass
        finally:
            async with lock:
                if ws in clients:
                    clients.remove(ws)
                    state["status"] = "paused"
                    state["revision"] += 1
                    logger.info("Desktop disconnected; agent paused")

    app.mount(
        "/mock",
        StaticFiles(
            directory=Path(__file__).resolve().parents[2] / "mock-site", html=True
        ),
        name="mock",
    )
    return app
