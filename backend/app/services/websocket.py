"""管理连接认证、消息收发和断开清理，业务指令交给 AgentService。"""

import asyncio
import logging

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from ..browser.client import BrowserRPCClient, BrowserRPCError
from ..browser.protocol import BrowserResult
from ..models import ClientMessage
from .agent import AgentService

logger = logging.getLogger("job_agent")


class WebSocketService:
    def __init__(self, agent: AgentService, rpc: BrowserRPCClient):
        # 由应用工厂注入同一个 Agent 服务，使 HTTP 和 WebSocket 看到一致状态。
        self.agent = agent
        self.rpc = rpc
        self.clients: set[WebSocket] = set()
        # 将连接登记、指令处理和断开清理串行化，避免协程交错修改状态。
        self.lock = asyncio.Lock()

    async def handle(self, ws: WebSocket) -> None:
        # 拒绝带 Origin 的网页连接；Electron 主进程的连接不带此请求头。
        if ws.headers.get("origin"):
            await ws.close(code=1008)
            return
        await ws.accept()
        try:
            # 令牌放在连接后第一条消息中，不写入 URL 或日志。
            auth = await asyncio.wait_for(ws.receive_json(), timeout=5)
            if not isinstance(auth, dict) or not isinstance(auth.get("token"), str):
                await ws.close(code=1008)
                return
            if not self.agent.valid_token(auth["token"]):
                await ws.close(code=1008)
                return
            async with self.lock:
                # 同一后端只允许一个客户端接管；被拒绝的连接不能改变运行状态。
                if self.clients:
                    await ws.close(code=1008, reason="One desktop client at a time")
                    return
                self.clients.add(ws)
                self.rpc.attach(ws)
                await self.rpc.send(self.agent.event("connected"))
            logger.info("Desktop connected")
            while True:
                raw = await ws.receive_json()
                try:
                    # RPC 响应独立分流，不能当作 Agent 指令，也不能在这里等待 RPC。
                    if isinstance(raw, dict) and raw.get("type") == "browser_result":
                        self.rpc.receive(BrowserResult.model_validate(raw))
                        continue
                    message = ClientMessage.model_validate(raw)
                except ValidationError:
                    await self.rpc.send({"type": "error", "message": "Invalid message"})
                    continue
                async with self.lock:
                    response = self.agent.handle_message(message)
                    await self.rpc.send(response)
        except (WebSocketDisconnect, TimeoutError, ValueError, BrowserRPCError):
            pass
        finally:
            async with self.lock:
                # 只有认证成功并登记的连接断开才触发暂停。
                if ws in self.clients:
                    self.clients.remove(ws)
                    self.rpc.detach(ws)
                    self.agent.pause_on_disconnect()
