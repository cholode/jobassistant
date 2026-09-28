"""本地协调服务：集中处理认证、状态变化与 WebSocket 会话。"""

import asyncio
import logging
import os
import secrets
from datetime import UTC, datetime

from fastapi import HTTPException, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from .models import ClientMessage, PageState

logger = logging.getLogger("job_agent")


class AgentService:
    def __init__(self, token: str | None = None):
        # 每个应用实例单独持有状态和锁，避免测试或多个实例之间共享数据。
        self.secret = token or os.environ.get("JOB_AGENT_TOKEN")
        if not self.secret:
            raise RuntimeError("JOB_AGENT_TOKEN is required; launch scripts/dev.ps1")
        self.state = {
            "status": "paused",
            "mode": "manual",
            "page": PageState().model_dump(),
            "revision": 0,
        }
        self.clients: set[WebSocket] = set()
        # 握手、消息处理与断开清理共用一把锁，避免协程交错修改状态。
        self.lock = asyncio.Lock()

    @staticmethod
    def health() -> dict:
        # 启动探测无需认证，也不返回用户状态。
        return {"status": "ok", "service": "job-agent", "phase": 1}

    def get_state(self, token: str | None) -> dict:
        self.authorize(token)
        return self.state

    def event(self, kind: str, request_id: str | None = None) -> dict:
        # 统一正常响应结构，附带当前状态和 UTC 时间。
        return {
            "type": kind,
            "request_id": request_id,
            "state": dict(self.state),
            "time": datetime.now(UTC).isoformat(),
        }

    def authorize(self, value: str | None) -> None:
        # 恒定时间比较可避免普通字符串比较泄露令牌匹配信息。
        if not value or not secrets.compare_digest(value, self.secret):
            raise HTTPException(401, "Unauthorized")

    async def websocket(self, ws: WebSocket):
        # 令牌放在连接后的第一条消息中，不写入 URL 或日志。
        # 拒绝带 Origin 的网页连接；Electron 主进程的连接不带该请求头。
        if ws.headers.get("origin"):
            await ws.close(code=1008)
            return
        await ws.accept()
        try:
            auth = await asyncio.wait_for(ws.receive_json(), timeout=5)
            if not isinstance(auth, dict) or not isinstance(auth.get("token"), str):
                await ws.close(code=1008)
                return
            if not secrets.compare_digest(auth["token"], self.secret):
                await ws.close(code=1008)
                return
            async with self.lock:
                # 同一后端只允许一个桌面客户端接管，避免多端修改状态。
                if self.clients:
                    await ws.close(code=1008, reason="One desktop client at a time")
                    return
                self.clients.add(ws)
                await ws.send_json(self.event("connected"))
            logger.info("Desktop connected")
            while True:
                raw = await ws.receive_json()
                try:
                    message = ClientMessage.model_validate(raw)
                except ValidationError:
                    await ws.send_json({"type": "error", "message": "Invalid message"})
                    continue
                async with self.lock:
                    # 恢复前必须携带最新页面信息，防止沿用旧页面状态。
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
                        self.state["page"] = message.page.model_dump()
                    if message.type in {"resume", "start", "pause"}:
                        self.state["status"] = (
                            "paused" if message.type == "pause" else "running"
                        )
                        logger.info("Agent status: %s", self.state["status"])
                    # 心跳只确认连接存活，不增加状态修订号。
                    if message.type != "ping":
                        self.state["revision"] += 1
                    await ws.send_json(
                        self.event(
                            "pong" if message.type == "ping" else "agent_state",
                            message.request_id,
                        )
                    )
        except (WebSocketDisconnect, TimeoutError, ValueError):
            pass
        finally:
            async with self.lock:
                # 只有已认证并登记的连接断开才影响状态；断连后立即暂停。
                if ws in self.clients:
                    self.clients.remove(ws)
                    self.state["status"] = "paused"
                    self.state["revision"] += 1
                    logger.info("Desktop disconnected; agent paused")
