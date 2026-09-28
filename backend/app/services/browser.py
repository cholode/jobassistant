"""浏览器读取服务：HTTP 认证和错误映射不放在接口入口中。"""

from fastapi import HTTPException

from ..browser.client import BrowserRPCClient, BrowserRPCError
from ..browser.protocol import BrowserReadRequest, PageReading
from ..models import ClientMessage
from .agent import AgentService


class BrowserService:
    def __init__(self, agent: AgentService, rpc: BrowserRPCClient):
        self.agent = agent
        self.rpc = rpc

    async def read(self, token: str | None, request: BrowserReadRequest) -> PageReading:
        self.agent.get_state(token)  # 与已有状态接口共用身份验证。
        try:
            data = await self.rpc.request(request)
            if data.kind == "verification":
                # 所有读取入口统一处理验证页，不依赖用户是否从某个 UI 按钮触发。
                event = self.agent.handle_message(
                    ClientMessage(type="pause", request_id="verification")
                )
                await self.rpc.send(event)
            return data
        except BrowserRPCError as error:
            status = {"DISCONNECTED": 503, "TIMEOUT": 504, "BUSY": 429}.get(
                error.code, 502
            )
            raise HTTPException(
                status, {"code": error.code, "message": str(error)}
            ) from error
