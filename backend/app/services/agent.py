"""管理 Agent 状态与指令，不负责 WebSocket 连接或消息收发。"""

import logging
import os
import secrets
from datetime import UTC, datetime

from fastapi import HTTPException

from ..models import ClientMessage, PageState

logger = logging.getLogger("job_agent")


class AgentService:
    def __init__(self, token: str | None = None):
        # 每个应用实例独立保存令牌和状态，避免不同实例相互影响。
        self.secret = token or os.environ.get("JOB_AGENT_TOKEN")
        if not self.secret:
            raise RuntimeError("JOB_AGENT_TOKEN is required; launch scripts/dev.ps1")
        self.state = {
            "status": "paused",
            "mode": "manual",
            "page": PageState().model_dump(),
            "revision": 0,
        }

    @staticmethod
    def health() -> dict:
        # 启动探测无需认证，也不返回用户状态。
        return {"status": "ok", "service": "job-agent", "phase": 4}

    def valid_token(self, value: str | None) -> bool:
        # HTTP 和 WebSocket 共用令牌校验，各自决定认证失败时的响应方式。
        return bool(value) and secrets.compare_digest(value, self.secret)

    def get_state(self, token: str | None) -> dict:
        if not self.valid_token(token):
            raise HTTPException(401, "Unauthorized")
        return self.state

    def event(self, kind: str, request_id: str | None = None) -> dict:
        # 正常响应统一附带状态快照、请求编号和 UTC 时间。
        return {
            "type": kind,
            "request_id": request_id,
            "state": dict(self.state),
            "time": datetime.now(UTC).isoformat(),
        }

    def handle_message(self, message: ClientMessage) -> dict:
        if message.type in {"copilot", "manual"}:
            self.state["mode"] = message.type
            self.state["status"] = "paused"
        # 恢复前必须携带最新页面信息；校验失败时不修改状态。
        if message.type in {"resume", "start"} and message.page is None:
            return {
                "type": "error",
                "request_id": message.request_id,
                "message": "Resume requires a fresh page snapshot",
            }
        if message.page is not None:
            self.state["page"] = message.page.model_dump()
        if message.type in {"resume", "start", "pause"}:
            self.state["status"] = "paused" if message.type == "pause" else "running"
            logger.info("Agent status: %s", self.state["status"])
        # 心跳确认连接存活，不增加状态修订号。
        if message.type != "ping":
            self.state["revision"] += 1
        return self.event(
            "pong" if message.type == "ping" else "agent_state", message.request_id
        )

    def pause_on_disconnect(self) -> None:
        # 由连接层在已认证的客户端断开时调用，统一处理断连后的状态变化。
        self.state["status"] = "paused"
        self.state["revision"] += 1
        logger.info("Desktop disconnected; agent paused")
