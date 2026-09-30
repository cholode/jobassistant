"""按请求编号关联响应，处理超时、断线和迟到结果，不阻塞 WebSocket 接收循环。"""

import asyncio
from uuid import uuid4

from fastapi import WebSocket, WebSocketDisconnect

from .protocol import BrowserReadRequest, BrowserResult, PageReading


class BrowserRPCError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class BrowserRPCClient:
    def __init__(self, timeout: float = 8):
        self.timeout = timeout
        self.socket: WebSocket | None = None
        self.pending: dict[str, asyncio.Future] = {}
        self.send_lock = asyncio.Lock()

    def attach(self, socket: WebSocket) -> None:
        self.socket = socket

    async def send(self, message: dict) -> None:
        async with self.send_lock:
            if self.socket is None:
                raise BrowserRPCError("DISCONNECTED", "桌面浏览器未连接")
            try:
                await self.socket.send_json(message)
            except (WebSocketDisconnect, OSError, RuntimeError) as error:
                raise BrowserRPCError("DISCONNECTED", "桌面连接已断开") from error

    def detach(self, socket: WebSocket) -> None:
        if socket is not self.socket:
            return
        self.socket = None
        for future in self.pending.values():
            if not future.done():
                future.set_exception(BrowserRPCError("DISCONNECTED", "桌面连接已断开"))
        self.pending.clear()

    def receive(self, result: BrowserResult) -> None:
        # 未知编号、重复结果及超时后到达的结果不影响任何新请求。
        future = self.pending.get(result.request_id)
        if future is not None and not future.done():
            future.set_result(result)

    async def request(self, request: BrowserReadRequest) -> PageReading:
        return await self.execute(
            request.command, {"expected_url": request.expected_url}
        )

    async def execute(self, command: str, payload: dict) -> PageReading:
        # 写入调用仅由已审批的 ApplicationGraph 发起，不直接作为 HTTP 透传接口。
        if self.socket is None:
            raise BrowserRPCError("DISCONNECTED", "桌面浏览器未连接")
        if len(self.pending) >= 16:
            raise BrowserRPCError("BUSY", "读取请求过多，请稍后再试")
        request_id = str(uuid4())
        future = asyncio.get_running_loop().create_future()
        self.pending[request_id] = future
        try:
            # 超时覆盖发送及等待响应两个阶段。
            async with asyncio.timeout(self.timeout):
                await self.send(
                    {
                        "type": "browser_command",
                        "request_id": request_id,
                        "command": command,
                        "payload": payload,
                    }
                )
                result = await future
            if not result.success:
                error = result.error
                raise BrowserRPCError(
                    error.code if error else "READ_FAILED",
                    error.message if error else "网页读取失败",
                )
            if result.data is None:
                raise BrowserRPCError("INVALID_RESULT", "浏览器返回了空数据")
            return result.data
        except TimeoutError as error:
            raise BrowserRPCError(
                "TIMEOUT", "读取网页超时，请等待页面加载后重试"
            ) from error
        finally:
            self.pending.pop(request_id, None)
            if not future.done():
                future.cancel()
            elif not future.cancelled():
                # 断线和发送失败同时发生时，也要取走 Future 异常，避免未处理告警。
                future.exception()
